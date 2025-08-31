/**
 * @file プロジェクトのエントリーポイント。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { createStagehandConfig } from "../stagehand.config.js"; // 動的設定関数をインポート
import { ExecutionContext, ExecutionMode } from "./core/ExecutionContext.js";
import { TestOrchestrator } from "./core/TestOrchestrator.js";
import { CommandLineInterface } from "./ui/cli.js";
import fs from "fs/promises";
import path from "path";

async function main() {
  const cli = new CommandLineInterface();
  cli.log("🚀 Stagehand Test Pilot を起動します...");

  const args = process.argv.slice(2);
  const mode: ExecutionMode = args.includes("--interactive")
    ? "interactive"
    : "autonomous";
  const testFilePath = args.find((arg) => !arg.startsWith("--"));

  if (mode === "autonomous" && !testFilePath) {
    cli.log(
      "❌ エラー: 自律モードではテストシナリオファイルへのパスを指定してください。",
    );
    cli.log("例: npm start tests/scenarios/login.txt");
    cli.close();
    return;
  }

  // 動的な設定オブジェクトを生成
  const stagehandConfig = createStagehandConfig();
  // CI環境など、ヘッドレスで実行したい場合の設定を上書き
  if (process.env.CI || args.includes("--headless")) {
    stagehandConfig.localBrowserLaunchOptions = {
      ...stagehandConfig.localBrowserLaunchOptions,
      headless: true,
    };
  }

  const stagehand = new Stagehand(stagehandConfig); // 生成した設定で初期化
  await stagehand.init();

  try {
    let scenarioText: string;
    if (mode === "interactive") {
      scenarioText = await cli.ask(
        "実行したいテストシナリオを自然言語で入力してください:\n> ",
      );
    } else {
      scenarioText = await fs.readFile(
        path.resolve(process.cwd(), testFilePath!),
        "utf-8",
      );
    }

    const context = new ExecutionContext(mode, scenarioText);
    const orchestrator = new TestOrchestrator(stagehand, context, cli);
    await orchestrator.run();
  } catch (error: any) {
    console.error(`\n❌ 致命的なエラーが発生しました: ${error.message}`);
  } finally {
    cli.log("\nセッションを終了します。");
    await stagehand.close();
    cli.close();
  }
}

main();
