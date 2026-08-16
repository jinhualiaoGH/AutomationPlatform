import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertValidSchedulerGeneration,
  initialSchedulerGeneration,
  isRestartableSchedulerRuntimeState,
  nextSchedulerGeneration,
  schedulerRestartCommand,
} from "../src/recovery/scheduler_recovery_contract.js";

import type {
  SchedulerGenerationFactory,
  SchedulerGenerationRuntime,
  SchedulerRestartResult,
} from "../src/recovery/scheduler_recovery_contract.js";

class FakeGenerationRuntime
implements SchedulerGenerationRuntime {
  public state:
    "idle" | "running" | "stopped" | "failed" =
    "idle";

  public get isRunning():
    boolean {
    return this.state ===
      "running";
  }

  public start():
    void {
    this.state =
      "running";
  }

  public async stop():
    Promise<unknown> {
    if (
      this.state ===
      "running"
    ) {
      this.state =
        "stopped";
    }

    return null;
  }
}

class FakeGenerationFactory
implements SchedulerGenerationFactory {
  public generations:
    number[] =
    [];

  public create(
    generation:
      number,
  ): SchedulerGenerationRuntime {
    this.generations.push(
      generation,
    );

    return new FakeGenerationRuntime();
  }
}

describe(
  "scheduler recovery contract",
  () => {
    it(
      "defines restart as the recovery command",
      () => {
        expect(
          schedulerRestartCommand,
        ).toBe(
          "restart",
        );
      },
    );

    it(
      "defines generation one as the initial generation",
      () => {
        expect(
          initialSchedulerGeneration,
        ).toBe(1);
      },
    );

    it(
      "accepts positive safe integer generations",
      () => {
        expect(
          () =>
            assertValidSchedulerGeneration(
              1,
            ),
        ).not.toThrow();

        expect(
          () =>
            assertValidSchedulerGeneration(
              2,
            ),
        ).not.toThrow();

        expect(
          () =>
            assertValidSchedulerGeneration(
              Number.MAX_SAFE_INTEGER,
            ),
        ).not.toThrow();
      },
    );

    it(
      "rejects invalid scheduler generations",
      () => {
        for (
          const value of [
            0,
            -1,
            1.5,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            Number.MAX_SAFE_INTEGER + 1,
          ]
        ) {
          expect(
            () =>
              assertValidSchedulerGeneration(
                value,
              ),
          ).toThrow(
            "generation must be a positive safe integer.",
          );
        }
      },
    );

    it(
      "advances generation monotonically",
      () => {
        expect(
          nextSchedulerGeneration(
            1,
          ),
        ).toBe(2);

        expect(
          nextSchedulerGeneration(
            41,
          ),
        ).toBe(42);
      },
    );

    it(
      "rejects generation overflow",
      () => {
        expect(
          () =>
            nextSchedulerGeneration(
              Number.MAX_SAFE_INTEGER,
            ),
        ).toThrow(
          "scheduler generation overflow.",
        );
      },
    );

    it(
      "allows recovery from running stopped and failed runtime states",
      () => {
        expect(
          isRestartableSchedulerRuntimeState(
            "running",
          ),
        ).toBe(true);

        expect(
          isRestartableSchedulerRuntimeState(
            "stopped",
          ),
        ).toBe(true);

        expect(
          isRestartableSchedulerRuntimeState(
            "failed",
          ),
        ).toBe(true);
      },
    );

    it(
      "does not treat an idle runtime as restartable",
      () => {
        expect(
          isRestartableSchedulerRuntimeState(
            "idle",
          ),
        ).toBe(false);
      },
    );

    it(
      "defines a generation factory without coupling to concrete SchedulerRuntime construction",
      () => {
        const factory =
          new FakeGenerationFactory();

        const runtime =
          factory.create(
            7,
          );

        expect(
          factory.generations,
        ).toEqual([
          7,
        ]);

        expect(runtime.state)
          .toBe(
            "idle",
          );

        runtime.start();

        expect(runtime.state)
          .toBe(
            "running",
          );
      },
    );

    it(
      "supports an executed restart result with a generation transition",
      () => {
        const result:
          SchedulerRestartResult = {
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              3,

            currentGeneration:
              4,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          };

        expect(result)
          .toEqual({
            command:
              "restart",

            disposition:
              "executed",

            previousGeneration:
              3,

            currentGeneration:
              4,

            previousState:
              "running",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          });
      },
    );

    it(
      "supports a rejected restart without advancing generation",
      () => {
        const result:
          SchedulerRestartResult = {
            command:
              "restart",

            disposition:
              "rejected",

            previousGeneration:
              1,

            currentGeneration:
              1,

            previousState:
              "idle",

            currentState:
              "idle",

            changed:
              false,

            reason:
              "An idle scheduler generation has not entered operational service.",
          };

        expect(result.changed)
          .toBe(false);

        expect(
          result.currentGeneration,
        ).toBe(
          result.previousGeneration,
        );
      },
    );
  },
);
