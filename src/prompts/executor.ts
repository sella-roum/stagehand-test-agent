/**
 * @file テスト実行エージェントがWhen句を解釈するために使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

export const executorSchema = z.object({
  observeInstruction: z
    .string()
    .describe(
      "Stagehandのpage.observe()に渡すための、操作対象要素を見つけるための自然言語指示。",
    ),
});

export function getExecutorPrompt(whenStep: string): string {
  return `
あなたは、Gherkinの'When'ステップを解釈し、Stagehandの'observe'メソッドで要素を特定するための指示に変換する専門家です。

# ルール
- 'When'ステップで記述されている操作対象（例：「ログインボタン」「検索バー」）を特定してください。
- その要素を見つけるための、簡潔で明確な自然言語の指示を生成してください。

# 例
入力:
'ユーザーが "ログイン" ボタンをクリックする'

出力 (JSON形式):
{
  "observeInstruction": "Find the login button"
}

# 変換対象の'When'ステップ
---
${whenStep}
`;
}
