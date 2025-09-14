/**
 * @file テストシナリオの記録ワークフローを統括するレコーダー。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { CommandLineInterface } from "../ui/cli.js";
// ToolCallResponseはエクスポートされていないため削除し、Clientのみインポート
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpTranslatorAgent } from "../agents/McpTranslatorAgent.js";
import { ScenarioGeneratorAgent } from "../agents/ScenarioGeneratorAgent.js";
import { RecordedStep } from "../types/recorder.js";
import { getLlm } from "../lib/llm/provider.js";
import path from "path";
import fs from "fs/promises";
import chalk from "chalk";

// 型ガード関数を改善し、any型を受け取れるようにする
function isTextResponse(
  response: any,
): response is { content: [{ text: string }] } {
  return (
    response &&
    Array.isArray(response.content) &&
    response.content.length > 0 &&
    typeof response.content[0].text === "string"
  );
}

export class ScenarioRecorder {
  private stagehand: Stagehand;
  private cli: CommandLineInterface;
  private mcpClient: McpClient | null = null;
  private recordedSteps: RecordedStep[] = [];
  private translatorAgent: McpTranslatorAgent;
  private generatorAgent: ScenarioGeneratorAgent;

  constructor(stagehand: Stagehand, cli: CommandLineInterface) {
    this.stagehand = stagehand;
    this.cli = cli;
    this.translatorAgent = new McpTranslatorAgent(getLlm("fast"));
    this.generatorAgent = new ScenarioGeneratorAgent(getLlm("default"));
  }

  /**
   * 記録セッションを開始し、ユーザーの操作指示を受け付けます。
   * @returns {Promise<string | null>} 保存されたシナリオのファイルパス、またはキャンセルされた場合はnull。
   */
  public async startRecording(): Promise<string | null> {
    let isRecording = true;
    try {
      await this.connectToMcp();

      // 記録ループ
      while (isRecording) {
        const instruction = await this.cli.ask(
          chalk.magenta("次の操作指示 > "),
        );
        const command = instruction.trim().toLowerCase();

        switch (command) {
          case "save":
            isRecording = false; // ループを抜ける
            return await this.saveScenario();
          case "cancel":
            isRecording = false; // ループを抜ける
            return null;
          default:
            await this.recordStep(instruction);
            break;
        }
      }
      return null; // 通常は到達しない
    } catch (error) {
      this.cli.log(
        chalk.red(`記録中にエラーが発生しました: ${(error as Error).message}`),
      );
      return null;
    } finally {
      await this.disconnectFromMcp();
    }
  }

  /**
   * Playwright-MCPサーバーを子プロセスとして起動し、接続します。
   */
  private async connectToMcp(): Promise<void> {
    this.cli.log("  - Playwright-MCPサーバーを起動中...");
    const command = "npx";
    const args = [
      "-y",
      "@playwright/mcp@latest",
      "--cdp-endpoint=http://localhost:9222",
    ];

    const transport = new StdioClientTransport({ command, args });

    this.mcpClient = new McpClient({
      name: "StagehandRecorder",
      version: "1.0",
    });
    await this.mcpClient.connect(transport);
    await this.mcpClient.ping();
    this.cli.log("  - MCPサーバーに接続しました。");
  }

  /**
   * MCPサーバーとの接続を解除し、プロセスを終了します。
   */
  private async disconnectFromMcp(): Promise<void> {
    if (this.mcpClient) {
      // transportがプロセスを管理しているので、clientをcloseすれば十分
      await this.mcpClient.close();
      this.mcpClient = null;
      this.cli.log("  - MCPサーバーを切断しました。");
    }
  }

  /**
   * ユーザーの単一の指示を記録・実行します。
   * @param {string} userInstruction - ユーザーからの自然言語の操作指示。
   */
  private async recordStep(userInstruction: string): Promise<void> {
    if (!this.mcpClient)
      throw new Error("MCPクライアントが接続されていません。");

    try {
      // 1. 現在のページ状態を取得
      const snapshotResponse = await this.mcpClient.callTool({
        name: "browser_snapshot",
      });

      if (!isTextResponse(snapshotResponse)) {
        throw new Error("スナップショットの取得に失敗しました。");
      }
      const snapshotText = snapshotResponse.content[0].text;

      // 2. LLMにツールコールを翻訳させる
      const toolCall = await this.translatorAgent.translate(
        userInstruction,
        snapshotText,
      );

      // 3. ツールを実行
      this.cli.log(
        chalk.gray(
          `  - 実行中: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`,
        ),
      );
      const result = await this.mcpClient.callTool(toolCall);

      if (result.isError) {
        if (isTextResponse(result)) {
          throw new Error(
            `MCPツールの実行に失敗しました: ${result.content[0].text}`,
          );
        }
        throw new Error(`MCPツールの実行に失敗しました: 不明なエラー`);
      }

      // 4. 成功した操作を履歴に追加
      this.recordedSteps.push({
        userInstruction,
        toolCall,
        snapshot: this.summarizeSnapshot(snapshotText),
      });
      this.cli.log(chalk.green("  - 操作を記録しました。"));
    } catch (error) {
      this.cli.log(
        chalk.red(`  - 操作に失敗しました: ${(error as Error).message}`),
      );
    }
  }

  /**
   * アクセシビリティツリーを要約して、後続のLLMへのコンテキストとして利用します。
   */
  private summarizeSnapshot(snapshot: string): string {
    const titleMatch = snapshot.match(/- Page Title: (.*)/);
    const title = titleMatch
      ? `ページタイトル「${titleMatch[1]}」`
      : "無題のページ";
    const elements =
      snapshot.match(/- (button|link|textbox|combobox) ".*"/g) || [];
    const summary = `${title}には、以下の要素があります: ${elements
      .map((e) => e.substring(2))
      .join(", ")}`;
    return summary.substring(0, 500); // 長さを制限
  }

  /**
   * 記録されたステップを自然言語シナリオに変換し、ファイルに保存します。
   */
  private async saveScenario(): Promise<string> {
    if (this.recordedSteps.length === 0) {
      throw new Error("記録された操作がありません。");
    }
    this.cli.log("  - 記録された操作からシナリオを生成中...");
    const generatedScenario = await this.generatorAgent.generate(
      this.recordedSteps,
    );

    const scenariosDir = path.resolve(process.cwd(), "tests/scenarios");
    await fs.mkdir(scenariosDir, { recursive: true });
    const filePath = path.join(scenariosDir, `recorded-${Date.now()}.txt`);
    await fs.writeFile(filePath, generatedScenario);

    return filePath;
  }
}
