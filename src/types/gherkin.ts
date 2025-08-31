/**
 * @file Gherkinシナリオの構造化JSONに関する型定義とZodスキーマ。
 */
import { z } from "zod";

// データテーブルの行を表すスキーマ
const tableRowSchema = z.record(z.string());

// Gherkinの単一ステップを表すスキーマ
const stepSchema = z.object({
  keyword: z
    .string()
    .describe("Gherkinキーワード (Given, When, Then, And, But)。"),
  text: z.string().describe("ステップの具体的な内容。"),
  table: z
    .array(tableRowSchema)
    .optional()
    .describe("ステップに関連付けられたデータテーブル（オプション）。"),
});

// 単一のシナリオを表すスキーマ
const scenarioSchema = z.object({
  title: z.string().describe("シナリオのタイトル。"),
  steps: z.array(stepSchema).describe("シナリオを構成するステップの配列。"),
});

// Gherkinドキュメント全体を表す最上位のスキーマ
export const gherkinSchema = z.object({
  feature: z.string().describe("テスト対象の機能名。"),
  background: z
    .array(stepSchema)
    .optional()
    .describe("全シナリオの前に実行される共通の前提条件（オプション）。"),
  scenarios: z
    .array(scenarioSchema)
    .describe("このフィーチャーに含まれるシナリオの配列。"),
});

// ZodスキーマからTypeScriptの型を生成
export type GherkinDocument = z.infer<typeof gherkinSchema>;
export type GherkinScenario = z.infer<typeof scenarioSchema>;
export type GherkinStep = z.infer<typeof stepSchema>;
