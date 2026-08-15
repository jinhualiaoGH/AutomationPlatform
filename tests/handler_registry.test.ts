import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DuplicateStepHandlerError,
  HandlerRegistry,
  UnknownStepHandlerError,
} from "../src/runtime/handler_registry.js";

import type {
  StepExecutionContext,
  StepExecutionResult,
  StepHandler,
} from "../src/runtime/step_handler.js";

class TestHandler
  implements StepHandler {
  public constructor(
    public readonly stepType: string,
  ) {}

  public async execute(
    _context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    return {
      status: "succeeded",
    };
  }
}

describe(
  "HandlerRegistry",
  () => {
    it(
      "registers and resolves handlers by step type",
      () => {
        const registry =
          new HandlerRegistry();

        const handler =
          new TestHandler(
            "test.echo",
          );

        registry.register(handler);

        expect(
          registry.has(
            "test.echo",
          ),
        ).toBe(true);

        expect(
          registry.get(
            "test.echo",
          ),
        ).toBe(handler);
      },
    );

    it(
      "rejects duplicate step type registration",
      () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new TestHandler(
            "test.echo",
          ),
        );

        expect(
          () =>
            registry.register(
              new TestHandler(
                "test.echo",
              ),
            ),
        ).toThrow(
          DuplicateStepHandlerError,
        );
      },
    );

    it(
      "rejects lookup of an unknown step type",
      () => {
        const registry =
          new HandlerRegistry();

        expect(
          () =>
            registry.get(
              "missing.handler",
            ),
        ).toThrow(
          UnknownStepHandlerError,
        );
      },
    );

    it(
      "reports registered step types deterministically",
      () => {
        const registry =
          new HandlerRegistry();

        registry.register(
          new TestHandler(
            "zeta.handler",
          ),
        );

        registry.register(
          new TestHandler(
            "alpha.handler",
          ),
        );

        registry.register(
          new TestHandler(
            "middle.handler",
          ),
        );

        expect(
          registry.registeredStepTypes(),
        ).toEqual([
          "alpha.handler",
          "middle.handler",
          "zeta.handler",
        ]);
      },
    );
  },
);
