import type {
  AutomationExecution,
  AutomationStep,
} from "../domain/automation.js";

export type StepExecutionContext = {
  automationExecution:
    AutomationExecution;

  step:
    AutomationStep;

  attemptNumber:
    number;
};

export type StepExecutionSuccess = {
  status: "succeeded";

  outputJson?:
    string | null;
};

export type StepExecutionFailure = {
  status: "failed";

  errorMessage:
    string;

  outputJson?:
    string | null;
};

export type StepExecutionResult =
  | StepExecutionSuccess
  | StepExecutionFailure;

export interface StepHandler {
  readonly stepType: string;

  execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult>;
}
