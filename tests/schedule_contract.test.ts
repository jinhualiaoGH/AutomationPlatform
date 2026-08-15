import {
  describe,
  expect,
  it,
} from "vitest";

import {
  minimumIntervalSeconds,
  scheduledTriggerType,
  type IntervalSchedule,
  type Schedule,
} from "../src/scheduling/schedule_contract.js";

describe(
  "schedule contract",
  () => {
    it(
      "defines the canonical scheduled trigger type",
      () => {
        expect(
          scheduledTriggerType,
        ).toBe("schedule");
      },
    );

    it(
      "defines a positive minimum interval",
      () => {
        expect(
          minimumIntervalSeconds,
        ).toBe(1);
      },
    );

    it(
      "represents an interval schedule",
      () => {
        const interval:
          IntervalSchedule = {
            kind: "interval",
            intervalSeconds: 60,
          };

        const schedule:
          Schedule = interval;

        expect(schedule).toEqual({
          kind: "interval",
          intervalSeconds: 60,
        });
      },
    );
  },
);
