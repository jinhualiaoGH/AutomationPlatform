import {
  describe,
  expect,
  it,
} from "vitest";

import {
  parseScheduleConfiguration,
} from "../src/scheduling/schedule_parser.js";

describe(
  "parseScheduleConfiguration",
  () => {
    it(
      "parses a valid interval schedule",
      () => {
        expect(
          parseScheduleConfiguration(
            JSON.stringify({
              intervalSeconds: 60,
            }),
          ),
        ).toEqual({
          kind: "interval",
          intervalSeconds: 60,
        });
      },
    );

    it(
      "accepts the minimum interval",
      () => {
        expect(
          parseScheduleConfiguration(
            JSON.stringify({
              intervalSeconds: 1,
            }),
          ),
        ).toEqual({
          kind: "interval",
          intervalSeconds: 1,
        });
      },
    );

    it(
      "rejects invalid JSON",
      () => {
        expect(
          () =>
            parseScheduleConfiguration(
              "{not-json}",
            ),
        ).toThrow(
          "Schedule configuration must be valid JSON.",
        );
      },
    );

    it(
      "rejects non-object JSON",
      () => {
        for (
          const configurationJson
          of [
            "null",
            "[]",
            '"schedule"',
            "60",
            "true",
          ]
        ) {
          expect(
            () =>
              parseScheduleConfiguration(
                configurationJson,
              ),
          ).toThrow(
            "Schedule configuration must be a JSON object.",
          );
        }
      },
    );

    it(
      "rejects a missing intervalSeconds",
      () => {
        expect(
          () =>
            parseScheduleConfiguration(
              "{}",
            ),
        ).toThrow(
          "intervalSeconds must be an integer.",
        );
      },
    );

    it(
      "rejects non-integer intervals",
      () => {
        for (
          const intervalSeconds
          of [
            "60",
            1.5,
            null,
            true,
          ]
        ) {
          expect(
            () =>
              parseScheduleConfiguration(
                JSON.stringify({
                  intervalSeconds,
                }),
              ),
          ).toThrow(
            "intervalSeconds must be an integer.",
          );
        }
      },
    );

    it(
      "rejects zero and negative intervals",
      () => {
        for (
          const intervalSeconds
          of [
            0,
            -1,
            -60,
          ]
        ) {
          expect(
            () =>
              parseScheduleConfiguration(
                JSON.stringify({
                  intervalSeconds,
                }),
              ),
          ).toThrow(
            "intervalSeconds must be at least 1.",
          );
        }
      },
    );

    it(
      "rejects unsupported properties",
      () => {
        expect(
          () =>
            parseScheduleConfiguration(
              JSON.stringify({
                intervalSeconds: 60,
                timezone: "UTC",
              }),
            ),
        ).toThrow(
          "Unsupported schedule configuration property: timezone.",
        );
      },
    );
  },
);
