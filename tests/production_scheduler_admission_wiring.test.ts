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
      "places readiness admission before coordinated HTTP command routing",
      () => {

        expect(server)
          .toMatch(
            /const readinessAwareCoordinatedControl[\s\S]*const coordinatedHttp/,
          );


        expect(server)
          .toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*readinessAwareCoordinatedControl,/,
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
