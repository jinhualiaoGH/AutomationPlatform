import {
  describe,
  expect,
  it,
} from "vitest";

import {
  CoordinatedRecoveryAwareSchedulerControlCoordinator,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  ProductionCoordinatedRecoveryControlServiceComposition,
} from "../src/recovery/production_coordinated_recovery_control_service_composition.js";

import {
  composeProductionCoordinatedRecoveryControl,
} from "../src/recovery/production_coordinated_recovery_control_composition.js";


describe(
  "composeProductionCoordinatedRecoveryControl",
  () => {

    it(
      "preserves the accepted A11.6 composition by identity",
      () => {

        const base =
          {
            controlService:
              {
                async execute() {
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
            ProductionCoordinatedRecoveryControlServiceComposition;


        const composed =
          composeProductionCoordinatedRecoveryControl(
            base,
          );


        expect(composed.base)
          .toBe(
            base,
          );


        expect(composed.coordinator)
          .toBeInstanceOf(
            CoordinatedRecoveryAwareSchedulerControlCoordinator,
          );
      },
    );


    it(
      "does not execute any command during composition",
      () => {

        let calls =
          0;


        const base =
          {
            controlService:
              {
                async execute() {
                  calls +=
                    1;

                  throw new Error(
                    "must not execute",
                  );
                },
              },
          } as unknown as
            ProductionCoordinatedRecoveryControlServiceComposition;


        composeProductionCoordinatedRecoveryControl(
          base,
        );


        expect(calls)
          .toBe(
            0,
          );
      },
    );


    it(
      "routes requests through the accepted A11.6 control service",
      async () => {

        let calls =
          0;


        const expected = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            8,

          observedGeneration:
            9,
        };


        const base =
          {
            controlService:
              {
                async execute(
                  command:
                    string,
                ) {

                  calls +=
                    1;

                  expect(command)
                    .toBe(
                      "restart",
                    );

                  return expected;
                },
              },
          } as unknown as
            ProductionCoordinatedRecoveryControlServiceComposition;


        const composed =
          composeProductionCoordinatedRecoveryControl(
            base,
          );


        await expect(
          composed.coordinator.execute({
            command:
              "restart",

            requestKey:
              "production-key",
          }),
        )
          .resolves
          .toBe(
            expected,
          );


        expect(calls)
          .toBe(
            1,
          );
      },
    );


    it(
      "provides request-key idempotency around the A11.6 service",
      async () => {

        let calls =
          0;


        const expected = {
          disposition:
            "superseded" as const,

          attemptedGeneration:
            11,

          observedGeneration:
            12,
        };


        const base =
          {
            controlService:
              {
                async execute() {
                  calls +=
                    1;

                  return expected;
                },
              },
          } as unknown as
            ProductionCoordinatedRecoveryControlServiceComposition;


        const composed =
          composeProductionCoordinatedRecoveryControl(
            base,
          );


        const first =
          composed.coordinator.execute({
            command:
              "restart",

            requestKey:
              "idempotent",
          });


        const second =
          composed.coordinator.execute({
            command:
              "restart",

            requestKey:
              "idempotent",
          });


        expect(second)
          .toBe(
            first,
          );


        await Promise.all([
          first,
          second,
        ]);


        expect(calls)
          .toBe(
            1,
          );
      },
    );
  },
);
