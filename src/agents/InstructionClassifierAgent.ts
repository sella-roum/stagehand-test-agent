/**
 * @file ユーザー指示の意図を分類するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  getClassifierPrompt,
  instructionClassificationSchema,
} from "../prompts/classifier.js";
import { StepIntent } from "../types/recorder.js";

export class InstructionClassifierAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * ユーザーの指示を「操作」または「検証」に分類します。
   * @param {string} instruction - ユーザーからの自然言語指示。
   * @returns {Promise<{ intent: StepIntent }>} 分類結果。
   */
  async classify(instruction: string): Promise<{ intent: StepIntent }> {
    try {
      const prompt = getClassifierPrompt(instruction);

      const { object } = await generateObject({
        model: this.llm,
        schema: instructionClassificationSchema,
        prompt,
      });

      return object;
    } catch (error) {
      console.warn(
        `⚠️ 意図分類LLMの呼び出しに失敗しました。キーワードベースのフォールバックを使用します。エラー: ${
          (error as Error).message
        }`,
      );
      // フォールバック: 簡易キーワードで推定
      const lowerInstruction = instruction.toLowerCase();
      const isAssertion =
        /確認|検証|表示されている|含まれている|等しい|一致|含む|verify|assert|should|contains?|equals?|exact(?:ly)?|match(?:es)?/.test(
          lowerInstruction,
        );
      return { intent: isAssertion ? "assertion" : "action" };
    }
  }
}
