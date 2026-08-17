import {
  FencedSchedulerRuntimeAdapter,
  type FencedSchedulerDispatchResult,
  type FencedSchedulerRuntimeIdentity,
  type FencedSchedulerRuntimeStateReader,
} from "./fenced_scheduler_runtime_adapter.js";

import {
  SchedulerPollingLoop,
  type SchedulerDispatcher,
} from "../scheduling/scheduler_polling_loop.js";

import {
  type TriggerDispatchSummary,
} from "../scheduling/trigger_dispatcher.js";


export type FencedSchedulerBlockedDispatchResult =
  Exclude<
    FencedSchedulerDispatchResult,
    {
      readonly kind:
        "dispatched";
    }
  >;


function blockedMessage(
  result:
    FencedSchedulerBlockedDispatchResult,
): string {

  switch (result.kind) {

    case "unowned":
      return (
        "Scheduler dispatch rejected because " +
        "durable ownership is unowned."
      );


    case "generation_mismatch":
      return (
        "Scheduler dispatch rejected because " +
        "the durable generation changed."
      );


    case "foreign_owner":
      return (
        "Scheduler dispatch rejected because " +
        "another durable owner is authoritative."
      );


    case "fenced":
      return (
        "Scheduler dispatch rejected because " +
        "the runtime fencing token is stale."
      );


    case "lease_expired":
      return (
        "Scheduler dispatch rejected because " +
        "the durable ownership lease expired."
      );
  }
}


export class FencedSchedulerPollingDispatchError
extends Error {

  public readonly name =
    "FencedSchedulerPollingDispatchError";


  public constructor(
    public readonly result:
      FencedSchedulerBlockedDispatchResult,
  ) {

    super(
      blockedMessage(
        result,
      ),
    );
  }
}


export class FencedSchedulerPollingDispatcher
implements SchedulerDispatcher {

  public constructor(
    private readonly stateReader:
      FencedSchedulerRuntimeStateReader,

    private readonly inner:
      SchedulerDispatcher,

    private readonly identity:
      FencedSchedulerRuntimeIdentity,
  ) {}


  public async dispatchDue(
    evaluatedAtUtc: Date,
    limit?: number,
  ): Promise<TriggerDispatchSummary> {

    /*
     * A12.5 intentionally owns the fencing decision.
     *
     * The small proxy below preserves SchedulerPollingLoop's
     * optional batch limit while routing execution through
     * the accepted A12.5 runtime-fencing adapter.
     */
    const adapter =
      new FencedSchedulerRuntimeAdapter(
        this.stateReader,
        {
          dispatchDue:
            async (
              authoritativeEvaluatedAtUtc:
                Date,
            ) =>
              this.inner.dispatchDue(
                authoritativeEvaluatedAtUtc,
                limit,
              ),
        },
        this.identity,
      );


    const result =
      await adapter.dispatchDue(
        evaluatedAtUtc,
      );


    if (result.kind !== "dispatched") {
      throw new FencedSchedulerPollingDispatchError(
        result,
      );
    }


    return result.summary;
  }
}


export type FencedSchedulerPollingLoopComposition = {
  readonly fencedDispatcher:
    FencedSchedulerPollingDispatcher;

  readonly pollingLoop:
    SchedulerPollingLoop;
};


export function createFencedSchedulerPollingLoopComposition(
  stateReader:
    FencedSchedulerRuntimeStateReader,

  dispatcher:
    SchedulerDispatcher,

  identity:
    FencedSchedulerRuntimeIdentity,
):
FencedSchedulerPollingLoopComposition {

  const fencedDispatcher =
    new FencedSchedulerPollingDispatcher(
      stateReader,
      dispatcher,
      identity,
    );


  const pollingLoop =
    new SchedulerPollingLoop(
      fencedDispatcher,
    );


  return Object.freeze({
    fencedDispatcher,
    pollingLoop,
  });
}
