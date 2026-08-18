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


describe(
  "production scheduler readiness wiring",
  () => {

    it(
      "imports the readiness service",
      () => {

        expect(server)
          .toContain(
            "SchedulerFailoverReadinessService",
          );
      },
    );


    it(
      "imports the readiness route factory",
      () => {

        expect(server)
          .toContain(
            "createSchedulerReadinessRoutes",
          );
      },
    );


    it(
      "builds readiness from the live failover status projector",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerFailoverReadinessService\(\s*schedulerFailoverStatus,\s*\)/,
          );
      },
    );


    it(
      "registers the scheduler readiness route",
      () => {

        expect(server)
          .toMatch(
            /app\.register\(\s*createSchedulerReadinessRoutes\(\s*schedulerReadiness,\s*\),\s*\);/,
          );
      },
    );


    it(
      "constructs readiness after failover status projection",
      () => {

        const projection =
          server.indexOf(
            "const schedulerFailoverStatus =",
          );

        const readiness =
          server.indexOf(
            "const schedulerReadiness =",
          );

        expect(projection)
          .toBeGreaterThanOrEqual(0);

        expect(readiness)
          .toBeGreaterThan(
            projection,
          );
      },
    );


    it(
      "constructs readiness before the application",
      () => {

        const readiness =
          server.indexOf(
            "const schedulerReadiness =",
          );

        const app =
          server.indexOf(
            "const app =",
          );

        expect(readiness)
          .toBeGreaterThanOrEqual(0);

        expect(app)
          .toBeGreaterThan(
            readiness,
          );
      },
    );


    it(
      "registers readiness only after the app exists",
      () => {

        const app =
          server.indexOf(
            "const app =",
          );

        const registration =
          server.indexOf(
            "createSchedulerReadinessRoutes(",
          );

        expect(app)
          .toBeGreaterThanOrEqual(0);

        expect(registration)
          .toBeGreaterThan(
            app,
          );
      },
    );


    it(
      "preserves existing failover-aware scheduler status",
      () => {

        expect(server)
          .toContain(
            "failoverAwareSchedulerStatus",
          );

        expect(server)
          .toMatch(
            /schedulerStatus:\s*failoverAwareSchedulerStatus/,
          );
      },
    );


    it(
      "preserves asynchronous failover startup",
      () => {

        expect(server)
          .toContain(
            "void schedulerFailover.runtime.start();",
          );

        expect(server)
          .not.toContain(
            "await ownershipRuntime.start()",
          );
      },
    );


    it(
      "preserves failover-owned shutdown",
      () => {

        expect(server)
          .toContain(
            "await schedulerFailover.runtime.stop();",
          );
      },
    );
  },
);
