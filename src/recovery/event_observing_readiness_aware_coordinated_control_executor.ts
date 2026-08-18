import type {
  ReadinessAwareCoordinatedSchedulerControlHandler,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "./readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionEventHistory,
} from "./scheduler_control_admission_event_history.js";


type ExecuteRequest =
  Parameters<
    ReadinessAwareCoordinatedSchedulerControlHandler["execute"]
  >[0];


type ExecuteResult =
  Awaited<
    ReturnType<
      ReadinessAwareCoordinatedSchedulerControlHandler["execute"]
    >
  >;


export type SchedulerControlAdmissionEventClock =
  () => Date;


function defaultClock():
  Date {

  return new Date();
}


/**
 * A19 history decorator around an already admission-aware executor.
 *
 * Intended production order:
 *
 * A17 readiness admission
 *   -> A18 metrics observer
 *   -> A19 event-history observer
 *
 * Invariants:
 *
 * - performs no admission policy
 * - performs no scheduler mutation
 * - returns the delegate result unchanged
 * - records one timestamped history event per successful result
 * - records no event when the delegate throws
 */
export class EventObservingReadinessAwareCoordinatedControlExecutor
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public constructor(
    private readonly delegate:
      ReadinessAwareCoordinatedSchedulerControlHandler,

    private readonly history:
      SchedulerControlAdmissionEventHistory,

    private readonly clock:
      SchedulerControlAdmissionEventClock =
      defaultClock,
  ) {}


  public async execute(
    request:
      ExecuteRequest,
  ): Promise<ExecuteResult> {

    const result =
      await this.delegate.execute(
        request,
      );


    this.observe(
      request,
      result,
    );


    return result;
  }


  private observe(
    request:
      ExecuteRequest,

    result:
      ReadinessAwareCoordinatedSchedulerControlResult,
  ): void {

    const observedAtUtc =
      this.clock();


    if (
      "kind" in result &&
      result.kind ===
        "admission_denied"
    ) {

      this.history.record(
        {
          disposition:
            "denied",

          command:
            result.command,

          reason:
            result.reason,
        },

        observedAtUtc,
      );


      return;
    }


    this.history.record(
      {
        disposition:
          "admitted",

        command:
          request.command,

        reason:
          null,
      },

      observedAtUtc,
    );
  }
}
