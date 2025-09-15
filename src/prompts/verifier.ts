/**
 * @file テスト実行エージェントがThen句を検証するために使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

// 演算子に 'toExist' と 'notToExist' を追加
const assertionOperatorSchema = z.enum([
  "toContain",
  "notToContain",
  "toEqual",
  "toExist",
  "notToExist",
]);

export const verifierSchema = z.object({
  // 検証の種類を判断するためのフィールドを追加
  assertionType: z
    .enum(["text", "element"])
    .describe(
      "検証の種類。'text'はテキスト内容の比較、'element'は要素の存在確認。",
    ),
  // 'element'検証の場合、observeInstructionを使用
  observeInstruction: z
    .string()
    .optional()
    .describe(
      "assertionTypeが'element'の場合に、存在を確認する要素を見つけるための指示。",
    ),
  // 'text'検証の場合、extractInstructionを使用
  extractInstruction: z
    .string()
    .optional()
    .describe("assertionTypeが'text'の場合に、検証内容を確認するための質問。"),
  assertion: z.object({
    expected: z
      .string()
      .describe(
        "期待される値（文字列）。'toExist'/'notToExist'の場合は空文字列でもよい。",
      ),
    operator: assertionOperatorSchema,
  }),
});

export function getVerifierPrompt(thenStep: string): string {
  return `
あなたは、Gherkinの'Then'ステップを解釈し、Stagehandで検証可能な形式に変換する専門家です。

# あなたのタスク
ユーザーの'Then'ステップの意図を分析し、以下の2種類の検証のどちらに該当するかを判断してください。

1.  **テキスト内容の検証 (assertionType: "text")**:
    - ページ上のテキスト、URL、タイトルなどが特定の値を含んでいるか、または等しいかを確認する場合。
    - この場合、'extractInstruction'と'assertion' (operator: 'toContain', 'notToContain', 'toEqual') を使用します。

2.  **要素の存在検証 (assertionType: "element")**:
    - 特定のボタン、リンク、見出しなどがページ上に表示されているか（または表示されていないか）を確認する場合。
    - この場合、'observeInstruction'と'assertion' (operator: 'toExist', 'notToExist') を使用します。

# ルール
- ユーザーの指示に最も適した'assertionType'を1つ選択してください。
- 'assertionType'が"text"の場合、'observeInstruction'は不要です。
- 'assertionType'が"element"の場合、'extractInstruction'は不要です。
- 'expected'は、テキスト検証の場合は期待値を、存在検証の場合は要素の説明を簡潔に記述してください。

# 例
## テキスト内容の検証
入力: '"ようこそ" というテキストが表示されている'
出力 (JSON形式):
{
  "assertionType": "text",
  "extractInstruction": "ページ全体のテキストを抽出して",
  "assertion": {
    "expected": "ようこそ",
    "operator": "toContain"
  }
}

## 要素の存在検証
入力: 'Githubへのリンクが存在することを確認'
出力 (JSON形式):
{
  "assertionType": "element",
  "observeInstruction": "Find the link to Github",
  "assertion": {
    "expected": "Githubへのリンク",
    "operator": "toExist"
  }
}

# 変換対象の'Then'ステップ
---
${thenStep}
`;
}
