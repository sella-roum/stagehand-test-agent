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

  switch (provider) {
    case "google":
      modelName = `google/${process.env.GOOGLE_DEFAULT_MODEL}`;
      modelClientOptions = { apiKey: process.env.GOOGLE_API_KEY };
      break;
    case "groq":
      modelName = `groq/${process.env.GROQ_DEFAULT_MODEL}`;
      modelClientOptions = { apiKey: process.env.GROQ_API_KEY };
      break;
    case "openai":
      modelName = `${process.env.OPENAI_DEFAULT_MODEL}`;
      modelClientOptions = {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      };
      break;
    case "cerebras":
      // StagehandはまだCerebrasをネイティブサポートしていない可能性があるため、
      // OpenAI互換エンドポイントとして設定します。
      modelName = `cerebras/${process.env.CEREBRAS_DEFAULT_MODEL}`;
      modelClientOptions = {
        apiKey: process.env.CEREBRAS_API_KEY,
        baseURL: "https://api.cerebras.ai/v1", // OpenAI互換エンドポイント
      };
      break;
    default:
      throw new Error(`サポートされていないプロバイダです: ${provider}`);
  }

  const config: ConstructorParams = {
    verbose: 1,
    domSettleTimeoutMs: 30_000,
    env: "LOCAL",
    localBrowserLaunchOptions: {
      headless: false,
      viewport: {
        width: 1280,
        height: 720,
      },
    },
    // Stagehandライブラリ自体が使用するLLMを明示的に指定
    modelName,
    modelClientOptions,
  };

  return config;
}
