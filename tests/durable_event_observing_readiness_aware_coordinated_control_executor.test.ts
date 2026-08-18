import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ReadinessAwareCoordinatedSchedulerControlHandler,
  ReadinessAwareCoordinatedSchedulerControlResult,
} from "../src/recovery/readiness_aware_coordinated_control_executor.js";

import {
  DurableEventObservingReadinessAwareCoordinatedControlExecutor,
} from "../src/recovery/durable_event_observing_readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionEventHistory,
} from "../src/recovery/scheduler_control_admission_event_history.js";

import type {
  SchedulerControlAdmissionEventRepository,
  StoredSchedulerControlAdmissionEvent,
} from "../src/recovery/scheduler_control_admission_event_repository.js";


type ExecuteRequest =
  Parameters<
    ReadinessAwareCoordinatedSchedulerControlHandler["execute"]
  >[0];


function request(
  command:
    ExecuteRequest["command"],
): ExecuteRequest {

  return {
    command,
  };
}


function admittedResult():
  ReadinessAwareCoordinatedSchedulerControlResult {

  return {
    kind:
      "executed",
  } as unknown as
    ReadinessAwareCoordinatedSchedulerControlResult;
}


function deniedResult(
  command:
    ExecuteRequest["command"],

  reason:
    "scheduler_standby" |
    "scheduler_fail_closed" |
    "scheduler_stopped",
):
  ReadinessAwareCoordinatedSchedulerControlResult {

  return {
    kind:
      "admission_denied",

    command,

    reason,
  };
}


class FakeDelegate
implements ReadinessAwareCoordinatedSchedulerControlHandler {

  public readonly calls:
    ExecuteRequest[] =
    [];


  public error:
    Error |
    null =
    null;


  public constructor(
    public result:
      ReadinessAwareCoordinatedSchedulerControlResult,
  ) {}


  public async execute(
    value:
      ExecuteRequest,
  ):
    Promise<
      ReadinessAwareCoordinatedSchedulerControlResult
    > {

    this.calls.push(
      value,
    );


    if (this.error !== null) {
      throw this.error;
    }


    return this.result;
  }
}


class FakeRepository
implements SchedulerControlAdmissionEventRepository {

  public readonly events:
    StoredSchedulerControlAdmissionEvent[] =
    [];


  public appendError:
    unknown =
    null;


  public async append(
    event:
      StoredSchedulerControlAdmissionEvent,
  ): Promise<void> {

    if (
      this.appendError !==
      null
    ) {

      throw this.appendError;
    }


    this.events.push({
      sequence:
        event.sequence,

      observedAtUtc:
        new Date(
          event.observedAtUtc.getTime(),
        ),

      disposition:
        event.disposition,

      command:
        event.command,

      reason:
        event.reason,
    });
  }


  public async list():
    Promise<
      readonly StoredSchedulerControlAdmissionEvent[]
    > {

    return this.events.map(
      (event) => ({
        sequence:
          event.sequence,

        observedAtUtc:
          new Date(
            event.observedAtUtc.getTime(),
          ),

        disposition:
          event.disposition,

        command:
          event.command,

        reason:
          event.reason,
      }),
    );
  }
}


