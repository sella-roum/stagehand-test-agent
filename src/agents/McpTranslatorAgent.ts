/**
 * @file 自然言語指示をMCPツールコールに変換するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  getMcpTranslatorPrompt,
  mcpToolCallSchema,
  McpToolCall,
} from "../prompts/mcpTranslator.js";

export class McpTranslatorAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * 指示とページ状態から、実行すべきMCPツールコールを生成します。
   * @param {string} instruction - ユーザーからの自然言語指示。
   * @param {string} snapshot - Playwright-MCPから取得したアクセシビリティツリー。
   * @returns {Promise<McpToolCall>} 生成されたツールコールオブジェクト。
   */
  async translate(instruction: string, snapshot: string): Promise<McpToolCall> {
    const prompt = getMcpTranslatorPrompt(instruction, snapshot);

    const { object } = await generateObject({
      model: this.llm,
      schema: mcpToolCallSchema,
      prompt,
    });

    return object;
  }
}
