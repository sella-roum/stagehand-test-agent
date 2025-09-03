/**
 * @file AIエージェントのエンドツーエンド(E2E)テストを定義します。
 * このファイルは、AIエージェントの動作を実際のブラウザ操作と連携させて検証します。
 * シナリオの解釈から、計画立案、ブラウザ操作、検証、自己修復まで、
 * プロジェクトのコアなワークフロー全体が正しく機能することを保証します。
 */
import { test, expect } from "@playwright/test";
import { Stagehand } from "@browserbasehq/stagehand";
import { createStagehandConfig } from "../stagehand.config.js";
import { ExecutionContext } from "../src/core/ExecutionContext.js";
import { TestOrchestrator } from "../src/core/TestOrchestrator.js";
import { CommandLineInterface } from "../src/ui/cli.js";
import fs from "fs/promises";
import path from "path";

// LLM APIの応答が遅延する場合を考慮し、テスト全体のタイムアウトを5分に延長します。
test.setTimeout(300000);

/**
 * テスト用のシナリオファイルを一時的に作成するヘルパー関数です。
 * CI/CD環境やローカルでのテスト実行時に、動的にテストケースを生成するのに役立ちます。
 * これにより、`npm start tests/scenarios/some-file.txt` のようなファイルベースの実行をシミュレートします。
 *
 * @param {string} name - 作成するファイル名 (例: 'google-search.txt')。
 * @param {string} content - ファイルに書き込むシナリオテキスト。
 * @returns {Promise<string>} 作成されたファイルの絶対パス。
 */
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

/**
 * @description Stagehand Test AgentのE2Eテストスイート。
 * AIエージェントのコア機能が、実際のブラウザ環境で期待通りに動作することを検証します。
 */
test.describe("Stagehand Test Agent E2E", () => {
  let stagehand: Stagehand;
  let cli: CommandLineInterface;

  /**
   * @description 各テストの実行前に、クリーンなテスト環境をセットアップします。
   * 1. Stagehandの新しいインスタンスを初期化し、テスト間の独立性を保証します。
   * 2. CommandLineInterfaceをモックし、自動テスト中にユーザー入力で停止するのを防ぎます。
   */
  test.beforeEach(async () => {
    const stagehandConfig = createStagehandConfig();
    // CI環境やヘッドレスモードでの実行を想定し、ブラウザUIを表示しないように設定
    stagehandConfig.localBrowserLaunchOptions = { headless: true };
    stagehand = new Stagehand(stagehandConfig);

    await stagehand.init();

    // テスト実行中にコンソールが冗長な出力で汚れるのを防ぎ、
    // 自動テストをスムーズに実行するために、CLIインターフェースを空の関数でモックします。
    // これにより、ユーザーへの確認(confirm)は常にtrueを返すようになります。
    cli = {
      log: () => {},
      logStepStart: () => {},
      logStepResult: () => {},
      logReport: () => {},
      ask: async () => "",
      confirm: async () => true, // `confirm`は常にtrueを返し、確認プロンプトを自動承認します。
      close: () => {},
    } as unknown as CommandLineInterface;
  });

  /**
   * @description 各テストの後にブラウザセッションを安全にクリーンアップし、リソースを解放します。
   */
  test.afterEach(async () => {
    await stagehand.close();
  });

  /**
   * @description 基本的な自然言語シナリオを解釈し、検索、ページ遷移、要素の検証という
   * 一連の操作を正しく実行できるか検証します。
   */
  test("正常系: Google検索からStagehandのドキュメントを検証する", async () => {
    const scenario = `
      Googleで「Stagehand AI」を検索して、公式サイトにアクセスし、
      ドキュメントの「Quickstart」ページに「Installation」という見出しがあることを確認する。
    `;
    await createScenarioFile("google-search.txt", scenario);

    // テスト実行のコンテキストを初期化します。自律モードで、指定されたシナリオを実行します。
    const context = new ExecutionContext("autonomous", scenario);
    // テスト全体の実行を管理するオーケストレーターを生成します。
    const orchestrator = new TestOrchestrator(stagehand, context, cli);

    // テスト実行を開始し、エラーが発生しないことを期待します。
    await expect(orchestrator.run()).resolves.not.toThrow();

    // テスト完了後の最終的な状態を検証します。
    const finalUrl = stagehand.page.url();
    expect(finalUrl).toContain("stagehand.dev/basics/installation");

    const failedSteps = context.stepResults.filter(
      (r) => r.status === "fail",
    ).length;
    expect(failedSteps).toBe(0);
  });

  /**
   * @description Gherkin形式のデータテーブルを含む、より複雑なシナリオを正しく解釈し、
   * フォーム入力や複数ステップの検証を実行できるか検証します。
   */
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
    await createScenarioFile("ecommerce-purchase.txt", scenario);

    // このテストケースでも同様に、コンテキストとオーケストレーターをセットアップします。
    const context = new ExecutionContext("autonomous", scenario);
    const orchestrator = new TestOrchestrator(stagehand, context, cli);

    // テスト実行を開始し、エラーが発生しないことを期待します。
    await expect(orchestrator.run()).resolves.not.toThrow();

    // テスト完了後の最終的な状態を検証します。
    const finalUrl = stagehand.page.url();
    expect(finalUrl).toContain("checkout-complete.html");

    const failedSteps = context.stepResults.filter(
      (r) => r.status === "fail",
    ).length;
    expect(failedSteps).toBe(0);
  });
});
