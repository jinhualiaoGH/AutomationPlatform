import {
  describe,
  expect,
  it,
} from "vitest";

import {
  DurableRecoveryCoordinationEngine,
  type DurableRecoveryCoordinationAllocator,
  type DurableRecoveryCoordinationTarget,
} from "../src/recovery/durable_recovery_coordination_engine.js";

import type {
  PersistentSchedulerGenerationAllocation,
  PersistentSchedulerGenerationCursor,
} from "../src/recovery/persistent_scheduler_generation_allocator.js";


type RestartResult = {
  readonly previousGeneration:
    number;

  readonly currentGeneration:
    number;

  readonly marker?:
    string;
};


function cursor(
  generation:
    number,

  version:
    number,
): PersistentSchedulerGenerationCursor {
  return {
    generation,

    rowVersion:
      new Uint8Array([
        version,
      ]),
  };
}


function allocated(
  previousGeneration:
    number,

  currentGeneration:
    number,

  version:
    number,
): PersistentSchedulerGenerationAllocation {
  return {
    disposition:
      "allocated",

    previous:
      cursor(
        previousGeneration,
        version - 1,
      ),

    current:
      cursor(
        currentGeneration,
        version,
      ),
  };
}


function stale(
  generation:
    number,

  version:
    number,
): PersistentSchedulerGenerationAllocation {
  return {
    disposition:
      "stale",

    previous:
      cursor(
        generation,
        version,
      ),

    current:
      null,
  };
}


class ScriptedAllocator
implements DurableRecoveryCoordinationAllocator {
  public readonly loaded:
    PersistentSchedulerGenerationCursor[] =
    [];

  public readonly allocations:
    PersistentSchedulerGenerationCursor[] =
    [];

  public constructor(
    private readonly loads:
      PersistentSchedulerGenerationCursor[],

    private readonly allocation:
      PersistentSchedulerGenerationAllocation |
      Error,
  ) {}


  public async load():
    Promise<PersistentSchedulerGenerationCursor> {

    const next =
      this.loads.shift();

    if (!next) {
      throw new Error(
        "Unexpected allocator load.",
      );
    }

    const copied =
      cursor(
        next.generation,
        next.rowVersion[0] ?? 0,
      );

    this.loaded.push(
      copied,
    );

    return copied;
  }


  public async allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation> {

    this.allocations.push(
      cursor(
        expected.generation,
        expected.rowVersion[0] ?? 0,
      ),
    );

    if (
      this.allocation instanceof
      Error
    ) {
      throw this.allocation;
    }

    return this.allocation;
  }
}


class RecoveryTarget
implements DurableRecoveryCoordinationTarget<RestartResult> {
  public restartCalls =
    0;

  public constructor(
    public generation:
      number,

    private readonly result:
      RestartResult |
      Error,
  ) {}


  public async restart():
    Promise<RestartResult> {

    this.restartCalls +=
      1;

    if (
      this.result instanceof
      Error
    ) {
      throw this.result;
    }

    this.generation =
      this.result.currentGeneration;

    return this.result;
  }
}


