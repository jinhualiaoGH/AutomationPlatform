import type {
  AutomationStep,
  AutomationStepExecution,
} from "../domain/automation.js";

export type StepRetryContext = {
  step:
    AutomationStep;

  failedAttempt:
    AutomationStepExecution;

  attemptsUsed:
    number;

  nextAttemptNumber:
    number;
};

export type StepRetryPredicate =
  (
    context: StepRetryContext,
  ) => boolean;

export interface StepRetryPolicy {
  readonly maxAttempts:
    number;

  shouldRetry(
    context: StepRetryContext,
  ): boolean;
}

export class BoundedStepRetryPolicy
  implements StepRetryPolicy {
  public constructor(
    public readonly maxAttempts:
      number = 3,

    private readonly predicate:
      StepRetryPredicate =
        () => true,
  ) {
    if (
      !Number.isInteger(
        maxAttempts,
      ) ||
      maxAttempts < 1
    ) {
      throw new Error(
        "Retry maxAttempts must be a positive integer.",
      );
    }
  }

  public shouldRetry(
    context: StepRetryContext,
  ): boolean {
    return this.predicate(
      context,
    );
  }
}