describe(
  "DurableEventObservingReadinessAwareCoordinatedControlExecutor",
  () => {

    it(
      "delegates the original request unchanged",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );

        const input =
          request(
            "restart",
          );


        await executor.execute(
          input,
        );


        expect(delegate.calls)
          .toEqual([
            input,
          ]);

        expect(delegate.calls[0])
          .toBe(
            input,
          );
      },
    );


    it(
      "returns the delegate result unchanged",
      async () => {

        const result =
          admittedResult();

        const delegate =
          new FakeDelegate(
            result,
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        const returned =
          await executor.execute(
            request(
              "start",
            ),
          );


        expect(returned)
          .toBe(
            result,
          );
      },
    );


    it(
      "records one admitted event in memory and durable repository",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
            () =>
              new Date(
                "2026-08-18T15:00:00.000Z",
              ),
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        const historyEvent =
          history.getSnapshot()
            .events[0];

        const durableEvent =
          (
            await repository.list()
          )[0];


        expect(historyEvent)
          .toEqual(
            durableEvent,
          );
      },
    );


    it(
      "uses one authoritative sequence identity",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        await executor.execute(
          request(
            "start",
          ),
        );

        await executor.execute(
          request(
            "stop",
          ),
        );


        expect(
          history.getSnapshot()
            .events
            .map(
              (event) =>
                event.sequence,
            ),
        ).toEqual([
          1,
          2,
        ]);


        expect(
          (
            await repository.list()
          ).map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);
      },
    );


    it(
      "uses the exact same observation timestamp for memory and persistence",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        let clockCalls =
          0;


        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
            () => {

              clockCalls +=
                1;


              return new Date(
                "2026-08-18T15:01:00.000Z",
              );
            },
          );


        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(clockCalls)
          .toBe(
            1,
          );


        expect(
          history.getSnapshot()
            .events[0]
            ?.observedAtUtc,
        ).toEqual(
          (
            await repository.list()
          )[0]
            ?.observedAtUtc,
        );
      },
    );


    it(
      "persists standby admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "restart",
              "scheduler_standby",
            ),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(
          (
            await repository.list()
          )[0],
        ).toMatchObject({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });
      },
    );


    it(
      "persists fail-closed admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "stop",
              "scheduler_fail_closed",
            ),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        await executor.execute(
          request(
            "stop",
          ),
        );


        expect(
          (
            await repository.list()
          )[0]
            ?.reason,
        ).toBe(
          "scheduler_fail_closed",
        );
      },
    );


    it(
      "persists stopped-supervision admission denial",
      async () => {

        const delegate =
          new FakeDelegate(
            deniedResult(
              "start",
              "scheduler_stopped",
            ),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(
          (
            await repository.list()
          )[0]
            ?.reason,
        ).toBe(
          "scheduler_stopped",
        );
      },
    );


    it(
      "does not record or persist when the delegate throws",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        delegate.error =
          new Error(
            "delegate failure",
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        let clockCalls =
          0;


        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
            () => {

              clockCalls +=
                1;

              return new Date();
            },
          );


        await expect(
          executor.execute(
            request(
              "start",
            ),
          ),
        ).rejects.toThrow(
          "delegate failure",
        );


        expect(clockCalls)
          .toBe(
            0,
          );

        expect(
          history.getSnapshot()
            .size,
        ).toBe(
          0,
        );

        expect(
          await repository.list(),
        ).toEqual(
          [],
        );
      },
    );


    it(
      "preserves completed control result when durable persistence fails",
      async () => {

        const result =
          admittedResult();

        const delegate =
          new FakeDelegate(
            result,
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        const failure =
          new Error(
            "database unavailable",
          );

        repository.appendError =
          failure;

        const failures:
          unknown[] =
          [];


        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
            undefined,
            (error) => {

              failures.push(
                error,
              );
            },
          );


        const returned =
          await executor.execute(
            request(
              "start",
            ),
          );


        expect(returned)
          .toBe(
            result,
          );

        expect(
          history.getSnapshot()
            .size,
        ).toBe(
          1,
        );

        expect(failures)
          .toEqual([
            failure,
          ]);
      },
    );


    it(
      "reports exactly one persistence failure",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const repository =
          new FakeRepository();

        repository.appendError =
          new Error(
            "persistent write failure",
          );

        let errorCalls =
          0;


        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
            undefined,
            () => {

              errorCalls +=
                1;
            },
          );


        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(errorCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "continues bounded in-memory history even when durable storage fails",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );

        const repository =
          new FakeRepository();

        repository.appendError =
          new Error(
            "database unavailable",
          );


        const executor =
          new DurableEventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            repository,
          );


        await executor.execute(
          request(
            "start",
          ),
        );

        await executor.execute(
          request(
            "stop",
          ),
        );

        await executor.execute(
          request(
            "restart",
          ),
        );


        const snapshot =
          history.getSnapshot();


        expect(snapshot.size)
          .toBe(
            2,
          );

        expect(snapshot.dropped)
          .toBe(
            1,
          );

        expect(
          snapshot.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          2,
          3,
        ]);
      },
    );
  },
);
