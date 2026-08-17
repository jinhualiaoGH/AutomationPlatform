import {
  assertSchedulerGeneration,
  validateGenerationTransition,
  type SchedulerGeneration,
} from "./scheduler_generation_state_contract.js";


export type DurableRecoveryRestartProvenance = {
  readonly previousGeneration:
    SchedulerGeneration;

  readonly currentGeneration:
    SchedulerGeneration;
};


export type DurableRecoveryRestartedResult<
  TResult extends DurableRecoveryRestartProvenance,
> = {
  readonly disposition:
    "restarted";

  readonly previousGeneration:
    SchedulerGeneration;

  readonly currentGeneration:
    SchedulerGeneration;

  readonly result:
    TResult;
};


export type DurableRecoverySupersededResult = {
  readonly disposition:
    "superseded";

  /*
   * Generation from which this contender attempted
   * durable recovery arbitration.
   */
  readonly attemptedGeneration:
    SchedulerGeneration;

  /*
   * Generation observed by a required durable re-read
   * after arbitration was lost.
   *
   * A11 does not interpret an arbitrary stale row version
   * as supersession.  Supersession is established only
   * after durable state is observed at a later generation.
   */
  readonly observedGeneration:
    SchedulerGeneration;
};


export type DurableRecoveryCoordinationResult<
  TResult extends DurableRecoveryRestartProvenance,
> =
  | DurableRecoveryRestartedResult<TResult>
  | DurableRecoverySupersededResult;


export function createDurableRecoveryRestartedResult<
  TResult extends DurableRecoveryRestartProvenance,
>(
  result:
    TResult,
): DurableRecoveryRestartedResult<TResult> {

  validateGenerationTransition(
    result.previousGeneration,
    result.currentGeneration,
  );

  return {
    disposition:
      "restarted",

    previousGeneration:
      result.previousGeneration,

    currentGeneration:
      result.currentGeneration,

    result,
  };
}


export function createDurableRecoverySupersededResult(
  attemptedGeneration:
    SchedulerGeneration,

  observedGeneration:
    SchedulerGeneration,
): DurableRecoverySupersededResult {

  assertSchedulerGeneration(
    attemptedGeneration,
  );

  assertSchedulerGeneration(
    observedGeneration,
  );

  if (
    observedGeneration <=
    attemptedGeneration
  ) {
    throw new Error(
      "Superseded durable recovery must observe a later durable generation.",
    );
  }

  return {
    disposition:
      "superseded",

    attemptedGeneration,

    observedGeneration,
  };
}
