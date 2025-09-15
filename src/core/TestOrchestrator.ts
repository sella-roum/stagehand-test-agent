/**
 * @file テスト実行のワークフロー全体を統括するオーケストレーター。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { ExecutionContext } from "./ExecutionContext.js";
import { CommandLineInterface } from "../ui/cli.js";
import { ScenarioNormalizerAgent } from "../agents/ScenarioNormalizerAgent.js";
import { TestAgent } from "../agents/TestAgent.js";
import { getLlm } from "../lib/llm/provider.js";
import { GherkinStep } from "../types/gherkin.js";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

/**
 * @class TestOrchestrator
 * @description テストの実行フロー全体を管理する司令塔。
 * シナリオ正規化、ステップ実行、結果記録、レポート生成というテスト全体のライフサイクルを管理します。
 */
export class TestOrchestrator {
  private stagehand: Stagehand;
  private context: ExecutionContext;
  private cli: CommandLineInterface;
  private normalizerAgent: ScenarioNormalizerAgent;
  private testAgent: TestAgent;

  /**
   * TestOrchestratorのインスタンスを生成します。
   * @param {Stagehand} stagehand - 初期化済みのStagehandインスタンス。
   * @param {ExecutionContext} context - テストセッションの状態を管理するコンテキスト。
   * @param {CommandLineInterface} cli - ユーザーとの対話を行うCLIインターフェース。
   */
  constructor(
    stagehand: Stagehand,
    context: ExecutionContext,
    cli: CommandLineInterface,
  ) {
    this.stagehand = stagehand;
    this.context = context;
    this.cli = cli;
    this.normalizerAgent = new ScenarioNormalizerAgent(getLlm("default"));
    this.testAgent = new TestAgent(
      getLlm("fast"),
      getLlm("default"),
      this.stagehand,
    );
  }

  /**
   * テスト実行のメインフローを開始します。
   * 実行フロー：
   * 1. シナリオをGherkin形式に正規化
   * 2. (対話モード時) ユーザーに実行計画を承認させる
   * 3. Gherkinの各ステップを順番に実行
   * 4. 最終的なテストレポートを生成
   * @returns {Promise<void>}
   */
  async run(): Promise<void> {
    try {
      // --- 1. シナリオ正規化 ---
      this.cli.log(
        `📝 シナリオを正規化中...\n"${this.context.originalScenario}"`,
      );
      const gherkinDocument = await this.normalizerAgent.normalize(
        this.context.originalScenario,
      );
      this.context.setGherkinDocument(gherkinDocument);

      this.cli.log(chalk.green("✅ Gherkin形式への変換完了。"));
      this.cli.log(chalk.bold.blue("--- 正規化されたテスト計画 ---"));
      this.cli.log(chalk.bold(`Feature: ${gherkinDocument.feature}`));
      this.cli.log(
        chalk.bold(`Scenario: ${gherkinDocument.scenarios[0].title}`),
      );
      if (gherkinDocument.background) {
        gherkinDocument.background.forEach((step) => {
          this.cli.log(`  ${step.keyword} ${step.text}`);
        });
      }
      gherkinDocument.scenarios[0].steps.forEach((step) => {
        this.cli.log(`  ${step.keyword} ${step.text}`);
      });
      this.cli.log(chalk.bold.blue("--------------------------"));

      // --- 2. 計画承認 (対話モード時) ---
      if (this.context.mode.startsWith("interactive")) {
        const proceed =
          await this.cli.confirm("この計画でテストを実行しますか？");
        if (!proceed) {
          this.cli.log("テスト実行をキャンセルしました。");
          return;
        }
      }

      // --- 3. ステップ実行 ---
      if (gherkinDocument.background) {
        for (const step of gherkinDocument.background) {
          await this.executeStep(step);
        }
      }

      for (const step of gherkinDocument.scenarios[0].steps) {
        await this.executeStep(step);
      }
    } catch (error) {
      // メイン処理で発生したエラーを捕捉し、ログに出力
      console.error(
        chalk.red(
          `\n❌ テスト実行中にエラーが発生しました: ${(error as Error).message}`,
        ),
      );
    } finally {
      // --- 4. レポート生成 (成功・失敗に関わらず必ず実行) ---
      this.cli.logReport(this.context.stepResults);
      await this.generateReport();
    }
  }

