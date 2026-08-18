import type {
  ReadinessAwareCoordinatedSchedulerControlHandler,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "./readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "./scheduler_control_admission_metrics.js";


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


/**
 * A18 observability decorator around the frozen A17 readiness
 * admission boundary.
 *
 * Important invariants:
 *
 * - does not perform admission itself
 * - does not modify the A17 result
 * - does not alter the downstream audited/coordinated executor
 * - records exactly one metric observation after each successful
 *   A17 execute() result
 * - propagates delegate failures without inventing a decision
 */
export class MetricsObservingReadinessAwareCoordinatedControlExecutor
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public constructor(
    private readonly delegate:
      ReadinessAwareCoordinatedSchedulerControlHandler,

    private readonly metrics:
      SchedulerControlAdmissionMetricsAccumulator,
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

    if (
      "kind" in result &&
      result.kind ===
        "admission_denied"
    ) {

      this.metrics.record({
        disposition:
          "denied",

        command:
          result.command,

        reason:
          result.reason,
      });


      return;
    }


    this.metrics.record({
      disposition:
        "admitted",

      command:
        request.command,

      reason:
        null,
    });
  }
}
