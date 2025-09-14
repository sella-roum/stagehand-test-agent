/**
 * @file シナリオレコーダー機能に関する型定義。
 */

/**
 * @interface RecordedStep
 * @description 記録された単一の操作ステップを表すインターフェース。
 */
export interface RecordedStep {
  /** @property {string} userInstruction - このステップを実行するためにユーザーが入力した自然言語の指示。 */
  userInstruction: string;
  /** @property {object} toolCall - 実際にPlaywright-MCPサーバーに対して実行されたツールコール。 */
  toolCall: {
    name: string;
    arguments: any;
  };
  /** @property {string} snapshot - 操作実行前のページ状態の簡潔な要約。 */
  snapshot: string;
}
