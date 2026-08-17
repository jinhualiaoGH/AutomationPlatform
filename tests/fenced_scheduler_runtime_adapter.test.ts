import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  FencedSchedulerRuntimeAdapter,
  type FencedSchedulerRuntimeDispatcher,
  type FencedSchedulerRuntimeStateReader,
} from "../src/recovery/fenced_scheduler_runtime_adapter.js";

import {
  createDurableSchedulerOwnership,
} from "../src/recovery/durable_scheduler_ownership_contract.js";

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


function state(
  input: {
    readonly generation?: number;
    readonly fencingToken?: number;
    readonly ownerId?: string | null;
    readonly leaseExpiresAtEpochMs?: number;
  } = {},
): SchedulerOwnershipState {

  const generation =
    input.generation ?? 7;

  const fencingToken =
    input.fencingToken ?? 11;

  const ownerId =
    input.ownerId === undefined
      ? "process-a"
      : input.ownerId;

  const leaseExpiresAtEpochMs =
    input.leaseExpiresAtEpochMs ??
    2_000;


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
  evaluatedAtUtc =
    new Date(1_500),
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


function fixture(
  schedulerState:
    SchedulerOwnershipState,
) {

  const read =
    vi.fn(
      async () =>
        schedulerState,
    );


  const dispatchDue =
    vi.fn(
      async (_now: Date) =>
        summary(),
    );


  const reader:
    FencedSchedulerRuntimeStateReader =
    {
      read,
    };


  const dispatcher:
    FencedSchedulerRuntimeDispatcher =
    {
      dispatchDue,
    };


  const adapter =
    new FencedSchedulerRuntimeAdapter(
      reader,
      dispatcher,
      {
        generation: 7,
        ownerId: "process-a",
        fencingToken: 11,
      },
    );


  return {
    adapter,
    read,
    dispatchDue,
  };
}


describe(
  "FencedSchedulerRuntimeAdapter",
  () => {

    it(
      "dispatches only for the current durable owner and fencing token",
      async () => {

        const test =
          fixture(
            state(),
          );


        const now =
          new Date(1_500);


        const result =
          await test.adapter.dispatchDue(
            now,
          );


        expect(result.kind)
          .toBe("dispatched");

        expect(test.read)
          .toHaveBeenCalledTimes(1);

        expect(test.dispatchDue)
          .toHaveBeenCalledTimes(1);

        expect(test.dispatchDue)
          .toHaveBeenCalledWith(
            now,
          );
      },
    );


    it(
      "rejects a stale fencing token before dispatch",
      async () => {

        const test =
          fixture(
            state({
              fencingToken:
                12,
            }),
          );


        const result =
          await test.adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result)
          .toEqual({
            kind:
              "fenced",

            observedFencingToken:
              12,
          });

        expect(test.dispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects a foreign owner before dispatch",
      async () => {

        const test =
          fixture(
            state({
              ownerId:
                "process-b",
            }),
          );


        const result =
          await test.adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result)
          .toEqual({
            kind:
              "foreign_owner",

            observedOwnerId:
              "process-b",
          });

        expect(test.dispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects an expired lease at the exact expiration boundary",
      async () => {

        const test =
          fixture(
            state({
              leaseExpiresAtEpochMs:
                1_500,
            }),
          );


        const result =
          await test.adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result)
          .toEqual({
            kind:
              "lease_expired",

            leaseExpiresAtEpochMs:
              1_500,
          });

        expect(test.dispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects another durable generation before dispatch",
      async () => {

        const test =
          fixture(
            state({
              generation:
                8,
            }),
          );


        const result =
          await test.adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result)
          .toEqual({
            kind:
              "generation_mismatch",

            observedGeneration:
              8,
          });

        expect(test.dispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "rejects an unowned durable scheduler before dispatch",
      async () => {

        const test =
          fixture(
            state({
              ownerId:
                null,
            }),
          );


        const result =
          await test.adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result)
          .toEqual({
            kind:
              "unowned",
          });

        expect(test.dispatchDue)
          .not.toHaveBeenCalled();
      },
    );


    it(
      "normalizes the runtime owner identity",
      async () => {

        const read =
          vi.fn(
            async () =>
              state(),
          );


        const dispatchDue =
          vi.fn(
            async (_now: Date) =>
              summary(),
          );


        const adapter =
          new FencedSchedulerRuntimeAdapter(
            {
              read,
            },
            {
              dispatchDue,
            },
            {
              generation:
                7,

              ownerId:
                "  process-a  ",

              fencingToken:
                11,
            },
          );


        const result =
          await adapter.dispatchDue(
            new Date(1_500),
          );


        expect(result.kind)
          .toBe("dispatched");

        expect(dispatchDue)
          .toHaveBeenCalledTimes(1);
      },
    );
  },
);
