import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SqlSchedulerControlAdmissionEventRepository,
  type AdmissionEventSqlPool,
} from "../src/repositories/scheduler_control_admission_event_repository.js";


type InputValue = {
  readonly name:
    string;

  readonly value:
    unknown;
};


class FakeRequest {

  public readonly inputs:
    InputValue[] =
    [];

  public readonly queries:
    string[] =
    [];

  public recordset:
    unknown[] =
    [];

  public queryError:
    unknown =
    null;


  public input(
    name:
      string,

    _type:
      unknown,

    value:
      unknown,
  ):
    FakeRequest {

    this.inputs.push({
      name,
      value,
    });


    return this;
  }


  public async query<T>(
    text:
      string,
  ):
    Promise<{
      recordset:
        T[];
    }> {

    this.queries.push(
      text,
    );


    if (
      this.queryError !==
      null
    ) {

      throw this.queryError;
    }


    return {
      recordset:
        this.recordset as T[],
    };
  }
}


class FakePool
implements AdmissionEventSqlPool {

  public readonly requests:
    FakeRequest[] =
    [];


  public nextRequest:
    FakeRequest =
    new FakeRequest();


  public request():
    FakeRequest {

    const request =
      this.nextRequest;


    this.requests.push(
      request,
    );


    this.nextRequest =
      new FakeRequest();


    return request;
  }
}


describe(
  "SqlSchedulerControlAdmissionEventRepository",
  () => {

    it(
      "inserts one admission event",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await repository.append({
          sequence:
            1,

          observedAtUtc:
            new Date(
              "2026-08-18T14:00:00.000Z",
            ),

          disposition:
            "admitted",

          command:
            "start",

          reason:
            null,
        });


        expect(pool.requests)
          .toHaveLength(
            1,
          );


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "INSERT INTO dbo.scheduler_control_admission_event",
        );
      },
    );


    it(
      "binds every persisted event field",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const observedAtUtc =
          new Date(
            "2026-08-18T14:01:00.000Z",
          );


        await repository.append({
          sequence:
            7,

          observedAtUtc,

          disposition:
            "denied",

          command:
            "restart",

          reason:
            "scheduler_standby",
        });


        expect(
          pool.requests[0]
            ?.inputs
            .map(
              (input) => [
                input.name,
                input.value,
              ],
            ),
        ).toEqual([
          [
            "sequence",
            7,
          ],
          [
            "observedAtUtc",
            observedAtUtc,
          ],
          [
            "disposition",
            "denied",
          ],
          [
            "command",
            "restart",
          ],
          [
            "reason",
            "scheduler_standby",
          ],
        ]);
      },
    );


    it(
      "lists events in sequence order",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          {
            sequence:
              1,

            observed_at_utc:
              new Date(
                "2026-08-18T14:02:00.000Z",
              ),

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

            observed_at_utc:
              new Date(
                "2026-08-18T14:03:00.000Z",
              ),

            disposition:
              "denied",

            command:
              "stop",

            reason:
              "scheduler_stopped",
          },
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const events =
          await repository.list();


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "ORDER BY",
        );

        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "sequence ASC",
        );


        expect(events)
          .toEqual([
            {
              sequence:
                1,

              observedAtUtc:
                new Date(
                  "2026-08-18T14:02:00.000Z",
                ),

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
                new Date(
                  "2026-08-18T14:03:00.000Z",
                ),

              disposition:
                "denied",

              command:
                "stop",

              reason:
                "scheduler_stopped",
            },
          ]);
      },
    );


    it(
      "returns defensive database dates",
      async () => {

        const databaseDate =
          new Date(
            "2026-08-18T14:04:00.000Z",
          );

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          {
            sequence:
              1,

            observed_at_utc:
              databaseDate,

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const events =
          await repository.list();


        events[0]
          ?.observedAtUtc
          .setUTCFullYear(
            2000,
          );


        expect(
          databaseDate.toISOString(),
        ).toBe(
          "2026-08-18T14:04:00.000Z",
        );
      },
    );


    it(
      "maps SQL Server duplicate-key errors to repository semantics",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.queryError = {
          number:
            2627,
        };


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.append({
            sequence:
              11,

            observedAtUtc:
              new Date(
                "2026-08-18T14:05:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "restart",

            reason:
              null,
          }),
        ).rejects.toThrow(
          "Admission event sequence 11 already exists.",
        );
      },
    );


    it(
      "maps SQL Server duplicate-index errors to repository semantics",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.queryError = {
          number:
            2601,
        };


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.append({
            sequence:
              12,

            observedAtUtc:
              new Date(
                "2026-08-18T14:06:00.000Z",
              ),

            disposition:
              "denied",

            command:
              "stop",

            reason:
              "scheduler_fail_closed",
          }),
        ).rejects.toThrow(
          "Admission event sequence 12 already exists.",
        );
      },
    );


    it(
      "rethrows unrelated SQL failures",
      async () => {

        const pool =
          new FakePool();

        const failure =
          new Error(
            "database unavailable",
          );

        pool.nextRequest.queryError =
          failure;


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.append({
            sequence:
              13,

            observedAtUtc:
              new Date(
                "2026-08-18T14:07:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          }),
        ).rejects.toBe(
          failure,
        );
      },
    );


    it(
      "rejects invalid sequence before database access",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.append({
            sequence:
              0,

            observedAtUtc:
              new Date(
                "2026-08-18T14:08:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          }),
        ).rejects.toThrow(
          "Admission event sequence must be a positive safe integer.",
        );


        expect(pool.requests)
          .toHaveLength(
            0,
          );
      },
    );


    it(
      "rejects invalid time before database access",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.append({
            sequence:
              1,

            observedAtUtc:
              new Date(
                Number.NaN,
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          }),
        ).rejects.toThrow(
          "Admission event observation time is invalid.",
        );


        expect(pool.requests)
          .toHaveLength(
            0,
          );
      },
    );
  },
);

