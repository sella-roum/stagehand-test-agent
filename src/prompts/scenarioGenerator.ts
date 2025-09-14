/**
 * @file シナリオ生成エージェントが使用するプロンプトを定義します。
 */
import { RecordedStep } from "../types/recorder.js";

export function getScenarioGeneratorPrompt(steps: RecordedStep[]): string {
  const formattedSteps = steps
    .map(
      (step, index) =>
        `ステップ ${index + 1} (意図: ${step.type}): "${step.userInstruction}"`,
    )
    .join("\n");

  return `
あなたは、優秀なQAエンジニア兼テクニカルライターです。
あなたの仕事は、以下に提供される一連の操作ログを分析し、それを第三者が読んでも理解できる、自然で一貫した単一の段落からなるテストシナリオに清書することです。

# 厳格なルール
- 最終的な出力は、単一の段落からなる自然な文章でなければなりません。
- 各ステップの意図('action'または'assertion')を考慮してください。
  - 'action'は「〜する。」「〜し、」のような能動的な操作として記述します。
  - 'assertion'は「〜されていることを確認する。」のように、検証の文章として記述します。
- ユーザーの指示の意図を汲み取り、物語のように自然に繋げてください。
- Gherkinキーワード（Given/When/Then）は使用しないでください。

# 非常に良い例
入力ログ:
ステップ 1 (意図: action): "Googleを開いて"
ステップ 2 (意図: action): "検索バーに「Stagehand AI」と入力"
ステップ 3 (意図: action): "検索ボタンをクリック"
ステップ 4 (意図: assertion): "「stagehand.dev」というリンクが表示されていることを確認"

出力シナリオ:
Googleにアクセスし、検索バーに「Stagehand AI」と入力して検索を実行する。次に、検索結果に「stagehand.dev」というリンクが表示されていることを確認する。

# 以下が清書対象の操作ログです
---
${formattedSteps}
---

上記のログを、単一の段落からなる自然なテストシナリオに変換してください。
`;
}
