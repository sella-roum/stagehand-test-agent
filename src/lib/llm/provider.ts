/**
 * @file LLMプロバイダの抽象化レイヤー。
 * 環境変数に基づいて適切なLLMクライアントをインスタンス化します。
 */
import { LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createCerebras } from "@ai-sdk/cerebras";

/**
 * LLMの役割に応じたモデルを取得します。
 * @param {'default' | 'fast'} role - 'default'は高精度モデル、'fast'は高速モデルを意図します。
 * @returns {LanguageModel} LanguageModelインスタンス。
 * @throws {Error} 環境変数が設定されていない場合や、サポートされていないプロバイダが指定された場合にエラーをスローします。
 */
export function getLlm(role: "default" | "fast"): LanguageModel {
  const provider = process.env.LLM_PROVIDER?.toLowerCase() || "google";
  // プロバイダ名とロールから、`.env` ファイルに定義された環境変数名を動的に構築します。
  // 例: provider='google', role='fast' -> 'GOOGLE_FAST_MODEL'
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
      const apiKey = process.env.CEREBRAS_API_KEY;
      if (!apiKey) throw new Error("CEREBRAS_API_KEYが設定されていません。");
      return createCerebras({ apiKey })(modelName);
    }
    default:
      throw new Error(`サポートされていないプロバイダです: ${provider}`);
  }
}
