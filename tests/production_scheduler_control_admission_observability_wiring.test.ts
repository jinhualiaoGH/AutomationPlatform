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
  "production scheduler control admission observability wiring",
  () => {

    it(
      "constructs one production admission metrics accumulator",
      () => {

        expect(server)
          .toContain(
            "new SchedulerControlAdmissionMetricsAccumulator()",
          );
      },
    );


    it(
      "wraps the frozen A17 readiness-aware executor",
      () => {

        expect(server)
          .toMatch(
            /new MetricsObservingReadinessAwareCoordinatedControlExecutor\(\s*readinessAwareCoordinatedControl,\s*schedulerControlAdmissionMetrics,/,
          );
      },
    );


    it(
      "keeps A17 readiness admission immediately downstream of audited control",
      () => {

        expect(server)
          .toMatch(
            /new ReadinessAwareCoordinatedSchedulerControlExecutor\(\s*auditedCoordinatedControl\.auditedExecutor,\s*schedulerReadiness,/,
          );
      },
    );


    it(
      "routes production commands through the A18 observing decorator",
      () => {

        expect(server)
          .toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*metricsObservingCoordinatedControl,/,
          );
      },
    );


    it(
      "does not route production commands directly through the A17 executor anymore",
      () => {

        expect(server)
          .not.toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*readinessAwareCoordinatedControl,/,
          );
      },
    );


    it(
      "builds the admission status service from the same metrics accumulator",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionStatusService\(\s*schedulerControlAdmissionMetrics,/,
          );
      },
    );


    it(
      "registers the admission status route",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerControlAdmissionStatusRoutes\(\s*schedulerControlAdmissionStatus,/,
          );
      },
    );


    it(
      "preserves the existing scheduler readiness route",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerReadinessRoutes\(\s*schedulerReadiness,/,
          );
      },
    );


    it(
      "keeps observability outside the frozen A17 implementation",
      () => {

        const readinessAwareIndex =
          server.indexOf(
            "const readinessAwareCoordinatedControl",
          );

        const metricsIndex =
          server.indexOf(
            "const schedulerControlAdmissionMetrics",
          );

        const observerIndex =
          server.indexOf(
            "const metricsObservingCoordinatedControl",
          );

        const httpIndex =
          server.indexOf(
            "const coordinatedHttp",
          );


        expect(readinessAwareIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(metricsIndex)
          .toBeGreaterThan(
            readinessAwareIndex,
          );

        expect(observerIndex)
          .toBeGreaterThan(
            metricsIndex,
          );

        expect(httpIndex)
          .toBeGreaterThan(
            observerIndex,
          );
      },
    );
  },
);
