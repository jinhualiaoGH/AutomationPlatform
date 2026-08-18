import type {
  SchedulerControlAdmissionCommand,
  SchedulerControlAdmissionDenialReason,
} from "./scheduler_control_admission.js";


export type SchedulerControlAdmissionObservation =
  | {
      readonly disposition:
        "admitted";

      readonly command:
        SchedulerControlAdmissionCommand;

      readonly reason:
        null;
    }
  | {
      readonly disposition:
        "denied";

      readonly command:
        SchedulerControlAdmissionCommand;

      readonly reason:
        SchedulerControlAdmissionDenialReason;
    };


export type SchedulerControlAdmissionCommandCounts = {
  readonly start:
    number;

  readonly stop:
    number;

  readonly restart:
    number;
};


export type SchedulerControlAdmissionDenialCounts = {
  readonly scheduler_standby:
    number;

  readonly scheduler_fail_closed:
    number;

  readonly scheduler_stopped:
    number;
};


export type SchedulerControlAdmissionMetricsSnapshot = {
  readonly total:
    number;

  readonly admitted:
    number;

  readonly denied:
    number;

  readonly byCommand:
    SchedulerControlAdmissionCommandCounts;

  readonly deniedByReason:
    SchedulerControlAdmissionDenialCounts;

  readonly lastDecision:
    SchedulerControlAdmissionObservation |
    null;
};


function incrementCounter(
  current:
    number,
): number {

  if (
    !Number.isSafeInteger(current) ||
    current < 0
  ) {

    throw new Error(
      "Admission metric counter is invalid.",
    );
  }


  if (
    current ===
    Number.MAX_SAFE_INTEGER
  ) {

    throw new Error(
      "Admission metric counter overflow.",
    );
  }


  return current + 1;
}


function cloneObservation(
  observation:
    SchedulerControlAdmissionObservation |
    null,
):
  SchedulerControlAdmissionObservation |
  null {

  if (observation === null) {
    return null;
  }


  return {
    ...observation,
  };
}


export class SchedulerControlAdmissionMetricsAccumulator {

  private total =
    0;

  private admitted =
    0;

  private denied =
    0;


  private readonly byCommand = {
    start:
      0,

    stop:
      0,

    restart:
      0,
  };


  private readonly deniedByReason = {
    scheduler_standby:
      0,

    scheduler_fail_closed:
      0,

    scheduler_stopped:
      0,
  };


  private lastDecision:
    SchedulerControlAdmissionObservation |
    null =
    null;


  public record(
    observation:
      SchedulerControlAdmissionObservation,
  ): void {

    this.total =
      incrementCounter(
        this.total,
      );


    this.byCommand[
      observation.command
    ] =
      incrementCounter(
        this.byCommand[
          observation.command
        ],
      );


    if (
      observation.disposition ===
      "admitted"
    ) {

      this.admitted =
        incrementCounter(
          this.admitted,
        );
    }
    else {

      this.denied =
        incrementCounter(
          this.denied,
        );


      this.deniedByReason[
        observation.reason
      ] =
        incrementCounter(
          this.deniedByReason[
            observation.reason
          ],
        );
    }


    this.lastDecision =
      {
        ...observation,
      };
  }


  public getSnapshot():
    SchedulerControlAdmissionMetricsSnapshot {

    return {
      total:
        this.total,

      admitted:
        this.admitted,

      denied:
        this.denied,

      byCommand: {
        ...this.byCommand,
      },

      deniedByReason: {
        ...this.deniedByReason,
      },

      lastDecision:
        cloneObservation(
          this.lastDecision,
        ),
    };
  }
}
