import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const migration =
  readFileSync(
    new URL(
      "../database/migrations/0009_scheduler_control_admission_event.sql",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "scheduler control admission event migration",
  () => {

    it(
      "creates the durable admission event table",
      () => {

        expect(migration)
          .toContain(
            "CREATE TABLE dbo.scheduler_control_admission_event",
          );
      },
    );


    it(
      "persists the complete A20 event contract",
      () => {

        expect(migration)
          .toContain(
            "sequence",
          );

        expect(migration)
          .toContain(
            "observed_at_utc",
          );

        expect(migration)
          .toContain(
            "disposition",
          );

        expect(migration)
          .toContain(
            "command",
          );

        expect(migration)
          .toContain(
            "reason",
          );
      },
    );


    it(
      "enforces durable sequence uniqueness",
      () => {

        expect(migration)
          .toContain(
            "UQ_scheduler_control_admission_event_sequence",
          );

        expect(migration)
          .toContain(
            "UNIQUE",
          );
      },
    );


    it(
      "constrains admission dispositions",
      () => {

        expect(migration)
          .toContain(
            "CK_scheduler_control_admission_event_disposition",
          );

        expect(migration)
          .toContain(
            "N'admitted'",
          );

        expect(migration)
          .toContain(
            "N'denied'",
          );
      },
    );


    it(
      "constrains scheduler commands",
      () => {

        expect(migration)
          .toContain(
            "CK_scheduler_control_admission_event_command",
          );

        expect(migration)
          .toContain(
            "N'start'",
          );

        expect(migration)
          .toContain(
            "N'stop'",
          );

        expect(migration)
          .toContain(
            "N'restart'",
          );
      },
    );


    it(
      "constrains denial reasons",
      () => {

        expect(migration)
          .toContain(
            "scheduler_standby",
          );

        expect(migration)
          .toContain(
            "scheduler_fail_closed",
          );

        expect(migration)
          .toContain(
            "scheduler_stopped",
          );
      },
    );


    it(
      "indexes chronological observation access",
      () => {

        expect(migration)
          .toContain(
            "IX_scheduler_control_admission_event_observed",
          );

        expect(migration)
          .toContain(
            "observed_at_utc",
          );
      },
    );
  },
);
