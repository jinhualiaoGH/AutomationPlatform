import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionMetricsAccumulator,
} from "../src/recovery/scheduler_control_admission_metrics.js";

import {
  SchedulerControlAdmissionStatusService,
} from "../src/recovery/scheduler_control_admission_status_service.js";

import {
  createSchedulerControlAdmissionStatusRoutes,
} from "../src/routes/scheduler_control_admission_status.js";


const apps:
  ReturnType<typeof Fastify>[] =
  [];


afterEach(
  async () => {

    await Promise.all(
      apps.map(
        async (app) =>
          app.close(),
      ),
    );

    apps.length =
      0;
  },
);


async function buildApp(
  metrics:
    SchedulerControlAdmissionMetricsAccumulator,
) {

  const service =
    new SchedulerControlAdmissionStatusService(
      metrics,
      () =>
        new Date(
          "2026-08-18T13:00:00.000Z",
        ),
    );


  const app =
    Fastify();

  apps.push(
    app,
  );


  await app.register(
    createSchedulerControlAdmissionStatusRoutes(
      service,
    ),
  );


  await app.ready();


  return app;
}


describe(
  "scheduler control admission status routes",
  () => {

    it(
      "exposes the operational status endpoint",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const app =
          await buildApp(
            metrics,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );
      },
    );


    it(
      "returns an empty initial status",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const app =
          await buildApp(
            metrics,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(
          response.json(),
        ).toEqual({
          observedAtUtc:
            "2026-08-18T13:00:00.000Z",

          hasObservedDecisions:
            false,

          metrics: {
            total:
              0,

            admitted:
              0,

            denied:
              0,

            byCommand: {
              start:
                0,

              stop:
                0,

              restart:
                0,
            },

            deniedByReason: {
              scheduler_standby:
                0,

              scheduler_fail_closed:
                0,

              scheduler_stopped:
                0,
            },

            lastDecision:
              null,
          },
        });
      },
    );


    it(
      "projects current admission metrics",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();


        metrics.record({
          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        metrics.record({
          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_fail_closed",
        });


        const app =
          await buildApp(
            metrics,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(
          response.json(),
        ).toMatchObject({
          hasObservedDecisions:
            true,

          metrics: {
            total:
              2,

            admitted:
              1,

            denied:
              1,

            byCommand: {
              start:
                1,

              stop:
                0,

              restart:
                1,
            },

            deniedByReason: {
              scheduler_standby:
                0,

              scheduler_fail_closed:
                1,

              scheduler_stopped:
                0,
            },

            lastDecision: {
              disposition:
                "denied",

              command:
                "restart",

              reason:
                "scheduler_fail_closed",
            },
          },
        });
      },
    );


    it(
      "reads the live accumulator on every request",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const app =
          await buildApp(
            metrics,
          );


        const first =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(
          first.json().metrics.total,
        ).toBe(
          0,
        );


        metrics.record({
          disposition:
            "denied",

          command:
            "stop",

          reason:
            "scheduler_standby",
        });


        const second =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(
          second.json().metrics.total,
        ).toBe(
          1,
        );


        expect(
          second.json().metrics.deniedByReason.scheduler_standby,
        ).toBe(
          1,
        );
      },
    );


    it(
      "uses a read-only GET route",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const app =
          await buildApp(
            metrics,
          );


        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(response.statusCode)
          .toBe(
            404,
          );
      },
    );


    it(
      "returns JSON content",
      async () => {

        const metrics =
          new SchedulerControlAdmissionMetricsAccumulator();

        const app =
          await buildApp(
            metrics,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/status",
          });


        expect(
          response.headers[
            "content-type"
          ],
        ).toContain(
          "application/json",
        );
      },
    );
  },
);
