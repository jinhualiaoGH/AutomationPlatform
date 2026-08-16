import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DurableSchedulerRecoverySupervisor,
  type DurableSchedulerGenerationAllocator,
} from "../src/recovery/durable_scheduler_recovery_supervisor.js";

import type {
  PersistentSchedulerGenerationAllocation,
  PersistentSchedulerGenerationCursor,
} from "../src/recovery/persistent_scheduler_generation_allocator.js";

import type {
  SchedulerRuntimeState,
} from "../src/scheduling/scheduler_runtime.js";


type RestartResult = {
  readonly disposition:
    "executed" |
    "rejected";

  readonly previousGeneration:
    number;

  readonly currentGeneration:
    number;
};


class FakeRecovery {
  public restartCalls =
    0;

  public restartError:
    Error | null =
    null;


  public constructor(
    public generation:
      number,

    public state:
      SchedulerRuntimeState,

    public restartResult:
      RestartResult,
  ) {}


  public async restart():
    Promise<RestartResult> {
    this.restartCalls +=
      1;

    if (
      this.restartError !==
      null
    ) {
      throw this.restartError;
    }

    if (
      this.restartResult.disposition ===
      "executed"
    ) {
      this.generation =
        this.restartResult.currentGeneration;

      this.state =
        "running";
    }

    return this.restartResult;
  }
}


class FakeAllocator
implements DurableSchedulerGenerationAllocator {
  public loadCalls =
    0;

  public allocationCalls =
    0;

  public allocatedExpected:
    PersistentSchedulerGenerationCursor |
    null =
    null;


  public constructor(
    public loaded:
      PersistentSchedulerGenerationCursor,

    public allocation:
      PersistentSchedulerGenerationAllocation,
  ) {}


  public async load():
    Promise<PersistentSchedulerGenerationCursor> {
    this.loadCalls +=
      1;

    return {
      generation:
        this.loaded.generation,

      rowVersion:
        Uint8Array.from(
          this.loaded.rowVersion,
        ),
    };
  }


  public async allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation> {
    this.allocationCalls +=
      1;

    this.allocatedExpected =
      {
        generation:
          expected.generation,

        rowVersion:
          Uint8Array.from(
            expected.rowVersion,
          ),
      };

    return this.allocation;
  }
}


function cursor(
  generation:
    number,

  rowVersion:
    number[],
): PersistentSchedulerGenerationCursor {
  return {
    generation,

    rowVersion:
      Uint8Array.from(
        rowVersion,
      ),
  };
}


function allocated(
  previous:
    PersistentSchedulerGenerationCursor,

  current:
    PersistentSchedulerGenerationCursor,
): PersistentSchedulerGenerationAllocation {
  return {
    disposition:
      "allocated",

    previous,
    current,
  };
}


