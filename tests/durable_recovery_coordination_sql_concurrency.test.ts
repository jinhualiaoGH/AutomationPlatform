import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  closeDatabase,
  getDatabasePool,
} from "../src/database/sqlserver.js";

import {
  SchedulerGenerationStateRepository,
} from "../src/repositories/scheduler_generation_state_repository.js";

import {
  PersistentSchedulerGenerationAllocator,
  type PersistentSchedulerGenerationAllocation,
  type PersistentSchedulerGenerationCursor,
} from "../src/recovery/persistent_scheduler_generation_allocator.js";

import {
  DurableRecoveryCoordinationEngine,
  type DurableRecoveryCoordinationAllocator,
  type DurableRecoveryCoordinationTarget,
} from "../src/recovery/durable_recovery_coordination_engine.js";


type RestartResult = {
  readonly previousGeneration:
    number;

  readonly currentGeneration:
    number;

  readonly contender:
    string;
};


class TwoPartyBarrier {
  private arrivals =
    0;

  private readonly released:
    Promise<void>;

  private release:
    () => void =
    () => {};


  public constructor() {
    this.released =
      new Promise<void>(
        (resolve) => {
          this.release =
            resolve;
        },
      );
  }


  public async arrive():
    Promise<void> {

    this.arrivals +=
      1;

    if (this.arrivals === 2) {
      this.release();
    }

    if (this.arrivals > 2) {
      throw new Error(
        "A11.4 initial-load barrier received too many arrivals.",
      );
    }

    await this.released;
  }


  public get arrivalCount():
    number {
    return this.arrivals;
  }
}


class FirstLoadBarrierAllocator
implements DurableRecoveryCoordinationAllocator {
  private initialLoad =
    true;


  public constructor(
    private readonly inner:
      PersistentSchedulerGenerationAllocator,

    private readonly barrier:
      TwoPartyBarrier,
  ) {}


  public async load():
    Promise<PersistentSchedulerGenerationCursor> {

    const current =
      await this.inner.load();

    if (this.initialLoad) {

      this.initialLoad =
        false;

      /*
       * Both contenders must complete their first real SQL
       * read before either is permitted to attempt allocation.
       * Therefore both race from the same generation/rowVersion.
       */
      await this.barrier.arrive();
    }

    return current;
  }


  public async allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation> {

    return this.inner.allocateNext(
      expected,
    );
  }
}


type SharedRestartCounter = {
  count:
    number;
};


class RealArbitrationRecoveryTarget
implements DurableRecoveryCoordinationTarget<RestartResult> {
  public constructor(
    public generation:
      number,

    private readonly contender:
      string,

    private readonly counter:
      SharedRestartCounter,
  ) {}


  public async restart():
    Promise<RestartResult> {

    this.counter.count +=
      1;

    const previousGeneration =
      this.generation;

    const currentGeneration =
      previousGeneration + 1;

    this.generation =
      currentGeneration;

    return {
      previousGeneration,

      currentGeneration,

      contender:
        this.contender,
    };
  }
}


async function resetGenerationOne():
  Promise<void> {

  const pool =
    await getDatabasePool();

  await pool
    .request()
    .query(`
      DELETE FROM
          dbo.scheduler_generation_state;

      INSERT INTO
          dbo.scheduler_generation_state
      (
          scheduler_generation_state_id,
          current_generation
      )
      VALUES
      (
          1,
          1
      );
    `);
}


