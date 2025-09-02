/**
 * @file Gherkinシナリオの構造化JSONに関する型定義とZodスキーマ。
 */
import { z } from "zod";

/**
 * @schema tableRowSchema
 * @description Gherkinのデータテーブルの単一行を表すスキーマ。
 * 現状、カラム名は '項目' と '値' に固定されていますが、
 * `formFiller.ts` の実装はより柔軟なカラム名にも対応可能です。
 */
const tableRowSchema = z.object({
  項目: z.string().describe("テーブルのヘッダーまたはキー。"),
  値: z.string().describe("その項目に対応する値。"),
});

/**
 * @schema stepSchema
 * @description Gherkinの単一ステップ (例: 'When ユーザーがログインボタンをクリックする') を表すスキーマ。
 */
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

/**
 * @schema scenarioSchema
 * @description Gherkinの単一シナリオ（`Scenario:` ブロック）を表すスキーマ。
 */
const scenarioSchema = z.object({
  title: z.string().describe("シナリオのタイトル。"),
  steps: z.array(stepSchema).describe("シナリオを構成するステップの配列。"),
});

/**
 * @schema gherkinSchema
 * @description Gherkinドキュメント全体を表す最上位のスキーマ。
 */
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
