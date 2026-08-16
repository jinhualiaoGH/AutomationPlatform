import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAuditService,
} from "../src/operations/scheduler_control_audit_service.js";

import type {
  SchedulerControlAuditReader,
} from "../src/operations/scheduler_control_audit_service.js";

import type {
  SchedulerControlAuditRecord,
} from "../src/repositories/scheduler_control_audit_repository.js";

function auditRecord(
  overrides:
    Partial<SchedulerControlAuditRecord> =
    {},
): SchedulerControlAuditRecord {
  return {
    auditId:
      1234567890123456789n,

    publicId:
      "11111111-1111-4111-8111-111111111111",

    requestKey:
      "history-1",

    command:
      "stop",

    auditStatus:
      "completed",

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

    errorMessage:
      null,

    createdAtUtc:
      new Date(
        "2026-08-15T23:00:00.000Z",
      ),

    completedAtUtc:
      new Date(
        "2026-08-15T23:00:01.000Z",
      ),

    rowVersion:
      Buffer.from([
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
      ]),

    ...overrides,
  };
}

class FakeRepository
implements SchedulerControlAuditReader {
  public limits:
    number[] =
    [];

  public records:
    SchedulerControlAuditRecord[] =
    [];

  public async listRecent(
    limit:
      number,
  ): Promise<SchedulerControlAuditRecord[]> {
    this.limits.push(
      limit,
    );

    return this.records;
  }
}

describe(
  "SchedulerControlAuditService",
  () => {
    it(
      "maps durable audit records to JSON-safe history items",
      async () => {
        const repository =
          new FakeRepository();

        repository.records = [
          auditRecord(),
        ];

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        const result =
          await service.getRecent(
            25,
          );

        expect(repository.limits)
          .toEqual([
            25,
          ]);

        expect(result)
          .toEqual({
            count:
              1,

            items: [
              {
                auditId:
                  "1234567890123456789",

                publicId:
                  "11111111-1111-4111-8111-111111111111",

                requestKey:
                  "history-1",

                command:
                  "stop",

                auditStatus:
                  "completed",

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

                errorMessage:
                  null,

                createdAtUtc:
                  "2026-08-15T23:00:00.000Z",

                completedAtUtc:
                  "2026-08-15T23:00:01.000Z",
              },
            ],
          });
      },
    );

    it(
      "preserves nullable failure and completion fields",
      async () => {
        const repository =
          new FakeRepository();

        repository.records = [
          auditRecord({
            requestKey:
              null,

            auditStatus:
              "pending",

            disposition:
              null,

            previousState:
              null,

            currentState:
              null,

            changed:
              null,

            reason:
              null,

            errorMessage:
              null,

            completedAtUtc:
              null,
          }),
        ];

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        const result =
          await service.getRecent();

        expect(result.items[0])
          .toMatchObject({
            requestKey:
              null,

            auditStatus:
              "pending",

            disposition:
              null,

            completedAtUtc:
              null,
          });

        expect(repository.limits)
          .toEqual([
            50,
          ]);
      },
    );

    it(
      "preserves durable failed-command detail",
      async () => {
        const repository =
          new FakeRepository();

        repository.records = [
          auditRecord({
            command:
              "start",

            auditStatus:
              "failed",

            disposition:
              null,

            previousState:
              null,

            currentState:
              null,

            changed:
              null,

            errorMessage:
              "synthetic runtime failure",
          }),
        ];

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        const result =
          await service.getRecent();

        expect(
          result.items[0]?.errorMessage,
        ).toBe(
          "synthetic runtime failure",
        );
      },
    );

    it(
      "rejects invalid limits before repository access",
      async () => {
        const repository =
          new FakeRepository();

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        for (
          const limit of [
            0,
            101,
            1.5,
            Number.NaN,
          ]
        ) {
          await expect(
            service.getRecent(
              limit,
            ),
          ).rejects.toThrow(
            "limit must be an integer from 1 to 100.",
          );
        }

        expect(repository.limits)
          .toEqual([]);
      },
    );

    it(
      "rejects an invalid created timestamp",
      async () => {
        const repository =
          new FakeRepository();

        repository.records = [
          auditRecord({
            createdAtUtc:
              new Date(
                Number.NaN,
              ),
          }),
        ];

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        await expect(
          service.getRecent(),
        ).rejects.toThrow(
          "createdAtUtc must be a valid Date.",
        );
      },
    );

    it(
      "rejects an invalid completed timestamp",
      async () => {
        const repository =
          new FakeRepository();

        repository.records = [
          auditRecord({
            completedAtUtc:
              new Date(
                Number.NaN,
              ),
          }),
        ];

        const service =
          new SchedulerControlAuditService(
            repository,
          );

        await expect(
          service.getRecent(),
        ).rejects.toThrow(
          "completedAtUtc must be a valid Date.",
        );
      },
    );
  },
);
