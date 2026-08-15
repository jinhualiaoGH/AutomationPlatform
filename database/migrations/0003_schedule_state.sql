CREATE TABLE dbo.automation_schedule_state
(
    schedule_state_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    trigger_id BIGINT
        NOT NULL,

    next_fire_at_utc DATETIME2(7)
        NOT NULL,

    last_evaluated_at_utc DATETIME2(7)
        NULL,

    created_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_schedule_state_created_at_utc
        DEFAULT SYSUTCDATETIME(),

    updated_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_schedule_state_updated_at_utc
        DEFAULT SYSUTCDATETIME(),

    row_version ROWVERSION
        NOT NULL,

    CONSTRAINT PK_automation_schedule_state
        PRIMARY KEY (schedule_state_id),

    CONSTRAINT UQ_automation_schedule_state_trigger
        UNIQUE (trigger_id),

    CONSTRAINT FK_automation_schedule_state_trigger
        FOREIGN KEY (trigger_id)
        REFERENCES dbo.automation_trigger
        (
            trigger_id
        ),

    CONSTRAINT CK_automation_schedule_state_time_order
        CHECK
        (
            last_evaluated_at_utc IS NULL
            OR next_fire_at_utc > last_evaluated_at_utc
        )
);


CREATE INDEX IX_automation_schedule_state_due
ON dbo.automation_schedule_state
(
    next_fire_at_utc,
    trigger_id
);
