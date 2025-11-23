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
import { StepIntent } from "../types/recorder.js";

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
      this.context,
    );
  }

  /**
   * テスト実行のメインフローを開始します。
   * 実行フロー：
   * 1. トレースとログ監視の開始
   * 2. シナリオをGherkin形式に正規化
   * 3. (対話モード時) ユーザーに実行計画を承認させる
   * 4. Gherkinの各ステップを順番に実行
   * 5. トレースの保存と最終的なテストレポートを生成
   * @returns {Promise<void>}
   */
  async run(): Promise<void> {
    const reportDir = path.resolve(process.cwd(), "test-results");
    await fs.mkdir(reportDir, { recursive: true });
    const tracePath = path.join(reportDir, `trace-${Date.now()}.zip`);

    const consoleHandler = (msg: any) => {
      if (["error", "warning"].includes(msg.type())) {
        this.context.addConsoleLog(msg.type(), msg.text());
      }
    };
    const requestFailedHandler = (request: any) => {
      if (request.failure()) {
        this.context.addNetworkError(
          request.url(),
          0,
          request.failure()?.errorText || "Failed",
        );
      }
    };
    const responseHandler = (response: any) => {
      if (response.status() >= 400) {
        this.context.addNetworkError(
          response.url(),
          response.status(),
          response.statusText(),
        );
      }
    };

    try {
      await this.stagehand.page.context().tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });

      this.stagehand.page.on("console", consoleHandler);
      this.stagehand.page.on("requestfailed", requestFailedHandler);
      this.stagehand.page.on("response", responseHandler);

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

      if (this.context.mode.startsWith("interactive")) {
        const proceed =
          await this.cli.confirm("この計画でテストを実行しますか？");
        if (!proceed) {
          this.cli.log("テスト実行をキャンセルしました。");
          return;
        }
      }

      if (gherkinDocument.background) {
        for (const step of gherkinDocument.background) {
          await this.executeStep(step);
        }
      }

      for (const step of gherkinDocument.scenarios[0].steps) {
        await this.executeStep(step);
      }
    } catch (error) {
      console.error(
        chalk.red(
          `\n❌ テスト実行中にエラーが発生しました: ${(error as Error).message}`,
        ),
      );
    } finally {
      this.stagehand.page.off("console", consoleHandler);
      this.stagehand.page.off("requestfailed", requestFailedHandler);
      this.stagehand.page.off("response", responseHandler);

      await this.stagehand.page.context().tracing.stop({ path: tracePath });
      this.cli.log(chalk.gray(`\n🕵️ Trace saved: ${tracePath}`));

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

    const keyword = step.keyword.toLowerCase();
    const intent: StepIntent =
      keyword.includes("then") || keyword.includes("and")
        ? "assertion"
        : "action";
    this.cli.logStepIntent(intent);

    const startTime = Date.now();
    let status: "pass" | "fail" = "fail";
    let details: string | undefined;
    let screenshotPath: string | undefined;

    const historyStartIndex = this.stagehand.history.length;

    try {
      if (this.context.mode === "interactive") {
        const proceed = await this.cli.confirm("このステップを実行しますか？");
        if (!proceed) {
          throw new Error("ユーザーがステップ実行をキャンセルしました。");
        }
      }

      const plan = await this.testAgent.processStep(step);

      if (typeof plan === "object" && plan !== null && "method" in plan) {
        await this.stagehand.page.act(plan);
      } else if (typeof plan === "boolean" && !plan) {
        throw new Error(`検証ステップ「${step.text}」が失敗しました。`);
      }

      status = "pass";
    } catch (e: any) {
      status = "fail";
      details = e.message;
      try {
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

    if (this.context.gherkinDocument) {
      content += `## テスト計画\n\n`;
      content += `**Feature**: ${this.context.gherkinDocument.feature}\n`;

      const hasScenario =
        this.context.gherkinDocument.scenarios &&
        this.context.gherkinDocument.scenarios.length > 0;

      content += hasScenario
        ? `**Scenario**: ${this.context.gherkinDocument.scenarios[0].title}\n\n`
        : `**Scenario**: (なし)\n\n`;

      content += "```gherkin\n";
      if (this.context.gherkinDocument.background) {
        this.context.gherkinDocument.background.forEach((step) => {
          content += `${step.keyword} ${step.text}\n`;
        });
      }

      if (hasScenario) {
        this.context.gherkinDocument.scenarios[0].steps.forEach(
          (step: GherkinStep) => {
            content += `${step.keyword} ${step.text}\n`;
            if (step.table && step.table.length > 0) {
              const headers = Object.keys(step.table[0]);
              content += `  | ${headers.join(" | ")} |\n`;
              content += `  | ${headers.map(() => "---").join(" | ")} |\n`;
              step.table.forEach((row: Record<string, string>) => {
                const values = headers.map((header) =>
                  String(row[header]).replace(/\|/g, "\\|"),
                );
                content += `  | ${values.join(" | ")} |\n`;
              });
            }
          },
        );
      }
      content += "```\n\n";
    }

    content += `## 実行結果\n\n`;

    for (const result of this.context.stepResults) {
      const icon = result.status === "pass" ? "✅" : "❌";
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

        const normalizeKey = (key: string) =>
          key
            .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
            .replace(/[\s-]+/g, "_")
            .toLowerCase();

        const SENSITIVE_KEY_PATTERN =
          /\b(pass(word)?|secret|token|api_key|authorization|auth(entication|orization)?|credential(s)?|cookie|set_cookie|session|csrf|client_secret|access_token|id_token|refresh_token)\b/;

        const shouldRedactKey = (key: string) =>
          SENSITIVE_KEY_PATTERN.test(normalizeKey(key));

        const redact = (v: any): any => {
          if (v === null || typeof v !== "object") return v;
          if (Array.isArray(v)) return v.map((x) => redact(x));

          return Object.fromEntries(
            Object.entries(v).map(([k, val]) => [
              k,
              shouldRedactKey(k) ? "[REDACTED]" : redact(val),
            ]),
          );
        };
        const sanitizedCommands = result.commands.map((cmd) => redact(cmd));

        content += JSON.stringify(sanitizedCommands, null, 2);
        content += "\n  ```\n";
      }

      content += "\n";
    }

    await fs.writeFile(reportPath, content);
    this.cli.log(`📄 レポートを ${reportPath} に生成しました。`);
  }
}
