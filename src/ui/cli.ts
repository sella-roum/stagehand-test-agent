/**
 * @file コマンドラインインターフェースの表示を担当。
 */
import chalk from "chalk";
import { TestStepResult } from "../core/ExecutionContext.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class CommandLineInterface {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({ input, output });
  }

  log(message: string) {
    console.log(message);
  }

  logStepStart(step: string) {
    console.log(chalk.yellow(`\n▶️  実行中: ${step}`));
  }

  logStepResult(result: TestStepResult) {
    if (result.status === "pass") {
      console.log(chalk.green(`✅  成功 (${result.durationMs}ms)`));
    } else {
      console.error(chalk.red(`❌  失敗 (${result.durationMs}ms)`));
      if (result.details) {
        console.error(chalk.red(`   詳細: ${result.details}`));
      }
    }
  }

  logReport(results: TestStepResult[]) {
    console.log(chalk.bold.blue("\n--- テストレポート ---"));
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    console.log(`合計: ${results.length}, 成功: ${passed}, 失敗: ${failed}`);
    console.log(chalk.bold.blue("--------------------"));
  }

  async ask(question: string): Promise<string> {
    return this.rl.question(chalk.cyan(question));
  }

  async confirm(question: string): Promise<boolean> {
    const answer = await this.rl.question(chalk.cyan(`${question} (y/n) `));
    return answer.toLowerCase() === "y";
  }

  close() {
    this.rl.close();
  }
}
