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
  cli.log("🚀 Stagehand Test Pilot を起動します...");

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
        scenarioText = await fs.readFile(
          path.resolve(process.cwd(), testFilePath),
          "utf-8",
        );
      } else {
        scenarioText = await cli.ask(
          chalk.bold(
            "\n次のテストシナリオを入力してください (終了するには 'exit' と入力):\n> ",
          ),
        );
        if (scenarioText.toLowerCase() === "exit") {
          break;
        }
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
