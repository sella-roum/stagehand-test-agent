/**
 * @file 自然言語シナリオをGherkin形式に変換するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  getGherkinizerPrompt,
  gherkinSchema,
  GherkinDocument,
} from "../prompts/gherkinizer.js";

export class ScenarioNormalizerAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * 自然言語のテストシナリオをGherkin形式に変換します。
   * @param scenarioText ユーザーが記述した自由形式のシナリオ
   * @returns 構造化されたGherkinドキュメントオブジェクト
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
