/**
 * @file エラー発生時に自己修復のための代替案を考案させるプロンプトとスキーマを定義します。
 */
import { z } from "zod";

export const selfHealingSchema = z.object({
  causeAnalysis: z.string().describe("エラーの根本原因の簡潔な分析。"),
  alternativeInstruction: z
    .string()
    .describe(
      "問題を回避するための、page.act()またはpage.observe()に渡す新しい自然言語指示。",
    ),
});

export function getSelfHealingPrompt(
  failedStep: string,
  error: Error,
  pageContent: string,
): string {
  return `
あなたは、ブラウザテストのデバッグを行うエキスパートAIです。
テスト実行中に以下のエラーが発生しました。原因を分析し、テストを続行するための代替アクションを提案してください。

# 失敗したステップ
"${failedStep}"

# 発生したエラー
\`\`\`
${error.name}: ${error.message}
\`\`\`

# エラー発生時のページ内容の要約
\`\`\`
${pageContent.substring(0, 2000)}...
\`\`\`

# あなたのタスク
1.  エラーの原因を分析してください。特に'ElementNotFoundError'や'Timeout'エラーは、要素のセレクタが間違っているか、ページがまだ読み込み中、または要素が画面外にある可能性を示唆しています。
2.  ページ内容の要約をヒントに、元の意図（"${failedStep}"）を達成するための、より具体的で堅牢な新しい指示を考案してください。

# 指示の例
- より詳細な説明を使う: "「メインコンテンツエリアにある青い送信ボタン」をクリック"
- 代替テキストを使う: "「次へ」というテキストを持つリンクをクリック"
- 位置を指定する: "ページ上部にあるナビゲーションバーの「設定」アイコンをクリック"

# 出力形式
必ず指定されたJSON形式で出力してください。
`;
}
