import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CoordinatedRecoveryAwareSchedulerControlService,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";

import type {
  ProductionDurableRecoveryCoordinationComposition,
} from "../src/recovery/production_durable_recovery_coordination_composition.js";

import {
  composeProductionCoordinatedRecoveryControlService,
} from "../src/recovery/production_coordinated_recovery_control_service_composition.js";


describe(
  "composeProductionCoordinatedRecoveryControlService",
  () => {

    it(
      "preserves the accepted A11.5 composition by identity",
      () => {

        const base =
          {
            base:
              {
                frozenControlService:
                  {
                    start() {
                      return {
                        command:
                          "start",

                        disposition:
                          "executed",

                        previousState:
                          "idle",

                        currentState:
                          "running",

                        changed:
                          true,

                        reason:
                          null,
                      };
                    },

                    async stop() {
                      return {
                        command:
                          "stop",

                        disposition:
                          "executed",

                        previousState:
                          "running",

                        currentState:
                          "stopped",

                        changed:
                          true,

                        reason:
                          null,
                      };
                    },
                  },
              },

            coordinatedRecovery:
              {
                async restart() {
                  return {
                    disposition:
                      "superseded",

                    attemptedGeneration:
                      1,

                    observedGeneration:
                      2,
                  };
                },
              },
          } as unknown as
            ProductionDurableRecoveryCoordinationComposition;


        const composed =
          composeProductionCoordinatedRecoveryControlService(
            base,
          );


        expect(composed.base)
          .toBe(
            base,
          );


        expect(composed.controlService)
          .toBeInstanceOf(
            CoordinatedRecoveryAwareSchedulerControlService,
          );
      },
    );


    it(
      "performs no start stop or restart during composition",
      () => {

        let startCalls =
          0;

        let stopCalls =
          0;

        let restartCalls =
          0;


        const base =
          {
            base:
              {
                frozenControlService:
                  {
                    start() {
                      startCalls +=
                        1;

                      throw new Error(
                        "start must not execute",
                      );
                    },

                    async stop() {
                      stopCalls +=
                        1;

                      throw new Error(
                        "stop must not execute",
                      );
                    },
                  },
              },

            coordinatedRecovery:
              {
                async restart() {
                  restartCalls +=
                    1;

                  throw new Error(
                    "restart must not execute",
                  );
                },
              },
          } as unknown as
            ProductionDurableRecoveryCoordinationComposition;


        composeProductionCoordinatedRecoveryControlService(
          base,
        );


        expect(startCalls)
          .toBe(
            0,
          );

        expect(stopCalls)
          .toBe(
            0,
          );

        expect(restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "routes start to the existing frozen A10 control service",
      async () => {

        const expected = {
          command:
            "start" as const,

          disposition:
            "executed" as const,

          previousState:
            "idle" as const,

          currentState:
            "running" as const,

          changed:
            true,

          reason:
            null,
        };


        let startCalls =
          0;


        const base =
          {
            base:
              {
                frozenControlService:
                  {
                    start() {
                      startCalls +=
                        1;

                      return expected;
                    },

                    async stop() {
                      throw new Error(
                        "stop must not execute",
                      );
                    },
                  },
              },

            coordinatedRecovery:
              {
                async restart() {
                  throw new Error(
                    "restart must not execute",
                  );
                },
              },
          } as unknown as
            ProductionDurableRecoveryCoordinationComposition;


        const composed =
          composeProductionCoordinatedRecoveryControlService(
            base,
          );


        await expect(
          composed.controlService.execute(
            "start",
          ),
        )
          .resolves
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
      "routes restart to the accepted A11.5 coordinated recovery adapter",
      async () => {

        const expected = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            8,

          observedGeneration:
            9,
        };


        let restartCalls =
          0;


        const base =
          {
            base:
              {
                frozenControlService:
                  {
                    start() {
                      throw new Error(
                        "start must not execute",
                      );
                    },

                    async stop() {
                      throw new Error(
                        "stop must not execute",
                      );
                    },
                  },
              },

            coordinatedRecovery:
              {
                async restart() {
                  restartCalls +=
                    1;

                  return expected;
                },
              },
          } as unknown as
            ProductionDurableRecoveryCoordinationComposition;


        const composed =
          composeProductionCoordinatedRecoveryControlService(
            base,
          );


        await expect(
          composed.controlService.execute(
            "restart",
          ),
        )
          .resolves
          .toBe(
            expected,
          );


        expect(restartCalls)
          .toBe(
            1,
          );
      },
    );
  },
);
