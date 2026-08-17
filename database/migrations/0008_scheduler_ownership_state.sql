IF OBJECT_ID(
    N'dbo.scheduler_ownership_state',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE dbo.scheduler_ownership_state
    (
        scheduler_ownership_state_id
            tinyint
            NOT NULL,

        current_generation
            bigint
            NOT NULL,

        fencing_token
            bigint
            NOT NULL,

        owner_id
            nvarchar(200)
            NULL,

        lease_expires_at_epoch_ms
            bigint
            NULL,

        row_version
            rowversion
            NOT NULL,

        CONSTRAINT
            PK_scheduler_ownership_state
        PRIMARY KEY
        (
            scheduler_ownership_state_id
        ),

        CONSTRAINT
            CK_scheduler_ownership_state_singleton
        CHECK
        (
            scheduler_ownership_state_id = 1
        ),

        CONSTRAINT
            CK_scheduler_ownership_state_generation
        CHECK
        (
            current_generation >= 1
        ),

        CONSTRAINT
            CK_scheduler_ownership_state_fencing
        CHECK
        (
            fencing_token >= 0
        ),

        CONSTRAINT
            CK_scheduler_ownership_state_owner_pair
        CHECK
        (
            (
                owner_id IS NULL
                AND
                lease_expires_at_epoch_ms IS NULL
            )
            OR
            (
                owner_id IS NOT NULL
                AND
                LEN(LTRIM(RTRIM(owner_id))) > 0
                AND
                lease_expires_at_epoch_ms IS NOT NULL
                AND
                lease_expires_at_epoch_ms >= 1
                AND
                fencing_token >= 1
            )
        )
    );


    INSERT INTO
        dbo.scheduler_ownership_state
    (
        scheduler_ownership_state_id,
        current_generation,
        fencing_token,
        owner_id,
        lease_expires_at_epoch_ms
    )
    VALUES
    (
        1,
        1,
        0,
        NULL,
        NULL
    );
END;
