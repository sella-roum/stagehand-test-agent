/**
 * @file データテーブルに基づいてフォーム入力を実行するヘルパー機能。
 */
import { Stagehand } from "@browserbasehq/stagehand";
import { GherkinStep } from "../types/gherkin.js";

/**
 * Gherkinステップに含まれるデータテーブルを解釈し、フォームの各フィールドに対応する値を入力します。
 * @param stagehand - Stagehandのインスタンス。
 * @param table - Gherkinのデータテーブル。各行は { "項目": string, "値": string } 形式を期待します。
 * @throws {Error} テーブルの形式が不正な場合や、フィールドが見つからない場合にエラーをスローします。
 */
export async function fillFormFromTable(
  stagehand: Stagehand,
  table: GherkinStep["table"],
): Promise<void> {
  if (!table || table.length === 0) {
    return;
  }

  console.log("  ...データテーブルに基づいてフォーム入力を開始します。");

  for (const row of table) {
    // 標準的なカラム名 "項目" と "値" を想定
    const fieldName = row["項目"] || Object.keys(row)[0];
    const value = row[fieldName];

    if (!fieldName || typeof value === "undefined") {
      console.warn(
        `テーブルの行 ${JSON.stringify(
          row,
        )} の形式が不正です。スキップします。`,
      );
      continue;
    }

    // Stagehandのactに、具体的な指示を渡す
    // AIは「'名前'というラベルの付いた入力欄に'田中花子'と入力して」のような指示を解釈できる
    const instruction = `'${fieldName}'フィールドに「${value}」と入力する`;
    console.log(`    - ${instruction}`);
    await stagehand.page.act(instruction);
  }
}
