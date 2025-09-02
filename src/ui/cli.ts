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

  /**
   * ユーザーに質問し、空でない入力を受け取るまで繰り返します。
   * @param {string} question - 表示する質問文。
   * @returns {Promise<string>} ユーザーが入力した文字列。
   */
  async ask(question: string): Promise<string> {
    let answer = "";
    // ユーザーが空の文字列を入力した場合に、再度入力を促すためのバリデーションループ
    while (!answer) {
      const input = await this.rl.question(chalk.cyan(question));
      answer = input.trim();
      if (!answer) {
        console.log(chalk.yellow("入力が空です。もう一度入力してください。"));
      }
    }
    return answer;
  }

  /**
   * ユーザーにy/nの確認を求め、有効な入力があるまで繰り返します。
   * @param {string} question - 表示する質問文。
   * @returns {Promise<boolean>} ユーザーが 'y' を入力した場合は true, 'n' を入力した場合は false。
   */
  async confirm(question: string): Promise<boolean> {
    let isValidInput = false;
    let result = false;
    // ユーザーが 'y' または 'n' 以外を入力した場合に、再度入力を促すためのバリデーションループ
    while (!isValidInput) {
      const answer = await this.rl.question(chalk.cyan(`${question} (y/n) `));
      const normalizedAnswer = answer.trim().toLowerCase();
      if (normalizedAnswer === "y" || normalizedAnswer === "yes") {
        isValidInput = true;
        result = true;
      } else if (normalizedAnswer === "n" || normalizedAnswer === "no") {
        isValidInput = true;
        result = false;
      } else {
        console.log(
          chalk.yellow("無効な入力です。'y' または 'n' で回答してください。"),
        );
      }
    }
    return result;
  }

  close() {
    this.rl.close();
  }
}
