import Fastify from "fastify";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  SchedulerControlAdmissionEventHistory,
} from "../src/recovery/scheduler_control_admission_event_history.js";

import {
  SchedulerControlAdmissionHistoryStatusService,
} from "../src/recovery/scheduler_control_admission_history_status_service.js";

import {
  createSchedulerControlAdmissionHistoryRoutes,
} from "../src/routes/scheduler_control_admission_history.js";


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
  history:
    SchedulerControlAdmissionEventHistory,
) {

  const service =
    new SchedulerControlAdmissionHistoryStatusService(
      history,
      () =>
        new Date(
          "2026-08-18T19:00:00.000Z",
        ),
    );


  const app =
    Fastify();

  apps.push(
    app,
  );


  await app.register(
    createSchedulerControlAdmissionHistoryRoutes(
      service,
    ),
  );


  await app.ready();


  return app;
}


describe(
  "scheduler control admission history routes",
  () => {

    it(
      "exposes the history endpoint",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(response.statusCode)
          .toBe(
            200,
          );
      },
    );


    it(
      "returns empty initial history",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(
          response.json(),
        ).toEqual({
          observedAtUtc:
            "2026-08-18T19:00:00.000Z",

          capacity:
            4,

          size:
            0,

          dropped:
            0,

          hasEvents:
            false,

          events:
            [],
        });
      },
    );


    it(
      "projects chronological admission events",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },

          new Date(
            "2026-08-18T18:55:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "denied",

            command:
              "restart",

            reason:
              "scheduler_fail_closed",
          },

          new Date(
            "2026-08-18T18:56:00.000Z",
          ),
        );


        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(
          response.json(),
        ).toMatchObject({
          size:
            2,

          dropped:
            0,

          hasEvents:
            true,

          events: [
            {
              sequence:
                1,

              observedAtUtc:
                "2026-08-18T18:55:00.000Z",

              disposition:
                "admitted",

              command:
                "start",

              reason:
                null,
            },

            {
              sequence:
                2,

              observedAtUtc:
                "2026-08-18T18:56:00.000Z",

              disposition:
                "denied",

              command:
                "restart",

              reason:
                "scheduler_fail_closed",
            },
          ],
        });
      },
    );


    it(
      "projects bounded-history dropped count",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            1,
          );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },

          new Date(
            "2026-08-18T18:57:00.000Z",
          ),
        );


        history.record(
          {
            disposition:
              "denied",

            command:
              "stop",

            reason:
              "scheduler_standby",
          },

          new Date(
            "2026-08-18T18:58:00.000Z",
          ),
        );


        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(
          response.json(),
        ).toMatchObject({
          capacity:
            1,

          size:
            1,

          dropped:
            1,

          events: [
            {
              sequence:
                2,

              command:
                "stop",

              reason:
                "scheduler_standby",
            },
          ],
        });
      },
    );


    it(
      "reads current history on every request",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const app =
          await buildApp(
            history,
          );


        const first =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(
          first.json().size,
        ).toBe(
          0,
        );


        history.record(
          {
            disposition:
              "admitted",

            command:
              "stop",

            reason:
              null,
          },

          new Date(
            "2026-08-18T18:59:00.000Z",
          ),
        );


        const second =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
          });


        expect(
          second.json().size,
        ).toBe(
          1,
        );
      },
    );


    it(
      "uses a read-only GET route",
      async () => {

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "POST",

            url:
              "/operations/scheduler/control-admission/history",
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

        const history =
          new SchedulerControlAdmissionEventHistory(
            4,
          );

        const app =
          await buildApp(
            history,
          );


        const response =
          await app.inject({
            method:
              "GET",

            url:
              "/operations/scheduler/control-admission/history",
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
