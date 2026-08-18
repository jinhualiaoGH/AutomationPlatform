import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  CoordinatedRecoveryAwareSchedulerControlCommand,
  CoordinatedRecoveryAwareSchedulerControlResult,
} from "../src/recovery/coordinated_recovery_aware_scheduler_control_service.js";

import {
  ReadinessAwareSchedulerControlExecutor,
  type ReadinessAwareSchedulerControlDelegate,
} from "../src/recovery/readiness_aware_scheduler_control_executor.js";

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
implements ReadinessAwareSchedulerControlDelegate {

  public commands:
    CoordinatedRecoveryAwareSchedulerControlCommand[] =
      [];


  public constructor(
    public result:
      CoordinatedRecoveryAwareSchedulerControlResult,
  ) {}


  public async execute(
    command:
      CoordinatedRecoveryAwareSchedulerControlCommand,
  ):
  Promise<CoordinatedRecoveryAwareSchedulerControlResult> {

    this.commands.push(
      command,
    );

    return this.result;
  }
}


function ready():
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
      "existing-coordinated-result",
  } as unknown as
    CoordinatedRecoveryAwareSchedulerControlResult;


describe(
  "ReadinessAwareSchedulerControlExecutor",
  () => {

    it(
      "delegates start while scheduler authority is active",
      async () => {

        const readiness =
          new FakeReadinessReader(
            ready(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        const result =
          await executor.execute(
            "start",
          );


        expect(result)
          .toBe(
            delegatedResult,
          );

        expect(delegate.commands)
          .toEqual([
            "start",
          ]);

        expect(readiness.reads)
          .toBe(1);
      },
    );


    it(
      "delegates stop while scheduler authority is active",
      async () => {

        const readiness =
          new FakeReadinessReader(
            ready(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "stop",
          ),
        ).toBe(
          delegatedResult,
        );

        expect(delegate.commands)
          .toEqual([
            "stop",
          ]);
      },
    );


    it(
      "delegates restart while scheduler authority is active",
      async () => {

        const readiness =
          new FakeReadinessReader(
            ready(),
          );

        const delegate =
          new FakeDelegate(
            delegatedResult,
          );

        const executor =
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "restart",
          ),
        ).toBe(
          delegatedResult,
        );

        expect(delegate.commands)
          .toEqual([
            "restart",
          ]);
      },
    );


    it(
      "blocks standby control before delegation",
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
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "restart",
          ),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });

        expect(delegate.commands)
          .toEqual([]);
      },
    );


    it(
      "blocks fail-closed control before delegation",
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
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "start",
          ),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "start",

          reason:
            "scheduler_fail_closed",
        });

        expect(delegate.commands)
          .toEqual([]);
      },
    );


    it(
      "blocks control after failover supervision stops",
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
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "stop",
          ),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "stop",

          reason:
            "scheduler_stopped",
        });

        expect(delegate.commands)
          .toEqual([]);
      },
    );


    it(
      "re-evaluates readiness for every command",
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
          new ReadinessAwareSchedulerControlExecutor(
            delegate,
            readiness,
          );


        expect(
          await executor.execute(
            "restart",
          ),
        ).toEqual({
          kind:
            "admission_denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        readiness.current =
          ready();


        expect(
          await executor.execute(
            "restart",
          ),
        ).toBe(
          delegatedResult,
        );


        expect(readiness.reads)
          .toBe(2);

        expect(delegate.commands)
          .toEqual([
            "restart",
          ]);
      },
    );
  },
);
