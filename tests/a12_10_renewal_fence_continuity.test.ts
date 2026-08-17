import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createRenewalAwareFencedSchedulerDispatcher,
} from "../src/recovery/production_scheduler_ownership_runtime_composition.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

import {
  FencedSchedulerPollingDispatchError,
} from "../src/recovery/fenced_scheduler_polling_loop_composition.js";

import {
  type FencedSchedulerRuntimeIdentity,
} from "../src/recovery/fenced_scheduler_runtime_adapter.js";

import {
  type SchedulerOwnershipState,
} from "../src/repositories/scheduler_ownership_state_repository.js";

import {
  type TriggerDispatchSummary,
} from "../src/scheduling/trigger_dispatcher.js";


function rowVersion(
  value:
    number,
): Buffer {

  const result =
    Buffer.alloc(8);


  result.writeBigUInt64BE(
    BigInt(value),
  );


  return result;
}


function ownershipState(
  fencingToken:
    number,
):
SchedulerOwnershipState {

  return Object.freeze({
    generation:
      7,

    fencingToken,

    ownership:
      createDurableSchedulerOwnership({
        generation:
          7,

        fencingToken,

        ownerId:
          "process-a",

        leaseExpiresAtEpochMs:
          100_000,
      }),

    rowVersion:
      rowVersion(
        fencingToken,
      ),
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
      0,

    dispatched:
      0,

    skipped:
      0,

    failed:
      0,

    outcomes:
      [],
  };
}


describe(
  "A12.10 renewal/fence continuity",
  () => {

    it(
      "uses the newly renewed fencing token without rebuilding the dispatcher",
      async () => {

        let identity:
          FencedSchedulerRuntimeIdentity =
          Object.freeze({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              11,
          });


        let durable =
          ownershipState(
            11,
          );


        const read =
          vi.fn(
            async () =>
              durable,
          );


        const realDispatch =
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
          createRenewalAwareFencedSchedulerDispatcher(
            {
              read,
            },
            {
              dispatchDue:
                realDispatch,
            },
            () =>
              identity,
          );


        const firstTime =
          new Date(
            10_000,
          );


        await expect(
          dispatcher.dispatchDue(
            firstTime,
            50,
          ),
        ).resolves.toEqual(
          summary(
            firstTime,
          ),
        );


        /*
         * Model one accepted lease renewal:
         *
         * lifecycle identity advances 11 -> 12
         * durable SQL authority advances 11 -> 12
         *
         * The same dispatcher instance must now use token 12.
         */
        identity =
          Object.freeze({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              12,
          });


        durable =
          ownershipState(
            12,
          );


        const secondTime =
          new Date(
            20_000,
          );


        await expect(
          dispatcher.dispatchDue(
            secondTime,
            50,
          ),
        ).resolves.toEqual(
          summary(
            secondTime,
          ),
        );


        expect(realDispatch)
          .toHaveBeenCalledTimes(
            2,
          );


        expect(read)
          .toHaveBeenCalledTimes(
            2,
          );
      },
    );


    it(
      "still fails closed when lifecycle identity is actually stale",
      async () => {

        const identity:
          FencedSchedulerRuntimeIdentity =
          Object.freeze({
            generation:
              7,

            ownerId:
              "process-a",

            fencingToken:
              11,
          });


        const durable =
          ownershipState(
            12,
          );


        const realDispatch =
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
          createRenewalAwareFencedSchedulerDispatcher(
            {
              read:
                async () =>
                  durable,
            },
            {
              dispatchDue:
                realDispatch,
            },
            () =>
              identity,
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              20_000,
            ),
          ),
        ).rejects.toBeInstanceOf(
          FencedSchedulerPollingDispatchError,
        );


        expect(realDispatch)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "fails closed when lifecycle authority disappears",
      async () => {

        const realDispatch =
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
          createRenewalAwareFencedSchedulerDispatcher(
            {
              read:
                async () =>
                  ownershipState(
                    12,
                  ),
            },
            {
              dispatchDue:
                realDispatch,
            },
            () =>
              null,
          );


        await expect(
          dispatcher.dispatchDue(
            new Date(
              20_000,
            ),
          ),
        ).rejects.toThrow(
          "ownership identity is unavailable before dispatch",
        );


        expect(realDispatch)
          .not.toHaveBeenCalled();
      },
    );
  },
);