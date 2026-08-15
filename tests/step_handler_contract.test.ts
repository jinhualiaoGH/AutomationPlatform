import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AutomationExecution,
  AutomationStep,
} from "../src/domain/automation.js";

import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../src/runtime/step_handler.js";

class ProbeStepHandler
implements StepHandler {
  readonly stepType =
    "probe";

  async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    return {
      status: "succeeded",
      outputJson: JSON.stringify({
        stepId:
          context.step.stepId.toString(),

        attemptNumber:
          context.attemptNumber,
      }),
    };
  }
}

describe(
  "StepHandler contract",
  () => {
    it(
      "executes through the runtime-neutral handler contract",
      async () => {
        const automationExecution =
          {
            executionId: 100n,
          } as AutomationExecution;

        const step =
          {
            stepId: 200n,
            stepType: "probe",
          } as AutomationStep;

        const context:
          StepExecutionContext = {
            automationExecution,
            step,
            attemptNumber: 1,
          };

        const handler:
          StepHandler =
            new ProbeStepHandler();

        expect(handler.stepType)
          .toBe("probe");

        const result =
          await handler.execute(
            context,
          );

        expect(result.status)
          .toBe("succeeded");

        if (
          result.status ===
          "succeeded"
        ) {
          expect(
            JSON.parse(
              result.outputJson ??
                "{}",
            ),
          ).toEqual({
            stepId: "200",
            attemptNumber: 1,
          });
        }
      },
    );

    it(
      "supports explicit failed results",
      async () => {
        const result:
          StepExecutionResult = {
            status: "failed",
            errorMessage:
              "Synthetic failure.",
          };

        expect(result.status)
          .toBe("failed");

        if (
          result.status ===
          "failed"
        ) {
          expect(
            result.errorMessage,
          ).toBe(
            "Synthetic failure.",
          );
        }
      },
    );
  },
);
