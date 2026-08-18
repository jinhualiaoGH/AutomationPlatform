import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

import {
  DurableSchedulerStandbyAcquisitionSupervisor,
  type DurableSchedulerStandbyAcquisitionSleeper,
} from "../src/recovery/durable_scheduler_standby_acquisition_supervisor.js";

import {
  SchedulerStandbyActiveFailoverIntegration,
  type SchedulerFailoverRuntimeController,
  type SchedulerStandbyOwnershipAuthority,
} from "../src/recovery/scheduler_standby_active_failover_integration.js";


class ImmediateSleeper
implements DurableSchedulerStandbyAcquisitionSleeper {

  public async sleep(
    _milliseconds:
      number,

    _signal:
      AbortSignal,
  ): Promise<void> {
    return;
  }
}


function ownership(
  fencingToken:
    number,
) {

  return createDurableSchedulerOwnership({
    generation:
      13,

    fencingToken,

    ownerId:
      "a13-standby",

    leaseExpiresAtEpochMs:
      20_000,
  });
}


describe(
  "SchedulerStandbyActiveFailoverIntegration",
  () => {

    it(
      "activates through D3 only after durable acquisition",
      async () => {

        const acquiredOwnership =
          ownership(
            51,
          );


        let activationCount =
          0;


        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {
              return {
                kind:
                  "acquired",

                ownership:
                  acquiredOwnership,
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate(
              observedOwnership,
            ) {
              expect(
                observedOwnership,
              ).toBe(
                acquiredOwnership,
              );

              activationCount +=
                1;
            },

            async deactivate() {
              return;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            integration,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        expect(
          integration.mode,
        ).toBe(
          "standby",
        );


        const result =
          await supervisor.start();


        expect(
          result.kind,
        ).toBe(
          "activated",
        );

        expect(
          integration.mode,
        ).toBe(
          "active",
        );

        expect(
          activationCount,
        ).toBe(
          1,
        );
      },
    );


    it(
      "remains standby under durable ownership contention",
      async () => {

        let attempts =
          0;


        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {

              attempts +=
                1;


              if (
                attempts < 3
              ) {
                return {
                  kind:
                    "contended",

                  observedOwnership:
                    ownership(
                      50,
                    ),
                };
              }


              return {
                kind:
                  "acquired",

                ownership:
                  ownership(
                    52,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              return;
            },

            async deactivate() {
              return;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            integration,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        await supervisor.start();


        expect(
          attempts,
        ).toBe(
          3,
        );

        expect(
          integration.mode,
        ).toBe(
          "active",
        );
      },
    );


    it(
      "fails closed and deactivates on ownership loss",
      async () => {

        let deactivations =
          0;


        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {
              return {
                kind:
                  "acquired",

                ownership:
                  ownership(
                    53,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              return;
            },

            async deactivate() {
              deactivations +=
                1;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        await integration.activate(
          ownership(
            53,
          ),
        );


        expect(
          integration.mode,
        ).toBe(
          "active",
        );


        await integration.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );

        expect(
          deactivations,
        ).toBe(
          1,
        );
      },
    );


    it(
      "fails closed on generation mismatch",
      async () => {

        let deactivations =
          0;


        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {
              return {
                kind:
                  "contended",

                observedOwnership:
                  ownership(
                    54,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              return;
            },

            async deactivate() {
              deactivations +=
                1;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        await integration.activate(
          ownership(
            55,
          ),
        );


        await integration.handleAuthoritySignal({
          kind:
            "generation_mismatch",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );

        expect(
          deactivations,
        ).toBe(
          1,
        );
      },
    );


    it(
      "returns from fail closed to standby only after runtime quiescence",
      async () => {

        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {
              return {
                kind:
                  "contended",

                observedOwnership:
                  ownership(
                    56,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              return;
            },

            async deactivate() {
              return;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        await integration.activate(
          ownership(
            57,
          ),
        );


        await integration.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );


        await integration.runtimeQuiesced();


        expect(
          integration.mode,
        ).toBe(
          "standby",
        );
      },
    );


    it(
      "requires a fresh acquisition after controlled standby reentry",
      async () => {

        let acquisitionAttempts =
          0;

        let activations =
          0;


        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {

              acquisitionAttempts +=
                1;


              return {
                kind:
                  "acquired",

                ownership:
                  ownership(
                    58 + acquisitionAttempts,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              activations +=
                1;
            },

            async deactivate() {
              return;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        const firstSupervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            integration,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        await firstSupervisor.start();


        expect(
          integration.mode,
        ).toBe(
          "active",
        );


        await integration.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );


        await integration.runtimeQuiesced();


        expect(
          integration.mode,
        ).toBe(
          "standby",
        );


        const secondSupervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            integration,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        await secondSupervisor.start();


        expect(
          integration.mode,
        ).toBe(
          "active",
        );

        expect(
          acquisitionAttempts,
        ).toBe(
          2,
        );

        expect(
          activations,
        ).toBe(
          2,
        );
      },
    );


    it(
      "does not expose fail-closed mode as active authority",
      async () => {

        const authority:
          SchedulerStandbyOwnershipAuthority =
          {
            async acquireOrRenew() {
              return {
                kind:
                  "contended",

                observedOwnership:
                  ownership(
                    60,
                  ),
              };
            },
          };


        const runtime:
          SchedulerFailoverRuntimeController =
          {
            async activate() {
              return;
            },

            async deactivate() {
              return;
            },
          };


        const integration =
          new SchedulerStandbyActiveFailoverIntegration(
            authority,
            runtime,
          );


        await integration.activate(
          ownership(
            61,
          ),
        );


        await integration.handleAuthoritySignal({
          kind:
            "ownership_lost",
        });


        expect(
          integration.mode,
        ).toBe(
          "fail_closed",
        );

        expect(
          integration.state,
        ).toBe(
          "standby",
        );


        expect(
          () =>
            integration.acquire(),
        ).toThrow(
          "Durable scheduler acquisition is permitted only from standby.",
        );
      },
    );
  },
);