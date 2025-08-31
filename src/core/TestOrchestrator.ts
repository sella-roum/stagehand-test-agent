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

/**
 * @class TestOrchestrator
 * @description テストの実行フロー全体を管理し、AIエージェントとUIを協調させるクラス。
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
   * シナリオの正規化、ステップごとの実行、レポート生成までを統括します。
   * @returns {Promise<void>}
   */
  async run(): Promise<void> {
    try {
      this.cli.log(
        `📝 シナリオを正規化中...\n"${this.context.originalScenario}"`,
      );
      const gherkinDocument = await this.normalizerAgent.normalize(
        this.context.originalScenario,
      );
      this.context.setGherkinDocument(gherkinDocument);

      this.cli.log("✅ Gherkin形式への変換完了。");
      this.cli.log(
        `Feature: ${gherkinDocument.feature}\nScenario: ${gherkinDocument.scenarios[0].title}`,
      );

      if (this.context.mode === "interactive") {
        const proceed =
          await this.cli.confirm("この計画でテストを実行しますか？");
        if (!proceed) {
          this.cli.log("テスト実行をキャンセルしました。");
          return;
        }
      }

      // Backgroundステップの実行
      if (gherkinDocument.background) {
        for (const step of gherkinDocument.background) {
          await this.executeStep(step);
        }
      }

      // Scenarioステップの実行 (最初のシナリオのみ)
      for (const step of gherkinDocument.scenarios[0].steps) {
        await this.executeStep(step);
      }

      this.cli.logReport(this.context.stepResults);
      await this.generateReport();
    } catch (error) {
      this.cli.logReport(this.context.stepResults);
      await this.generateReport();
      // エラーを再スローして、呼び出し元（特にテストランナー）に失敗を通知する
      throw error;
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
    const startTime = Date.now();
    let status: "pass" | "fail" = "fail";
    let details: string | undefined;
    let screenshotPath: string | undefined;

    try {
      if (this.context.mode === "interactive") {
        const proceed = await this.cli.confirm("このステップを実行しますか？");
        if (!proceed) {
          throw new Error("ユーザーがステップ実行をキャンセルしました。");
        }
      }

      await this.testAgent.executeStep(step);
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
    this.context.addResult({
      step: fullStep,
      status,
      durationMs,
      details,
      screenshotPath,
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
      content += `**Feature**: ${this.context.gherkinDocument.feature}\n`;
      content += `**Scenario**: ${this.context.gherkinDocument.scenarios[0].title}\n\n`;
    }

    for (const result of this.context.stepResults) {
      const icon = result.status === "pass" ? "✅" : "❌";
      content += `## ${icon} ${result.step}\n`;
      content += `- **結果**: ${result.status}\n`;
      content += `- **実行時間**: ${result.durationMs}ms\n`;
      if (result.details) {
        content += `- **詳細**: \`\`\`\n${result.details}\n\`\`\`\n`;
      }
      if (result.screenshotPath) {
        // 相対パスに変換してレポートのポータビリティを向上
        const relativePath = path.relative(reportDir, result.screenshotPath);
        content += `- **証跡**: ![Failure Screenshot](${relativePath})\n`;
      }
      content += "\n";
    }

    await fs.writeFile(reportPath, content);
    this.cli.log(`📄 レポートを ${reportPath} に生成しました。`);
  }
}
