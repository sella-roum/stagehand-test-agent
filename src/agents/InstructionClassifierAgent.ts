/**
 * @file ユーザー指示の意図を分類するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  getClassifierPrompt,
  instructionClassificationSchema,
} from "../prompts/classifier.js";

export class InstructionClassifierAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * ユーザーの指示を「操作」または「検証」に分類します。
   * @param {string} instruction - ユーザーからの自然言語指示。
   * @returns {Promise<{ intent: "action" | "assertion" }>} 分類結果。
   */
  async classify(
    instruction: string,
  ): Promise<{ intent: "action" | "assertion" }> {
    const prompt = getClassifierPrompt(instruction);

    const { object } = await generateObject({
      model: this.llm,
      schema: instructionClassificationSchema,
      prompt,
    });

    return object;
  }
}
