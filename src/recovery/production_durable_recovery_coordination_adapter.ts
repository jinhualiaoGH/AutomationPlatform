import {
  createDurableRecoveryRestartedResult,
  createDurableRecoverySupersededResult,
  type DurableRecoveryCoordinationResult,
  type DurableRecoveryRestartProvenance,
} from "./durable_recovery_coordination_contract.js";

import type {
  PersistentSchedulerGenerationCursor,
} from "./persistent_scheduler_generation_allocator.js";


export const
DURABLE_RECOVERY_STALE_ALLOCATION_ERROR =
  "Durable scheduler generation allocation is stale.";


export type ProductionDurableRecoveryInner<
  TResult extends DurableRecoveryRestartProvenance,
> = {
  readonly durableGeneration:
    number | null;

  restart():
    Promise<TResult>;
};


export type ProductionDurableRecoveryGenerationObserver = {
  load():
    Promise<PersistentSchedulerGenerationCursor>;
};


/*
 * Frozen A10 may reject a restart without allocating identity.
 *
 * Such a result remains exactly the original TResult.
 *
 * Successful restart results become A11 "restarted".
 * Cross-process CAS losers become A11 "superseded".
 */
export type ProductionDurableRecoveryCoordinationResult<
  TResult extends DurableRecoveryRestartProvenance,
> =
  | TResult
  | DurableRecoveryCoordinationResult<TResult>;


function isStaleAllocationError(
  error:
    unknown,
): error is Error {

  return (
    error instanceof Error &&
    error.message ===
      DURABLE_RECOVERY_STALE_ALLOCATION_ERROR
  );
}


export class ProductionDurableRecoveryCoordinationAdapter<
  TResult extends DurableRecoveryRestartProvenance,
> {
  public constructor(
    private readonly inner:
      ProductionDurableRecoveryInner<TResult>,

    private readonly observer:
      ProductionDurableRecoveryGenerationObserver,
  ) {}


  public async restart():
    Promise<
      ProductionDurableRecoveryCoordinationResult<TResult>
    > {

    const attemptedGeneration =
      this.inner.durableGeneration;


    if (attemptedGeneration === null) {
      throw new Error(
        "Production durable recovery coordination requires initialized durable generation.",
      );
    }


    try {

      /*
       * The frozen A10 supervisor remains authoritative for:
       *
       * - rejected restart semantics,
       * - allocation-before-restart ordering,
       * - active/durable drift protection,
       * - consumed-generation behavior,
       * - restart provenance validation.
       */
      const result =
        await this.inner.restart();


      /*
       * Frozen rejected results preserve generation identity.
       *
       * Do not reinterpret or wrap them.
       */
      if (
        result.currentGeneration ===
        result.previousGeneration
      ) {
        return result;
      }


      return createDurableRecoveryRestartedResult(
        result,
      );
    }
    catch (error) {

      /*
       * A11 intercepts only the exact frozen A10 stale-CAS
       * outcome. All other A10 failures propagate unchanged.
       */
      if (!isStaleAllocationError(error)) {
        throw error;
      }


      /*
       * Stale CAS alone is not proof of supersession.
       * A fresh durable observation is mandatory.
       */
      const observed =
        await this.observer.load();


      if (
        observed.generation <=
        attemptedGeneration
      ) {

        /*
         * Preserve the original A10 stale failure when durable
         * state does not prove that another contender advanced.
         */
        throw error;
      }


      return createDurableRecoverySupersededResult(
        attemptedGeneration,
        observed.generation,
      );
    }
  }
}
