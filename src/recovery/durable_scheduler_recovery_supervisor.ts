import {
  isRestartableSchedulerRuntimeState,
} from "./scheduler_recovery_contract.js";

import type {
  SchedulerRuntimeState,
} from "../scheduling/scheduler_runtime.js";

import type {
  PersistentSchedulerGenerationAllocation,
  PersistentSchedulerGenerationCursor,
} from "./persistent_scheduler_generation_allocator.js";


export type DurableSchedulerRestartResult = {
  readonly previousGeneration:
    number;

  readonly currentGeneration:
    number;
};


export type DurableSchedulerRecoveryTarget<
  TResult extends DurableSchedulerRestartResult,
> = {
  readonly generation:
    number;

  readonly state:
    SchedulerRuntimeState;

  restart():
    Promise<TResult>;
};


export type DurableSchedulerGenerationAllocator = {
  load():
    Promise<PersistentSchedulerGenerationCursor>;

  allocateNext(
    expected:
      PersistentSchedulerGenerationCursor,
  ):
    Promise<PersistentSchedulerGenerationAllocation>;
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


export class DurableSchedulerRecoverySupervisor<
  TResult extends DurableSchedulerRestartResult,
> {
  private durableCursorValue:
    PersistentSchedulerGenerationCursor |
    null =
    null;


  public constructor(
    private readonly recovery:
      DurableSchedulerRecoveryTarget<TResult>,

    private readonly allocator:
      DurableSchedulerGenerationAllocator,
  ) {}


  public get durableGeneration():
    number | null {
    return (
      this.durableCursorValue
        ?.generation ??
      null
    );
  }


  public get isInitialized():
    boolean {
    return (
      this.durableCursorValue !==
      null
    );
  }


  public async initialize():
    Promise<PersistentSchedulerGenerationCursor> {
    if (
      this.durableCursorValue !==
      null
    ) {
      throw new Error(
        "Durable scheduler recovery supervision is already initialized.",
      );
    }

    const cursor =
      await this.allocator.load();

    if (
      cursor.generation !==
      this.recovery.generation
    ) {
      throw new Error(
        "Durable scheduler generation does not match the active recovery generation.",
      );
    }

    this.durableCursorValue =
      cloneCursor(
        cursor,
      );

    return cloneCursor(
      this.durableCursorValue,
    );
  }


  public async restart():
    Promise<TResult> {
    const cursor =
      this.durableCursorValue;

    if (cursor === null) {
      throw new Error(
        "Durable scheduler recovery supervision has not been initialized.",
      );
    }

    if (
      this.recovery.generation !==
      cursor.generation
    ) {
      throw new Error(
        "Active recovery generation has drifted from durable scheduler generation.",
      );
    }

    if (
      !isRestartableSchedulerRuntimeState(
        this.recovery.state,
      )
    ) {
      return this.recovery.restart();
    }

    const allocation =
      await this.allocator.allocateNext(
        cloneCursor(
          cursor,
        ),
      );

    if (
      allocation.disposition ===
      "stale"
    ) {
      throw new Error(
        "Durable scheduler generation allocation is stale.",
      );
    }

    if (
      allocation.previous.generation !==
      cursor.generation
    ) {
      throw new Error(
        "Durable scheduler generation allocation started from an unexpected generation.",
      );
    }

    if (
      allocation.current.generation !==
      cursor.generation + 1
    ) {
      throw new Error(
        "Durable scheduler generation allocation did not advance exactly once.",
      );
    }

    /*
     * Durable identity is published locally before runtime
     * replacement begins.
     *
     * If the frozen A9 restart fails after allocation, the new
     * generation remains consumed.  A later operation will detect
     * active/durable generation drift instead of reusing identity.
     */
    this.durableCursorValue =
      cloneCursor(
        allocation.current,
      );

    const result =
      await this.recovery.restart();

    if (
      result.previousGeneration !==
      allocation.previous.generation
    ) {
      throw new Error(
        "Recovery restart previous generation does not match durable allocation.",
      );
    }

    if (
      result.currentGeneration !==
      allocation.current.generation
    ) {
      throw new Error(
        "Recovery restart current generation does not match durable allocation.",
      );
    }

    return result;
  }
}
