/**
 * @file MCPツールコールへの翻訳エージェントが使用するプロンプトとスキーマを定義します。
 */
import { z } from "zod";

export const mcpToolCallSchema = z.object({
  name: z.string().describe("実行するPlaywright-MCPツールの名前。"),
  arguments: z.record(z.any()).describe("ツールに渡す引数オブジェクト。"),
});

export type McpToolCall = z.infer<typeof mcpToolCallSchema>;

export function getMcpTranslatorPrompt(
  instruction: string,
  snapshot: string,
): string {
  return `
あなたは、ユーザーの自然言語指示と現在のウェブページの状態（アクセシビリティツリー）を分析し、実行すべき単一のPlaywright-MCPツールコールに変換するエキスパートAIです。

# 利用可能な主要ツール
- browser_navigate: { "url": "..." } - 指定されたURLに移動する。
- browser_click: { "element": "...", "ref": "..." } - 指定されたrefを持つ要素をクリックする。
- browser_type: { "element": "...", "ref": "...", "text": "..." } - 指定されたrefを持つ要素にテキストを入力する。
- browser_press_key: { "key": "..." } - キーボードのキーを押す（例: "Enter"）。

# ルール
1. ユーザーの指示を達成するために、上記リストから**最も適切なツールを1つだけ**選択してください。
2. ページのアクセシビリティツリーを注意深く参照し、操作対象の**正確な 'ref' ID** を特定してください。'ref'は 'e' + 数字の形式です (例: 'e12')。
3. 'element'引数には、人間が理解できる要素の説明を簡潔に記述してください。
4. 出力は指定されたJSONスキーマに厳密に従ってください。

# ユーザー指示
"${instruction}"

# 現在のページ状態（アクセシビリティツリー）
\`\`\`
${snapshot}
\`\`\`

上記の指示とページ状態に基づいて、実行すべき単一のツールコールをJSONで出力してください。
`;
}
