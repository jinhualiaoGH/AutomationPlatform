import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuditedCoordinatedRecoverySchedulerControlExecutor,
} from "../src/recovery/audited_coordinated_recovery_scheduler_control_executor.js";

import {
  SchedulerRecoveryCoordinationAuditRepository,
} from "../src/repositories/scheduler_recovery_coordination_audit_repository.js";

import type {
  ProductionCoordinatedRecoveryControlComposition,
} from "../src/recovery/production_coordinated_recovery_control_composition.js";

import {
  composeProductionAuditedCoordinatedRecoveryControl,
} from "../src/recovery/production_audited_coordinated_recovery_control_composition.js";


describe(
  "composeProductionAuditedCoordinatedRecoveryControl",
  () => {

    it(
      "preserves the accepted A11.7 composition by identity",
      () => {

        const base =
          {
            coordinator:
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
            ProductionCoordinatedRecoveryControlComposition;


        const composed =
          composeProductionAuditedCoordinatedRecoveryControl(
            base,
          );


        expect(composed.base)
          .toBe(
            base,
          );


        expect(composed.auditRepository)
          .toBeInstanceOf(
            SchedulerRecoveryCoordinationAuditRepository,
          );


        expect(composed.auditedExecutor)
          .toBeInstanceOf(
            AuditedCoordinatedRecoverySchedulerControlExecutor,
          );
      },
    );


    it(
      "does not execute a command during composition",
      () => {

        let calls =
          0;


        const base =
          {
            coordinator:
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
            ProductionCoordinatedRecoveryControlComposition;


        composeProductionAuditedCoordinatedRecoveryControl(
          base,
        );


        expect(calls)
          .toBe(
            0,
          );
      },
    );
  },
);
