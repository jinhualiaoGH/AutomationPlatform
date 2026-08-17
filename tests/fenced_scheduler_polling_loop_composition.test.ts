import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  FencedSchedulerPollingDispatchError,
  FencedSchedulerPollingDispatcher,
  createFencedSchedulerPollingLoopComposition,
} from "../src/recovery/fenced_scheduler_polling_loop_composition.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

import {
  SchedulerPollingLoop,
  type SchedulerDispatcher,
} from "../src/scheduling/scheduler_polling_loop.js";

import {
  type SchedulerOwnershipState,
} from "../src/repositories/scheduler_ownership_state_repository.js";

import {
  type TriggerDispatchSummary,
} from "../src/scheduling/trigger_dispatcher.js";


function rowVersion(
  value = 1,
): Buffer {

  const result =
    Buffer.alloc(8);


  result.writeBigUInt64BE(
    BigInt(value),
  );


  return result;
}


function ownershipState(
  input: {
    readonly generation?: number;
    readonly fencingToken?: number;
    readonly ownerId?: string | null;
    readonly leaseExpiresAtEpochMs?: number;
  } = {},
): SchedulerOwnershipState {

  const generation =
    input.generation ??
    7;


  const fencingToken =
    input.fencingToken ??
    11;


  const ownerId =
    input.ownerId === undefined
      ? "process-a"
      : input.ownerId;


  const leaseExpiresAtEpochMs =
    input.leaseExpiresAtEpochMs ??
    10_000;


  return Object.freeze({
    generation,

    fencingToken,

    ownership:
      ownerId === null
        ? null
        : createDurableSchedulerOwnership({
            generation,
            fencingToken,
            ownerId,
            leaseExpiresAtEpochMs,
          }),

    rowVersion:
      rowVersion(),
  });
}


function summary(
  evaluatedAtUtc:
    Date,
):
TriggerDispatchSummary {

  return {
    evaluatedAtUtc,

    candidates:
      3,

    dispatched:
      2,

    skipped:
      1,

    failed:
      0,

    outcomes:
      [],
  };
}


function identity() {

  return {
    generation:
      7,

    ownerId:
      "process-a",

    fencingToken:
      11,
  } as const;
}


describe(
  "FencedSchedulerPollingDispatcher",
  () => {

    it(
      "forwards the original polling-loop batch limit when ownership is authoritative",
      async () => {

        const read =
          vi.fn(
            async () =>
              ownershipState(),
          );


        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
              _limit?: number,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const inner:
          SchedulerDispatcher =
          {
            dispatchDue:
              innerDispatchDue,
          };


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read,
            },
            inner,
            identity(),
          );


        const evaluatedAtUtc =
          new Date(
            5_000,
          );


        const result =
          await dispatcher.dispatchDue(
            evaluatedAtUtc,
            37,
          );


        expect(read)
          .toHaveBeenCalledTimes(1);


        expect(innerDispatchDue)
          .toHaveBeenCalledTimes(1);


        expect(innerDispatchDue)
          .toHaveBeenCalledWith(
            evaluatedAtUtc,
            37,
          );


        expect(result)
          .toEqual(
            summary(
              evaluatedAtUtc,
            ),
          );
      },
    );


    it(
      "blocks a stale fencing token before the real dispatcher is reached",
      async () => {

        const read =
          vi.fn(
            async () =>
              ownershipState({
                fencingToken:
                  12,
              }),
          );


        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read,
            },
            {
              dispatchDue:
                innerDispatchDue,
            },
            identity(),
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              5_000,
            ),
            50,
          ),
        ).rejects.toMatchObject({
          name:
            "FencedSchedulerPollingDispatchError",

          result:
            {
              kind:
                "fenced",

              observedFencingToken:
                12,
            },
        });


        expect(innerDispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "blocks a foreign owner before the real dispatcher is reached",
      async () => {

        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read:
                async () =>
                  ownershipState({
                    ownerId:
                      "process-b",
                  }),
            },
            {
              dispatchDue:
                innerDispatchDue,
            },
            identity(),
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              5_000,
            ),
          ),
        ).rejects.toBeInstanceOf(
          FencedSchedulerPollingDispatchError,
        );


        expect(innerDispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "blocks an expired ownership lease before the real dispatcher is reached",
      async () => {

        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read:
                async () =>
                  ownershipState({
                    leaseExpiresAtEpochMs:
                      5_000,
                  }),
            },
            {
              dispatchDue:
                innerDispatchDue,
            },
            identity(),
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              5_000,
            ),
          ),
        ).rejects.toMatchObject({
          result:
            {
              kind:
                "lease_expired",
            },
        });


        expect(innerDispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "blocks an unowned scheduler before the real dispatcher is reached",
      async () => {

        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read:
                async () =>
                  ownershipState({
                    ownerId:
                      null,
                  }),
            },
            {
              dispatchDue:
                innerDispatchDue,
            },
            identity(),
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              5_000,
            ),
          ),
        ).rejects.toMatchObject({
          result:
            {
              kind:
                "unowned",
            },
        });


        expect(innerDispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "blocks another durable generation before the real dispatcher is reached",
      async () => {

        const innerDispatchDue =
          vi.fn(
            async (
              evaluatedAtUtc:
                Date,
            ) =>
              summary(
                evaluatedAtUtc,
              ),
          );


        const dispatcher =
          new FencedSchedulerPollingDispatcher(
            {
              read:
                async () =>
                  ownershipState({
                    generation:
                      8,
                  }),
            },
            {
              dispatchDue:
                innerDispatchDue,
            },
            identity(),
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              5_000,
            ),
          ),
        ).rejects.toMatchObject({
          result:
            {
              kind:
                "generation_mismatch",

              observedGeneration:
                8,
            },
        });


        expect(innerDispatchDue)
          .not.toHaveBeenCalled();
      },
    );
  },
);


describe(
  "createFencedSchedulerPollingLoopComposition",
  () => {

    it(
      "composes the accepted fencing boundary directly into SchedulerPollingLoop",
      () => {

        const inner:
          SchedulerDispatcher =
          {
            dispatchDue:
              async (
                evaluatedAtUtc:
                  Date,
              ) =>
                summary(
                  evaluatedAtUtc,
                ),
          };


        const composition =
          createFencedSchedulerPollingLoopComposition(
            {
              read:
                async () =>
                  ownershipState(),
            },
            inner,
            identity(),
          );


        expect(
          composition.fencedDispatcher,
        ).toBeInstanceOf(
          FencedSchedulerPollingDispatcher,
        );


        expect(
          composition.pollingLoop,
        ).toBeInstanceOf(
          SchedulerPollingLoop,
        );


        expect(
          Object.isFrozen(
            composition,
          ),
        ).toBe(true);
      },
    );
  },
);
