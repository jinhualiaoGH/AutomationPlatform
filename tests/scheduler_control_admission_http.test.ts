import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isSchedulerControlAdmissionDenied,
  mapSchedulerControlAdmissionHttpResponse,
  SCHEDULER_CONTROL_ADMISSION_HTTP_STATUS,
} from "../src/recovery/scheduler_control_admission_http.js";

import type {
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "../src/recovery/readiness_aware_coordinated_control_executor.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";


describe(
  "scheduler control admission HTTP contract",
  () => {

    it(
      "uses HTTP 409 for readiness admission denial",
      () => {

        expect(
          SCHEDULER_CONTROL_ADMISSION_HTTP_STATUS,
        ).toBe(
          409,
        );
      },
    );


    it(
      "recognizes standby admission denial",
      () => {

        const result:
          ReadinessAwareCoordinatedSchedulerControlResult = {
            kind:
              "admission_denied",

            command:
              "restart",

            reason:
              "scheduler_standby",
          };


        expect(
          isSchedulerControlAdmissionDenied(
            result,
          ),
        ).toBe(
          true,
        );
      },
    );


    it(
      "maps standby denial to HTTP 409 without changing its body",
      () => {

        const result = {
          kind:
            "admission_denied" as const,

          command:
            "restart" as const,

          reason:
            "scheduler_standby" as const,
        };


        expect(
          mapSchedulerControlAdmissionHttpResponse(
            result,
          ),
        ).toEqual({
          statusCode:
            409,

          body:
            result,
        });
      },
    );


    it(
      "maps fail-closed denial to HTTP 409",
      () => {

        const result = {
          kind:
            "admission_denied" as const,

          command:
            "start" as const,

          reason:
            "scheduler_fail_closed" as const,
        };


        expect(
          mapSchedulerControlAdmissionHttpResponse(
            result,
          ),
        ).toEqual({
          statusCode:
            409,

          body: {
            kind:
              "admission_denied",

            command:
              "start",

            reason:
              "scheduler_fail_closed",
          },
        });
      },
    );


    it(
      "maps stopped-supervision denial to HTTP 409",
      () => {

        const result = {
          kind:
            "admission_denied" as const,

          command:
            "stop" as const,

          reason:
            "scheduler_stopped" as const,
        };


        expect(
          mapSchedulerControlAdmissionHttpResponse(
            result,
          ),
        ).toEqual({
          statusCode:
            409,

          body:
            result,
        });
      },
    );


    it(
      "does not intercept frozen coordinated-control results",
      () => {

        const frozenResult =
          {
            command:
              "start",

            disposition:
              "executed",

            previousState:
              "idle",

            currentState:
              "running",

            changed:
              true,

            reason:
              null,
          } as unknown as
            CoordinatedRecoveryAwareSchedulerControlResult;


        expect(
          isSchedulerControlAdmissionDenied(
            frozenResult,
          ),
        ).toBe(
          false,
        );


        expect(
          mapSchedulerControlAdmissionHttpResponse(
            frozenResult,
          ),
        ).toBeNull();
      },
    );


    it(
      "does not intercept frozen rejected restart results",
      () => {

        const frozenResult =
          {
            command:
              "restart",

            disposition:
              "rejected",

            previousGeneration:
              7,

            currentGeneration:
              7,

            previousState:
              "idle",

            currentState:
              "idle",

            changed:
              false,

            reason:
              "scheduler runtime is not restartable",
          } as unknown as
            CoordinatedRecoveryAwareSchedulerControlResult;


        expect(
          mapSchedulerControlAdmissionHttpResponse(
            frozenResult,
          ),
        ).toBeNull();
      },
    );
  },
);
