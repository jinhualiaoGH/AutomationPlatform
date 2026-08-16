IF OBJECT_ID(
    N'dbo.scheduler_recovery_command_audit',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE dbo.scheduler_recovery_command_audit
    (
        recovery_audit_id
            BIGINT
            IDENTITY(1, 1)
            NOT NULL,

        public_id
            UNIQUEIDENTIFIER
            NOT NULL
            CONSTRAINT
                DF_scheduler_recovery_command_audit_public_id
            DEFAULT NEWSEQUENTIALID(),

        command
            NVARCHAR(16)
            NOT NULL,

        request_key
            NVARCHAR(128)
            NULL,

        audit_status
            NVARCHAR(16)
            NOT NULL,

        disposition
            NVARCHAR(16)
            NULL,

        previous_state
            NVARCHAR(16)
            NULL,

        current_state
            NVARCHAR(16)
            NULL,

        previous_generation
            BIGINT
            NULL,

        current_generation
            BIGINT
            NULL,

        changed
            BIT
            NULL,

        reason
            NVARCHAR(1000)
            NULL,

        error_message
            NVARCHAR(2000)
            NULL,

        created_at_utc
            DATETIME2(7)
            NOT NULL
            CONSTRAINT
                DF_scheduler_recovery_command_audit_created_at
            DEFAULT SYSUTCDATETIME(),

        completed_at_utc
            DATETIME2(7)
            NULL,

        CONSTRAINT
            PK_scheduler_recovery_command_audit
        PRIMARY KEY
        (
            recovery_audit_id
        ),

        CONSTRAINT
            UQ_scheduler_recovery_command_audit_public_id
        UNIQUE
        (
            public_id
        ),

        CONSTRAINT
            CK_scheduler_recovery_command_audit_command
        CHECK
        (
            command IN
            (
                N'start',
                N'stop',
                N'restart'
            )
        ),

        CONSTRAINT
            CK_scheduler_recovery_command_audit_status
        CHECK
        (
            audit_status IN
            (
                N'pending',
                N'completed',
                N'failed'
            )
        ),

        CONSTRAINT
            CK_scheduler_recovery_command_audit_disposition
        CHECK
        (
            disposition IS NULL
            OR disposition IN
            (
                N'executed',
                N'noop',
                N'rejected'
            )
        ),

        CONSTRAINT
            CK_scheduler_recovery_command_audit_generation_pair
        CHECK
        (
            (
                previous_generation IS NULL
                AND current_generation IS NULL
            )
            OR
            (
                previous_generation IS NOT NULL
                AND current_generation IS NOT NULL
                AND previous_generation >= 1
                AND current_generation >= 1
            )
        )
    );

    CREATE INDEX
        IX_scheduler_recovery_command_audit_created_at
    ON
        dbo.scheduler_recovery_command_audit
    (
        recovery_audit_id DESC
    );

    CREATE INDEX
        IX_scheduler_recovery_command_audit_request_key
    ON
        dbo.scheduler_recovery_command_audit
    (
        request_key
    )
    WHERE
        request_key IS NOT NULL;
END;
