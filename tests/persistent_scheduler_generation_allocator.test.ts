import {
  describe,
  expect,
  it,
} from "vitest";

import {
  PersistentSchedulerGenerationAllocator,
} from "../src/recovery/persistent_scheduler_generation_allocator.js";

import {
  createSchedulerGenerationAllocation,
  type SchedulerGenerationAllocationResult,
  type SchedulerGenerationState,
  type SchedulerGenerationStateStore,
} from "../src/recovery/scheduler_generation_state_contract.js";


class FakeGenerationStateStore
implements SchedulerGenerationStateStore {
  public readCalls =
    0;

  public allocateCalls:
    Array<{
      readonly generation:
        number;

      readonly rowVersion:
        number[];
    }> =
    [];

  public constructor(
    public state:
      SchedulerGenerationState,

    public allocationResult:
      SchedulerGenerationAllocationResult,
  ) {}


  public async read():
    Promise<SchedulerGenerationState> {
    this.readCalls +=
      1;

    return {
      currentGeneration:
        this.state.currentGeneration,

      rowVersion:
        Uint8Array.from(
          this.state.rowVersion,
        ),
    };
  }


  public async allocateNext(
    expectedGeneration:
      number,

    expectedRowVersion:
      Readonly<Uint8Array>,
  ):
    Promise<SchedulerGenerationAllocationResult> {

    this.allocateCalls.push({
      generation:
        expectedGeneration,

      rowVersion:
        Array.from(
          expectedRowVersion,
        ),
    });

    return this.allocationResult;
  }
}


function state(
  generation:
    number,

  rowVersion:
    number[],
): SchedulerGenerationState {
  return {
    currentGeneration:
      generation,

    rowVersion:
      Uint8Array.from(
        rowVersion,
      ),
  };
}


describe(
  "PersistentSchedulerGenerationAllocator",
  () => {
    it(
      "loads the current durable generation cursor",
      async () => {
        const store =
          new FakeGenerationStateStore(
            state(
              7,
              [
                1,
                2,
                3,
              ],
            ),

            {
              disposition:
                "stale",

              allocation:
                null,
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        const cursor =
          await allocator.load();

        expect(
          cursor.generation,
        ).toBe(7);

        expect(
          Array.from(
            cursor.rowVersion,
          ),
        ).toEqual([
          1,
          2,
          3,
        ]);

        expect(
          store.readCalls,
        ).toBe(1);
      },
    );


    it(
      "returns a defensive cursor from durable state",
      async () => {
        const source =
          new Uint8Array([
            9,
            8,
          ]);

        const store =
          new FakeGenerationStateStore(
            {
              currentGeneration:
                3,

              rowVersion:
                source,
            },

            {
              disposition:
                "stale",

              allocation:
                null,
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        const cursor =
          await allocator.load();

        source[0] =
          0;

        expect(
          Array.from(
            cursor.rowVersion,
          ),
        ).toEqual([
          9,
          8,
        ]);
      },
    );


    it(
      "forwards the complete expected durable cursor to the store",
      async () => {
        const store =
          new FakeGenerationStateStore(
            state(
              4,
              [
                1,
              ],
            ),

            {
              disposition:
                "allocated",

              allocation:
                createSchedulerGenerationAllocation(
                  4,
                  5,
                  new Uint8Array([
                    5,
                    5,
                  ]),
                ),
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        await allocator.allocateNext({
          generation:
            4,

          rowVersion:
            new Uint8Array([
              2,
              4,
              6,
            ]),
        });

        expect(
          store.allocateCalls,
        ).toEqual([
          {
            generation:
              4,

            rowVersion:
              [
                2,
                4,
                6,
              ],
          },
        ]);
      },
    );


    it(
      "maps a successful durable allocation to previous and current cursors",
      async () => {
        const store =
          new FakeGenerationStateStore(
            state(
              4,
              [
                1,
              ],
            ),

            {
              disposition:
                "allocated",

              allocation:
                createSchedulerGenerationAllocation(
                  4,
                  5,
                  new Uint8Array([
                    10,
                    11,
                  ]),
                ),
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        const result =
          await allocator.allocateNext({
            generation:
              4,

          rowVersion:
            new Uint8Array([
              7,
              8,
            ]),
        });

        expect(
          result.disposition,
        ).toBe(
          "allocated",
        );

        if (
          result.disposition !==
          "allocated"
        ) {
          throw new Error(
            "Expected allocated result.",
          );
        }

        expect(
          result.previous.generation,
        ).toBe(4);

        expect(
          Array.from(
            result.previous.rowVersion,
          ),
        ).toEqual([
          7,
          8,
        ]);

        expect(
          result.current.generation,
        ).toBe(5);

        expect(
          Array.from(
            result.current.rowVersion,
          ),
        ).toEqual([
          10,
          11,
        ]);
      },
    );


    it(
      "preserves a stale allocation without inventing a generation",
      async () => {
        const store =
          new FakeGenerationStateStore(
            state(
              9,
              [
                1,
              ],
            ),

            {
              disposition:
                "stale",

              allocation:
                null,
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        const result =
          await allocator.allocateNext({
            generation:
              9,

          rowVersion:
            new Uint8Array([
              3,
              3,
            ]),
        });

        expect(
          result.disposition,
        ).toBe(
          "stale",
        );

        if (
          result.disposition !==
          "stale"
        ) {
          throw new Error(
            "Expected stale result.",
          );
        }

        expect(
          result.previous.generation,
        ).toBe(9);

        expect(
          Array.from(
            result.previous.rowVersion,
          ),
        ).toEqual([
          3,
          3,
        ]);

        expect(
          result.current,
        ).toBeNull();
      },
    );


    it(
      "rejects a store allocation that does not match the expected generation",
      async () => {
        const store =
          new FakeGenerationStateStore(
            state(
              4,
              [
                1,
              ],
            ),

            {
              disposition:
                "allocated",

              allocation:
                createSchedulerGenerationAllocation(
                  5,
                  6,
                  new Uint8Array([
                    8,
                  ]),
                ),
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        await expect(
          allocator.allocateNext({
            generation:
              4,

            rowVersion:
              new Uint8Array([
                1,
              ]),
          }),
        ).rejects.toThrow(
          "Persistent scheduler generation allocation does not match the expected generation.",
        );
      },
    );


    it(
      "propagates durable store failures unchanged",
      async () => {
        const expected =
          new Error(
            "synthetic durable allocation failure",
          );

        const store:
          SchedulerGenerationStateStore =
          {
            async read() {
              return state(
                1,
                [
                  1,
                ],
              );
            },

            async allocateNext() {
              throw expected;
            },
          };

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        await expect(
          allocator.allocateNext({
            generation:
              1,

            rowVersion:
              new Uint8Array([
                1,
              ]),
          }),
        ).rejects.toBe(
          expected,
        );
      },
    );


    it(
      "does not mutate the caller supplied cursor",
      async () => {
        const source =
          new Uint8Array([
            4,
            5,
            6,
          ]);

        const store =
          new FakeGenerationStateStore(
            state(
              2,
              [
                1,
              ],
            ),

            {
              disposition:
                "stale",

              allocation:
                null,
            },
          );

        const allocator =
          new PersistentSchedulerGenerationAllocator(
            store,
          );

        await allocator.allocateNext({
          generation:
            2,

          rowVersion:
            source,
        });

        expect(
          Array.from(
            source,
          ),
        ).toEqual([
          4,
          5,
          6,
        ]);
      },
    );
  },
);
