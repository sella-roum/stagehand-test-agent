/**
 * @file Gherkinシナリオを解釈し、実行可能な計画を立案するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import {
  Stagehand,
  ObserveResult,
  ExtractResult,
} from "@browserbasehq/stagehand";
import { getExecutorPrompt, executorSchema } from "../prompts/executor.js";
import { getVerifierPrompt, verifierSchema } from "../prompts/verifier.js";
import {
  getSelfHealingPrompt,
  selfHealingSchema,
} from "../prompts/selfHealing.js";
import { GherkinStep } from "../types/gherkin.js";
import { fillFormFromTable } from "./formFiller.js";
import { z } from "zod";

/**
 * 複数の形式で返される可能性があるExtractResultから、主要なテキストコンテンツを安全に抽出します。
 * @param result - Stagehandのextractメソッドからの戻り値。
 * @returns {string} 抽出されたテキスト。見つからない場合は空文字列。
 */
function getSafeTextFromResult(result: ExtractResult<z.AnyZodObject>): string {
  if (typeof (result as any).extraction === "string") {
    return (result as any).extraction;
  }
  if (typeof (result as any).page_text === "string") {
    return (result as any).page_text;
  }
  return "";
}

/**
 * @class TestAgent
 * @description Gherkinの各ステップを解釈し、ブラウザ操作の計画立案、検証、自己修復を行う中核エージェント。
 */
export class TestAgent {
  private llm: LanguageModel;
  private stagehand: Stagehand;
  private selfHealingLlm: LanguageModel;

  /**
   * TestAgentのインスタンスを生成します。
   * @param {LanguageModel} fastLlm - 通常の計画立案に使用する、高速・安価なLLM。
   * @param {LanguageModel} defaultLlm - 自己修復など、より高度な推論が求められるタスクに使用する高性能なLLM。
   * @param {Stagehand} stagehand - ブラウザ操作を実行するためのStagehandインスタンス。
   */
  constructor(
    fastLlm: LanguageModel,
    defaultLlm: LanguageModel,
    stagehand: Stagehand,
  ) {
    this.llm = fastLlm;
    this.selfHealingLlm = defaultLlm;
    this.stagehand = stagehand;
  }

  /**
   * Gherkinステップを受け取り、キーワードに基づいて適切な処理に分岐させます。
   * @param {GherkinStep} step - 実行するGherkinステップオブジェクト。
   * @returns {Promise<ObserveResult | boolean | void>}
   * - 操作ステップ (`When`) の場合: 実行計画 (`ObserveResult`)
   * - 検証ステップ (`Then`) の場合: 検証結果 (`boolean`)
   * - URL遷移 (`Given`) など直接実行した場合: `void`
   */
  async processStep(
    step: GherkinStep,
  ): Promise<ObserveResult | boolean | void> {
    const keyword = step.keyword.toLowerCase();
    if (keyword.includes("given")) {
      return this.planGivenStep(step);
    }
    // "And"は正規化エージェントによって"When"か"Then"に解決されることを前提とする
    if (keyword.includes("when")) {
      return this.planWhenStep(step);
    }
    if (keyword.includes("then") || keyword.includes("and")) {
      const success = await this.verifyThenStep(step);
      if (!success) {
        throw new Error(`検証ステップ「${step.text}」が失敗しました。`);
      }
      return success;
    }
    console.warn(
      `不明なキーワード「${step.keyword}」です。'When'として処理を試みます。`,
    );
    return this.planWhenStep(step);
  }

