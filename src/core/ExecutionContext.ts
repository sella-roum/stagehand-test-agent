/**
 * @file テストセッション全体の状態を管理するコンテキストオブジェクト。
 */
import { GherkinDocument } from "../types/gherkin.js";

export type ExecutionMode = "autonomous" | "interactive" | "interactive:auto";

export interface TestStepResult {
  step: string; // Gherkinのキーワードとテキストを結合した文字列
  status: "pass" | "fail" | "skipped";
  durationMs: number;
  details?: string;
  screenshotPath?: string;
}

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
   * @param newScenario 新しいシナリオのテキスト
   */
  resetForNewScenario(newScenario: string) {
    this.originalScenario = newScenario;
    this.gherkinDocument = null;
    this.stepResults = [];
  }
}
