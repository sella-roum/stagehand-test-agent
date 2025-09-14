/**
 * @file シナリオレコーダー機能に関する型定義。
 */

/**
 * @interface RecordedStep
 * @description 記録された単一の操作ステップを表すインターフェース。
 */
export interface RecordedStep {
  /** @property {'action' | 'assertion'} type - このステップが「操作」か「検証」かを示す。 */
  type: "action" | "assertion";
  /** @property {string} userInstruction - このステップを実行するためにユーザーが入力した自然言語の指示。 */
  userInstruction: string;
}