describe(
  "DurableSchedulerRecoverySupervisor",
  () => {
    it(
      "initializes from durable generation state",
      async () => {
        const recovery =
          new FakeRecovery(
            4,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                4,

              currentGeneration:
                5,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              4,
              [
                1,
                2,
              ],
            ),

            allocated(
              cursor(
                4,
                [
                  1,
                  2,
                ],
              ),

              cursor(
                5,
                [
                  3,
                  4,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        expect(
          supervisor.isInitialized,
        ).toBe(false);

        expect(
          supervisor.durableGeneration,
        ).toBeNull();

        const loaded =
          await supervisor.initialize();

        expect(
          loaded.generation,
        ).toBe(4);

        expect(
          supervisor.isInitialized,
        ).toBe(true);

        expect(
          supervisor.durableGeneration,
        ).toBe(4);

        expect(
          allocator.loadCalls,
        ).toBe(1);
      },
    );


    it(
      "rejects initialization when durable and active generations differ",
      async () => {
        const recovery =
          new FakeRecovery(
            3,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                3,

              currentGeneration:
                4,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              4,
              [
                1,
              ],
            ),

            {
              disposition:
                "stale",

              previous:
                cursor(
                  4,
                  [
                    1,
                  ],
                ),

              current:
                null,
            },
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await expect(
          supervisor.initialize(),
        ).rejects.toThrow(
          "Durable scheduler generation does not match the active recovery generation.",
        );

        expect(
          supervisor.isInitialized,
        ).toBe(false);
      },
    );


    it(
      "rejects duplicate initialization",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              1,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                1,
                [
                  1,
                ],
              ),

              cursor(
                2,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.initialize(),
        ).rejects.toThrow(
          "Durable scheduler recovery supervision is already initialized.",
        );
      },
    );


    it(
      "rejects restart before initialization",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              1,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                1,
                [
                  1,
                ],
              ),

              cursor(
                2,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Durable scheduler recovery supervision has not been initialized.",
        );

        expect(
          allocator.allocationCalls,
        ).toBe(0);

        expect(
          recovery.restartCalls,
        ).toBe(0);
      },
    );


    it(
      "preserves frozen rejected restart semantics without allocating",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "idle",
            {
              disposition:
                "rejected",

              previousGeneration:
                1,

              currentGeneration:
                1,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              1,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                1,
                [
                  1,
                ],
              ),

              cursor(
                2,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        const result =
          await supervisor.restart();

        expect(
          result,
        ).toEqual({
          disposition:
            "rejected",

          previousGeneration:
            1,

          currentGeneration:
            1,
        });

        expect(
          allocator.allocationCalls,
        ).toBe(0);

        expect(
          recovery.restartCalls,
        ).toBe(1);

        expect(
          supervisor.durableGeneration,
        ).toBe(1);
      },
    );


    it(
      "allocates durable identity before invoking restart",
      async () => {
        const events:
          string[] =
          [];

        const recovery =
          new FakeRecovery(
            1,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const allocator:
          DurableSchedulerGenerationAllocator =
          {
            async load() {
              return cursor(
                1,
                [
                  1,
                ],
              );
            },

            async allocateNext(
              expected,
            ) {
              events.push(
                "allocate",
              );

              return allocated(
                expected,

                cursor(
                  2,
                  [
                    2,
                  ],
                ),
              );
            },
          };

        const originalRestart =
          recovery.restart.bind(
            recovery,
          );

        recovery.restart =
          async () => {
            events.push(
              "restart",
            );

            return originalRestart();
          };

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        const result =
          await supervisor.restart();

        expect(
          events,
        ).toEqual([
          "allocate",
          "restart",
        ]);

        expect(
          result.previousGeneration,
        ).toBe(1);

        expect(
          result.currentGeneration,
        ).toBe(2);

        expect(
          supervisor.durableGeneration,
        ).toBe(2);

        expect(
          recovery.generation,
        ).toBe(2);
      },
    );


    it(
      "forwards the initialized durable cursor to allocation",
      async () => {
        const recovery =
          new FakeRecovery(
            7,
            "stopped",
            {
              disposition:
                "executed",

              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              7,
              [
                9,
                8,
                7,
              ],
            ),

            allocated(
              cursor(
                7,
                [
                  9,
                  8,
                  7,
                ],
              ),

              cursor(
                8,
                [
                  6,
                  5,
                  4,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();
        await supervisor.restart();

        expect(
          allocator.allocatedExpected
            ?.generation,
        ).toBe(7);

        expect(
          Array.from(
            allocator.allocatedExpected
              ?.rowVersion ??
            [],
          ),
        ).toEqual([
          9,
          8,
          7,
        ]);
      },
    );


    it(
      "rejects stale durable allocation without invoking frozen restart",
      async () => {
        const recovery =
          new FakeRecovery(
            5,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                5,

              currentGeneration:
                6,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              5,
              [
                1,
              ],
            ),

            {
              disposition:
                "stale",

              previous:
                cursor(
                  5,
                  [
                    1,
                  ],
                ),

              current:
                null,
            },
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Durable scheduler generation allocation is stale.",
        );

        expect(
          recovery.restartCalls,
        ).toBe(0);

        expect(
          supervisor.durableGeneration,
        ).toBe(5);
      },
    );


    it(
      "rejects active generation drift before allocating",
      async () => {
        const recovery =
          new FakeRecovery(
            3,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                3,

              currentGeneration:
                4,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              3,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                3,
                [
                  1,
                ],
              ),

              cursor(
                4,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        recovery.generation =
          4;

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Active recovery generation has drifted from durable scheduler generation.",
        );

        expect(
          allocator.allocationCalls,
        ).toBe(0);

        expect(
          recovery.restartCalls,
        ).toBe(0);
      },
    );


    it(
      "consumes durable identity when runtime restart fails",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const expected =
          new Error(
            "synthetic runtime restart failure",
          );

        recovery.restartError =
          expected;

        const allocator =
          new FakeAllocator(
            cursor(
              1,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                1,
                [
                  1,
                ],
              ),

              cursor(
                2,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.restart(),
        ).rejects.toBe(
          expected,
        );

        expect(
          supervisor.durableGeneration,
        ).toBe(2);

        expect(
          recovery.generation,
        ).toBe(1);

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Active recovery generation has drifted from durable scheduler generation.",
        );

        expect(
          allocator.allocationCalls,
        ).toBe(1);
      },
    );


    it(
      "rejects a restart result with wrong previous generation",
      async () => {
        const recovery =
          new FakeRecovery(
            3,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                2,

              currentGeneration:
                4,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              3,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                3,
                [
                  1,
                ],
              ),

              cursor(
                4,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Recovery restart previous generation does not match durable allocation.",
        );
      },
    );


    it(
      "rejects a restart result with wrong current generation",
      async () => {
        const recovery =
          new FakeRecovery(
            3,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                3,

              currentGeneration:
                5,
            },
          );

        const allocator =
          new FakeAllocator(
            cursor(
              3,
              [
                1,
              ],
            ),

            allocated(
              cursor(
                3,
                [
                  1,
                ],
              ),

              cursor(
                4,
                [
                  2,
                ],
              ),
            ),
          );

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.restart(),
        ).rejects.toThrow(
          "Recovery restart current generation does not match durable allocation.",
        );
      },
    );


    it(
      "propagates allocator failures without invoking restart",
      async () => {
        const recovery =
          new FakeRecovery(
            1,
            "running",
            {
              disposition:
                "executed",

              previousGeneration:
                1,

              currentGeneration:
                2,
            },
          );

        const expected =
          new Error(
            "synthetic allocator failure",
          );

        const allocator:
          DurableSchedulerGenerationAllocator =
          {
            async load() {
              return cursor(
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

        const supervisor =
          new DurableSchedulerRecoverySupervisor(
            recovery,
            allocator,
          );

        await supervisor.initialize();

        await expect(
          supervisor.restart(),
        ).rejects.toBe(
          expected,
        );

        expect(
          recovery.restartCalls,
        ).toBe(0);

        expect(
          supervisor.durableGeneration,
        ).toBe(1);
      },
    );
  },
);
