import type {
  AutomationStepExecution,
} from "../domain/automation.js";

import {
  PersistentStepRunner,
} from "./persistent_step_runner.js";

import type {
  PersistentStepRunInput,
} from "./persistent_step_runner.js";

import {
  BoundedStepRetryPolicy,
} from "./retry_policy.js";

import type {
  StepRetryPolicy,
} from "./retry_policy.js";

export class RetryingStepRunner {
  public constructor(
    private readonly attemptRunner =
      new PersistentStepRunner(),

    private readonly retryPolicy:
      StepRetryPolicy =
      new BoundedStepRetryPolicy(),
  ) {}

  public async run(
    input: PersistentStepRunInput,
  ): Promise<AutomationStepExecution> {
    const firstAttemptNumber =
      input.attemptNumber ?? 1;

    for (
      let attemptOffset = 0;
      attemptOffset <
        this.retryPolicy.maxAttempts;
      attemptOffset += 1
    ) {
      const attemptNumber =
        firstAttemptNumber +
        attemptOffset;

      const attempt =
        await this.attemptRunner.run({
          ...input,
          attemptNumber,
        });

      if (
        attempt.status ===
        "succeeded"
      ) {
        return attempt;
      }

      const attemptsUsed =
        attemptOffset + 1;

      if (
        attemptsUsed >=
        this.retryPolicy.maxAttempts
      ) {
        return attempt;
      }

      const nextAttemptNumber =
        attemptNumber + 1;

      if (
        !this.retryPolicy.shouldRetry({
          step:
            input.step,

          failedAttempt:
            attempt,

          attemptsUsed,

          nextAttemptNumber,
        })
      ) {
        return attempt;
      }
    }

    throw new Error(
      "RetryingStepRunner reached an unreachable state.",
    );
  }
}
