IF OBJECT_ID(
    N'dbo.scheduler_generation_state',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE
        dbo.scheduler_generation_state
    (
        scheduler_generation_state_id
            tinyint
            NOT NULL,

        current_generation
            bigint
            NOT NULL,

        created_at_utc
            datetime2(7)
            NOT NULL
            CONSTRAINT
                DF_scheduler_generation_state_created_at_utc
            DEFAULT
                SYSUTCDATETIME(),

        updated_at_utc
            datetime2(7)
            NOT NULL
            CONSTRAINT
                DF_scheduler_generation_state_updated_at_utc
            DEFAULT
                SYSUTCDATETIME(),

        row_version
            rowversion
            NOT NULL,

        CONSTRAINT
            PK_scheduler_generation_state
        PRIMARY KEY
        (
            scheduler_generation_state_id
        ),

        CONSTRAINT
            CK_scheduler_generation_state_singleton
        CHECK
        (
            scheduler_generation_state_id = 1
        ),

        CONSTRAINT
            CK_scheduler_generation_state_generation
        CHECK
        (
            current_generation >= 1
        )
    );
END;


IF NOT EXISTS
(
    SELECT
        1
    FROM dbo.scheduler_generation_state
    WHERE
        scheduler_generation_state_id = 1
)
BEGIN
    INSERT INTO
        dbo.scheduler_generation_state
    (
        scheduler_generation_state_id,
        current_generation
    )
    VALUES
    (
        1,
        1
    );
END;
