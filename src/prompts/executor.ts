/**
 * @file テスト実行エージェントがWhen句を解釈するために使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

/**
 * @schema executorSchema
 * @description 操作(When)ステップの実行計画スキーマ。
 * AIに「何を探すか(observeInstruction)」と「どうしたいか(intendedAction)」を計画させる。
 */
export const executorSchema = z.object({
  observeInstruction: z
    .string()
    .describe(
      "Stagehandのpage.observe()に渡すための、操作対象要素を見つけるための自然言語指示。",
    ),
  /**
   * ユーザーのGherkinステップから推測される操作の意図。
   * これに基づき、observeが返した複数の候補をフィルタリングする。
   */
  intendedAction: z
    .enum([
      "click",
      "double_click",
      "fill",
      "press",
      "select",
      "hover",
      "scroll",
      "drag",
      "unknown",
    ])
    .describe(
      "ユーザーがその要素に対して行いたい操作の種別。" +
        "クリック/押下は'click'、" +
        "ダブルクリックは'double_click'、" +
        "テキスト入力/書き込みは'fill'、" +
        "Enterキーなどの単一キー押下は'press'、" +
        "ドロップダウン選択は'select'、" +
        "マウスオーバーは'hover'、" +
        "スクロール操作は'scroll'、" +
        "ドラッグ＆ドロップは'drag'、" +
        "不明な場合は'unknown'に分類する。",
    ),
});

export function getExecutorPrompt(whenStep: string): string {
  return `
あなたは、Gherkinの'When'ステップを解釈し、Stagehandで要素を特定するための指示と、実行すべき操作種別に変換する専門家です。

# ルール
- 'When'ステップで記述されている操作対象（例：「ログインボタン」「検索バー」）を特定してください。
- その要素を見つけるための、簡潔で明確な自然言語の指示を 'observeInstruction' として生成してください。
- そのステップがどの操作（click, double_click, fill, press, select, hover, scroll, drag）に該当するかを 'intendedAction' として分類してください。

# 出力例
入力:
'ユーザーが "ログイン" ボタンをクリックする'
出力 (JSON形式):
{
  "observeInstruction": "Find the login button",
  "intendedAction": "click"
}

入力:
'ユーザーが検索バーに "テスト" と入力する'
出力 (JSON形式):
{
  "observeInstruction": "Find the search bar",
  "intendedAction": "fill"
}

入力:
'ユーザーが国ドロップダウンから "日本" を選択する'
出力 (JSON形式):
{
  "observeInstruction": "Find the country dropdown",
  "intendedAction": "select"
}

入力:
'ユーザーがナビゲーションメニューの「製品」にマウスオーバーする'
出力 (JSON形式):
{
  "observeInstruction": "Find 'Products' in the navigation menu",
  "intendedAction": "hover"
}

入力:
'ユーザーがページ下部までスクロールする'
出力 (JSON形式):
{
  "observeInstruction": "Find the main page area or body",
  "intendedAction": "scroll"
}

入力:
'ユーザーが検索バーでEnterキーを押す'
出力 (JSON形式):
{
  "observeInstruction": "Find the search bar",
  "intendedAction": "press"
}

# 変換対象の'When'ステップ
---
${whenStep}
`;
}
