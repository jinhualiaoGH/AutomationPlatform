import type {
  CoordinatedSchedulerControlAdmissionDeniedResult,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "./readiness_aware_coordinated_control_executor.js";


export const SCHEDULER_CONTROL_ADMISSION_HTTP_STATUS =
  409 as const;


export type SchedulerControlAdmissionHttpResponse = {

  readonly statusCode:
    typeof SCHEDULER_CONTROL_ADMISSION_HTTP_STATUS;

  readonly body:
    CoordinatedSchedulerControlAdmissionDeniedResult;
};


/**
 * Detects the A17-specific result without widening or modifying any
 * frozen A9-A16 scheduler-control result union.
 */
export function isSchedulerControlAdmissionDenied(
  result:
    ReadinessAwareCoordinatedSchedulerControlResult,
):
result is CoordinatedSchedulerControlAdmissionDeniedResult {

  return (
    "kind" in result &&
    result.kind ===
      "admission_denied"
  );
}


/**
 * Maps only A17 admission denial into HTTP semantics.
 *
 * Existing coordinated-control results deliberately return null here
 * so the frozen route can continue using its established A11 response
 * mapping unchanged.
 *
 * HTTP 409 is consistent with the existing command API's governed
 * non-execution semantics for rejected and superseded commands.
 */
export function mapSchedulerControlAdmissionHttpResponse(
  result:
    ReadinessAwareCoordinatedSchedulerControlResult,
):
SchedulerControlAdmissionHttpResponse |
null {

  if (
    !isSchedulerControlAdmissionDenied(
      result,
    )
  ) {

    return null;
  }


  return {
    statusCode:
      SCHEDULER_CONTROL_ADMISSION_HTTP_STATUS,

    body:
      result,
  };
}
