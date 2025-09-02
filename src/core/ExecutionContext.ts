/**
 * @file テストセッション全体の状態を管理するコンテキストオブジェクト。
 */
import { GherkinDocument } from "../types/gherkin.js";
import type { HistoryEntry } from "@browserbasehq/stagehand"; // HistoryEntry型をインポート

/**
 * @typedef {'autonomous' | 'interactive' | 'interactive:auto'} ExecutionMode
 * @description テストエージェントの実行モードを定義します。
 * - `autonomous`: CI/CD向け。確認なしで最後まで自動実行します。
 * - `interactive`: デバッグ向け。各ステップの実行前にユーザーの確認を求めます。
 * - `interactive:auto`: ハイブリッド。最初の計画のみユーザーが承認し、その後は自律実行します。
 */
export type ExecutionMode = "autonomous" | "interactive" | "interactive:auto";

/**
 * @interface TestStepResult
 * @description 単一のテストステップの実行結果を格納するインターフェース。
 */
export interface TestStepResult {
  /** @property {string} step - Gherkinのキーワードとテキストを結合した完全なステップ文字列。 */
  step: string;
  /** @property {'pass' | 'fail' | 'skipped'} status - ステップの実行結果。 */
  status: "pass" | "fail" | "skipped";
  /** @property {number} durationMs - ステップの実行にかかった時間（ミリ秒）。 */
  durationMs: number;
  /** @property {string} [details] - 失敗した場合のエラーメッセージなどの詳細。 */
  details?: string;
  /** @property {string} [screenshotPath] - 失敗した場合に撮影されたスクリーンショットのファイルパス。 */
  screenshotPath?: string;
  /** @property {HistoryEntry[]} [commands] - このステップ内で実行されたStagehandの内部コマンド履歴。 */
  commands?: HistoryEntry[];
}

/**
 * @class ExecutionContext
 * @description テストセッション全体の状態を保持します。
 * 複数のシナリオが連続して実行される場合でも、状態をリセットして正しく管理する役割を担います。
 */
export class ExecutionContext {
  public mode: ExecutionMode;
  public originalScenario: string;
  public gherkinDocument: GherkinDocument | null = null;
  public stepResults: TestStepResult[] = [];

  constructor(mode: ExecutionMode, scenario: string) {
    this.mode = mode;
    this.originalScenario = scenario;
  }

  addResult(result: TestStepResult) {
    this.stepResults.push(result);
  }

  setGherkinDocument(doc: GherkinDocument) {
    this.gherkinDocument = doc;
  }

  /**
   * 新しいテストシナリオのためにコンテキストをリセットします。
   * @param {string} newScenario - 新しいシナリオのテキスト。
   */
  resetForNewScenario(newScenario: string) {
    this.originalScenario = newScenario;
    this.gherkinDocument = null;
    this.stepResults = [];
  }
}
