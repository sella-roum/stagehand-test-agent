/**
 * @file プロジェクトのエントリーポイント。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { createStagehandConfig } from "../stagehand.config.js";
import { ExecutionContext, ExecutionMode } from "./core/ExecutionContext.js";
import { TestOrchestrator } from "./core/TestOrchestrator.js";
import { CommandLineInterface } from "./ui/cli.js";
import fs from "fs/promises";
import path from "path";
import chalk from "chalk";

async function main() {
  const cli = new CommandLineInterface();
  cli.log("🚀 Stagehand Test Agent を起動します...");

  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  let mode: ExecutionMode = "autonomous";
  if (modeArg) {
    const modeValue = modeArg.split("=")[1];
    if (
      modeValue === "interactive" ||
      modeValue === "confirm" ||
      modeValue === "interactive:auto"
    ) {
      mode = modeValue as ExecutionMode;
    }
  }
  if (args.includes("--interactive")) {
    mode = "interactive";
  }

  const testFilePath = args.find((arg) => !arg.startsWith("--"));

  if (mode === "autonomous" && !testFilePath) {
    cli.log(
      "❌ エラー: 自律モードではテストシナリオファイルへのパスを指定してください。",
    );
    cli.log("例: npm start tests/scenarios/login.txt");
    cli.close();
    return;
  }

  const stagehandConfig = createStagehandConfig();
  if (process.env.CI || args.includes("--headless")) {
    stagehandConfig.localBrowserLaunchOptions = {
      ...stagehandConfig.localBrowserLaunchOptions,
      headless: true,
    };
  }

  const stagehand = new Stagehand(stagehandConfig);
  await stagehand.init();

  let executionContext: ExecutionContext | null = null;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let scenarioText: string;

      if (testFilePath && !executionContext) {
        // 自律モードの初回実行
        scenarioText = await fs.readFile(
          path.resolve(process.cwd(), testFilePath),
          "utf-8",
        );
      } else {
        // 対話モード、または自律モードの2回目以降のループ

        // headlessモードかどうかでInspectorの案内を動的に変更
        const isHeadless = stagehandConfig.localBrowserLaunchOptions?.headless;
        const inspectorPrompt = isHeadless ? "" : ", Inspector: 'inspector'";
        const promptMessage = `\nテストシナリオを入力してください (終了: 'exit'${inspectorPrompt}):\n> `;

        const userInput = await cli.ask(chalk.bold(promptMessage));

        // 空行または空白のみの入力をチェック
        if (userInput.trim() === "") {
          cli.log(
            "💡 空行です。シナリオ、または 'inspector' | 'exit' を入力してください。",
          );
          continue; // ループの先頭に戻り、再入力を促す
        }

        const command = userInput.trim().toLowerCase();

        if (command === "exit") {
          break; // ループを終了
        }

        // headlessモードでない場合のみinspectorコマンドを処理
        if (!isHeadless && command === "inspector") {
          cli.log(
            "🕵️ Playwright Inspectorを起動します... Inspectorを閉じて続行してください。",
          );
          // stagehand.page.pause() を呼び出してInspectorを起動
          await stagehand.page.pause();
          cli.log("✅ Inspectorが終了しました。操作を再開します。");
          continue; // 次のコマンド入力を待つためにループの先頭に戻る
        }

        // 'exit'でも'inspector'でもなければ、シナリオとして扱う
        scenarioText = userInput;
      }

      if (executionContext) {
        executionContext.resetForNewScenario(scenarioText);
      } else {
        executionContext = new ExecutionContext(mode, scenarioText);
      }

      const orchestrator = new TestOrchestrator(
        stagehand,
        executionContext,
        cli,
      );
      await orchestrator.run();

      if (mode === "autonomous") {
        break;
      }
    }
  } catch (error: any) {
    console.error(`\n❌ 致命的なエラーが発生しました: ${error.message}`);
  } finally {
    cli.log("\nセッションを終了します。");
    await stagehand.close();
    cli.close();
  }
}

main();
