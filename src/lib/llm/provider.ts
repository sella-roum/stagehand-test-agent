/**
 * @file LLMプロバイダの抽象化レイヤー。
 * 環境変数に基づいて適切なLLMクライアントをインスタンス化します。
 */
import { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
// Cerebrasの公式SDKまたはカスタムクライアントを想定
// import { createCerebras } from "@ai-sdk/cerebras"; // (仮)

/**
 * LLMの役割に応じたモデルを取得します。
 * @param role 'default' (高精度) または 'fast' (高速)
 * @returns LanguageModelインスタンス
 */
export function getLlm(role: "default" | "fast"): LanguageModel {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || "google";
  const modelEnvVar = `${provider.toUpperCase()}_${role.toUpperCase()}_MODEL`;
  const modelName = process.env[modelEnvVar];

  if (!modelName) {
    throw new Error(`環境変数 ${modelEnvVar} が.envに設定されていません。`);
  }

  switch (provider) {
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) throw new Error("GOOGLE_API_KEYが設定されていません。");
      return createGoogleGenerativeAI({ apiKey })(modelName);
    }
    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEYが設定されていません。");
      return createGroq({ apiKey })(modelName);
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEYが設定されていません。");
      return createOpenAI({
        apiKey,
        baseURL: process.env.OPENAI_BASE_URL || undefined,
      })(modelName);
    }
    case "cerebras": {
      // 注: 現状、Vercel AI SDKに公式のCerebrasプロバイダはありません。
      // ここではカスタムクライアントを実装する想定のプレースホルダーです。
      // 実際のプロジェクトではここにCerebrasClientを実装します。
      throw new Error("Cerebrasはまだサポートされていません。");
    }
    default:
      throw new Error(`サポートされていないプロバイダです: ${provider}`);
  }
}
