/**
 * @file シナリオレコーダー機能に関する型定義。
 */

export const StepIntent = ["action", "assertion"] as const;
export type StepIntent = (typeof StepIntent)[number];

/**
 * @interface RecordedStep
 * @description 記録された単一の操作ステップを表すインターフェース。
 */
export interface RecordedStep {
  /** @property {StepIntent} type - このステップが「操作」か「検証」かを示す。 */
  readonly type: StepIntent;
  /** @property {string} userInstruction - このステップを実行するためにユーザーが入力した自然言語の指示。 */
  readonly userInstruction: string;
  /** @property {number} [timestamp] - 記録時のUNIXミリ秒（オプション）。 */
  readonly timestamp?: number;
}
