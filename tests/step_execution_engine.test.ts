import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  AutomationExecution,
  AutomationStep,
} from "../src/domain/automation.js";

import {
  HandlerRegistry,
  UnknownStepHandlerError,
} from "../src/runtime/handler_registry.js";

import {
  StepExecutionEngine,
} from "../src/runtime/step_execution_engine.js";

import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../src/runtime/step_handler.js";

class SuccessHandler
  implements StepHandler {
  public readonly stepType =
    "test.success";

  public async execute(
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    return {
      status: "succeeded",

      outputJson:
        JSON.stringify({
          attemptNumber:
            context.attemptNumber,

          stepType:
            context.step.stepType,
        }),
    };
  }
}

class FailureResultHandler
  implements StepHandler {
  public readonly stepType =
    "test.failure-result";

  public async execute(
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    return {
      status: "failed",

      errorMessage:
        "Synthetic handler failure.",
    };
  }
}

class ThrowingHandler
  implements StepHandler {
  public readonly stepType =
    "test.throw";

  public async execute(
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    throw new Error(
      "Synthetic thrown failure.",
    );
  }
}

class NonErrorThrowingHandler
  implements StepHandler {
  public readonly stepType =
    "test.non-error-throw";

  public async execute(
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    throw "synthetic-string-error";
  }
}

function createContext(
  stepType: string,
): StepExecutionContext {
  const automationExecution =
    {
      executionId: 100n,
    } as AutomationExecution;

  const step =
    {
      stepId: 200n,
      stepType,
    } as AutomationStep;

  return {
    automationExecution,
    step,
    attemptNumber: 3,
  };
}

describe(
  "StepExecutionEngine",
  () => {
    it(
      "resolves and executes a registered handler",
      async () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new SuccessHandler(),
        );

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createContext(
              "test.success",
            ),
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
            attemptNumber: 3,
            stepType:
              "test.success",
          });
        }
      },
    );

    it(
      "preserves an explicit failed handler result",
      async () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new FailureResultHandler(),
        );

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createContext(
              "test.failure-result",
            ),
          );

        expect(result)
          .toEqual({
            status: "failed",
            errorMessage:
              "Synthetic handler failure.",
          });
      },
    );

    it(
      "converts a thrown Error into a failed result",
      async () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new ThrowingHandler(),
        );

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createContext(
              "test.throw",
            ),
          );

        expect(result)
          .toEqual({
            status: "failed",

            errorMessage:
              "Synthetic thrown failure.",
          });
      },
    );

    it(
      "normalizes a non-Error throw",
      async () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new NonErrorThrowingHandler(),
        );

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createContext(
              "test.non-error-throw",
            ),
          );

        expect(result)
          .toEqual({
            status: "failed",

            errorMessage:
              "Unknown step execution error.",
          });
      },
    );

    it(
      "preserves an unknown handler as a registry error",
      async () => {
        const registry =
          new HandlerRegistry();

        const engine =
          new StepExecutionEngine(
            registry,
          );

        await expect(
          engine.execute(
            createContext(
              "missing.handler",
            ),
          ),
        ).rejects.toBeInstanceOf(
          UnknownStepHandlerError,
        );
      },
    );
  },
);
