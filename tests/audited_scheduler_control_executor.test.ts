import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuditedSchedulerControlExecutor,
} from "../src/operations/audited_scheduler_control_executor.js";

import type {
  SchedulerControlAuditWriter,
  SchedulerControlCommandExecutor,
} from "../src/operations/audited_scheduler_control_executor.js";

import type {
  SchedulerControlRequest,
} from "../src/operations/scheduler_control_coordinator.js";

import type {
  SchedulerControlResult,
} from "../src/operations/scheduler_control_service.js";

function result():
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

class FakeExecutor
implements SchedulerControlCommandExecutor {
  public calls:
    SchedulerControlRequest[] =
    [];

  public failure:
    unknown =
    null;

  public async execute(
    request:
      SchedulerControlRequest,
  ): Promise<SchedulerControlResult> {
    this.calls.push(
      request,
    );

    if (this.failure !== null) {
      throw this.failure;
    }

    return result();
  }
}

class FakeAudit
implements SchedulerControlAuditWriter {
  public events:
    string[] =
    [];

  public createFailure:
    unknown =
    null;

  public completeFailure:
    unknown =
    null;

  public failFailure:
    unknown =
    null;

  public async createPending(
    input: {
      command:
        SchedulerControlRequest["command"];

      requestKey:
        string | null;
    },
  ): Promise<{
    publicId:
      string;
  }> {
    this.events.push(
      `create:${input.command}:${input.requestKey ?? "null"}`,
    );

    if (this.createFailure !== null) {
      throw this.createFailure;
    }

    return {
      publicId:
        "audit-1",
    };
  }

  public async complete(
    publicId:
      string,

    controlResult:
      SchedulerControlResult,
  ): Promise<void> {
    this.events.push(
      `complete:${publicId}:${controlResult.disposition}`,
    );

    if (this.completeFailure !== null) {
      throw this.completeFailure;
    }
  }

  public async fail(
    publicId:
      string,

    errorMessage:
      string,
  ): Promise<void> {
    this.events.push(
      `fail:${publicId}:${errorMessage}`,
    );

    if (this.failFailure !== null) {
      throw this.failFailure;
    }
  }
}

describe(
  "AuditedSchedulerControlExecutor",
  () => {
    it(
      "persists intent before executing and then records completion",
      async () => {
        const inner =
          new FakeExecutor();

        const audit =
          new FakeAudit();

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        const request = {
          command:
            "stop",

          requestKey:
            "audit-123",
        } as const;

        await expect(
          executor.execute(
            request,
          ),
        ).resolves.toEqual(
          result(),
        );

        expect(audit.events)
          .toEqual([
            "create:stop:audit-123",
            "complete:audit-1:executed",
          ]);

        expect(inner.calls)
          .toEqual([
            request,
          ]);
      },
    );

    it(
      "stores null when no request key is supplied",
      async () => {
        const inner =
          new FakeExecutor();

        const audit =
          new FakeAudit();

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        await executor.execute({
          command:
            "stop",
        });

        expect(audit.events[0])
          .toBe(
            "create:stop:null",
          );
      },
    );

    it(
      "does not execute a command when audit intent cannot be persisted",
      async () => {
        const inner =
          new FakeExecutor();

        const audit =
          new FakeAudit();

        audit.createFailure =
          new Error(
            "audit database unavailable",
          );

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "stop",
          }),
        ).rejects.toThrow(
          "audit database unavailable",
        );

        expect(inner.calls)
          .toEqual([]);
      },
    );

    it(
      "records a failed command and rethrows the original control error",
      async () => {
        const inner =
          new FakeExecutor();

        inner.failure =
          new Error(
            "synthetic runtime failure",
          );

        const audit =
          new FakeAudit();

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "stop",

            requestKey:
              "failure-1",
          }),
        ).rejects.toThrow(
          "synthetic runtime failure",
        );

        expect(audit.events)
          .toEqual([
            "create:stop:failure-1",
            "fail:audit-1:synthetic runtime failure",
          ]);
      },
    );

    it(
      "preserves the original control error if failure auditing also fails",
      async () => {
        const inner =
          new FakeExecutor();

        inner.failure =
          new Error(
            "original control failure",
          );

        const audit =
          new FakeAudit();

        audit.failFailure =
          new Error(
            "secondary audit failure",
          );

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "stop",
          }),
        ).rejects.toThrow(
          "original control failure",
        );
      },
    );

    it(
      "fails the request when successful command completion cannot be durably recorded",
      async () => {
        const inner =
          new FakeExecutor();

        const audit =
          new FakeAudit();

        audit.completeFailure =
          new Error(
            "completion audit failure",
          );

        const executor =
          new AuditedSchedulerControlExecutor(
            inner,
            audit,
          );

        await expect(
          executor.execute({
            command:
              "stop",
          }),
        ).rejects.toThrow(
          "completion audit failure",
        );

        expect(inner.calls)
          .toHaveLength(1);

        expect(audit.events)
          .toEqual([
            "create:stop:null",
            "complete:audit-1:executed",
            "fail:audit-1:completion audit failure",
          ]);
      },
    );
  },
);
