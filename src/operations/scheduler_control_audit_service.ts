import type {
  SchedulerControlAuditRecord,
} from "../repositories/scheduler_control_audit_repository.js";

export type SchedulerControlAuditReader = {
  listRecent(
    limit:
      number,
  ): Promise<SchedulerControlAuditRecord[]>;
};

export type SchedulerControlAuditItem = {
  auditId:
    string;

  publicId:
    string;

  requestKey:
    string | null;

  command:
    SchedulerControlAuditRecord["command"];

  auditStatus:
    SchedulerControlAuditRecord["auditStatus"];

  disposition:
    SchedulerControlAuditRecord["disposition"];

  previousState:
    SchedulerControlAuditRecord["previousState"];

  currentState:
    SchedulerControlAuditRecord["currentState"];

  changed:
    boolean | null;

  reason:
    string | null;

  errorMessage:
    string | null;

  createdAtUtc:
    string;

  completedAtUtc:
    string | null;
};

export type SchedulerControlAuditHistory = {
  count:
    number;

  items:
    SchedulerControlAuditItem[];
};

function assertLimit(
  limit:
    number,
): void {
  if (
    !Number.isInteger(
      limit,
    ) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new Error(
      "limit must be an integer from 1 to 100.",
    );
  }
}

function assertValidDate(
  value:
    Date,
  name:
    string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(
      value.getTime(),
    )
  ) {
    throw new Error(
      `${name} must be a valid Date.`,
    );
  }
}

function mapItem(
  record:
    SchedulerControlAuditRecord,
): SchedulerControlAuditItem {
  assertValidDate(
    record.createdAtUtc,
    "createdAtUtc",
  );

  if (
    record.completedAtUtc !== null
  ) {
    assertValidDate(
      record.completedAtUtc,
      "completedAtUtc",
    );
  }

  return {
    auditId:
      record.auditId.toString(),

    publicId:
      record.publicId,

    requestKey:
      record.requestKey,

    command:
      record.command,

    auditStatus:
      record.auditStatus,

    disposition:
      record.disposition,

    previousState:
      record.previousState,

    currentState:
      record.currentState,

    changed:
      record.changed,

    reason:
      record.reason,

    errorMessage:
      record.errorMessage,

    createdAtUtc:
      record.createdAtUtc
        .toISOString(),

    completedAtUtc:
      record.completedAtUtc === null
        ? null
        : record.completedAtUtc
            .toISOString(),
  };
}

export class SchedulerControlAuditService {
  public constructor(
    private readonly repository:
      SchedulerControlAuditReader,
  ) {}

  public async getRecent(
    limit =
      50,
  ): Promise<SchedulerControlAuditHistory> {
    assertLimit(
      limit,
    );

    const records =
      await this.repository.listRecent(
        limit,
      );

    const items =
      records.map(
        mapItem,
      );

    return {
      count:
        items.length,

      items,
    };
  }
}
