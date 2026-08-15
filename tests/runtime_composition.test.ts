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
  LogStepHandler,
} from "../src/runtime/handlers/log_step_handler.js";

import {
  createDefaultHandlerRegistry,
} from "../src/runtime/runtime_composition.js";

import {
  StepExecutionEngine,
} from "../src/runtime/step_execution_engine.js";

import type {
  StepExecutionContext,
} from "../src/runtime/step_handler.js";

function createLogContext():
  StepExecutionContext {
  const automationExecution =
    {
      executionId: 501n,
    } as AutomationExecution;

  const step =
    {
      stepId: 601n,
      stepType: "log",
    } as AutomationStep;

  return {
    automationExecution,
    step,
    attemptNumber: 2,
  };
}

describe(
  "runtime composition",
  () => {
    it(
      "registers the built-in log handler",
      () => {
        const registry =
          createDefaultHandlerRegistry();

        expect(
          registry.has("log"),
        ).toBe(true);

        expect(
          registry.get("log"),
        ).toBeInstanceOf(
          LogStepHandler,
        );
      },
    );

    it(
      "exposes a deterministic built-in handler set",
      () => {
        const registry =
          createDefaultHandlerRegistry();

        expect(
          registry.registeredStepTypes(),
        ).toEqual([
          "log",
        ]);
      },
    );

    it(
      "executes a built-in log step through the composed runtime",
      async () => {
        const registry =
          createDefaultHandlerRegistry();

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createLogContext(),
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
            kind: "log",
            stepType: "log",
            executionId: "501",
            stepId: "601",
            attemptNumber: 2,
          });
        }
      },
    );

    it(
      "creates independent registries on each call",
      () => {
        const first =
          createDefaultHandlerRegistry();

        const second =
          createDefaultHandlerRegistry();

        expect(first)
          .not.toBe(second);

        expect(
          first.get("log"),
        ).not.toBe(
          second.get("log"),
        );

        expect(
          first.registeredStepTypes(),
        ).toEqual(
          second.registeredStepTypes(),
        );
      },
    );
  },
);
