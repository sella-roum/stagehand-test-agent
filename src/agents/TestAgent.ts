/**
 * @file Gherkinシナリオを実行・検証するAIエージェント。
 */
import { LanguageModel, generateObject } from "ai";
import { Stagehand } from "@browserbasehq/stagehand";
import { getExecutorPrompt, executorSchema } from "../prompts/executor.js";
import { getVerifierPrompt, verifierSchema } from "../prompts/verifier.js";
import {
  getSelfHealingPrompt,
  selfHealingSchema,
} from "../prompts/selfHealing.js";
import { GherkinStep } from "../types/gherkin.js";
import { fillFormFromTable } from "./formFiller.js";
import { z } from "zod";

export class TestAgent {
  private llm: LanguageModel;
  private stagehand: Stagehand;
  private selfHealingLlm: LanguageModel;

  constructor(
    fastLlm: LanguageModel,
    defaultLlm: LanguageModel,
    stagehand: Stagehand,
  ) {
    this.llm = fastLlm;
    this.selfHealingLlm = defaultLlm;
    this.stagehand = stagehand;
  }

  async executeStep(step: GherkinStep): Promise<void> {
    const keyword = step.keyword.toLowerCase();
    if (keyword.includes("given")) {
      await this.handleGiven(step);
    } else if (keyword.includes("when") || keyword.includes("and")) {
      await this.handleWhen(step);
    } else if (keyword.includes("then")) {
      const success = await this.handleThen(step);
      if (!success) {
        throw new Error(`検証に失敗しました: "${step.text}"`);
      }
    } else {
      console.warn(
        `不明なキーワード「${step.keyword}」です。'When'として処理を試みます。`,
      );
      await this.handleWhen(step);
    }
  }

  private async handleGiven(step: GherkinStep): Promise<void> {
    console.log(`  ...前提条件を実行中: ${step.text}`);

    const urlMatch = step.text.match(/https?:\/\/[^\s"`<>()]+/);
    const expectedUrl = urlMatch ? urlMatch[0] : null;

    // 1. 実行フェーズ
    if (expectedUrl) {
      await this.stagehand.page.goto(expectedUrl, { timeout: 30000 });
    } else {
      await this.stagehand.page.act(step.text);
    }

    // 2. 検証フェーズ
    console.log("  ...前提条件が満たされたか検証中...");
    await this.stagehand.page.waitForLoadState("domcontentloaded", {
      timeout: 15000,
    });

    if (expectedUrl) {
      const currentUrl = this.stagehand.page.url();
      if (currentUrl === "about:blank" || !currentUrl.startsWith(expectedUrl)) {
        throw new Error(
          `前提条件の検証に失敗: URLへの遷移に失敗しました。\n  期待値 (前方一致): ${expectedUrl}\n  実際値: ${currentUrl}`,
        );
      }
      console.log(`  ✅ URL検証成功: ${currentUrl}`);
    } else {
      const textMatch = step.text.match(/"([^"]+)"/);
      const expectedText = textMatch ? textMatch[1] : null; // マッチした部分文字列(グループ1)を抽出

      if (expectedText) {
        const pageContent = await this.stagehand.page.content();
        if (!pageContent.includes(expectedText)) {
          throw new Error(
            `前提条件の検証に失敗: ページ内にテキスト「${expectedText}」が見つかりません。`,
          );
        }
        console.log(`  ✅ テキスト検証成功: 「${expectedText}」を発見`);
      } else {
        console.warn(
          "検証可能なテキストが'Given'ステップに見つからないため、検証をスキップします。",
        );
      }
    }
  }

  private async handleWhen(step: GherkinStep): Promise<void> {
    await this.executeWithSelfHealing(step.text, async (currentText) => {
      if (step.table && step.table.length > 0) {
        await fillFormFromTable(this.stagehand, step.table);
      }

      const { object: plan } = await generateObject({
        model: this.llm,
        schema: executorSchema,
        prompt: getExecutorPrompt(currentText),
      });

      const observed = await this.stagehand.page.observe(
        plan.observeInstruction,
      );
      if (observed.length === 0) {
        if (step.table) {
          throw new Error(
            `データ入力後、要素が見つかりませんでした: "${plan.observeInstruction}"`,
          );
        }
        throw new Error(
          `要素が見つかりませんでした: "${plan.observeInstruction}"`,
        );
      }
      // 配列ではなく、最初の要素(単一のObserveResult)を渡す
      await this.stagehand.page.act(observed[0]);
    });
  }

  private async handleThen(step: GherkinStep): Promise<boolean> {
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

    const { object: plan } = await generateObject({
      model: this.llm,
      schema: verifierSchema,
      prompt: getVerifierPrompt(step.text),
    });

    const { extraction } = await this.stagehand.page.extract(
      plan.extractInstruction,
    );
    const actual = (extraction as string) || "";

    switch (plan.assertion.operator) {
      case "toContain":
        return actual.includes(plan.assertion.expected);
      case "notToContain":
        return !actual.includes(plan.assertion.expected);
      case "toEqual":
        return actual === plan.assertion.expected;
      default:
        return false;
    }
  }

  private async executeWithSelfHealing(
    originalStepText: string,
    operation: (stepText: string) => Promise<void>,
    maxRetries: number = 2,
  ) {
    let lastError: Error | null = null;
    let currentStep = originalStepText;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        await operation(currentStep);
        if (i > 0) {
          console.log("✅ 自己修復に成功しました。");
        }
        return;
      } catch (e: any) {
        lastError = e;
        if (i < maxRetries) {
          console.warn(
            `⚠️ ステップ実行に失敗しました。自己修復を試みます... (${i + 1}/${maxRetries})`,
          );
          if (!lastError) {
            console.error(
              "自己修復を試みましたが、エラーオブジェクトが存在しません。",
            );
            continue;
          }
          const pageContent = await this.stagehand.page
            .extract()
            .then((r) => r.page_text || "");

          const { object: plan } = await generateObject({
            model: this.selfHealingLlm,
            schema: selfHealingSchema,
            prompt: getSelfHealingPrompt(
              originalStepText,
              lastError,
              pageContent,
            ),
          });

          console.log(`   分析: ${plan.causeAnalysis}`);
          console.log(`   代替案: "${plan.alternativeInstruction}"`);
          currentStep = plan.alternativeInstruction;
        }
      }
    }
    throw new Error(
      `ステップ「${originalStepText}」は${maxRetries}回の自己修復を試みましたが、最終的に失敗しました。最後の失敗理由: ${lastError?.message}`,
    );
  }
}
