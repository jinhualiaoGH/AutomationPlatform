import {
  describe,
  expect,
  it,
} from "vitest";

import {
  RecoveryAwareSchedulerControlCoordinator,
} from "../src/recovery/recovery_aware_scheduler_control_coordinator.js";

import type {
  RecoveryAwareSchedulerControlHandler,
} from "../src/recovery/recovery_aware_scheduler_control_coordinator.js";

import type {
  RecoveryAwareSchedulerControlCommand,
  RecoveryAwareSchedulerControlResult,
} from "../src/recovery/recovery_aware_scheduler_control_service.js";

function startResult():
  RecoveryAwareSchedulerControlResult {
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
  RecoveryAwareSchedulerControlResult {
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
  RecoveryAwareSchedulerControlResult {
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

function resultFor(
  command:
    RecoveryAwareSchedulerControlCommand,
): RecoveryAwareSchedulerControlResult {
  switch (command) {
    case "start":
      return startResult();

    case "stop":
      return stopResult();

    case "restart":
      return restartResult();
  }
}

type Deferred<T> = {
  promise:
    Promise<T>;

  resolve:
    (value: T) => void;

  reject:
    (reason?: unknown) => void;
};

function deferred<T>():
  Deferred<T> {
  let resolve:
    (value: T) => void =
    () => {};

  let reject:
    (reason?: unknown) => void =
    () => {};

  const promise =
    new Promise<T>(
      (
        innerResolve,
        innerReject,
      ) => {
        resolve =
          innerResolve;

        reject =
          innerReject;
      },
    );

  return {
    promise,
    resolve,
    reject,
  };
}

describe(
  "RecoveryAwareSchedulerControlCoordinator",
  () => {
    it(
      "executes a single recovery-aware command through the handler",
      async () => {
        const calls:
          RecoveryAwareSchedulerControlCommand[] =
          [];

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls.push(
                  command,
                );

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const result =
          await coordinator.execute({
            command:
              "restart",
          });

        expect(calls)
          .toEqual([
            "restart",
          ]);

        expect(result.command)
          .toBe(
            "restart",
          );
      },
    );

    it(
      "serializes start stop and restart commands in FIFO order",
      async () => {
        const first =
          deferred<
            RecoveryAwareSchedulerControlResult
          >();

        const events:
          string[] =
          [];

        let callNumber =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              command => {
                callNumber++;

                events.push(
                  `start:${command}`,
                );

                if (callNumber === 1) {
                  return first.promise.then(
                    result => {
                      events.push(
                        `finish:${command}`,
                      );

                      return result;
                    },
                  );
                }

                events.push(
                  `finish:${command}`,
                );

                return Promise.resolve(
                  resultFor(
                    command,
                  ),
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const firstExecution =
          coordinator.execute({
            command:
              "start",
          });

        const secondExecution =
          coordinator.execute({
            command:
              "stop",
          });

        const thirdExecution =
          coordinator.execute({
            command:
              "restart",
          });

        await Promise.resolve();

        expect(events)
          .toEqual([
            "start:start",
          ]);

        first.resolve(
          startResult(),
        );

        await firstExecution;
        await secondExecution;
        await thirdExecution;

        expect(events)
          .toEqual([
            "start:start",
            "finish:start",
            "start:stop",
            "finish:stop",
            "start:restart",
            "finish:restart",
          ]);
      },
    );

    it(
      "deduplicates concurrent commands with the same request key",
      async () => {
        const pending =
          deferred<
            RecoveryAwareSchedulerControlResult
          >();

        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              () => {
                calls++;

                return pending.promise;
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "restart-001",
          });

        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "restart-001",
          });

        expect(second)
          .toBe(
            first,
          );

        await Promise.resolve();

        expect(calls)
          .toBe(1);

        pending.resolve(
          restartResult(),
        );

        await expect(first)
          .resolves.toEqual(
            restartResult(),
          );

        await expect(second)
          .resolves.toEqual(
            restartResult(),
          );
      },
    );

    it(
      "normalizes surrounding whitespace in request keys",
      async () => {
        let calls =
          0;

        const pending =
          deferred<
            RecoveryAwareSchedulerControlResult
          >();

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              () => {
                calls++;

                return pending.promise;
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "  restart-002  ",
          });

        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "restart-002",
          });

        expect(second)
          .toBe(
            first,
          );

        await Promise.resolve();

        expect(calls)
          .toBe(1);

        pending.resolve(
          restartResult(),
        );

        await first;
      },
    );

    it(
      "keeps a completed request key idempotent",
      async () => {
        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls++;

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "completed-key",
          });

        const firstResult =
          await first;

        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "completed-key",
          });

        expect(second)
          .toBe(
            first,
          );

        await expect(second)
          .resolves.toBe(
            firstResult,
          );

        expect(calls)
          .toBe(1);
      },
    );

    it(
      "keeps a failed request key idempotent",
      async () => {
        const expected =
          new Error(
            "synthetic recovery failure",
          );

        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async () => {
                calls++;

                throw expected;
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "failed-key",
          });

        await expect(first)
          .rejects.toBe(
            expected,
          );

        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "failed-key",
          });

        expect(second)
          .toBe(
            first,
          );

        await expect(second)
          .rejects.toBe(
            expected,
          );

        expect(calls)
          .toBe(1);
      },
    );

    it(
      "does not deduplicate distinct request keys",
      async () => {
        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls++;

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "key-a",
          });

        const second =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "key-b",
          });

        expect(second)
          .not.toBe(
            first,
          );

        await first;
        await second;

        expect(calls)
          .toBe(2);
      },
    );

    it(
      "does not deduplicate commands without request keys",
      async () => {
        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls++;

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",
          });

        const second =
          coordinator.execute({
            command:
              "restart",
          });

        expect(second)
          .not.toBe(
            first,
          );

        await first;
        await second;

        expect(calls)
          .toBe(2);
      },
    );

    it(
      "rejects an empty request key before enqueueing",
      async () => {
        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls++;

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const execution =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "   ",
          });

        await expect(execution)
          .rejects.toThrow(
            "requestKey must not be empty.",
          );

        expect(calls)
          .toBe(0);
      },
    );

    it(
      "rejects an oversized request key before enqueueing",
      async () => {
        let calls =
          0;

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls++;

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const execution =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "x".repeat(
                129,
              ),
          });

        await expect(execution)
          .rejects.toThrow(
            "requestKey must not exceed 128 characters.",
          );

        expect(calls)
          .toBe(0);
      },
    );

    it(
      "does not let a failed command poison later queued commands",
      async () => {
        const expected =
          new Error(
            "synthetic restart failure",
          );

        const calls:
          RecoveryAwareSchedulerControlCommand[] =
          [];

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              async command => {
                calls.push(
                  command,
                );

                if (
                  command ===
                  "restart"
                ) {
                  throw expected;
                }

                return resultFor(
                  command,
                );
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const failed =
          coordinator.execute({
            command:
              "restart",
          });

        const later =
          coordinator.execute({
            command:
              "stop",
          });

        await expect(failed)
          .rejects.toBe(
            expected,
          );

        await expect(later)
          .resolves.toEqual(
            stopResult(),
          );

        expect(calls)
          .toEqual([
            "restart",
            "stop",
          ]);
      },
    );

    it(
      "deduplicates by request key even when repeated submission names a different command",
      async () => {
        const pending =
          deferred<
            RecoveryAwareSchedulerControlResult
          >();

        const calls:
          RecoveryAwareSchedulerControlCommand[] =
          [];

        const handler:
          RecoveryAwareSchedulerControlHandler = {
            execute:
              command => {
                calls.push(
                  command,
                );

                return pending.promise;
              },
          };

        const coordinator =
          new RecoveryAwareSchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "restart",

            requestKey:
              "operation-identity",
          });

        const duplicate =
          coordinator.execute({
            command:
              "stop",

            requestKey:
              "operation-identity",
          });

        expect(duplicate)
          .toBe(
            first,
          );

        await Promise.resolve();

        expect(calls)
          .toEqual([
            "restart",
          ]);

        pending.resolve(
          restartResult(),
        );

        const result =
          await duplicate;

        expect(result.command)
          .toBe(
            "restart",
          );
      },
    );
  },
);
