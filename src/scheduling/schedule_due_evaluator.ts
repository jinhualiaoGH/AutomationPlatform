export type ScheduleDueEvaluation = {
  readonly due: boolean;
  readonly scheduledFor: Date;
  readonly evaluatedAt: Date;
};

function assertValidDate(
  value: Date,
  name: string,
): void {
  if (
    !(value instanceof Date) ||
    !Number.isFinite(value.getTime())
  ) {
    throw new Error(
      name + " must be a valid Date.",
    );
  }
}

export function evaluateScheduleDue(
  scheduledFor: Date,
  evaluatedAt: Date,
): ScheduleDueEvaluation {
  assertValidDate(
    scheduledFor,
    "scheduledFor",
  );

  assertValidDate(
    evaluatedAt,
    "evaluatedAt",
  );

  return {
    due:
      scheduledFor.getTime() <=
      evaluatedAt.getTime(),

    scheduledFor:
      new Date(
        scheduledFor.getTime(),
      ),

    evaluatedAt:
      new Date(
        evaluatedAt.getTime(),
      ),
  };
}
