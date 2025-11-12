/**
 * @file テストシナリオの記録ワークフローを統括するレコーダー。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { CommandLineInterface } from "../ui/cli.js";
import { RecordedStep } from "../types/recorder.js";
import { GherkinStep } from "../types/gherkin.js";
import { TestAgent } from "../agents/TestAgent.js";
import { InstructionClassifierAgent } from "../agents/InstructionClassifierAgent.js";
import { ScenarioGeneratorAgent } from "../agents/ScenarioGeneratorAgent.js";
import { getLlm } from "../lib/llm/provider.js";
import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

export class ScenarioRecorder {
  private stagehand: Stagehand;
  private cli: CommandLineInterface;
  private recordedSteps: RecordedStep[] = [];
  private classifierAgent: InstructionClassifierAgent;
  private testAgent: TestAgent;
  private generatorAgent: ScenarioGeneratorAgent;

  constructor(stagehand: Stagehand, cli: CommandLineInterface) {
    this.stagehand = stagehand;
    this.cli = cli;
    this.classifierAgent = new InstructionClassifierAgent(getLlm("fast"));
    // TestAgentを初期化して、検証ロジックを再利用できるようにする
    this.testAgent = new TestAgent(
      getLlm("fast"),
      getLlm("default"),
      this.stagehand,
    );
    this.generatorAgent = new ScenarioGeneratorAgent(getLlm("default"));
  }

  /**
   * 記録セッションを開始し、ユーザーの操作指示を受け付けます。
   * @returns {Promise<string | null>} 保存されたシナリオのファイルパス、またはキャンセルされた場合はnull。
   */
  public async startRecording(): Promise<string | null> {
    let isRecording = true;
    while (isRecording) {
      const instruction = await this.cli.ask(chalk.magenta("次の操作指示 > "));
      const command = instruction.trim().toLowerCase();

      switch (command) {
        case "save":
          if (this.recordedSteps.length === 0) {
            this.cli.log(
              chalk.yellow(
                "記録された操作がありません。少なくとも1件の操作を記録してください。",
              ),
            );
            break; // 続行
          }
          isRecording = false;
          return await this.saveScenario();
        case "cancel":
          isRecording = false;
          return null;
        default:
          await this.recordStep(instruction);
          break;
      }
    }
    return null;
  }

  /**
   * ユーザーの単一の指示を記録・実行します。
   * @param {string} userInstruction - ユーザーからの自然言語の操作指示。
   */
  private async recordStep(userInstruction: string): Promise<void> {
    let success = false;
    let retryCount = 0;
    const rawRetries = process.env.RECORDER_MAX_RETRIES;
    const parsedRetries = rawRetries !== undefined ? Number(rawRetries) : 1;
    const maxRetries =
      Number.isFinite(parsedRetries) && parsedRetries >= 0 ? parsedRetries : 1; // 0も許容

    let currentInstruction = userInstruction;

    while (!success && retryCount <= maxRetries) {
      try {
        // 1. 意図を分類
        const { intent } =
          await this.classifierAgent.classify(currentInstruction);

        if (intent === "action") {
          // 2a. 操作を実行
          this.cli.log(chalk.gray(`  - 操作を実行中...`));

          // URLナビゲーションか、要素操作かを判定
          const urlMatch = currentInstruction.match(/https?:\/\/[^\s"`<>()]+/);
          const url = urlMatch ? urlMatch[0] : null;

          if (url) {
            // URLへの遷移の場合
            this.cli.log(chalk.gray(`  - URLに遷移します: ${url}`));
            await this.stagehand.page.goto(url, {
              timeout: 30000,
              waitUntil: "domcontentloaded",
            });
          } else {
            // 要素操作の場合
            const result = await this.stagehand.page.act(currentInstruction);
            // 戻り値の型が様々なので、堅牢な成功判定を行う
            const isSuccess =
              typeof result === "boolean"
                ? result
                : result && typeof result === "object" && "success" in result
                  ? Boolean((result as { success: boolean }).success)
                  : true; // 戻り値が無い/不定なら成功扱い（例外は catch で拾う）

            if (!isSuccess) {
              throw new Error(`操作 '${currentInstruction}' に失敗しました。`);
            }
          }

          this.cli.log(chalk.green("  - 操作が成功しました。"));
          this.recordedSteps.push({
            type: "action",
            userInstruction: currentInstruction,
            timestamp: Date.now(),
          });
        } else {
          // intent === "assertion"
          // 2b. 検証を実行
          this.cli.log(chalk.gray(`  - 検証を実行中...`));
          const tempStep: GherkinStep = {
            keyword: "Then",
            text: currentInstruction,
          };
          const verificationSuccess =
            await this.testAgent.processStep(tempStep);

          if (verificationSuccess !== true) {
            throw new Error("検証に失敗しました。");
          }
          this.cli.log(chalk.green("  - 検証が成功しました。"));
          this.recordedSteps.push({
            type: "assertion",
            userInstruction: currentInstruction,
            timestamp: Date.now(),
          });
        }
        success = true;
      } catch (error) {
        this.cli.log(
          chalk.red(`  - ステップに失敗しました: ${(error as Error).message}`),
        );

        if (retryCount < maxRetries) {
          const shouldRetry = await this.cli.confirm(
            "このステップを再試行しますか？ (指示を修正して再入力できます)",
          );
          if (shouldRetry) {
            currentInstruction = await this.cli.ask(
              chalk.magenta("修正後の操作指示 > "),
            );
            retryCount++;
            continue;
          }
        }
        break;
      }
    }

    if (!success) {
      this.cli.log(chalk.yellow("  - このステップはスキップされました。"));
    }
  }

  /**
   * 記録されたステップを自然言語シナリオに変換し、ファイルに保存します。
   */
  private async saveScenario(): Promise<string> {
    if (this.recordedSteps.length === 0) {
      // このチェックはstartRecordingに移動したが、念のため残す
      throw new Error("記録された操作がありません。");
    }
    this.cli.log("  - 記録された操作からシナリオを生成中...");
    const generatedScenario = await this.generatorAgent.generate(
      this.recordedSteps,
    );

    if (!generatedScenario?.trim()) {
      throw new Error("シナリオ生成に失敗しました（空の出力）。");
    }

    const scenariosDir = path.resolve(process.cwd(), "tests/scenarios");
    await fs.mkdir(scenariosDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(scenariosDir, `recorded-${timestamp}.txt`);
    await fs.writeFile(filePath, generatedScenario, { encoding: "utf-8" });

    this.cli.log(chalk.green(`  - シナリオを保存しました: ${filePath}`));
    return filePath;
  }
}
