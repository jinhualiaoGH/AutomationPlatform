CREATE TABLE dbo.automation_definition
(
    automation_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    public_id UNIQUEIDENTIFIER
        NOT NULL
        CONSTRAINT DF_automation_definition_public_id
        DEFAULT NEWSEQUENTIALID(),

    name NVARCHAR(200)
        NOT NULL,

    description NVARCHAR(1000)
        NULL,

    status NVARCHAR(20)
        NOT NULL
        CONSTRAINT DF_automation_definition_status
        DEFAULT N'draft',

    created_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_definition_created_at_utc
        DEFAULT SYSUTCDATETIME(),

    updated_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_definition_updated_at_utc
        DEFAULT SYSUTCDATETIME(),

    row_version ROWVERSION
        NOT NULL,

    CONSTRAINT PK_automation_definition
        PRIMARY KEY (automation_id),

    CONSTRAINT UQ_automation_definition_public_id
        UNIQUE (public_id),

    CONSTRAINT CK_automation_definition_name
        CHECK (LEN(LTRIM(RTRIM(name))) > 0),

    CONSTRAINT CK_automation_definition_status
        CHECK (
            status IN
            (
                N'draft',
                N'active',
                N'paused',
                N'archived'
            )
        )
);


CREATE TABLE dbo.automation_trigger
(
    trigger_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    public_id UNIQUEIDENTIFIER
        NOT NULL
        CONSTRAINT DF_automation_trigger_public_id
        DEFAULT NEWSEQUENTIALID(),

    automation_id BIGINT
        NOT NULL,

    trigger_type NVARCHAR(50)
        NOT NULL,

    configuration_json NVARCHAR(MAX)
        NOT NULL
        CONSTRAINT DF_automation_trigger_configuration_json
        DEFAULT N'{}',

    is_enabled BIT
        NOT NULL
        CONSTRAINT DF_automation_trigger_is_enabled
        DEFAULT 1,

    created_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_trigger_created_at_utc
        DEFAULT SYSUTCDATETIME(),

    updated_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_trigger_updated_at_utc
        DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_automation_trigger
        PRIMARY KEY (trigger_id),

    CONSTRAINT UQ_automation_trigger_public_id
        UNIQUE (public_id),

    CONSTRAINT FK_automation_trigger_definition
        FOREIGN KEY (automation_id)
        REFERENCES dbo.automation_definition
        (
            automation_id
        ),

    CONSTRAINT CK_automation_trigger_type
        CHECK (
            LEN(
                LTRIM(
                    RTRIM(trigger_type)
                )
            ) > 0
        ),

    CONSTRAINT CK_automation_trigger_configuration_json
        CHECK (
            ISJSON(configuration_json) = 1
        )
);


CREATE TABLE dbo.automation_step
(
    step_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    public_id UNIQUEIDENTIFIER
        NOT NULL
        CONSTRAINT DF_automation_step_public_id
        DEFAULT NEWSEQUENTIALID(),

    automation_id BIGINT
        NOT NULL,

    step_order INT
        NOT NULL,

    step_type NVARCHAR(50)
        NOT NULL,

    name NVARCHAR(200)
        NOT NULL,

    configuration_json NVARCHAR(MAX)
        NOT NULL
        CONSTRAINT DF_automation_step_configuration_json
        DEFAULT N'{}',

    timeout_seconds INT
        NULL,

    created_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_step_created_at_utc
        DEFAULT SYSUTCDATETIME(),

    updated_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_step_updated_at_utc
        DEFAULT SYSUTCDATETIME(),

    CONSTRAINT PK_automation_step
        PRIMARY KEY (step_id),

    CONSTRAINT UQ_automation_step_public_id
        UNIQUE (public_id),

    CONSTRAINT UQ_automation_step_order
        UNIQUE
        (
            automation_id,
            step_order
        ),

    CONSTRAINT FK_automation_step_definition
        FOREIGN KEY (automation_id)
        REFERENCES dbo.automation_definition
        (
            automation_id
        ),

    CONSTRAINT CK_automation_step_order
        CHECK (step_order > 0),

    CONSTRAINT CK_automation_step_type
        CHECK (
            LEN(
                LTRIM(
                    RTRIM(step_type)
                )
            ) > 0
        ),

    CONSTRAINT CK_automation_step_name
        CHECK (
            LEN(
                LTRIM(
                    RTRIM(name)
                )
            ) > 0
        ),

    CONSTRAINT CK_automation_step_configuration_json
        CHECK (
            ISJSON(configuration_json) = 1
        ),

    CONSTRAINT CK_automation_step_timeout
        CHECK (
            timeout_seconds IS NULL
            OR timeout_seconds > 0
        )
);