describe(
  "A22 SQL keyset pagination",
  () => {

    function admissionRow(
      sequence:
        number,
    ) {

      return {
        sequence,

        page_total:
          5,

        observed_at_utc:
          new Date(
            `2026-08-18T15:${String(sequence).padStart(2, "0")}:00.000Z`,
          ),

        disposition:
          sequence % 2 === 0
            ? "denied"
            : "admitted",

        command:
          sequence % 3 === 0
            ? "restart"
            : sequence % 3 === 1
              ? "start"
              : "stop",

        reason:
          sequence % 2 === 0
            ? "scheduler_standby"
            : null,
      };
    }


    it(
      "implements the bounded repository contract",
      () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        expect(repository.listPage)
          .toBeTypeOf(
            "function",
          );
      },
    );


    it(
      "queries newest events with limit plus one",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          admissionRow(
            5,
          ),
          admissionRow(
            4,
          ),
          admissionRow(
            3,
          ),
          admissionRow(
            2,
          ),
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const page =
          await repository.listPage({
            limit:
              3,
          });


        expect(pool.requests)
          .toHaveLength(
            1,
          );


        expect(
          pool.requests[0]
            ?.inputs
            .map(
              (input) => [
                input.name,
                input.value,
              ],
            ),
        ).toContainEqual([
          "limitPlusOne",
          4,
        ]);


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "TOP (@limitPlusOne)",
        );


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "sequence DESC",
        );


        expect(
          page.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          3,
          4,
          5,
        ]);


        expect(page.hasMore)
          .toBe(
            true,
          );


        expect(page.nextBeforeSequence)
          .toBe(
            3,
          );
      },
    );


    it(
      "uses beforeSequence as an exclusive SQL cursor",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          admissionRow(
            4,
          ),
          admissionRow(
            3,
          ),
          admissionRow(
            2,
          ),
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const page =
          await repository.listPage({
            limit:
              2,

            beforeSequence:
              5,
          });


        expect(
          pool.requests[0]
            ?.inputs
            .map(
              (input) => [
                input.name,
                input.value,
              ],
            ),
        ).toContainEqual([
          "beforeSequence",
          5,
        ]);


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "sequence < @beforeSequence",
        );


        expect(
          page.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          3,
          4,
        ]);


        expect(page.hasMore)
          .toBe(
            true,
          );


        expect(page.nextBeforeSequence)
          .toBe(
            3,
          );
      },
    );


    it(
      "omits beforeSequence predicate for newest-page queries",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          admissionRow(
            2,
          ),
          admissionRow(
            1,
          ),
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await repository.listPage({
          limit:
            2,
        });


        expect(
          pool.requests[0]
            ?.queries[0],
        ).not.toContain(
          "@beforeSequence",
        );
      },
    );


    it(
      "returns no next cursor when no older event exists",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          admissionRow(
            2,
          ),
          admissionRow(
            1,
          ),
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const page =
          await repository.listPage({
            limit:
              3,
          });


        expect(
          page.events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);


        expect(page.hasMore)
          .toBe(
            false,
          );


        expect(page.nextBeforeSequence)
          .toBeNull();
      },
    );


    it(
      "rejects invalid page limit before creating a SQL request",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.listPage({
            limit:
              0,
          }),
        ).rejects.toThrow(
          "Admission event page limit must be a positive safe integer.",
        );


        expect(pool.requests)
          .toHaveLength(
            0,
          );
      },
    );


    it(
      "rejects invalid beforeSequence before creating a SQL request",
      async () => {

        const pool =
          new FakePool();

        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        await expect(
          repository.listPage({
            limit:
              2,

            beforeSequence:
              0,
          }),
        ).rejects.toThrow(
          "Admission event page beforeSequence must be a positive safe integer.",
        );


        expect(pool.requests)
          .toHaveLength(
            0,
          );
      },
    );


    it(
      "preserves frozen list behavior",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          admissionRow(
            1,
          ),
          admissionRow(
            2,
          ),
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const events =
          await repository.list();


        expect(
          events.map(
            (event) =>
              event.sequence,
          ),
        ).toEqual([
          1,
          2,
        ]);


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "sequence ASC",
        );
      },
    );
  },
);


describe(
  "A22 SQL page total",
  () => {

    it(
      "reports total from the bounded SQL projection",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset = [
          {
            sequence:
              3,

            page_total:
              3,

            observed_at_utc:
              new Date(
                "2026-08-18T19:03:00.000Z",
              ),

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

            page_total:
              3,

            observed_at_utc:
              new Date(
                "2026-08-18T19:02:00.000Z",
              ),

            disposition:
              "admitted",

            command:
              "start",

            reason:
              null,
          },
        ];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const page =
          await repository.listPage({
            limit:
              2,
          });


        expect(page.total)
          .toBe(
            3,
          );


        expect(
          pool.requests[0]
            ?.queries[0],
        ).toContain(
          "COUNT_BIG(*) OVER () AS page_total",
        );
      },
    );


    it(
      "reports zero total for an empty result",
      async () => {

        const pool =
          new FakePool();

        pool.nextRequest.recordset =
          [];


        const repository =
          new SqlSchedulerControlAdmissionEventRepository(
            async () =>
              pool,
          );


        const page =
          await repository.listPage({
            limit:
              10,
          });


        expect(page.total)
          .toBe(
            0,
          );
      },
    );
  },
);
