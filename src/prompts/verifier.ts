/**
 * @file テスト実行エージェントがThen句を検証するために使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

export const verifierSchema = z.object({
  extractInstruction: z
    .string()
    .describe(
      "Stagehandのpage.extract()に渡すための、検証内容を確認するための質問。",
    ),
  assertion: z.object({
    expected: z.string().describe("期待される値（文字列）。"),
    operator: z
      .enum(["toContain", "notToContain", "toEqual"])
      .describe("比較演算子。"),
  }),
});

export function getVerifierPrompt(thenStep: string): string {
  return `
あなたは、Gherkinの'Then'ステップを解釈し、Stagehandの'extract'メソッドで検証可能な形式に変換する専門家です。

# ルール
- 'Then'ステップが何を検証しようとしているかを理解してください。
- 検証に必要な情報をページから抽出するための質問を'extractInstruction'として生成してください。
- 期待される値と、それに対する比較演算子（toContain, notToContain, toEqual）を'assertion'として定義してください。

# 例
入力:
'"ようこそ" というテキストが表示されている'

出力 (JSON形式):
{
  "extractInstruction": "ページ全体のテキストを抽出して",
  "assertion": {
    "expected": "ようこそ",
    "operator": "toContain"
  }
}

# 変換対象の'Then'ステップ
---
${thenStep}
`;
}