  /**
   * 単一のテストステップを実行し、結果を記録します。
   * @param {GherkinStep} step - 実行するGherkinステップオブジェクト。
   * @private
   */
  private async executeStep(step: GherkinStep) {
    const fullStep = `${step.keyword} ${step.text}`;
    this.cli.logStepStart(fullStep);

    // キーワードに基づいて意図を判断し、ログに出力
    const keyword = step.keyword.toLowerCase();
    const intent = keyword.includes("then") ? "assertion" : "action";
    this.cli.logStepIntent(intent);

    const startTime = Date.now();
    let status: "pass" | "fail" = "fail";
    let details: string | undefined;
    let screenshotPath: string | undefined;

    // このステップで実行されたStagehandの内部コマンドのみを抽出するための開始インデックス
    const historyStartIndex = this.stagehand.history.length;

    try {
      if (this.context.mode === "interactive") {
        const proceed = await this.cli.confirm("このステップを実行しますか？");
        if (!proceed) {
          throw new Error("ユーザーがステップ実行をキャンセルしました。");
        }
      }

      // TestAgentから計画を受け取り、Orchestratorが実行する
      const plan = await this.testAgent.processStep(step);

      if (typeof plan === "object" && plan !== null && "method" in plan) {
        // planがObserveResultの場合、actを実行
        await this.stagehand.page.act(plan);
      } else if (typeof plan === "boolean" && !plan) {
        // planがfalseの場合 (Then句の検証失敗)
        throw new Error(`検証ステップ「${step.text}」が失敗しました。`);
      }
      // planがvoid(GivenのURL遷移)またはtrue(Thenの検証成功)の場合は何もしない

      status = "pass";
    } catch (e: any) {
      status = "fail";
      details = e.message;
      try {
        // メインのエラー処理中にスクリーンショット撮影で失敗しても、
        // テスト全体がクラッシュしないようにするための安全策
        const screenshotDir = path.resolve(process.cwd(), "test-results");
        await fs.mkdir(screenshotDir, { recursive: true });
        screenshotPath = path.join(screenshotDir, `failure-${Date.now()}.png`);
        await this.stagehand.page.screenshot({ path: screenshotPath });
      } catch (screenshotError: any) {
        details += `\nスクリーンショットの撮影にも失敗しました: ${screenshotError.message}`;
      }
    }

    const durationMs = Date.now() - startTime;
    const historyEndIndex = this.stagehand.history.length;
    // このステップで実行されたコマンド履歴を抽出
    const commands = this.stagehand.history.slice(
      historyStartIndex,
      historyEndIndex,
    );

    this.context.addResult({
      step: fullStep,
      status,
      durationMs,
      details,
      screenshotPath,
      commands,
    });
    this.cli.logStepResult(this.context.stepResults.slice(-1)[0]);

    if (status === "fail") {
      throw new Error("テストステップが失敗したため、実行を中断します。");
    }
  }

  /**
   * テスト結果をMarkdown形式のレポートファイルとして生成します。
   * @private
   */
  private async generateReport() {
    const reportDir = path.resolve(process.cwd(), "test-results");
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `report-${Date.now()}.md`);

    let content = `# テストレポート\n\n`;

    // 1. 正規化されたテスト計画をレポートに追加
    if (this.context.gherkinDocument) {
      content += `## テスト計画\n\n`;
      content += `**Feature**: ${this.context.gherkinDocument.feature}\n`;
      content += `**Scenario**: ${this.context.gherkinDocument.scenarios[0].title}\n\n`;
      content += "```gherkin\n";
      if (this.context.gherkinDocument.background) {
        this.context.gherkinDocument.background.forEach((step) => {
          content += `${step.keyword} ${step.text}\n`;
        });
      }

      // `scenarios`は配列なので、最初の要素`[0]`にアクセスする
      this.context.gherkinDocument.scenarios[0].steps.forEach(
        (step: GherkinStep) => {
          content += `${step.keyword} ${step.text}\n`;

          if (step.table && step.table.length > 0) {
            // テーブルのヘッダーを取得 (最初の行からキーを取得)
            const headers = Object.keys(step.table[0]);
            content += `  | ${headers.join(" | ")} |\n`;
            content += `  | ${headers.map(() => "---").join(" | ")} |\n`;

            // テーブルの各行を追加
            step.table.forEach((row: Record<string, string>) => {
              const values = headers.map((header) => row[header]);
              content += `  | ${values.join(" | ")} |\n`;
            });
          }
        },
      );

      content += "```\n\n";
    }

    // 2. 実行結果セクションを追加
    content += `## 実行結果\n\n`;

    for (const result of this.context.stepResults) {
      const icon = result.status === "pass" ? "✅" : "❌";
      // ヘッダーレベルをH3に変更して階層を明確化
      content += `### ${icon} ${result.step}\n`;
      content += `- **結果**: ${result.status}\n`;
      content += `- **実行時間**: ${result.durationMs}ms\n`;
      if (result.details) {
        content += `- **詳細**: \n\`\`\`\n${result.details}\n\`\`\`\n`;
      }
      if (result.screenshotPath) {
        const relativePath = path.relative(reportDir, result.screenshotPath);
        content += `- **証跡**: ![Failure Screenshot](${relativePath})\n`;
      }

      if (result.commands && result.commands.length > 0) {
        content += `- **実行コマンド詳細**:\n`;
        content += "  ```json\n";

        // セキュリティのため、'password'を含む可能性のあるコマンド引数を '[REDACTED]' に置き換える
        const sanitizedCommands = result.commands.map((cmd) => {
          const sanitizedCmd: Record<string, any> = { ...cmd };
          // 'act'コマンドの引数をチェック
          if (
            sanitizedCmd.method === "act" &&
            typeof sanitizedCmd.action === "string" &&
            sanitizedCmd.action.toLowerCase().includes("password")
          ) {
            sanitizedCmd.action = "[REDACTED]";
          }
          return sanitizedCmd;
        });

        content += JSON.stringify(sanitizedCommands, null, 2);
        content += "\n  ```\n";
      }

      content += "\n";
    }

    await fs.writeFile(reportPath, content);
    this.cli.log(`📄 レポートを ${reportPath} に生成しました。`);
  }
}
