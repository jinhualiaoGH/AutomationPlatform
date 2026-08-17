import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  DurableProductionRecoveryControlComposition,
} from "../src/recovery/durable_production_recovery_control_composition.js";

import {
  ProductionDurableRecoveryCoordinationAdapter,
} from "../src/recovery/production_durable_recovery_coordination_adapter.js";

import {
  composeProductionDurableRecoveryCoordination,
} from "../src/recovery/production_durable_recovery_coordination_composition.js";


describe(
  "composeProductionDurableRecoveryCoordination",
  () => {

    it(
      "preserves the complete frozen A10 composition by identity",
      () => {

        const base =
          {
            durableSupervisor:
              {
                durableGeneration:
                  1,

                async restart() {
                  return {
                    disposition:
                      "executed",

                    previousGeneration:
                      1,

                    currentGeneration:
                      2,
                  };
                },
              },

            generationAllocator:
              {
                async load() {
                  return {
                    generation:
                      1,

                    rowVersion:
                      Uint8Array.from([
                        1,
                      ]),
                  };
                },
              },
          } as unknown as
            DurableProductionRecoveryControlComposition;


        const composed =
          composeProductionDurableRecoveryCoordination(
            base,
          );


        expect(composed.base)
          .toBe(
            base,
          );

        expect(
          composed.coordinatedRecovery,
        )
          .toBeInstanceOf(
            ProductionDurableRecoveryCoordinationAdapter,
          );
      },
    );


    it(
      "does not perform restart or durable reads during composition",
      () => {

        let restartCalls =
          0;

        let loadCalls =
          0;


        const base =
          {
            durableSupervisor:
              {
                durableGeneration:
                  1,

                async restart() {
                  restartCalls +=
                    1;

                  return {
                    disposition:
                      "executed",

                    previousGeneration:
                      1,

                    currentGeneration:
                      2,
                  };
                },
              },

            generationAllocator:
              {
                async load() {
                  loadCalls +=
                    1;

                  return {
                    generation:
                      1,

                    rowVersion:
                      Uint8Array.from([
                        1,
                      ]),
                  };
                },
              },
          } as unknown as
            DurableProductionRecoveryControlComposition;


        composeProductionDurableRecoveryCoordination(
          base,
        );


        expect(restartCalls)
          .toBe(
            0,
          );

        expect(loadCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "binds coordinated restart to the frozen A10 durable supervisor",
      async () => {

        let restartCalls =
          0;


        const base =
          {
            durableSupervisor:
              {
                durableGeneration:
                  5,

                async restart() {
                  restartCalls +=
                    1;

                  return {
                    disposition:
                      "executed",

                    previousGeneration:
                      5,

                    currentGeneration:
                      6,
                  };
                },
              },

            generationAllocator:
              {
                async load() {
                  return {
                    generation:
                      6,

                    rowVersion:
                      Uint8Array.from([
                        1,
                      ]),
                  };
                },
              },
          } as unknown as
            DurableProductionRecoveryControlComposition;


        const composed =
          composeProductionDurableRecoveryCoordination(
            base,
          );


        await expect(
          composed.coordinatedRecovery.restart(),
        )
          .resolves
          .toMatchObject({
            disposition:
              "restarted",

            previousGeneration:
              5,

            currentGeneration:
              6,
          });


        expect(restartCalls)
          .toBe(
            1,
          );
      },
    );
  },
);
