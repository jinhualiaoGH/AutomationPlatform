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
  EventObservingReadinessAwareCoordinatedControlExecutor,
} from "../src/recovery/event_observing_readiness_aware_coordinated_control_executor.js";

import {
  SchedulerControlAdmissionEventHistory,
} from "../src/recovery/scheduler_control_admission_event_history.js";


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


describe(
  "EventObservingReadinessAwareCoordinatedControlExecutor",
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

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
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

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
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
      "records an admitted event",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            () =>
              new Date(
                "2026-08-18T17:00:00.000Z",
              ),
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(
          history.getSnapshot(),
        ).toMatchObject({
          size:
            1,

          dropped:
            0,

          events: [
            {
              sequence:
                1,

              observedAtUtc:
                new Date(
                  "2026-08-18T17:00:00.000Z",
                ),

              disposition:
                "admitted",

              command:
                "start",

              reason:
                null,
            },
          ],
        });
      },
    );


    it(
      "records standby denial",
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

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            () =>
              new Date(
                "2026-08-18T17:01:00.000Z",
              ),
          );


        await executor.execute(
          request(
            "restart",
          ),
        );


        expect(
          history.getSnapshot()
            .events[0],
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
      "records fail-closed denial",
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

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
          );


        await executor.execute(
          request(
            "stop",
          ),
        );


        expect(
          history.getSnapshot()
            .events[0]
            ?.reason,
        ).toBe(
          "scheduler_fail_closed",
        );
      },
    );


    it(
      "records stopped denial",
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

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(
          history.getSnapshot()
            .events[0]
            ?.reason,
        ).toBe(
          "scheduler_stopped",
        );
      },
    );


    it(
      "samples the event clock once per successful result",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        let clockCalls =
          0;


        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            () => {

              clockCalls +=
                1;


              return new Date(
                "2026-08-18T17:02:00.000Z",
              );
            },
          );


        await executor.execute(
          request(
            "start",
          ),
        );


        expect(clockCalls)
          .toBe(
            1,
          );
      },
    );


    it(
      "records one event for every successful delegate result",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            8,
          );

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
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


        expect(
          history.getSnapshot()
            .events
            .map(
              (event) =>
                event.command,
            ),
        ).toEqual([
          "start",
          "stop",
          "restart",
        ]);
      },
    );


    it(
      "respects bounded event history capacity",
      async () => {

        const delegate =
          new FakeDelegate(
            admittedResult(),
          );

        const history =
          new SchedulerControlAdmissionEventHistory(
            2,
          );

        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
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


    it(
      "does not record or sample the clock when the delegate throws",
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

        let clockCalls =
          0;


        const executor =
          new EventObservingReadinessAwareCoordinatedControlExecutor(
            delegate,
            history,
            () => {

              clockCalls +=
                1;

              return new Date();
            },
          );


        await expect(
          executor.execute(
            request(
              "restart",
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
      },
    );
  },
);
