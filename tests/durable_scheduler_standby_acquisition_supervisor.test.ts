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
  type DurableSchedulerStandbyAcquisitionLifecycle,
  type DurableSchedulerStandbyAcquisitionSleeper,
} from "../src/recovery/durable_scheduler_standby_acquisition_supervisor.js";


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
      12,

    fencingToken,

    ownerId:
      "standby-a",

    leaseExpiresAtEpochMs:
      10_000,
  });
}


describe(
  "DurableSchedulerStandbyAcquisitionSupervisor",
  () => {

    it(
      "activates only after explicit durable acquisition",
      async () => {

        let activated =
          false;

        const acquired =
          ownership(
            41,
          );


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {
              return {
                kind:
                  "acquired",

                ownership:
                  acquired,
              };
            },

            async activate(
              observed,
            ) {
              expect(
                observed,
              ).toBe(
                acquired,
              );

              activated =
                true;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        expect(
          activated,
        ).toBe(
          false,
        );


        const result =
          await supervisor.start();


        expect(
          result.kind,
        ).toBe(
          "activated",
        );

        expect(
          activated,
        ).toBe(
          true,
        );
      },
    );


    it(
      "remains standby while ownership is contended",
      async () => {

        let attempts =
          0;

        let activations =
          0;


        const acquired =
          ownership(
            42,
          );


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {

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
                      40,
                    ),
                };
              }


              return {
                kind:
                  "acquired",

                ownership:
                  acquired,
              };
            },

            async activate() {
              activations +=
                1;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        const result =
          await supervisor.start();


        expect(
          attempts,
        ).toBe(
          3,
        );

        expect(
          activations,
        ).toBe(
          1,
        );

        expect(
          result.kind,
        ).toBe(
          "activated",
        );
      },
    );


    it(
      "fails closed if standby acquisition returns renewed authority",
      async () => {

        let activations =
          0;


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {
              return {
                kind:
                  "renewed",

                ownership:
                  ownership(
                    43,
                  ),
              };
            },

            async activate() {
              activations +=
                1;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        const result =
          await supervisor.start();


        expect(
          result.kind,
        ).toBe(
          "acquisition_error",
        );

        expect(
          activations,
        ).toBe(
          0,
        );
      },
    );


    it(
      "fails closed on generation mismatch without activating",
      async () => {

        let activations =
          0;


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {
              return {
                kind:
                  "generation_mismatch",

                observedGeneration:
                  99,
              };
            },

            async activate() {
              activations +=
                1;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        const result =
          await supervisor.start();


        expect(
          result.kind,
        ).toBe(
          "acquisition_error",
        );

        expect(
          activations,
        ).toBe(
          0,
        );
      },
    );

    it(
      "rejects supervision outside standby state",
      () => {

        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "active",

            async acquire() {
              return {
                kind:
                  "contended",

                observedOwnership:
                  ownership(
                    44,
                  ),
              };
            },

            async activate() {
              return;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        expect(
          () =>
            supervisor.start(),
        ).toThrow(
          "Standby acquisition supervision requires a standby scheduler.",
        );
      },
    );


    it(
      "returns acquisition_error without activating when acquisition throws",
      async () => {

        let activations =
          0;


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {
              throw new Error(
                "ownership store unavailable",
              );
            },

            async activate() {
              activations +=
                1;
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            new ImmediateSleeper(),
          );


        const result =
          await supervisor.start();


        expect(
          result.kind,
        ).toBe(
          "acquisition_error",
        );

        expect(
          activations,
        ).toBe(
          0,
        );
      },
    );


    it(
      "stop prevents a pending standby acquisition attempt",
      async () => {

        let attempts =
          0;


        let releaseSleep:
          (() => void) |
          null =
          null;


        const sleeper:
          DurableSchedulerStandbyAcquisitionSleeper =
          {
            sleep() {
              return new Promise<void>(
                (
                  resolve,
                ) => {
                  releaseSleep =
                    resolve;
                },
              );
            },
          };


        const lifecycle:
          DurableSchedulerStandbyAcquisitionLifecycle =
          {
            state:
              "standby",

            async acquire() {
              attempts +=
                1;

              return {
                kind:
                  "contended",

                observedOwnership:
                  ownership(
                    45,
                  ),
              };
            },

            async activate() {
              throw new Error(
                "Activation must not occur.",
              );
            },
          };


        const supervisor =
          new DurableSchedulerStandbyAcquisitionSupervisor(
            lifecycle,
            {
              acquisitionIntervalMs:
                1,
            },
            sleeper,
          );


        const run =
          supervisor.start();


        const stop =
          supervisor.stop();


        if (releaseSleep !== null) {
          (
            releaseSleep as
              () => void
          )();
        }


        await stop;


        const result =
          await run;


        expect(
          result.kind,
        ).toBe(
          "stopped",
        );

        expect(
          attempts,
        ).toBe(
          0,
        );
      },
    );
  },
);