  /**
   * Givenステップの実行計画を立てます。URL遷移は直接実行し、それ以外は操作計画を返します。
   * @param {GherkinStep} step - Gherkinステップオブジェクト。
   * @returns {Promise<ObserveResult | void>} URL遷移がない場合は操作計画(ObserveResult)、URL遷移のみの場合はvoid。
   * @private
   */
  private async planGivenStep(
    step: GherkinStep,
  ): Promise<ObserveResult | void> {
    const urlMatch = step.text.match(/https?:\/\/[^\s"`<>()]+/);
    const expectedUrl = urlMatch ? urlMatch[0] : null;

    if (expectedUrl) {
      // URL遷移はエージェントが直接実行する
      await this.stagehand.page.goto(expectedUrl, { timeout: 30000 });
      await this.stagehand.page.waitForLoadState("domcontentloaded", {
        timeout: 15000,
      });
      const currentUrl = this.stagehand.page.url();
      if (currentUrl === "about:blank" || !currentUrl.startsWith(expectedUrl)) {
        throw new Error(
          `前提条件の検証に失敗: URLへの遷移に失敗しました。\n  期待値 (前方一致): ${expectedUrl}\n  実際値: ${currentUrl}`,
        );
      }
      console.log(`  ✅ URL検証成功: ${currentUrl}`);
      return; // URL遷移は直接実行したので計画は返さない
    } else {
      // URL以外のGivenはWhenと同様に操作計画を立てる
      return this.planWhenStep(step);
    }
  }

  /**
   * Whenステップの操作計画を立てます。
   * @param {GherkinStep} step - Gherkinステップオブジェクト。
   * @returns {Promise<ObserveResult>} 実行すべき単一の操作計画(ObserveResult)。
   * @private
   */
  private async planWhenStep(step: GherkinStep): Promise<ObserveResult> {
    return this.planWithSelfHealing(step, async (currentText) => {
      // Gherkinizerの設計により、テーブル入力と他の操作（クリック等）は
      // 別ステップに分離されていることが期待される。
      // もしテーブルが存在する場合、既存のロジック（formFillerの実行）を優先する。
      if (step.table && step.table.length > 0) {
        await fillFormFromTable(this.stagehand, step.table);
      }

      // 1. AIコールで「観察指示」と「操作種別」を同時に取得
      const { object: plan } = await generateObject({
        model: this.llm,
        schema: executorSchema,
        prompt: getExecutorPrompt(currentText),
      });

      // 2. 観察を実行
      const observed = await this.stagehand.page.observe(
        plan.observeInstruction,
      );
      if (observed.length === 0) {
        throw new Error(
          `要素が見つかりませんでした: "${plan.observeInstruction}"`,
        );
      }

      // 3. AIが判断した操作種別 (plan.intendedAction) に基づいてフィルタリング
      const intendedAction = plan.intendedAction;
      if (intendedAction !== "unknown" && observed.length > 1) {
        const filtered = observed.filter((obsResult) => {
          // AIの意図 (intendedAction) と
          // Stagehandが返すメソッド (obsResult.method) をマッピングする
          switch (intendedAction) {
            case "click":
              return obsResult.method === "click";
            case "type":
              // Stagehandの入力系メソッドは 'fill' と想定
              return obsResult.method === "fill" || obsResult.method === "type";
            case "select":
              return obsResult.method === "selectOption";
            case "hover":
              return obsResult.method === "hover";
            default:
              return false;
          }
        });

        if (filtered.length > 0) {
          // フィルタリングされた結果の先頭を返す
          return filtered[0];
        }
        // フィルタリングしたが一致するものがなかった場合、
        // 警告を出しつつ、フォールバックとして先頭の要素を返す
        console.warn(
          `AIの意図「${intendedAction}」に一致する要素が見つかりませんでしたが、` +
            `Observeは ${observed.length} 件の要素を返しました。` +
            `先頭の要素 (method: '${observed[0].method}') を使用します。`,
        );
      }

      // フィルタリング不要（unknown）、フィルタリングで候補0、
      // または元々候補が1つだった場合は、従来通り先頭を返す
      return observed[0];
    });
  }

  /**
   * Thenステップの検証を実行します。
   * @param {GherkinStep} step - Gherkinステップオブジェクト。
   * @returns {Promise<boolean>} 検証が成功した場合はtrue。
   * @private
   */
  private async verifyThenStep(step: GherkinStep): Promise<boolean> {
    // --- データテーブルが存在する場合の検証ロジック ---
    if (step.table && step.table.length > 0) {
      console.log("  ...データテーブルに基づいて検証を開始します。");
      const keys = Object.keys(step.table[0]);
      const rowSchema = z.object(
        keys.reduce(
          (acc, key) => {
            acc[key] = z.string();
            return acc;
          },
          {} as Record<string, z.ZodString>,
        ),
      );

      const tableSchema = z.object({
        items: z.array(rowSchema),
      });

      const { items: extractedData } = await this.stagehand.page.extract({
        instruction: `${step.text}の内容をテーブル形式で抽出してください。`,
        schema: tableSchema,
      });

      if (!extractedData || extractedData.length === 0) {
        console.error("検証データがページから抽出できませんでした。");
        return false;
      }

      for (const expectedRow of step.table) {
        const match = extractedData.some((actualRow) =>
          Object.entries(expectedRow).every(
            ([key, value]) =>
              actualRow[key] &&
              actualRow[key].toString().includes(value.toString()),
          ),
        );
        if (!match) {
          console.error(
            `検証失敗: 期待値 ${JSON.stringify(
              expectedRow,
            )} が抽出データ内に見つかりません。`,
          );
          return false;
        }
      }
      console.log("  ...データテーブルのすべての行が検証されました。");
      return true;
    }

    // --- 通常のテキストまたは要素の検証ロジック ---
    const { object: plan } = await generateObject({
      model: this.llm,
      schema: verifierSchema,
      prompt: getVerifierPrompt(step.text),
    });

    // assertionTypeに応じて処理を分岐
    if (plan.assertionType === "element") {
      const observed = await this.stagehand.page.observe(
        plan.observeInstruction,
      );
      const elementExists = observed.length > 0;

      if (!elementExists) {
        console.error(
          `要素が見つかりませんでした: "${plan.observeInstruction}"`,
        );
      }

      switch (plan.assertion.operator) {
        case "toExist":
          return elementExists;
        case "notToExist":
          return !elementExists;
        default:
          // スキーマで網羅されているため、ここは通らないはず
          return false;
      }
    } else {
      // 既存のテキスト検証ロジック
      const result = await this.stagehand.page.extract({
        instruction: plan.extractInstruction,
      });
      const actual = getSafeTextFromResult(result);

      switch (plan.assertion.operator) {
        case "toContain":
          return actual.includes(plan.assertion.expected);
        case "notToContain":
          return !actual.includes(plan.assertion.expected);
        case "toEqual":
          return actual === plan.assertion.expected;
        default:
          // スキーマで網羅されているため、ここは通らないはず
          return false;
      }
    }
  }

  /**
   * 自己修復ロジックで計画立案処理をラップします。
   * 失敗した場合、最大2回まで高性能LLMに代替案を考えさせてリトライします。
   * @param {GherkinStep} originalStep - 元のGherkinステップ。
   * @param {(stepText: string) => Promise<ObserveResult>} planner - 計画を立案する関数。
   * @returns {Promise<ObserveResult>} 成功した操作計画(ObserveResult)。
   * @private
   */
  private async planWithSelfHealing(
    originalStep: GherkinStep,
    planner: (stepText: string) => Promise<ObserveResult>,
  ): Promise<ObserveResult> {
    let lastError: Error | null = null;
    let currentText = originalStep.text;

    // 自己修復ループ：最大リトライ回数 = 2 (合計3回試行)
    for (let i = 0; i <= 2; i++) {
      try {
        const plan = await planner(currentText);
        if (i > 0) console.log("✅ 自己修復による再計画に成功しました。");
        return plan;
      } catch (e: any) {
        lastError = e;
        if (i < 2) {
          console.warn(
            `⚠️ 計画立案に失敗しました。自己修復を試みます... (${i + 1}/2)`,
          );
          if (!lastError) {
            console.error("エラーオブジェクトが存在しません。");
            continue;
          }
          const pageContentResult = await this.stagehand.page.extract({
            instruction: "ページ全体のテキストを抽出してください",
          });
          const pageContent = getSafeTextFromResult(pageContentResult);

          const { object: healingPlan } = await generateObject({
            model: this.selfHealingLlm,
            schema: selfHealingSchema,
            prompt: getSelfHealingPrompt(
              originalStep.text,
              lastError,
              pageContent,
            ),
          });
          console.log(`   分析: ${healingPlan.causeAnalysis}`);
          console.log(`   代替案: "${healingPlan.alternativeInstruction}"`);
          currentText = healingPlan.alternativeInstruction;
        }
      }
    }
    throw new Error(
      `ステップ「${originalStep.text}」の計画立案は2回の自己修復を試みましたが、最終的に失敗しました。最後の失敗理由: ${lastError?.message}`,
    );
  }
}