describe(
  "A11.4 real SQL durable recovery concurrency",
  () => {

    it(
      "allows exactly one engine to restart and supersedes the competing engine",
      async () => {

        /*
         * Keep the test database canonical even if any assertion
         * below fails.
         */
        await resetGenerationOne();

        try {

          const repositoryA =
            new SchedulerGenerationStateRepository();

          const repositoryB =
            new SchedulerGenerationStateRepository();

          const allocatorA =
            new PersistentSchedulerGenerationAllocator(
              repositoryA,
            );

          const allocatorB =
            new PersistentSchedulerGenerationAllocator(
              repositoryB,
            );


          /*
           * Verify both independent repository instances observe
           * the same real SQL starting identity.
           */
          const beforeA =
            await repositoryA.read();

          const beforeB =
            await repositoryB.read();

          expect(beforeA.currentGeneration)
            .toBe(
              1,
            );

          expect(beforeB.currentGeneration)
            .toBe(
              1,
            );

          expect(beforeA.rowVersion)
            .toHaveLength(
              8,
            );

          expect(beforeB.rowVersion)
            .toHaveLength(
              8,
            );


          const barrier =
            new TwoPartyBarrier();

          const coordinatedAllocatorA =
            new FirstLoadBarrierAllocator(
              allocatorA,
              barrier,
            );

          const coordinatedAllocatorB =
            new FirstLoadBarrierAllocator(
              allocatorB,
              barrier,
            );


          const restartCounter:
            SharedRestartCounter =
          {
            count:
              0,
          };


          const recoveryA =
            new RealArbitrationRecoveryTarget(
              1,
              "A",
              restartCounter,
            );

          const recoveryB =
            new RealArbitrationRecoveryTarget(
              1,
              "B",
              restartCounter,
            );


          const engineA =
            new DurableRecoveryCoordinationEngine(
              recoveryA,
              coordinatedAllocatorA,
            );

          const engineB =
            new DurableRecoveryCoordinationEngine(
              recoveryB,
              coordinatedAllocatorB,
            );


          /*
           * Both restart requests are released concurrently only
           * after both initial SQL reads have completed.
           */
          const [
            resultA,
            resultB,
          ] =
            await Promise.all([
              engineA.restart(),
              engineB.restart(),
            ]);


          expect(barrier.arrivalCount)
            .toBe(
              2,
            );


          const results =
            [
              resultA,
              resultB,
            ];


          const restarted =
            results.filter(
              (result) =>
                result.disposition ===
                "restarted",
            );

          const superseded =
            results.filter(
              (result) =>
                result.disposition ===
                "superseded",
            );


          /*
           * This is the central A11.4 arbitration proof.
           */
          expect(restarted)
            .toHaveLength(
              1,
            );

          expect(superseded)
            .toHaveLength(
              1,
            );

          expect(restartCounter.count)
            .toBe(
              1,
            );


          const winner =
            restarted[0];

          if (
            !winner ||
            winner.disposition !==
              "restarted"
          ) {
            throw new Error(
              "A11.4 winning result missing.",
            );
          }

          expect(winner.previousGeneration)
            .toBe(
              1,
            );

          expect(winner.currentGeneration)
            .toBe(
              2,
            );

          expect(
            winner.result.previousGeneration,
          )
            .toBe(
              1,
            );

          expect(
            winner.result.currentGeneration,
          )
            .toBe(
              2,
            );


          const loser =
            superseded[0];

          if (
            !loser ||
            loser.disposition !==
              "superseded"
          ) {
            throw new Error(
              "A11.4 superseded result missing.",
            );
          }

          expect(loser.attemptedGeneration)
            .toBe(
              1,
            );

          expect(loser.observedGeneration)
            .toBeGreaterThanOrEqual(
              2,
            );


          /*
           * Exactly one process-local recovery target is allowed
           * to advance.  The superseded contender remains at its
           * original active generation.
           */
          const activeGenerations =
            [
              recoveryA.generation,
              recoveryB.generation,
            ]
              .sort(
                (
                  left,
                  right,
                ) =>
                  left - right,
              );

          expect(activeGenerations)
            .toEqual([
              1,
              2,
            ]);


          /*
           * Independent final SQL observation: one and only one
           * durable generation was consumed globally.
           */
          const finalRepository =
            new SchedulerGenerationStateRepository();

          const finalState =
            await finalRepository.read();

          expect(finalState.currentGeneration)
            .toBe(
              2,
            );

          expect(finalState.rowVersion)
            .toHaveLength(
              8,
            );


          console.log(
            "A11_4_SQL_CONCURRENCY=" +
              JSON.stringify({
                startGeneration:
                  1,

                restarted:
                  restarted.length,

                superseded:
                  superseded.length,

                restartCalls:
                  restartCounter.count,

                finalGeneration:
                  finalState.currentGeneration,

                loserObservedGeneration:
                  loser.observedGeneration,
              }),
          );
        }
        finally {

          /*
           * Test evidence may advance the real SQL state to 2,
           * but the local shared test database is restored to its
           * canonical generation-one baseline afterward.
           */
          await resetGenerationOne();
        }


        const cleanupRepository =
          new SchedulerGenerationStateRepository();

        const cleanupState =
          await cleanupRepository.read();

        expect(cleanupState.currentGeneration)
          .toBe(
            1,
          );

        expect(cleanupState.rowVersion)
          .toHaveLength(
            8,
          );

        console.log(
          "A11_4_SQL_CLEANUP=" +
            JSON.stringify({
              generation:
                cleanupState.currentGeneration,

              rowVersionLength:
                cleanupState.rowVersion.length,
            }),
        );
      },
      30000,
    );
  },
);


afterAll(
  async () => {
    await closeDatabase();
  },
);
