import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  composeProductionDurableRecoveryCoordination,
} from "../src/recovery/production_durable_recovery_coordination_composition.js";

import {
  composeProductionCoordinatedRecoveryControlService,
} from "../src/recovery/production_coordinated_recovery_control_service_composition.js";

import {
  composeProductionCoordinatedRecoveryControl,
} from "../src/recovery/production_coordinated_recovery_control_composition.js";

import {
  composeProductionAuditedCoordinatedRecoveryControl,
} from "../src/recovery/production_audited_coordinated_recovery_control_composition.js";

import {
  composeProductionCoordinatedRecoveryHttp,
} from "../src/recovery/production_coordinated_recovery_http_composition.js";

import type {
  DurableProductionRecoveryControlComposition,
} from "../src/recovery/durable_production_recovery_control_composition.js";


const apps:
  ReturnType<typeof Fastify>[] =
  [];


afterEach(
  async () => {

    while (apps.length > 0) {

      const app =
        apps.pop();


      if (app) {
        await app.close();
      }
    }
  },
);


describe(
  "A11.10 production coordination graph",
  () => {

    it(
      "constructs the complete A11 graph around one existing A10 recovery object",
      async () => {

        const restartCalls:
          number[] =
          [];


        const existingA10 =
          {
            frozenControlService:
              {
                async execute() {
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
              },

            durableSupervisor:
              {
                async restart() {

                  restartCalls.push(
                    1,
                  );


                  return {
                    command:
                      "restart",

                    disposition:
                      "executed",

                    previousGeneration:
                      4,

                    currentGeneration:
                      5,

                    previousState:
                      "running",

                    currentState:
                      "running",

                    changed:
                      true,

                    reason:
                      null,
                  };
                },
              },
          } as unknown as
            DurableProductionRecoveryControlComposition;


        const a115 =
          composeProductionDurableRecoveryCoordination(
            existingA10,
          );


        const a116 =
          composeProductionCoordinatedRecoveryControlService(
            a115,
          );


        const a117 =
          composeProductionCoordinatedRecoveryControl(
            a116,
          );


        const a118 =
          composeProductionAuditedCoordinatedRecoveryControl(
            a117,
          );


        const a119 =
          composeProductionCoordinatedRecoveryHttp(
            a118,
          );


        expect(a115.base)
          .toBe(
            existingA10,
          );


        expect(typeof a119.commandRoutes)
          .toBe(
            "function",
          );


        expect(typeof a119.coordinationAuditRoutes)
          .toBe(
            "function",
          );


        /*
         * Composition itself must not perform recovery.
         */
        expect(restartCalls)
          .toEqual([]);
      },
    );
  },
);
