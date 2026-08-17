import {
  createDurableRecoveryRestartedResult,
  createDurableRecoverySupersededResult,
  type DurableRecoveryCoordinationResult,
  type DurableRecoveryRestartProvenance,
} from "./durable_recovery_coordination_contract.js";

import {
  type PersistentSchedulerGenerationAllocation,
  type PersistentSchedulerGenerationCursor,
} from "./persistent_scheduler_generation_allocator.js";


export type DurableRecoveryCoordinationAllocator = {
  load():
    Promise<PersistentSchedulerGenerationCursor>;

  allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation>;
};


export type DurableRecoveryCoordinationTarget<
  TResult extends DurableRecoveryRestartProvenance,
> = {
  readonly generation:
    number;

  restart():
    Promise<TResult>;
};


function cloneCursor(
  cursor:
    PersistentSchedulerGenerationCursor,
): PersistentSchedulerGenerationCursor {
  return {
    generation:
      cursor.generation,

    rowVersion:
      Uint8Array.from(
        cursor.rowVersion,
      ),
  };
}


export class DurableRecoveryCoordinationEngine<
  TResult extends DurableRecoveryRestartProvenance,
> {
  public constructor(
    private readonly recovery:
      DurableRecoveryCoordinationTarget<TResult>,

    private readonly allocator:
      DurableRecoveryCoordinationAllocator,
  ) {}


  public async restart():
    Promise<
      DurableRecoveryCoordinationResult<TResult>
    > {

    const attempted =
      cloneCursor(
        await this.allocator.load(),
      );


    if (
      this.recovery.generation !==
      attempted.generation
    ) {
      throw new Error(
        "Active recovery generation does not match durable recovery arbitration generation.",
      );
    }


    const allocation =
      await this.allocator.allocateNext(
        cloneCursor(
          attempted,
        ),
      );


    if (
      allocation.disposition ===
      "stale"
    ) {

      const observed =
        cloneCursor(
          await this.allocator.load(),
        );


      if (
        observed.generation <=
        attempted.generation
      ) {
        throw new Error(
          "Stale durable recovery arbitration did not observe a later durable generation.",
        );
      }


      return createDurableRecoverySupersededResult(
        attempted.generation,
        observed.generation,
      );
    }


    if (
      allocation.previous.generation !==
      attempted.generation
    ) {
      throw new Error(
        "Durable recovery arbitration allocation started from an unexpected generation.",
      );
    }


    if (
      allocation.current.generation !==
      attempted.generation + 1
    ) {
      throw new Error(
        "Durable recovery arbitration allocation did not advance exactly once.",
      );
    }


    const result =
      await this.recovery.restart();


    if (
      result.previousGeneration !==
      allocation.previous.generation
    ) {
      throw new Error(
        "Recovery restart previous generation does not match coordination allocation.",
      );
    }


    if (
      result.currentGeneration !==
      allocation.current.generation
    ) {
      throw new Error(
        "Recovery restart current generation does not match coordination allocation.",
      );
    }


    return createDurableRecoveryRestartedResult(
      result,
    );
  }
}
