import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateScheduleDue,
} from "../src/scheduling/schedule_due_evaluator.js";

describe(
  "evaluateScheduleDue",
  () => {
    it(
      "is due when scheduledFor is before evaluatedAt",
      () => {
        const result =
          evaluateScheduleDue(
            new Date(
              "2026-08-15T12:00:00.000Z",
            ),
            new Date(
              "2026-08-15T12:00:01.000Z",
            ),
          );

        expect(result.due)
          .toBe(true);
      },
    );

    it(
      "is due exactly at the scheduled instant",
      () => {
        const instant =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const result =
          evaluateScheduleDue(
            instant,
            new Date(
              instant.getTime(),
            ),
          );

        expect(result.due)
          .toBe(true);
      },
    );

    it(
      "is not due before the scheduled instant",
      () => {
        const result =
          evaluateScheduleDue(
            new Date(
              "2026-08-15T12:00:01.000Z",
            ),
            new Date(
              "2026-08-15T12:00:00.999Z",
            ),
          );

        expect(result.due)
          .toBe(false);
      },
    );

    it(
      "uses millisecond precision at the due boundary",
      () => {
        const scheduledFor =
          new Date(
            "2026-08-15T12:00:00.123Z",
          );

        expect(
          evaluateScheduleDue(
            scheduledFor,
            new Date(
              "2026-08-15T12:00:00.122Z",
            ),
          ).due,
        ).toBe(false);

        expect(
          evaluateScheduleDue(
            scheduledFor,
            new Date(
              "2026-08-15T12:00:00.123Z",
            ),
          ).due,
        ).toBe(true);
      },
    );

    it(
      "returns the supplied instants by value",
      () => {
        const scheduledFor =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const evaluatedAt =
          new Date(
            "2026-08-15T12:00:01.000Z",
          );

        const result =
          evaluateScheduleDue(
            scheduledFor,
            evaluatedAt,
          );

        expect(
          result.scheduledFor.getTime(),
        ).toBe(
          scheduledFor.getTime(),
        );

        expect(
          result.evaluatedAt.getTime(),
        ).toBe(
          evaluatedAt.getTime(),
        );

        expect(result.scheduledFor)
          .not.toBe(scheduledFor);

        expect(result.evaluatedAt)
          .not.toBe(evaluatedAt);
      },
    );

    it(
      "does not mutate either input Date",
      () => {
        const scheduledFor =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const evaluatedAt =
          new Date(
            "2026-08-15T12:00:01.000Z",
          );

        const scheduledMs =
          scheduledFor.getTime();

        const evaluatedMs =
          evaluatedAt.getTime();

        evaluateScheduleDue(
          scheduledFor,
          evaluatedAt,
        );

        expect(
          scheduledFor.getTime(),
        ).toBe(scheduledMs);

        expect(
          evaluatedAt.getTime(),
        ).toBe(evaluatedMs);
      },
    );

    it(
      "rejects an invalid scheduledFor date",
      () => {
        expect(
          () =>
            evaluateScheduleDue(
              new Date(Number.NaN),
              new Date(
                "2026-08-15T12:00:00.000Z",
              ),
            ),
        ).toThrow(
          "scheduledFor must be a valid Date.",
        );
      },
    );

    it(
      "rejects an invalid evaluatedAt date",
      () => {
        expect(
          () =>
            evaluateScheduleDue(
              new Date(
                "2026-08-15T12:00:00.000Z",
              ),
              new Date(Number.NaN),
            ),
        ).toThrow(
          "evaluatedAt must be a valid Date.",
        );
      },
    );
  },
);
