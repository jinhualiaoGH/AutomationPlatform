import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ProductionAuditedCoordinatedRecoveryControlComposition,
} from "../src/recovery/production_audited_coordinated_recovery_control_composition.js";

import {
  composeProductionCoordinatedRecoveryHttp,
} from "../src/recovery/production_coordinated_recovery_http_composition.js";


describe(
  "composeProductionCoordinatedRecoveryHttp",
  () => {

    it(
      "preserves the accepted A11.8 composition by identity",
      () => {

        const base =
          {
            auditedExecutor:
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

            auditRepository:
              {
                async listRecent() {
                  return [];
                },
              },
          } as unknown as
            ProductionAuditedCoordinatedRecoveryControlComposition;


        const composition =
          composeProductionCoordinatedRecoveryHttp(
            base,
          );


        expect(composition.base)
          .toBe(
            base,
          );


        expect(typeof composition.commandRoutes)
          .toBe(
            "function",
          );


        expect(
          typeof composition.coordinationAuditRoutes,
        )
          .toBe(
            "function",
          );
      },
    );


    it(
      "does not execute commands or read audit history during composition",
      () => {

        let commandCalls =
          0;

        let auditCalls =
          0;


        const base =
          {
            auditedExecutor:
              {
                async execute() {
                  commandCalls +=
                    1;

                  throw new Error(
                    "must not execute",
                  );
                },
              },

            auditRepository:
              {
                async listRecent() {
                  auditCalls +=
                    1;

                  throw new Error(
                    "must not read",
                  );
                },
              },
          } as unknown as
            ProductionAuditedCoordinatedRecoveryControlComposition;


        composeProductionCoordinatedRecoveryHttp(
          base,
        );


        expect(commandCalls)
          .toBe(
            0,
          );


        expect(auditCalls)
          .toBe(
            0,
          );
      },
    );
  },
);
