import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlCoordinator,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlHandler,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

function result(
  command:
    "start" | "stop",
): SchedulerControlResult {
  return {
    command,

    disposition:
      "executed",

    previousState:
      command === "start"
        ? "idle"
        : "running",

    currentState:
      command === "start"
        ? "running"
        : "stopped",

    changed:
      true,

    reason:
      null,
  };
}

class ControlledHandler
implements SchedulerControlHandler {
  public events:
    string[] =
    [];

  public startCalls =
    0;

  public stopCalls =
    0;

  public stopGate:
    Promise<void> | null =
    null;

  public startError:
    unknown =
    null;

  public stopError:
    unknown =
    null;

  public start():
    SchedulerControlResult {
    this.startCalls++;

    this.events.push(
      "start:begin",
    );

    if (this.startError !== null) {
      this.events.push(
        "start:error",
      );

      throw this.startError;
    }

    this.events.push(
      "start:end",
    );

    return result(
      "start",
    );
  }

  public async stop():
    Promise<SchedulerControlResult> {
    this.stopCalls++;

    this.events.push(
      "stop:begin",
    );

    if (this.stopGate !== null) {
      await this.stopGate;
    }

    if (this.stopError !== null) {
      this.events.push(
        "stop:error",
      );

      throw this.stopError;
    }

    this.events.push(
      "stop:end",
    );

    return result(
      "stop",
    );
  }
}

function deferred():
  {
    promise: Promise<void>;
    resolve: () => void;
  } {
  let resolveValue:
    (() => void) | null =
    null;

  const promise =
    new Promise<void>(
      (resolve) => {
        resolveValue =
          resolve;
      },
    );

  return {
    promise,

    resolve:
      () => {
        resolveValue?.();
      },
  };
}

describe(
  "SchedulerControlCoordinator",
  () => {
    it(
      "executes a single command through the handler",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        await expect(
          coordinator.execute({
            command:
              "start",
          }),
        ).resolves.toEqual(
          result(
            "start",
          ),
        );

        expect(handler.startCalls)
          .toBe(1);

        expect(handler.stopCalls)
          .toBe(0);
      },
    );

    it(
      "serializes concurrent commands in FIFO order",
      async () => {
        const handler =
          new ControlledHandler();

        const gate =
          deferred();

        handler.stopGate =
          gate.promise;

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "stop",
          });

        const second =
          coordinator.execute({
            command:
              "start",
          });

        await Promise.resolve();

        expect(handler.events)
          .toEqual([
            "stop:begin",
          ]);

        expect(handler.startCalls)
          .toBe(0);

        gate.resolve();

        await expect(first)
          .resolves.toEqual(
            result(
              "stop",
            ),
          );

        await expect(second)
          .resolves.toEqual(
            result(
              "start",
            ),
          );

        expect(handler.events)
          .toEqual([
            "stop:begin",
            "stop:end",
            "start:begin",
            "start:end",
          ]);
      },
    );

    it(
      "deduplicates concurrent commands with the same request key",
      async () => {
        const handler =
          new ControlledHandler();

        const gate =
          deferred();

        handler.stopGate =
          gate.promise;

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "stop",

            requestKey:
              "request-123",
          });

        const duplicate =
          coordinator.execute({
            command:
              "stop",

            requestKey:
              "request-123",
          });

        expect(duplicate)
          .toBe(
            first,
          );

        await Promise.resolve();

        expect(handler.stopCalls)
          .toBe(1);

        gate.resolve();

        await expect(first)
          .resolves.toEqual(
            result(
              "stop",
            ),
          );

        await expect(duplicate)
          .resolves.toEqual(
            result(
              "stop",
            ),
          );

        expect(handler.stopCalls)
          .toBe(1);
      },
    );

    it(
      "keeps completed request keys idempotent",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        const first =
          await coordinator.execute({
            command:
              "start",

            requestKey:
              "stable-key",
          });

        const duplicate =
          await coordinator.execute({
            command:
              "start",

            requestKey:
              "stable-key",
          });

        expect(first)
          .toEqual(
            duplicate,
          );

        expect(handler.startCalls)
          .toBe(1);
      },
    );

    it(
      "does not deduplicate distinct request keys",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        await coordinator.execute({
          command:
            "start",

          requestKey:
            "key-a",
        });

        await coordinator.execute({
          command:
            "start",

          requestKey:
            "key-b",
        });

        expect(handler.startCalls)
          .toBe(2);
      },
    );

    it(
      "does not deduplicate commands without request keys",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        await coordinator.execute({
          command:
            "start",
        });

        await coordinator.execute({
          command:
            "start",
        });

        expect(handler.startCalls)
          .toBe(2);
      },
    );

    it(
      "rejects an empty request key before enqueueing",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        await expect(
          coordinator.execute({
            command:
              "start",

            requestKey:
              "   ",
          }),
        ).rejects.toThrow(
          "requestKey must not be empty.",
        );

        expect(handler.startCalls)
          .toBe(0);
      },
    );

    it(
      "rejects an oversized request key before enqueueing",
      async () => {
        const handler =
          new ControlledHandler();

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        await expect(
          coordinator.execute({
            command:
              "start",

            requestKey:
              "x".repeat(
                129,
              ),
          }),
        ).rejects.toThrow(
          "requestKey must not exceed 128 characters.",
        );

        expect(handler.startCalls)
          .toBe(0);
      },
    );

    it(
      "does not let a failed command poison later queued commands",
      async () => {
        const handler =
          new ControlledHandler();

        handler.stopError =
          new Error(
            "synthetic stop failure",
          );

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        const failed =
          coordinator.execute({
            command:
              "stop",
          });

        const later =
          coordinator.execute({
            command:
              "start",
          });

        await expect(failed)
          .rejects.toThrow(
            "synthetic stop failure",
          );

        await expect(later)
          .resolves.toEqual(
            result(
              "start",
            ),
          );

        expect(handler.events)
          .toEqual([
            "stop:begin",
            "stop:error",
            "start:begin",
            "start:end",
          ]);
      },
    );

    it(
      "returns the same rejected promise for a repeated failed request key",
      async () => {
        const handler =
          new ControlledHandler();

        handler.startError =
          new Error(
            "synthetic start failure",
          );

        const coordinator =
          new SchedulerControlCoordinator(
            handler,
          );

        const first =
          coordinator.execute({
            command:
              "start",

            requestKey:
              "failed-key",
          });

        const duplicate =
          coordinator.execute({
            command:
              "start",

            requestKey:
              "failed-key",
          });

        expect(duplicate)
          .toBe(
            first,
          );

        await expect(first)
          .rejects.toThrow(
            "synthetic start failure",
          );

        await expect(duplicate)
          .rejects.toThrow(
            "synthetic start failure",
          );

        expect(handler.startCalls)
          .toBe(1);
      },
    );
  },
);
