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
  "production scheduler control admission history wiring",
  () => {

    it(
      "constructs one bounded admission event history",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionEventHistory\(\s*256,\s*\)/,
          );
      },
    );


    it(
      "keeps admission history observation between A17 readiness and A18 metrics",
      () => {

        const readinessIndex =
          server.indexOf(
            "const readinessAwareCoordinatedControl",
          );

        const historyIndex =
          server.indexOf(
            "const schedulerControlAdmissionHistory",
          );

        const observerIndex =
          server.indexOf(
            "const eventObservingCoordinatedControl",
          );

        const metricsIndex =
          server.indexOf(
            "const metricsObservingCoordinatedControl",
          );


        expect(readinessIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(historyIndex)
          .toBeGreaterThan(
            readinessIndex,
          );

        expect(observerIndex)
          .toBeGreaterThan(
            historyIndex,
          );

        expect(metricsIndex)
          .toBeGreaterThan(
            observerIndex,
          );


        /*
         * A19 freezes the history-observation semantic boundary.
         *
         * Later phases may strengthen the concrete observer with
         * durable persistence while preserving one bounded history
         * and the same downstream A18 metrics boundary.
         */
        expect(server)
          .toMatch(
            /schedulerControlAdmissionHistory/,
          );
      },
    );


    it(
      "keeps A18 metrics observation outside the A19 event observer",
      () => {

        expect(server)
          .toMatch(
            /new MetricsObservingReadinessAwareCoordinatedControlExecutor\(\s*eventObservingCoordinatedControl,\s*schedulerControlAdmissionMetrics,/,
          );
      },
    );


    it(
      "preserves A18 as the direct coordinated HTTP delegate",
      () => {

        expect(server)
          .toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*metricsObservingCoordinatedControl,/,
          );
      },
    );


    it(
      "does not bypass A18 by routing A19 directly to HTTP",
      () => {

        expect(server)
          .not.toMatch(
            /composeProductionCoordinatedRecoveryHttp\(\s*auditedCoordinatedControl,\s*eventObservingCoordinatedControl,/,
          );
      },
    );


    it(
      "builds the history status service from the same history instance",
      () => {

        expect(server)
          .toMatch(
            /new SchedulerControlAdmissionHistoryStatusService\(\s*schedulerControlAdmissionHistory,/,
          );
      },
    );


    it(
      "registers the admission history route",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerControlAdmissionHistoryRoutes\(\s*schedulerControlAdmissionHistoryStatus,/,
          );
      },
    );


    it(
      "preserves the existing A18 admission status route",
      () => {

        expect(server)
          .toMatch(
            /createSchedulerControlAdmissionStatusRoutes\(\s*schedulerControlAdmissionStatus,/,
          );
      },
    );


    it(
      "keeps the production observer chain in the intended order",
      () => {

        const readinessIndex =
          server.indexOf(
            "const readinessAwareCoordinatedControl",
          );

        const historyIndex =
          server.indexOf(
            "const schedulerControlAdmissionHistory",
          );

        const eventObserverIndex =
          server.indexOf(
            "const eventObservingCoordinatedControl",
          );

        const metricsIndex =
          server.indexOf(
            "const schedulerControlAdmissionMetrics",
          );

        const metricsObserverIndex =
          server.indexOf(
            "const metricsObservingCoordinatedControl",
          );

        const httpIndex =
          server.indexOf(
            "const coordinatedHttp",
          );


        expect(readinessIndex)
          .toBeGreaterThanOrEqual(
            0,
          );

        expect(historyIndex)
          .toBeGreaterThan(
            readinessIndex,
          );

        expect(eventObserverIndex)
          .toBeGreaterThan(
            historyIndex,
          );

        expect(metricsIndex)
          .toBeGreaterThan(
            eventObserverIndex,
          );

        expect(metricsObserverIndex)
          .toBeGreaterThan(
            metricsIndex,
          );

        expect(httpIndex)
          .toBeGreaterThan(
            metricsObserverIndex,
          );
      },
    );
  },
);
