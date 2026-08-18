import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CoordinatedRecoveryAwareSchedulerControlRequest,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_coordinator.js";

import type {
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";

import {
  ReadinessAwareCoordinatedSchedulerControlExecutor,
  type CoordinatedSchedulerControlRequestDelegate,
} from "../src/recovery/readiness_aware_coordinated_control_executor.js";

import type {
  SchedulerFailoverReadiness,
} from "../src/recovery/scheduler_failover_readiness.js";

import type {
  SchedulerFailoverReadinessReader,
} from "../src/recovery/scheduler_failover_readiness_service.js";


class FakeReadinessReader
implements SchedulerFailoverReadinessReader {

  public reads =
    0;


  public constructor(
    public current:
      SchedulerFailoverReadiness,
  ) {}


  public snapshot():
  SchedulerFailoverReadiness {

    this.reads +=
      1;

    return this.current;
  }
}


class FakeDelegate
implements CoordinatedSchedulerControlRequestDelegate {

  public requests:
    CoordinatedRecoveryAwareSchedulerControlRequest[] =
      [];


  public constructor(
    public result:
      CoordinatedRecoveryAwareSchedulerControlResult,
  ) {}


  public async execute(
    request:
      CoordinatedRecoveryAwareSchedulerControlRequest,
  ):
  Promise<CoordinatedRecoveryAwareSchedulerControlResult> {

    this.requests.push(
      request,
    );

    return this.result;
  }
}


function active():
SchedulerFailoverReadiness {

  return {
    ready:
      true,

    state:
      "ready",

    reason:
      "scheduler_active",
  };
}


function standby():
SchedulerFailoverReadiness {

  return {
    ready:
      false,

    state:
      "standby",

    reason:
      "scheduler_standby",
  };
}


function failClosed():
SchedulerFailoverReadiness {

  return {
    ready:
      false,

    state:
      "fail_closed",

    reason:
      "scheduler_fail_closed",
  };
}


function stopped():
SchedulerFailoverReadiness {

  return {
    ready:
      false,

    state:
      "stopped",

    reason:
      "scheduler_stopped",
  };
}


const delegatedResult =
  {
    marker:
      "frozen-result",
  } as unknown as
    CoordinatedRecoveryAwareSchedulerControlResult;


describe(
  "ReadinessAwareCoordinatedSchedulerControlExecutor",
  () => {

    it(
      "delegates the exact original request while active",
      async () => {

        const readiness =
          new FakeReadinessReader(
            active(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        const request:
          CoordinatedRecoveryAwareSchedulerControlRequest = {
            command:
              "restart",

            requestKey:
              "operator-request-001",
          };


        const result =
          await executor.execute(
            request,
          );


        expect(result)
          .toBe(
            delegatedResult,
          );

        expect(delegate.requests)
          .toEqual([
            request,
          ]);

        expect(delegate.requests[0])
          .toBe(
            request,
          );

        expect(readiness.reads)
          .toBe(1);
      },
    );


    it(
      "preserves an unkeyed active request",
      async () => {

        const readiness =
          new FakeReadinessReader(
            active(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        const request:
          CoordinatedRecoveryAwareSchedulerControlRequest = {
            command:
              "start",
          };


        await executor.execute(
          request,
        );


        expect(delegate.requests[0])
          .toBe(
            request,
          );
      },
    );


    it(
      "denies standby before the audited delegate",
      async () => {

        const readiness =
          new FakeReadinessReader(
            standby(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        const result =
          await executor.execute({
            command:
              "restart",

            requestKey:
              "standby-attempt",
          });


        expect(result)
          .toEqual({
            kind:
              "admission_denied",

            command:
              "restart",

            reason:
              "scheduler_standby",
          });

        expect(delegate.requests)
          .toEqual([]);
      },
    );


    it(
      "denies fail-closed before the audited delegate",
      async () => {

        const readiness =
          new FakeReadinessReader(
            failClosed(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute({
            command:
              "stop",
          }),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "stop",

          reason:
            "scheduler_fail_closed",
        });


        expect(delegate.requests)
          .toEqual([]);
      },
    );


    it(
      "denies stopped supervision before the audited delegate",
      async () => {

        const readiness =
          new FakeReadinessReader(
            stopped(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute({
            command:
              "start",

            requestKey:
              "stopped-attempt",
          }),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "start",

          reason:
            "scheduler_stopped",
        });


        expect(delegate.requests)
          .toEqual([]);
      },
    );


    it(
      "re-evaluates readiness for every coordinated request",
      async () => {

        const readiness =
          new FakeReadinessReader(
            standby(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareCoordinatedSchedulerControlExecutor(
            delegate,
            readiness,
          );


        const request:
          CoordinatedRecoveryAwareSchedulerControlRequest = {
            command:
              "restart",

            requestKey:
              "transition-request",
          };


        const denied =
          await executor.execute(
            request,
          );


        expect(denied)
          .toMatchObject({
            kind:
              "admission_denied",
          });


        readiness.current =
          active();


        const admitted =
          await executor.execute(
            request,
          );


        expect(admitted)
          .toBe(
            delegatedResult,
          );

        expect(readiness.reads)
          .toBe(2);

        expect(delegate.requests)
          .toEqual([
            request,
          ]);
      },
    );
  },
);
