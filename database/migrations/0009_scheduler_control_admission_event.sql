CREATE TABLE dbo.scheduler_control_admission_event
(
    admission_event_id
        BIGINT
        IDENTITY(1, 1)
        NOT NULL,

    sequence
        BIGINT
        NOT NULL,

    observed_at_utc
        DATETIME2(3)
        NOT NULL,

    disposition
        NVARCHAR(16)
        NOT NULL,

    command
        NVARCHAR(16)
        NOT NULL,

    reason
        NVARCHAR(64)
        NULL,

    CONSTRAINT PK_scheduler_control_admission_event
        PRIMARY KEY CLUSTERED
        (
            admission_event_id
        ),

    CONSTRAINT UQ_scheduler_control_admission_event_sequence
        UNIQUE
        (
            sequence
        ),

    CONSTRAINT CK_scheduler_control_admission_event_sequence
        CHECK
        (
            sequence > 0
        ),

    CONSTRAINT CK_scheduler_control_admission_event_disposition
        CHECK
        (
            disposition IN
            (
                N'admitted',
                N'denied'
            )
        ),

    CONSTRAINT CK_scheduler_control_admission_event_command
        CHECK
        (
            command IN
            (
                N'start',
                N'stop',
                N'restart'
            )
        ),

    CONSTRAINT CK_scheduler_control_admission_event_reason
        CHECK
        (
            (
                disposition = N'admitted'
                AND reason IS NULL
            )
            OR
            (
                disposition = N'denied'
                AND reason IN
                (
                    N'scheduler_standby',
                    N'scheduler_fail_closed',
                    N'scheduler_stopped'
                )
            )
        )
);


CREATE INDEX IX_scheduler_control_admission_event_observed
ON dbo.scheduler_control_admission_event
(
    observed_at_utc,
    sequence
);
