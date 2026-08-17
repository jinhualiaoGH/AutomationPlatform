IF OBJECT_ID(
    N'dbo.scheduler_recovery_coordination_audit',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE dbo.scheduler_recovery_coordination_audit
    (
        scheduler_recovery_coordination_audit_id
            BIGINT
            IDENTITY(1, 1)
            NOT NULL,

        public_id
            UNIQUEIDENTIFIER
            NOT NULL
            CONSTRAINT DF_scheduler_recovery_coordination_audit_public_id
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

        result_kind
            NVARCHAR(16)
            NULL,

        disposition
            NVARCHAR(16)
            NULL,

        previous_state
            NVARCHAR(32)
            NULL,

        current_state
            NVARCHAR(32)
            NULL,

        previous_generation
            BIGINT
            NULL,

        current_generation
            BIGINT
            NULL,

        attempted_generation
            BIGINT
            NULL,

        observed_generation
            BIGINT
            NULL,

        changed
            BIT
            NULL,

        reason
            NVARCHAR(1024)
            NULL,

        error_message
            NVARCHAR(2048)
            NULL,

        created_at_utc
            DATETIME2(7)
            NOT NULL
            CONSTRAINT DF_scheduler_recovery_coordination_audit_created_at
            DEFAULT SYSUTCDATETIME(),

        completed_at_utc
            DATETIME2(7)
            NULL,

        CONSTRAINT PK_scheduler_recovery_coordination_audit
            PRIMARY KEY
            (
                scheduler_recovery_coordination_audit_id
            ),

        CONSTRAINT UQ_scheduler_recovery_coordination_audit_public_id
            UNIQUE
            (
                public_id
            ),

        CONSTRAINT CK_scheduler_recovery_coordination_audit_command
            CHECK
            (
                command IN
                (
                    N'start',
                    N'stop',
                    N'restart'
                )
            ),

        CONSTRAINT CK_scheduler_recovery_coordination_audit_status
            CHECK
            (
                audit_status IN
                (
                    N'pending',
                    N'completed',
                    N'failed'
                )
            ),

        CONSTRAINT CK_scheduler_recovery_coordination_audit_result_kind
            CHECK
            (
                result_kind IS NULL
                OR result_kind IN
                (
                    N'control',
                    N'rejected',
                    N'restarted',
                    N'superseded'
                )
            ),

        CONSTRAINT CK_scheduler_recovery_coordination_audit_time_order
            CHECK
            (
                completed_at_utc IS NULL
                OR completed_at_utc >= created_at_utc
            )
    );


    CREATE INDEX IX_scheduler_recovery_coordination_audit_created
    ON dbo.scheduler_recovery_coordination_audit
    (
        created_at_utc DESC
    );


    CREATE INDEX IX_scheduler_recovery_coordination_audit_request_key
    ON dbo.scheduler_recovery_coordination_audit
    (
        request_key,
        created_at_utc DESC
    )
    WHERE request_key IS NOT NULL;
END;
