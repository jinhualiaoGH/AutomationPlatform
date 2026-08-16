import {
  describe,
  expect,
  it,
} from "vitest";

import {
  OffsetSchedulerRecoveryFacade,
  type OffsetSchedulerRecoverySource,
} from "../src/recovery/offset_scheduler_recovery_facade.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";


class FakeRecovery
implements OffsetSchedulerRecoverySource {
  public restartCalls =
    0;


  public constructor(
    public generation:
      number,

    public state:
      SchedulerRuntimeState,
  ) {}


  public async restart() {
    this.restartCalls +=
      1;

    const previousGeneration =
      this.generation;

    this.generation +=
      1;

    return {
      command:
        "restart" as const,

      disposition:
        "executed" as const,

      previousState:
        this.state,

      currentState:
        "running" as const,

      changed:
        true,

      reason:
        null,

      previousGeneration,

      currentGeneration:
        this.generation,
    };
  }
}


describe(
  "OffsetSchedulerRecoveryFacade",
  () => {
    it(
      "preserves identity when local and durable generations match",
      () => {
        const recovery =
          new FakeRecovery(
            4,
            "running",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            4,
          );

        expect(
          facade.generation,
        ).toBe(4);

        expect(
          facade.state,
        ).toBe("running");
      },
    );


    it(
      "maps fresh local generation one onto a later durable generation",
      () => {
        const recovery =
          new FakeRecovery(
            1,
            "idle",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            17,
          );

        expect(
          facade.generation,
        ).toBe(17);

        expect(
          facade.state,
        ).toBe("idle");
      },
    );


    it(
      "follows the underlying runtime state dynamically",
      () => {
        const recovery =
          new FakeRecovery(
            1,
            "idle",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            9,
          );

        recovery.state =
          "running";

        expect(
          facade.state,
        ).toBe("running");
      },
    );


    it(
      "translates a local restart into durable coordinates",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            9,
          );

        const result =
          await facade.restart();

        expect(
          result.previousGeneration,
        ).toBe(9);

        expect(
          result.currentGeneration,
        ).toBe(10);

        expect(
          facade.generation,
        ).toBe(10);

        expect(
          recovery.generation,
        ).toBe(2);

        expect(
          recovery.restartCalls,
        ).toBe(1);
      },
    );


    it(
      "preserves all non-generation restart fields",
      async () => {
        const recovery =
          new FakeRecovery(
            3,
            "stopped",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            12,
          );

        const result =
          await facade.restart();

        expect(
          result,
        ).toMatchObject({
          command:
            "restart",

          disposition:
            "executed",

          previousState:
            "stopped",

          currentState:
            "running",

          changed:
            true,

          reason:
            null,

          previousGeneration:
            12,

          currentGeneration:
            13,
        });
      },
    );


    it(
      "maps rejected restart without inventing a generation transition",
      async () => {
        const recovery:
          OffsetSchedulerRecoverySource =
          {
            generation:
              1,

            state:
              "idle",

            async restart() {
              return {
                command:
                  "restart",

                disposition:
                  "rejected",

                previousState:
                  "idle",

                currentState:
                  "idle",

                changed:
                  false,

                reason:
                  "synthetic rejection",

                previousGeneration:
                  1,

                currentGeneration:
                  1,
              };
            },
          };

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            6,
          );

        const result =
          await facade.restart();

        expect(
          result.previousGeneration,
        ).toBe(6);

        expect(
          result.currentGeneration,
        ).toBe(6);

        expect(
          facade.generation,
        ).toBe(6);
      },
    );


    it(
      "rejects a durable generation below the local generation",
      () => {
        const recovery =
          new FakeRecovery(
            5,
            "running",
          );

        expect(
          () =>
            new OffsetSchedulerRecoveryFacade(
              recovery,
              4,
            ),
        ).toThrow(
          "Durable generation must not precede the recovery-local generation.",
        );
      },
    );


    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])(
      "rejects invalid durable generation %s",
      (
        durableGeneration,
      ) => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
          );

        expect(
          () =>
            new OffsetSchedulerRecoveryFacade(
              recovery,
              durableGeneration,
            ),
        ).toThrow();
      },
    );


    it(
      "rejects translated generation overflow",
      () => {
        const recovery =
          new FakeRecovery(
            Number.MAX_SAFE_INTEGER,
            "running",
          );

        const facade =
          new OffsetSchedulerRecoveryFacade(
            recovery,
            Number.MAX_SAFE_INTEGER,
          );

        recovery.generation =
          Number.MAX_SAFE_INTEGER;

        expect(
          facade.generation,
        ).toBe(
          Number.MAX_SAFE_INTEGER,
        );
      },
    );
  },
);
