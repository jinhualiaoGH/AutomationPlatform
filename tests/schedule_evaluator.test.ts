import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Schedule,
} from "../src/scheduling/schedule_contract.js";

import {
  evaluateSchedule,
} from "../src/scheduling/schedule_evaluator.js";

function intervalSchedule(
  intervalSeconds: number,
): Schedule {
  return {
    kind: "interval",
    intervalSeconds,
  };
}

describe(
  "evaluateSchedule",
  () => {
    it(
      "computes the next fire time for an interval schedule",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const result =
          evaluateSchedule(
            intervalSchedule(60),
            referenceTime,
          );

        expect(
          result.nextFireAt.toISOString(),
        ).toBe(
          "2026-08-15T12:01:00.000Z",
        );
      },
    );

    it(
      "advances by the exact configured interval",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T12:34:56.789Z",
          );

        const result =
          evaluateSchedule(
            intervalSchedule(90),
            referenceTime,
          );

        expect(
          result.nextFireAt.getTime() -
            referenceTime.getTime(),
        ).toBe(90_000);
      },
    );

    it(
      "preserves millisecond precision",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T00:00:00.123Z",
          );

        const result =
          evaluateSchedule(
            intervalSchedule(1),
            referenceTime,
          );

        expect(
          result.nextFireAt.toISOString(),
        ).toBe(
          "2026-08-15T00:00:01.123Z",
        );
      },
    );

    it(
      "does not mutate the reference Date",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const original =
          referenceTime.getTime();

        evaluateSchedule(
          intervalSchedule(30),
          referenceTime,
        );

        expect(
          referenceTime.getTime(),
        ).toBe(original);
      },
    );

    it(
      "is deterministic for identical inputs",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T12:00:00.000Z",
          );

        const schedule =
          intervalSchedule(300);

        const first =
          evaluateSchedule(
            schedule,
            referenceTime,
          );

        const second =
          evaluateSchedule(
            schedule,
            referenceTime,
          );

        expect(
          first.nextFireAt.getTime(),
        ).toBe(
          second.nextFireAt.getTime(),
        );
      },
    );

    it(
      "crosses UTC day boundaries correctly",
      () => {
        const referenceTime =
          new Date(
            "2026-08-15T23:59:30.000Z",
          );

        const result =
          evaluateSchedule(
            intervalSchedule(60),
            referenceTime,
          );

        expect(
          result.nextFireAt.toISOString(),
        ).toBe(
          "2026-08-16T00:00:30.000Z",
        );
      },
    );

    it(
      "rejects an invalid reference date",
      () => {
        expect(
          () =>
            evaluateSchedule(
              intervalSchedule(60),
              new Date(Number.NaN),
            ),
        ).toThrow(
          "referenceTime must be a valid Date.",
        );
      },
    );

    it(
      "defensively rejects a zero interval",
      () => {
        expect(
          () =>
            evaluateSchedule(
              intervalSchedule(0),
              new Date(
                "2026-08-15T12:00:00.000Z",
              ),
            ),
        ).toThrow(
          "Interval duration must be a positive safe integer number of milliseconds.",
        );
      },
    );

    it(
      "defensively rejects a negative interval",
      () => {
        expect(
          () =>
            evaluateSchedule(
              intervalSchedule(-1),
              new Date(
                "2026-08-15T12:00:00.000Z",
              ),
            ),
        ).toThrow(
          "Interval duration must be a positive safe integer number of milliseconds.",
        );
      },
    );

    it(
      "rejects an unsafe interval conversion",
      () => {
        expect(
          () =>
            evaluateSchedule(
              intervalSchedule(
                Number.MAX_SAFE_INTEGER,
              ),
              new Date(
                "2026-08-15T12:00:00.000Z",
              ),
            ),
        ).toThrow(
          "Interval duration must be a positive safe integer number of milliseconds.",
        );
      },
    );
  },
);
