IF OBJECT_ID(
    N'dbo.scheduler_control_command_audit',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE dbo.scheduler_control_command_audit
    (
        audit_id
            bigint
            IDENTITY(1, 1)
            NOT NULL,

        public_id
            uniqueidentifier
            NOT NULL
            CONSTRAINT DF_scheduler_control_command_audit_public_id
            DEFAULT NEWSEQUENTIALID(),

        request_key
            nvarchar(128)
            NULL,

        command
            nvarchar(16)
            NOT NULL,

        audit_status
            nvarchar(16)
            NOT NULL,

        disposition
            nvarchar(16)
            NULL,

        previous_state
            nvarchar(16)
            NULL,

        current_state
            nvarchar(16)
            NULL,

        changed
            bit
            NULL,

        reason
            nvarchar(1000)
            NULL,

        error_message
            nvarchar(2000)
            NULL,

        created_at_utc
            datetime2(7)
            NOT NULL
            CONSTRAINT DF_scheduler_control_command_audit_created_at
            DEFAULT SYSUTCDATETIME(),

        completed_at_utc
            datetime2(7)
            NULL,

        row_version
            rowversion
            NOT NULL,

        CONSTRAINT PK_scheduler_control_command_audit
            PRIMARY KEY CLUSTERED
            (
                audit_id
            ),

        CONSTRAINT UQ_scheduler_control_command_audit_public_id
            UNIQUE
            (
                public_id
            ),

        CONSTRAINT CK_scheduler_control_command_audit_command
            CHECK
            (
                command IN
                (
                    N'start',
                    N'stop'
                )
            ),

        CONSTRAINT CK_scheduler_control_command_audit_status
            CHECK
            (
                audit_status IN
                (
                    N'pending',
                    N'completed',
                    N'failed'
                )
            ),

        CONSTRAINT CK_scheduler_control_command_audit_disposition
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

        CONSTRAINT CK_scheduler_control_command_audit_previous_state
            CHECK
            (
                previous_state IS NULL
                OR previous_state IN
                (
                    N'idle',
                    N'running',
                    N'stopped',
                    N'failed'
                )
            ),

        CONSTRAINT CK_scheduler_control_command_audit_current_state
            CHECK
            (
                current_state IS NULL
                OR current_state IN
                (
                    N'idle',
                    N'running',
                    N'stopped',
                    N'failed'
                )
            )
    );
END;

IF NOT EXISTS
(
    SELECT
        1
    FROM sys.indexes
    WHERE
        object_id =
            OBJECT_ID(
                N'dbo.scheduler_control_command_audit'
            )
        AND name =
            N'IX_scheduler_control_command_audit_created_at'
)
BEGIN
    CREATE INDEX
        IX_scheduler_control_command_audit_created_at
    ON
        dbo.scheduler_control_command_audit
        (
            created_at_utc DESC,
            audit_id DESC
        );
END;

IF NOT EXISTS
(
    SELECT
        1
    FROM sys.indexes
    WHERE
        object_id =
            OBJECT_ID(
                N'dbo.scheduler_control_command_audit'
            )
        AND name =
            N'IX_scheduler_control_command_audit_request_key'
)
BEGIN
    CREATE INDEX
        IX_scheduler_control_command_audit_request_key
    ON
        dbo.scheduler_control_command_audit
        (
            request_key
        )
    WHERE
        request_key IS NOT NULL;
END;
