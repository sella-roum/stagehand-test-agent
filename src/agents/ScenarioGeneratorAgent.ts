/**
 * @file 記録された操作履歴から自然言語シナリオを生成するAIエージェント。
 */
import { LanguageModel, generateText } from "ai";
import { getScenarioGeneratorPrompt } from "@/prompts/scenarioGenerator";
import { RecordedStep } from "@/types/recorder";

export class ScenarioGeneratorAgent {
  private llm: LanguageModel;

  constructor(llm: LanguageModel) {
    this.llm = llm;
  }

  /**
   * 記録されたステップのリストから、自然言語のテストシナリオを生成します。
   * @param {RecordedStep[]} steps - 記録された操作ステップの配列。
   * @returns {Promise<string>} 生成されたシナリオテキスト。
   */
  async generate(steps: RecordedStep[]): Promise<string> {
    const prompt = getScenarioGeneratorPrompt(steps);

    const { text } = await generateText({
      model: this.llm,
      prompt,
    });

    return text;
  }
}
