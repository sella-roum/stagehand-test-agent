/**
 * @file Stagehandの動的な設定を生成するファクトリ関数を提供します。
 */
import type { ConstructorParams } from "@browserbasehq/stagehand";
import dotenv from "dotenv";

// .envファイルから環境変数を読み込む
dotenv.config();

/**
 * 現在の環境変数に基づいて、Stagehandのコンストラクタに渡すための
 * 設定オブジェクトを動的に生成します。
 * @returns {ConstructorParams} Stagehandに渡す設定オブジェクト。
 */
export function createStagehandConfig(): ConstructorParams {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || "google";

  let modelName: string;
  let modelClientOptions: ConstructorParams["modelClientOptions"];

  // Stagehandライブラリ自体のデフォルトモデルとして、常にFASTモデルを使用するように変更
  switch (provider) {
    case "google":
      modelName = `google/${process.env.GOOGLE_FAST_MODEL}`;
      modelClientOptions = { apiKey: process.env.GOOGLE_API_KEY };
      break;
    case "groq":
      modelName = `groq/${process.env.GROQ_FAST_MODEL}`;
      modelClientOptions = { apiKey: process.env.GROQ_API_KEY };
      break;
    case "openai":
      modelName = `${process.env.OPENAI_FAST_MODEL}`;
      modelClientOptions = {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      };
      break;
    case "cerebras":
      modelName = `cerebras/${process.env.CEREBRAS_FAST_MODEL}`;
      modelClientOptions = {
        apiKey: process.env.CEREBRAS_API_KEY,
        baseURL: "https://api.cerebras.ai/v1",
      };
      break;
    default:
      throw new Error(`サポートされていないプロバイダです: ${provider}`);
  }

  /**
   * Stagehandのコンストラクタに渡す設定オブジェクトです。
   * ライブラリの挙動を詳細に制御します。
   */
  const config: ConstructorParams = {
    // Stagehandライブラリの内部ログの出力レベル。0はログを抑制します。
    // ログの詳細度レベル: 0 = サイレント, 1 = 情報, 2 = すべて
    verbose: 0,
    // ページ操作後にDOMが安定するのを待つ最大時間（ミリ秒）。
    // JavaScriptによる動的なコンテンツ描画が完了するのを待つために重要です。
    domSettleTimeoutMs: 30_000,
    // 実行環境を指定します。'LOCAL'はローカルマシンでブラウザを起動・管理することを意味します。
    env: "LOCAL",
    // 'env'が'LOCAL'の場合に使用される、Playwrightのブラウザ起動オプション。
    localBrowserLaunchOptions: {
      // `false`にすると、テスト実行中にブラウザUIが表示され、デバッグが容易になります。
      // CI/CD環境では `true` にすることが一般的です。
      headless: false,
      // ブラウザの表示領域サイズ。
      // レスポンシブデザインによるレイアウト崩れを防ぎ、テストの再現性を高めます。
      viewport: {
        width: 1280,
        height: 720,
      },
      /**
       * Chrome DevTools Protocol (CDP) のデバッグポートを有効にします。
       * これにより、Playwright-MCPのような外部ツールが、起動済みのブラウザインスタンスに接続して
       * 制御することが可能になります。
       * 注意: 現在ポートは9222に固定されています。将来的に動的なポート割り当てを検討する可能性があります。
       */
      args: ["--remote-debugging-port=9222"],
    },
    // Stagehandライブラリ自体が内部的に使用するLLM。
    // DOM解析など頻繁な呼び出しのために、コストと速度に優れた高速なモデルを指定します。
    modelName,
    modelClientOptions,
  };

  return config;
}
