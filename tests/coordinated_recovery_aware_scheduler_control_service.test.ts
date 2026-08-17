import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CoordinatedRecoveryAwareSchedulerControlService,
  type CoordinatedSchedulerRestartHandler,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";


function frozenResult(
  command:
    "start" |
    "stop",
) {
  return {
    command,

    disposition:
      "executed" as const,

    previousState:
      "idle" as const,

    currentState:
      command === "start"
        ? "running" as const
        : "stopped" as const,

    changed:
      true,

    reason:
      null,
  };
}


describe(
  "CoordinatedRecoveryAwareSchedulerControlService",
  () => {

    it(
      "delegates start unchanged to the frozen control handler",
      () => {

        const expected =
          frozenResult(
            "start",
          );

        let startCalls =
          0;

        const frozen = {
          start() {
            startCalls +=
              1;

            return expected;
          },

          async stop() {
            return frozenResult(
              "stop",
            );
          },
        };


        const restart:
          CoordinatedSchedulerRestartHandler =
        {
          async restart() {
            throw new Error(
              "restart must not execute",
            );
          },
        };


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );


        expect(service.start())
          .toBe(
            expected,
          );

        expect(startCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "delegates stop unchanged to the frozen control handler",
      async () => {

        const expected =
          frozenResult(
            "stop",
          );

        let stopCalls =
          0;

        const frozen = {
          start() {
            return frozenResult(
              "start",
            );
          },

          async stop() {
            stopCalls +=
              1;

            return expected;
          },
        };


        const restart:
          CoordinatedSchedulerRestartHandler =
        {
          async restart() {
            throw new Error(
              "restart must not execute",
            );
          },
        };


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );


        await expect(
          service.stop(),
        )
          .resolves
          .toBe(
            expected,
          );

        expect(stopCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "preserves a frozen rejected restart result unchanged",
      async () => {

        const rejected = {
          command:
            "restart" as const,

          disposition:
            "rejected" as const,

          previousGeneration:
            7,

          currentGeneration:
            7,

          previousState:
            "idle" as const,

          currentState:
            "idle" as const,

          changed:
            false,

          reason:
            "scheduler runtime is not restartable",
        };


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                return rejected;
              },
            },
          );


        const result =
          await service.restart();


        expect(result)
          .toBe(
            rejected,
          );
      },
    );


    it(
      "returns an A11 restarted outcome unchanged",
      async () => {

        const restartResult = {
          command:
            "restart" as const,

          disposition:
            "executed" as const,

          previousGeneration:
            7,

          currentGeneration:
            8,

          previousState:
            "running" as const,

          currentState:
            "running" as const,

          changed:
            true,

          reason:
            null,
        };


        const restarted = {
          disposition:
            "restarted" as const,

          previousGeneration:
            7,

          currentGeneration:
            8,

          result:
            restartResult,
        };


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                return restarted;
              },
            },
          );


        await expect(
          service.restart(),
        )
          .resolves
          .toBe(
            restarted,
          );
      },
    );


    it(
      "returns an A11 superseded outcome unchanged",
      async () => {

        const superseded = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            7,

          observedGeneration:
            8,
        };


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                return superseded;
              },
            },
          );


        await expect(
          service.restart(),
        )
          .resolves
          .toBe(
            superseded,
          );
      },
    );


    it(
      "dispatches start through execute without reinterpretation",
      async () => {

        const expected =
          frozenResult(
            "start",
          );


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return expected;
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                throw new Error(
                  "restart must not execute",
                );
              },
            },
          );


        await expect(
          service.execute(
            "start",
          ),
        )
          .resolves
          .toBe(
            expected,
          );
      },
    );


    it(
      "dispatches stop through execute without reinterpretation",
      async () => {

        const expected =
          frozenResult(
            "stop",
          );


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return expected;
              },
            },
            {
              async restart() {
                throw new Error(
                  "restart must not execute",
                );
              },
            },
          );


        await expect(
          service.execute(
            "stop",
          ),
        )
          .resolves
          .toBe(
            expected,
          );
      },
    );


    it(
      "dispatches restart through execute and preserves superseded",
      async () => {

        const superseded = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            11,

          observedGeneration:
            12,
        };


        let restartCalls =
          0;


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                restartCalls +=
                  1;

                return superseded;
              },
            },
          );


        await expect(
          service.execute(
            "restart",
          ),
        )
          .resolves
          .toBe(
            superseded,
          );


        expect(restartCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "propagates restart failures unchanged",
      async () => {

        const expected =
          new Error(
            "synthetic coordinated restart failure",
          );


        const service =
          new CoordinatedRecoveryAwareSchedulerControlService(
            {
              start() {
                return frozenResult(
                  "start",
                );
              },

              async stop() {
                return frozenResult(
                  "stop",
                );
              },
            },
            {
              async restart() {
                throw expected;
              },
            },
          );


        await expect(
          service.execute(
            "restart",
          ),
        )
          .rejects
          .toBe(
            expected,
          );
      },
    );
  },
);
