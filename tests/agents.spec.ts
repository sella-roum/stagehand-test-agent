/**
 * @file AIエージェントのエンドツーエンドテストを定義します。
 */
import { test, expect } from "@playwright/test";
import { Stagehand } from "@browserbasehq/stagehand";
import { createStagehandConfig } from "../stagehand.config.js";
import { ExecutionContext } from "../src/core/ExecutionContext.js";
import { TestOrchestrator } from "../src/core/TestOrchestrator.js";
import { CommandLineInterface } from "../src/ui/cli.js";
import fs from "fs/promises";
import path from "path";

// AIの応答時間を考慮し、テスト全体のタイムアウトを5分に設定
test.setTimeout(300000);

// テスト用のシナリオファイルを作成するヘルパー関数
async function createScenarioFile(
  name: string,
  content: string,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "tests/scenarios");
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content);
  return filePath;
}

test.describe("Stagehand Test Pilot E2E", () => {
  let stagehand: Stagehand;
  let cli: CommandLineInterface;

  // 各テストの前にStagehandを初期化
  test.beforeEach(async () => {
    const stagehandConfig = createStagehandConfig();
    stagehandConfig.localBrowserLaunchOptions = { headless: true };
    stagehand = new Stagehand(stagehandConfig);

    await stagehand.init();
    // テスト中はコンソール出力を抑制するため、モックのCLIを使用
    cli = {
      log: () => {},
      logStepStart: () => {},
      logStepResult: () => {},
      logReport: () => {},
      ask: async () => "",
      confirm: async () => true,
      close: () => {},
    } as unknown as CommandLineInterface;
  });

  // 各テストの後にStagehandをクローズ
  test.afterEach(async () => {
    await stagehand.close();
  });

  test("正常系: Google検索からStagehandのドキュメントを検証する", async () => {
    const scenario = `
      Googleで「Stagehand AI」を検索して、公式サイトにアクセスし、
      ドキュメントの「Quickstart」ページに「Installation」という見出しがあることを確認する。
    `;
    // --- START: 修正箇所 ---
    // 未使用の戻り値は変数に代入しない
    await createScenarioFile("google-search.txt", scenario);
    // --- END: 修正箇所 ---

    const context = new ExecutionContext("autonomous", scenario);
    const orchestrator = new TestOrchestrator(stagehand, context, cli);

    await expect(orchestrator.run()).resolves.not.toThrow();

    const finalUrl = stagehand.page.url();
    expect(finalUrl).toContain("stagehand.dev/basics/installation");
    const failedSteps = context.stepResults.filter(
      (r) => r.status === "fail",
    ).length;
    expect(failedSteps).toBe(0);
  });

  test("データテーブル: Eコマースサイトでの購入フローをテストする", async () => {
    const scenario = `
      フィーチャー: ECサイトでの商品購入
      シナリオ: ログインして商品をカートに追加し、購入手続きで情報を入力する

      前提: ユーザーがダミーのECサイト "https://www.saucedemo.com" を開いている
      操作: ユーザーがユーザー名 "standard_user" とパスワード "secret_sauce" を入力する
      操作: ユーザーが "Login" ボタンをクリックする
      検証: URLに "/inventory.html" が含まれていること

      操作: ユーザーが "Sauce Labs Backpack" をカートに追加する
      検証: カートアイコンに "1" と表示されていること

      操作: ユーザーがカートアイコンをクリックする
      操作: ユーザーが "Checkout" ボタンをクリックする

      操作: ユーザーが配送先情報を入力する
      | First Name | Hanako |
      | Last Name  | Tanaka |
      | Zip/Postal Code | 123-4567 |
      操作: ユーザーが "Continue" ボタンをクリックする
      検証: "Payment Information" というテキストが表示されていること

      操作: ユーザーが "Finish" ボタンをクリックする
      検証: "Thank you for your order!" というテキストが表示されていること
    `;
    // 未使用の戻り値は変数に代入しない
    await createScenarioFile("ecommerce-purchase.txt", scenario);

    const context = new ExecutionContext("autonomous", scenario);
    const orchestrator = new TestOrchestrator(stagehand, context, cli);

    await expect(orchestrator.run()).resolves.not.toThrow();

    const finalUrl = stagehand.page.url();
    expect(finalUrl).toContain("checkout-complete.html");
    const failedSteps = context.stepResults.filter(
      (r) => r.status === "fail",
    ).length;
    expect(failedSteps).toBe(0);
  });
});
