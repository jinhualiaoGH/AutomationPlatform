import type {
  ReadinessAwareCoordinatedSchedulerControlHandler,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "./readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionEventHistory,
} from "./scheduler_control_admission_event_history.js";

import type {
  SchedulerControlAdmissionEventRepository,
} from "./scheduler_control_admission_event_repository.js";


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


export type DurableAdmissionEventClock =
  () => Date;


export type DurableAdmissionEventPersistenceErrorHandler =
  (
    error:
      unknown,
  ) => void;


function defaultClock():
  Date {

  return new Date();
}


function defaultPersistenceErrorHandler(
  _error:
    unknown,
): void {

  // Deliberately no-op.
  //
  // A persistence failure occurs after the delegated scheduler-control
  // operation has already produced a result. It must therefore not
  // rewrite that completed control outcome.
}


/**
 * A20 durable admission-event observer.
 *
 * One authoritative event is created by A19 history.record().
 * That exact returned event is then offered to the A20 repository.
 *
 * Failure semantics:
 *
 * - delegate failure:
 *     no history event
 *     no repository append
 *     original failure propagates
 *
 * - history failure:
 *     no repository append
 *     history failure propagates
 *
 * - repository failure:
 *     event remains present in bounded A19 history
 *     persistence error handler is invoked
 *     original scheduler-control result is preserved
 *
 * This prevents an already-completed scheduler operation from being
 * reported as failed merely because durable evidence storage failed.
 */
export class DurableEventObservingReadinessAwareCoordinatedControlExecutor
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public constructor(
    private readonly delegate:
      ReadinessAwareCoordinatedSchedulerControlHandler,

    private readonly history:
      SchedulerControlAdmissionEventHistory,

    private readonly repository:
      SchedulerControlAdmissionEventRepository,

    private readonly clock:
      DurableAdmissionEventClock =
      defaultClock,

    private readonly onPersistenceError:
      DurableAdmissionEventPersistenceErrorHandler =
      defaultPersistenceErrorHandler,
  ) {}


  public async execute(
    request:
      ExecuteRequest,
  ): Promise<ExecuteResult> {

    const result =
      await this.delegate.execute(
        request,
      );


    const event =
      this.recordHistoryEvent(
        request,
        result,
      );


    try {

      await this.repository.append(
        event,
      );
    }
    catch (error) {

      this.onPersistenceError(
        error,
      );
    }


    return result;
  }


  private recordHistoryEvent(
    request:
      ExecuteRequest,

    result:
      ReadinessAwareCoordinatedSchedulerControlResult,
  ) {

    const observedAtUtc =
      this.clock();


    if (
      "kind" in result &&
      result.kind ===
        "admission_denied"
    ) {

      return this.history.record(
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
    }


    return this.history.record(
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
