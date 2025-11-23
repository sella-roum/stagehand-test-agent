/**
 * @file テスト実行エージェントがThen句を検証するために使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

const textOperatorSchema = z.enum(["toContain", "notToContain", "toEqual"]);
const stateCheckSchema = z.enum([
  "exists",
  "not_exists",
  "visible",
  "hidden",
  "enabled",
  "disabled",
  "checked",
  "unchecked",
  "value_equals",
]);

export const verifierSchema = z.discriminatedUnion("assertionType", [
  z
    .object({
      assertionType: z.literal("text"),
      extractInstruction: z
        .string()
        .describe(
          "assertionTypeが'text'の場合に、検証内容を確認するための質問。",
        ),
      assertion: z
        .object({
          expected: z.string().describe("期待される値（文字列）。"),
          operator: textOperatorSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      assertionType: z.literal("element_state"),
      observeInstruction: z
        .string()
        .describe(
          "assertionTypeが'element_state'の場合に、検証対象の要素を見つけるための指示。",
        ),
      assertion: z
        .object({
          check: stateCheckSchema.describe("検証する状態の種類。"),
          expectedValue: z
            .string()
            .optional()
            .describe("value_equalsの場合の期待値。"),
        })
        .strict(),
    })
    .strict(),
]);

export function getVerifierPrompt(thenStep: string): string {
  return `
あなたは、Gherkinの'Then'ステップを解釈し、Stagehandで検証可能な形式に変換する専門家です。

必ず有効なJSONのみを出力してください。コードフェンス(\`\`\`)やコメント、説明文は出力しないでください。キーはダブルクォートで囲みます。

# あなたのタスク
ユーザーの'Then'ステップの意図を分析し、以下の検証タイプのいずれかを選択してください。

1.  **テキスト内容の検証 (assertionType: "text")**:
    - ページ上のテキスト、URL、タイトルなどが特定の値を含んでいるか、または等しいかを確認する場合。
    - この場合、'extractInstruction'と'assertion' (operator: 'toContain', 'notToContain', 'toEqual') を使用します。

2.  **要素の状態検証 (assertionType: "element_state")**:
    - 要素の存在、可視性、有効無効、チェック状態、入力値などを検証する場合。
    - この場合、'observeInstruction'と'assertion' (check: "exists", "not_exists", "visible", "hidden", "enabled", "disabled", "checked", "unchecked", "value_equals") を使用します。

# ルール
- ユーザーの指示に最も適した'assertionType'を1つ選択してください。
- 'expected'や'expectedValue'は、検証に必要な期待値を記述してください。

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

## 要素の状態検証 (存在)
入力: 'Githubへのリンクが存在することを確認'
出力 (JSON形式):
{
  "assertionType": "element_state",
  "observeInstruction": "Find the link to Github",
  "assertion": {
    "check": "exists"
  }
}

## 要素の状態検証 (入力値)
入力: '名前フィールドの値が "Taro" であること'
出力 (JSON形式):
{
  "assertionType": "element_state",
  "observeInstruction": "Find the name input field",
  "assertion": {
    "check": "value_equals",
    "expectedValue": "Taro"
  }
}

# 変換対象の'Then'ステップ
---
${thenStep}
`;
}
