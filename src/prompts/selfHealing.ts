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
  accessibilityTree: string,
  logs: string,
): string {
  return `
あなたは、ブラウザテストのデバッグを行うエキスパートAIです。
テスト実行中に以下のエラーが発生しました。提供された情報を元に原因を分析し、テストを続行するための代替アクションを提案してください。

# 失敗したステップ
"${failedStep}"

# 発生したエラー
\`\`\`
${error.name}: ${error.message}
\`\`\`

# ブラウザログとネットワークエラー
\`\`\`
${logs}
\`\`\`

# エラー発生時の画面構造 (Accessibility Tree)
\`\`\`json
${accessibilityTree}
\`\`\`

# あなたのタスク
1.  コンソールログやネットワークエラーを確認し、APIエラー(500)やJSエラーが操作不能の原因になっていないか分析してください。
2.  アクセシビリティツリーを分析し、対象要素が本当に存在するか、名前(name)や役割(role)が想定通りか、disabled状態でないかを確認してください。
3.  エラーの原因を特定し、元の意図（"${failedStep}"）を達成するための、より具体的で堅牢な新しい指示を考案してください。

# 指示の例
- より詳細な説明を使う: "「メインコンテンツエリアにある青い送信ボタン」をクリック"
- 代替テキストを使う: "「次へ」というテキストを持つリンクをクリック"
- 位置を指定する: "ページ上部にあるナビゲーションバーの「設定」アイコンをクリック"

# 出力形式
必ず指定されたJSON形式で出力してください。
`;
}
