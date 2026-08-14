IF OBJECT_ID(N'dbo.schema_migration', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.schema_migration
    (
        version         INT            NOT NULL,
        name            NVARCHAR(200)  NOT NULL,
        checksum        CHAR(64)       NOT NULL,
        applied_at_utc  DATETIME2(7)   NOT NULL
            CONSTRAINT DF_schema_migration_applied_at_utc
            DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_schema_migration
            PRIMARY KEY (version),

        CONSTRAINT UQ_schema_migration_name
            UNIQUE (name)
    );
END;
