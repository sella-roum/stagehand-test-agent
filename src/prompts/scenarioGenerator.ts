/**
 * @file シナリオ生成エージェントが使用するプロンプトを定義します。
 */
import { RecordedStep } from "../types/recorder.js";

export function getScenarioGeneratorPrompt(steps: RecordedStep[]): string {
  const formattedSteps = steps
    .map(
      (step, index) =>
        `ステップ ${index + 1}:\n- ユーザー指示: "${
          step.userInstruction
        }"\n- 実行された操作: ${step.toolCall.name}\n- 操作前のページ状態(要約): ${
          step.snapshot
        }`,
    )
    .join("\n\n");

  return `
あなたは、優秀なQAエンジニア兼テクニカルライターです。
あなたの仕事は、以下に提供される一連の技術的な操作ログを分析し、それを第三者が読んでも理解できる、自然で一貫した単一の段落からなるテストシナリオに清書することです。

# 厳格なルール
- 最終的な出力は、単一の段落からなる自然な文章でなければなりません。
- 各操作の技術的な詳細（例：'browser_click'、'ref' ID）は完全に省略してください。
- ユーザーの指示の意図を汲み取り、物語のように繋げてください。
- Gherkin形式（Given/When/Then）は使用しないでください。
- 操作の目的が明確になるように、必要に応じて文脈を補ってください。

# 非常に良い例
入力ログ:
ステップ 1:
- ユーザー指示: "Googleを開いて"
- 実行された操作: browser_navigate
- 操作前のページ状態(要約): ...
ステップ 2:
- ユーザー指示: "検索バーに「Stagehand AI」と入力"
- 実行された操作: browser_type
- 操作前のページ状態(要約): ...
ステップ 3:
- ユーザー指示: "検索ボタンをクリック"
- 実行された操作: browser_click
- 操作前のページ状態(要約): ...

出力シナリオ:
Googleにアクセスし、検索バーに「Stagehand AI」と入力して検索を実行する。

# 以下が清書対象の操作ログです
---
${formattedSteps}
---

上記のログを、単一の段落からなる自然なテストシナリオに変換してください。
`;
}