CREATE TABLE dbo.automation_execution
(
    execution_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    public_id UNIQUEIDENTIFIER
        NOT NULL
        CONSTRAINT DF_automation_execution_public_id
        DEFAULT NEWSEQUENTIALID(),

    automation_id BIGINT
        NOT NULL,

    trigger_id BIGINT
        NULL,

    status NVARCHAR(20)
        NOT NULL
        CONSTRAINT DF_automation_execution_status
        DEFAULT N'pending',

    requested_at_utc DATETIME2(7)
        NOT NULL
        CONSTRAINT DF_automation_execution_requested_at_utc
        DEFAULT SYSUTCDATETIME(),

    started_at_utc DATETIME2(7)
        NULL,

    completed_at_utc DATETIME2(7)
        NULL,

    input_json NVARCHAR(MAX)
        NULL,

    output_json NVARCHAR(MAX)
        NULL,

    error_message NVARCHAR(4000)
        NULL,

    row_version ROWVERSION
        NOT NULL,

    CONSTRAINT PK_automation_execution
        PRIMARY KEY (execution_id),

    CONSTRAINT UQ_automation_execution_public_id
        UNIQUE (public_id),

    CONSTRAINT FK_automation_execution_definition
        FOREIGN KEY (automation_id)
        REFERENCES dbo.automation_definition
        (
            automation_id
        ),

    CONSTRAINT FK_automation_execution_trigger
        FOREIGN KEY (trigger_id)
        REFERENCES dbo.automation_trigger
        (
            trigger_id
        ),

    CONSTRAINT CK_automation_execution_status
        CHECK (
            status IN
            (
                N'pending',
                N'running',
                N'succeeded',
                N'failed',
                N'cancelled'
            )
        ),

    CONSTRAINT CK_automation_execution_input_json
        CHECK (
            input_json IS NULL
            OR ISJSON(input_json) = 1
        ),

    CONSTRAINT CK_automation_execution_output_json
        CHECK (
            output_json IS NULL
            OR ISJSON(output_json) = 1
        ),

    CONSTRAINT CK_automation_execution_time_order
        CHECK (
            completed_at_utc IS NULL
            OR started_at_utc IS NULL
            OR completed_at_utc >= started_at_utc
        )
);


CREATE TABLE dbo.automation_step_execution
(
    step_execution_id BIGINT
        IDENTITY(1,1)
        NOT NULL,

    public_id UNIQUEIDENTIFIER
        NOT NULL
        CONSTRAINT DF_automation_step_execution_public_id
        DEFAULT NEWSEQUENTIALID(),

    execution_id BIGINT
        NOT NULL,

    step_id BIGINT
        NOT NULL,

    attempt_number INT
        NOT NULL
        CONSTRAINT DF_automation_step_execution_attempt
        DEFAULT 1,

    status NVARCHAR(20)
        NOT NULL
        CONSTRAINT DF_automation_step_execution_status
        DEFAULT N'pending',

    started_at_utc DATETIME2(7)
        NULL,

    completed_at_utc DATETIME2(7)
        NULL,

    input_json NVARCHAR(MAX)
        NULL,

    output_json NVARCHAR(MAX)
        NULL,

    error_message NVARCHAR(4000)
        NULL,

    CONSTRAINT PK_automation_step_execution
        PRIMARY KEY (step_execution_id),

    CONSTRAINT UQ_automation_step_execution_public_id
        UNIQUE (public_id),

    CONSTRAINT UQ_automation_step_execution_attempt
        UNIQUE
        (
            execution_id,
            step_id,
            attempt_number
        ),

    CONSTRAINT FK_automation_step_execution_execution
        FOREIGN KEY (execution_id)
        REFERENCES dbo.automation_execution
        (
            execution_id
        ),

    CONSTRAINT FK_automation_step_execution_step
        FOREIGN KEY (step_id)
        REFERENCES dbo.automation_step
        (
            step_id
        ),

    CONSTRAINT CK_automation_step_execution_attempt
        CHECK (attempt_number > 0),

    CONSTRAINT CK_automation_step_execution_status
        CHECK (
            status IN
            (
                N'pending',
                N'running',
                N'succeeded',
                N'failed',
                N'cancelled'
            )
        ),

    CONSTRAINT CK_automation_step_execution_input_json
        CHECK (
            input_json IS NULL
            OR ISJSON(input_json) = 1
        ),

    CONSTRAINT CK_automation_step_execution_output_json
        CHECK (
            output_json IS NULL
            OR ISJSON(output_json) = 1
        ),

    CONSTRAINT CK_automation_step_execution_time_order
        CHECK (
            completed_at_utc IS NULL
            OR started_at_utc IS NULL
            OR completed_at_utc >= started_at_utc
        )
);


CREATE INDEX IX_automation_definition_status
ON dbo.automation_definition
(
    status
);


CREATE INDEX IX_automation_trigger_automation
ON dbo.automation_trigger
(
    automation_id,
    is_enabled
);


CREATE INDEX IX_automation_step_automation
ON dbo.automation_step
(
    automation_id,
    step_order
);


CREATE INDEX IX_automation_execution_automation_requested
ON dbo.automation_execution
(
    automation_id,
    requested_at_utc DESC
);


CREATE INDEX IX_automation_execution_status
ON dbo.automation_execution
(
    status,
    requested_at_utc
);


CREATE INDEX IX_automation_step_execution_execution
ON dbo.automation_step_execution
(
    execution_id,
    status
);