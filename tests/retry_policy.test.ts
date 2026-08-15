import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AutomationStep,
  AutomationStepExecution,
} from "../src/domain/automation.js";

import {
  BoundedStepRetryPolicy,
} from "../src/runtime/retry_policy.js";

function createContext() {
  return {
    step:
      {
        stepId: 10n,
        stepType: "test.retry",
      } as AutomationStep,

    failedAttempt:
      {
        stepExecutionId: 20n,
        attemptNumber: 1,
        status: "failed",
      } as AutomationStepExecution,

    attemptsUsed: 1,
    nextAttemptNumber: 2,
  };
}

describe(
  "BoundedStepRetryPolicy",
  () => {
    it(
      "defaults to three retry attempts",
      () => {
        const policy =
          new BoundedStepRetryPolicy();

        expect(
          policy.maxAttempts,
        ).toBe(3);

        expect(
          policy.shouldRetry(
            createContext(),
          ),
        ).toBe(true);
      },
    );

    it(
      "rejects invalid maxAttempts values",
      () => {
        expect(
          () =>
            new BoundedStepRetryPolicy(
              0,
            ),
        ).toThrow(
          "positive integer",
        );

        expect(
          () =>
            new BoundedStepRetryPolicy(
              1.5,
            ),
        ).toThrow(
          "positive integer",
        );
      },
    );

    it(
      "supports an explicit non-retryable decision",
      () => {
        const policy =
          new BoundedStepRetryPolicy(
            5,
            () => false,
          );

        expect(
          policy.maxAttempts,
        ).toBe(5);

        expect(
          policy.shouldRetry(
            createContext(),
          ),
        ).toBe(false);
      },
    );
  },
);
