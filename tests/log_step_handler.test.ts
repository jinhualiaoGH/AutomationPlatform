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
} from "../src/runtime/handler_registry.js";

import {
  LogStepHandler,
} from "../src/runtime/handlers/log_step_handler.js";

import {
  StepExecutionEngine,
} from "../src/runtime/step_execution_engine.js";

import type {
  StepExecutionContext,
} from "../src/runtime/step_handler.js";

function createContext():
  StepExecutionContext {
  const automationExecution =
    {
      executionId: 101n,
    } as AutomationExecution;

  const step =
    {
      stepId: 202n,
      stepType: "log",
    } as AutomationStep;

  return {
    automationExecution,
    step,
    attemptNumber: 3,
  };
}

describe(
  "LogStepHandler",
  () => {
    it(
      "declares the log step type",
      () => {
        const handler =
          new LogStepHandler();

        expect(handler.stepType)
          .toBe("log");
      },
    );

    it(
      "produces deterministic structured output",
      async () => {
        const handler =
          new LogStepHandler();

        const result =
          await handler.execute(
            createContext(),
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
            executionId: "101",
            stepId: "202",
            attemptNumber: 3,
          });
        }
      },
    );

    it(
      "executes through the registry and execution engine",
      async () => {
        const registry =
          new HandlerRegistry();

        const handler =
          new LogStepHandler();

        registry.register(handler);

        expect(
          registry.get("log"),
        ).toBe(handler);

        const engine =
          new StepExecutionEngine(
            registry,
          );

        const result =
          await engine.execute(
            createContext(),
          );

        expect(result.status)
          .toBe("succeeded");

        if (
          result.status ===
          "succeeded"
        ) {
          const output =
            JSON.parse(
              result.outputJson ??
                "{}",
            );

          expect(output.kind)
            .toBe("log");

          expect(output.stepType)
            .toBe("log");

          expect(output.executionId)
            .toBe("101");

          expect(output.stepId)
            .toBe("202");

          expect(output.attemptNumber)
            .toBe(3);
        }
      },
    );
  },
);