describe(
  "DurableRecoveryCoordinationEngine",
  () => {

    it(
      "returns restarted when this contender wins durable arbitration",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                10,
              ),
            ],
            allocated(
              7,
              8,
              11,
            ),
          );

        const restart = {
          previousGeneration:
            7,

          currentGeneration:
            8,

          marker:
            "preserved",
        };

        const recovery =
          new RecoveryTarget(
            7,
            restart,
          );

        const result =
          await new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart();

        expect(result)
          .toEqual({
            disposition:
              "restarted",

            previousGeneration:
              7,

            currentGeneration:
              8,

            result:
              restart,
          });

        expect(recovery.restartCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "forwards the complete freshly loaded cursor to arbitration",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                12,
                44,
              ),
            ],
            allocated(
              12,
              13,
              45,
            ),
          );

        const recovery =
          new RecoveryTarget(
            12,
            {
              previousGeneration:
                12,

              currentGeneration:
                13,
            },
          );

        await new DurableRecoveryCoordinationEngine(
          recovery,
          allocator,
        )
          .restart();

        expect(
          allocator.allocations,
        )
          .toEqual([
            cursor(
              12,
              44,
            ),
          ]);
      },
    );


    it(
      "re-reads durable state after losing arbitration",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                10,
              ),

              cursor(
                8,
                11,
              ),
            ],
            stale(
              7,
              10,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        const result =
          await new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart();

        expect(result)
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              7,

            observedGeneration:
              8,
          });

        expect(allocator.loaded)
          .toHaveLength(
            2,
          );

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "allows reconciliation to observe multiple later generations",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                5,
                1,
              ),

              cursor(
                9,
                9,
              ),
            ],
            stale(
              5,
              1,
            ),
          );

        const recovery =
          new RecoveryTarget(
            5,
            {
              previousGeneration:
                5,

              currentGeneration:
                6,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .resolves
          .toEqual({
            disposition:
              "superseded",

            attemptedGeneration:
              5,

            observedGeneration:
              9,
          });

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "fails closed when stale arbitration re-read observes the same generation",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                10,
              ),

              cursor(
                7,
                99,
              ),
            ],
            stale(
              7,
              10,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Stale durable recovery arbitration did not observe a later durable generation.",
          );

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "fails closed when stale arbitration re-read observes an older generation",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                10,
              ),

              cursor(
                6,
                9,
              ),
            ],
            stale(
              7,
              10,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Stale durable recovery arbitration did not observe a later durable generation.",
          );

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "rejects active and durable generation drift before arbitration",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                8,
                2,
              ),
            ],
            allocated(
              8,
              9,
              3,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Active recovery generation does not match durable recovery arbitration generation.",
          );

        expect(allocator.allocations)
          .toHaveLength(
            0,
          );

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "propagates allocation failures without invoking restart",
      async () => {
        const expected =
          new Error(
            "synthetic allocation failure",
          );

        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                3,
                1,
              ),
            ],
            expected,
          );

        const recovery =
          new RecoveryTarget(
            3,
            {
              previousGeneration:
                3,

              currentGeneration:
                4,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toBe(
            expected,
          );

        expect(recovery.restartCalls)
          .toBe(
            0,
          );
      },
    );


    it(
      "preserves consumed durable identity when runtime restart fails",
      async () => {
        const expected =
          new Error(
            "synthetic restart failure",
          );

        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                40,
                1,
              ),
            ],
            allocated(
              40,
              41,
              2,
            ),
          );

        const recovery =
          new RecoveryTarget(
            40,
            expected,
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toBe(
            expected,
          );

        expect(allocator.allocations)
          .toHaveLength(
            1,
          );

        expect(recovery.restartCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "rejects restart provenance with the wrong previous generation",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                1,
              ),
            ],
            allocated(
              7,
              8,
              2,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                6,

              currentGeneration:
                8,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Recovery restart previous generation does not match coordination allocation.",
          );
      },
    );


    it(
      "rejects restart provenance with the wrong current generation",
      async () => {
        const allocator =
          new ScriptedAllocator(
            [
              cursor(
                7,
                1,
              ),
            ],
            allocated(
              7,
              8,
              2,
            ),
          );

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                9,
            },
          );

        await expect(
          new DurableRecoveryCoordinationEngine(
            recovery,
            allocator,
          )
            .restart(),
        )
          .rejects
          .toThrow(
            "Recovery restart current generation does not match coordination allocation.",
          );
      },
    );


    it(
      "defensively copies the loaded cursor before allocation",
      async () => {
        const originalRowVersion =
          new Uint8Array([
            55,
          ]);

        const allocator:
          DurableRecoveryCoordinationAllocator =
        {
          async load() {
            return {
              generation:
                7,

              rowVersion:
                originalRowVersion,
            };
          },

          async allocateNext(
            expected,
          ) {
            expect(expected.rowVersion)
              .not
              .toBe(
                originalRowVersion,
              );

            return allocated(
              7,
              8,
              56,
            );
          },
        };

        const recovery =
          new RecoveryTarget(
            7,
            {
              previousGeneration:
                7,

              currentGeneration:
                8,
            },
          );

        await new DurableRecoveryCoordinationEngine(
          recovery,
          allocator,
        )
          .restart();
      },
    );
  },
);
