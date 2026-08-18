import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";


const server =
  readFileSync(
    new URL(
      "../src/server.ts",
      import.meta.url,
    ),
    "utf8",
  );


const httpComposition =
  readFileSync(
    new URL(
      "../src/recovery/production_coordinated_recovery_http_composition.ts",
      import.meta.url,
    ),
    "utf8",
  );


describe(
  "production scheduler admission wiring",
  () => {

    it(
      "constructs readiness-aware coordinated control",
      () => {

        expect(server)
          .toContain(
            "new ReadinessAwareCoordinatedSchedulerControlExecutor(",
          );
      },
    );


    it(
      "uses the existing audited executor as the admitted delegate",
      () => {

        expect(server)
          .toMatch(
            /new ReadinessAwareCoordinatedSchedulerControlExecutor\(\s*auditedCoordinatedControl\.auditedExecutor,\s*schedulerReadiness,/,
          );
      },
    );


    it(
      "keeps readiness admission before coordinated HTTP command routing",
      () => {

        const readinessIndex =
          server.indexOf(
            "const readinessAwareCoordinatedControl",
          );

        const httpIndex =
          server.indexOf(
            "const coordinatedHttp",
          );


        expect(readinessIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(httpIndex)
          .toBeGreaterThan(
            readinessIndex,
          );


        /*
         * A17 contract:
         *
         * Readiness admission must remain upstream of the
         * coordinated HTTP command boundary.
         *
         * Later phases may insert transparent decorators between
         * the A17 executor and that boundary without changing
         * A17 admission semantics.
         */
        expect(server)
          .toMatch(
            /new ReadinessAwareCoordinatedSchedulerControlExecutor\(\s*auditedCoordinatedControl\.auditedExecutor,\s*schedulerReadiness,/,
          );
      },
    );


    it(
      "does not replace the audited composition",
      () => {

        expect(server)
          .toContain(
            "composeProductionAuditedCoordinatedRecoveryControl(",
          );


        expect(server)
          .toContain(
            "auditedCoordinatedControl.auditedExecutor",
          );
      },
    );


    it(
      "allows HTTP composition to override only the command executor",
      () => {

        expect(httpComposition)
          .toContain(
            "commandExecutor:",
          );


        expect(httpComposition)
          .toContain(
            "base.auditedExecutor",
          );


        expect(httpComposition)
          .toMatch(
            /createCoordinatedSchedulerRecoveryControlRoutes\(\s*commandExecutor,/,
          );
      },
    );


    it(
      "keeps audit routes bound to the original audit repository",
      () => {

        expect(httpComposition)
          .toMatch(
            /createSchedulerRecoveryCoordinationAuditRoutes\(\s*base\.auditRepository,/,
          );
      },
    );


    it(
      "keeps readiness routes on the same live readiness service",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerReadinessRoutes\(\s*schedulerReadiness,/,
          );
      },
    );
  },
);
