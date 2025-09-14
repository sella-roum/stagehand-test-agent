/**
 * @file ユーザー指示の意図を分類するエージェントが使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

/**
 * @schema instructionClassificationSchema
 * @description ユーザーの指示の意図を分類するためのZodスキーマ。
 */
export const instructionClassificationSchema = z.object({
  intent: z
    .enum(["action", "assertion"])
    .describe(
      "ユーザーの指示の意図。'action'はブラウザ上の操作、'assertion'は状態の検証を意味する。",
    ),
});

/**
 * @function getClassifierPrompt
 * @description 意図分類のためのプロンプトを生成します。
 * @param {string} instruction - ユーザーからの自然言語指示。
 * @returns {string} LLMに渡すプロンプト文字列。
 */
export function getClassifierPrompt(instruction: string): string {
  return `
あなたは、ユーザーからの指示が「操作(action)」なのか「検証(assertion)」なのかを分類する専門家です。

# ルール
- 指示がページの何かをクリックする、入力する、移動するなどの**行動**を促すものであれば "action" と分類してください。
- 指示がページの状態（テキストの表示、URL、要素の存在など）が期待通りか**確認**を求めるものであれば "assertion" と分類してください。
- 「確認」「検証」「表示されている」「含まれている」などの言葉は "assertion" の強いヒントです。

# 例
- 指示: "ログインボタンをクリックして" -> intent: "action"
- 指示: "検索バーに'テスト'と入力" -> intent: "action"
- 指示: "「ようこそ」と表示されていることを確認" -> intent: "assertion"
- 指示: "URLに'/dashboard'が含まれているか" -> intent: "assertion"

# 分類対象の指示
---
${instruction}
---

上記の指示の意図を分類し、指定されたJSON形式で出力してください。
`;
}
