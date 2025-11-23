/**
 * @file 自然言語シナリオをGherkin形式に変換するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  getGherkinizerPrompt,
  gherkinSchema,
  GherkinDocument,
} from "@/prompts/gherkinizer";

/**
 * @class ScenarioNormalizerAgent
 * @description ユーザーが入力した自由形式のテキストを、構造化されたGherkin JSONに変換する責務を持つエージェント。
 */
export class ScenarioNormalizerAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * 自然言語のテストシナリオをGherkin形式に変換します。
   * @param {string} scenarioText - ユーザーによって記述された自由形式のテストシナリオ。
   * @returns {Promise<GherkinDocument>} 構造化されたGherkin形式のJSONオブジェクト。
   */
  async normalize(scenarioText: string): Promise<GherkinDocument> {
    const prompt = getGherkinizerPrompt(scenarioText);

    const { object } = await generateObject({
      model: this.llm,
      schema: gherkinSchema,
      prompt,
    });

    return object;
  }
}
