import {
  describe,
  expect,
  it,
} from "vitest";

import {
  RecoveryAwareSchedulerControlService,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";

import type {
  FrozenSchedulerControlHandler,
  SchedulerRestartHandler,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

import type {
  SchedulerRestartResult,
} from "../src/recovery/scheduler_recovery_contract.js";

function startResult():
  SchedulerControlResult {
  return {
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
  };
}

function stopResult():
  SchedulerControlResult {
  return {
    command:
      "stop",

    disposition:
      "executed",

    previousState:
      "running",

    currentState:
      "stopped",

    changed:
      true,

    reason:
      null,
  };
}

function restartResult():
  SchedulerRestartResult {
  return {
    command:
      "restart",

    disposition:
      "executed",

    previousGeneration:
      1,

    currentGeneration:
      2,

    previousState:
      "running",

    currentState:
      "running",

    changed:
      true,

    reason:
      null,
  };
}

class FakeFrozenControl
implements FrozenSchedulerControlHandler {
  public startCalls =
    0;

  public stopCalls =
    0;

  public readonly startValue =
    startResult();

  public readonly stopValue =
    stopResult();

  public start():
    SchedulerControlResult {
    this.startCalls++;

    return this.startValue;
  }

  public async stop():
    Promise<SchedulerControlResult> {
    this.stopCalls++;

    return this.stopValue;
  }
}

class FakeRestartHandler
implements SchedulerRestartHandler {
  public restartCalls =
    0;

  public readonly restartValue =
    restartResult();

  public async restart():
    Promise<SchedulerRestartResult> {
    this.restartCalls++;

    return this.restartValue;
  }
}

describe(
  "RecoveryAwareSchedulerControlService",
  () => {
    it(
      "delegates start unchanged to the frozen A8 control handler",
      () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          service.start();

        expect(result)
          .toBe(
            frozen.startValue,
          );

        expect(frozen.startCalls)
          .toBe(1);

        expect(frozen.stopCalls)
          .toBe(0);

        expect(restart.restartCalls)
          .toBe(0);
      },
    );

    it(
      "delegates stop unchanged to the frozen A8 control handler",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.stop();

        expect(result)
          .toBe(
            frozen.stopValue,
          );

        expect(frozen.startCalls)
          .toBe(0);

        expect(frozen.stopCalls)
          .toBe(1);

        expect(restart.restartCalls)
          .toBe(0);
      },
    );

    it(
      "delegates restart only to the recovery handler",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.restart();

        expect(result)
          .toBe(
            restart.restartValue,
          );

        expect(restart.restartCalls)
          .toBe(1);

        expect(frozen.startCalls)
          .toBe(0);

        expect(frozen.stopCalls)
          .toBe(0);
      },
    );

    it(
      "dispatches start through execute without changing its result",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "start",
          );

        expect(result)
          .toBe(
            frozen.startValue,
          );

        expect(frozen.startCalls)
          .toBe(1);

        expect(restart.restartCalls)
          .toBe(0);
      },
    );

    it(
      "dispatches stop through execute without changing its result",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "stop",
          );

        expect(result)
          .toBe(
            frozen.stopValue,
          );

        expect(frozen.stopCalls)
          .toBe(1);

        expect(restart.restartCalls)
          .toBe(0);
      },
    );

    it(
      "dispatches restart through execute only to the recovery handler",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "restart",
          );

        expect(result)
          .toBe(
            restart.restartValue,
          );

        expect(restart.restartCalls)
          .toBe(1);

        expect(frozen.startCalls)
          .toBe(0);

        expect(frozen.stopCalls)
          .toBe(0);
      },
    );

    it(
      "preserves a frozen rejected start result without reinterpretation",
      async () => {
        const frozen:
          FrozenSchedulerControlHandler = {
            start: () => ({
              command:
                "start",

              disposition:
                "rejected",

              previousState:
                "running",

              currentState:
                "running",

              changed:
                false,

              reason:
                "SchedulerRuntime is single-start and can only start from idle.",
            }),

            stop: async () =>
              stopResult(),
          };

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "start",
          );

        expect(result)
          .toEqual({
            command:
              "start",

            disposition:
              "rejected",

            previousState:
              "running",

            currentState:
              "running",

            changed:
              false,

            reason:
              "SchedulerRuntime is single-start and can only start from idle.",
          });
      },
    );

    it(
      "preserves a frozen noop stop result without reinterpretation",
      async () => {
        const frozen:
          FrozenSchedulerControlHandler = {
            start:
              startResult,

            stop:
              async () => ({
                command:
                  "stop",

                disposition:
                  "noop",

                previousState:
                  "stopped",

                currentState:
                  "stopped",

                changed:
                  false,

                reason:
                  "SchedulerRuntime is not currently running.",
              }),
          };

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "stop",
          );

        expect(result)
          .toEqual({
            command:
              "stop",

            disposition:
              "noop",

            previousState:
              "stopped",

            currentState:
              "stopped",

            changed:
              false,

            reason:
              "SchedulerRuntime is not currently running.",
          });
      },
    );

    it(
      "preserves a rejected restart result including generation identity",
      async () => {
        const frozen =
          new FakeFrozenControl();

        const restart:
          SchedulerRestartHandler = {
            restart:
              async () => ({
                command:
                  "restart",

                disposition:
                  "rejected",

                previousGeneration:
                  1,

                currentGeneration:
                  1,

                previousState:
                  "idle",

                currentState:
                  "idle",

                changed:
                  false,

                reason:
                  "An idle scheduler generation has not entered operational service.",
              }),
          };

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        const result =
          await service.execute(
            "restart",
          );

        expect(result)
          .toEqual({
            command:
              "restart",

            disposition:
              "rejected",

            previousGeneration:
              1,

            currentGeneration:
              1,

            previousState:
              "idle",

            currentState:
              "idle",

            changed:
              false,

            reason:
              "An idle scheduler generation has not entered operational service.",
          });
      },
    );

    it(
      "propagates frozen start errors unchanged",
      async () => {
        const expected =
          new Error(
            "synthetic start failure",
          );

        const frozen:
          FrozenSchedulerControlHandler = {
            start: () => {
              throw expected;
            },

            stop:
              async () =>
                stopResult(),
          };

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        await expect(
          service.execute(
            "start",
          ),
        ).rejects.toBe(
          expected,
        );
      },
    );

    it(
      "propagates frozen stop errors unchanged",
      async () => {
        const expected =
          new Error(
            "synthetic stop failure",
          );

        const frozen:
          FrozenSchedulerControlHandler = {
            start:
              startResult,

            stop: async () => {
              throw expected;
            },
          };

        const restart =
          new FakeRestartHandler();

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        await expect(
          service.execute(
            "stop",
          ),
        ).rejects.toBe(
          expected,
        );
      },
    );

    it(
      "propagates restart errors unchanged",
      async () => {
        const expected =
          new Error(
            "synthetic restart failure",
          );

        const frozen =
          new FakeFrozenControl();

        const restart:
          SchedulerRestartHandler = {
            restart: async () => {
              throw expected;
            },
          };

        const service =
          new RecoveryAwareSchedulerControlService(
            frozen,
            restart,
          );

        await expect(
          service.execute(
            "restart",
          ),
        ).rejects.toBe(
          expected,
        );
      },
    );
  },
);
