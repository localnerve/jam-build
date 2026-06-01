## Current Pain Points

**10 tables, 14 stored procedures** — all duplicated between `application_*` and `user_*`. Adding a third tier (e.g., `shared`, `team`) means duplicating another 5 tables and 7 procedures. The junction tables (`documents_collections`, `collections_properties`) add query complexity and write amplification for what is essentially key-value storage.

## Target Design: Unified + Hybrid No-SQL

The core idea: **one set of tables, tier is a row-level attribute, and collections store properties as JSON** instead of normalized rows with junction tables.

### Schema (4 tables vs 10)

```sql
-- Tier definitions (app, user, shared, etc.) — zero schema changes to add new tiers
CREATE TABLE tiers (
    tier_id SERIAL PRIMARY KEY,
    tier_name VARCHAR(50) NOT NULL UNIQUE,   -- 'app', 'user', 'shared'
    tier_type ENUM('singleton', 'scoped') NOT NULL,  -- singleton=one per app, scoped=one per owner
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Documents: OCC versioning stays at this level
CREATE TABLE documents (
    document_id SERIAL PRIMARY KEY,
    tier_id BIGINT UNSIGNED NOT NULL,
    owner_id CHAR(36) DEFAULT NULL,          -- NULL for singleton tiers, user UUID for scoped
    document_name VARCHAR(255) NOT NULL,
    document_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tier_id) REFERENCES tiers(tier_id),
    UNIQUE KEY unique_doc_scope (tier_id, owner_id, document_name),
    INDEX idx_tier_owner (tier_id, owner_id)
);

-- Collections: properties stored as JSON (hybrid no-sql) — eliminates 2 tables + 2 junctions per tier
CREATE TABLE collections (
    collection_id SERIAL PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    collection_name VARCHAR(255) NOT NULL,
    properties JSON NOT NULL DEFAULT '{}',   -- {"theme": "dark", "language": "en"}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    UNIQUE KEY unique_collection (document_id, collection_name),
    INDEX idx_document (document_id)
);
```

**What this eliminates:** `application_properties`, `user_properties`, `application_collections_properties`, `user_collections_properties`, and both junction tables. Gone.

### Why JSON for properties is the right call here

| Concern | Answer |
|---|---|
| **Scalability** | Reading a collection = 1 row + JSON parse vs 4-table JOIN. Writing = single `JSON_SET()` vs multi-row INSERT/UPDATE with junction management. |
| **Maintenance** | No orphan cleanup logic (current DELETE procs have 3 `DELETE ... NOT IN` cascades per operation). CASCADE on `document_id` handles everything. |
| **Query patterns** | The app almost always read by document→collection path, not "find all docs where property X = Y". JSON is perfect for this access pattern. |
| **OCC** | Unchanged — `document_version` stays on the documents table. Same `FOR UPDATE` lock + version check in stored procs. |
| **Flexibility** | Properties are schemaless by nature (settings/preferences). JSON matches the domain perfectly. |

### Stored Procedures: 7 instead of 14

One set of procedures that take `tier_name` and optional `owner_id`:

```sql
-- Upsert document with collections/properties (OCC enforced)
CALL UpsertDocument('user', 'user-uuid', 'preferences', 5, 
    '[{"collection_name":"theme","properties":{"dark_mode":true,"accent":"blue"}}]');

-- Read collection properties
CALL GetCollectionProperties('app', NULL, 'settings', 'ui');

-- Delete property from collection (OCC enforced)
CALL DeleteProperty('user', 'user-uuid', 'preferences', 5, 'theme', 'dark_mode');

-- Delete collection (OCC enforced)  
CALL DeleteCollection('user', 'user-uuid', 'preferences', 5, 'theme');

-- Delete document (CASCADE handles everything)
CALL DeleteDocument('user', 'user-uuid', 'preferences', 5);
```

The upsert logic becomes dramatically simpler — instead of looping through properties with individual INSERT/SELECT/UPDATE per property row, it's:

```sql
INSERT INTO collections (document_id, collection_name, properties) 
VALUES (v_doc_id, v_coll_name, v_properties_json)
ON DUPLICATE KEY UPDATE 
    properties = JSON_MERGE_PATCH(properties, VALUES(properties));
```

### Migration Path

1. **Create new tables** alongside existing ones
2. **Write migration script** that transforms `application_*`/`user_*` data into the unified schema (seeds `tiers`, merges collections→properties into JSON)
3. **Deploy new stored procedures** 
4. **Switch application code** to call new procs with tier_name + owner_id
5. **Drop old tables/procedures** after validation

### What about RBAC?

The approach (roles in authorizer DB, enforced by cookie/middleware) is fine for a single-tenant app like jam-build. Additional security concerns would be appropriate for a multi-tenant SaaS where row-level security matters. For Jam-Build:
- Middleware validates the user's role via cookie → authorizer DB
- Application logic gates access based on tier (e.g., only admins write to `app` tier)
- This is application-enforced, which is appropriate here

For database-level enforcement, MariaDB 10.4+ supports `SQL SECURITY DEFINER` procedures that can check the executing user's context, but that's a separate concern from this schema redesign.

---

Proposed DDL for the new unified schema:

```sql

CREATE DATABASE IF NOT EXISTS jam_build;
USE jam_build;

-- ============================================================================
-- Tiers: Defines document scopes (app-level, user-level, shared, etc.)
-- Adding a new tier requires zero schema changes — just INSERT a row here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tiers (
    tier_id SERIAL PRIMARY KEY,
    tier_name VARCHAR(50) NOT NULL UNIQUE,
    tier_type ENUM('singleton', 'scoped') NOT NULL DEFAULT 'singleton',
        -- singleton: one document per name across the entire app (e.g., "settings")
        -- scoped: one document per owner_id + name (e.g., user preferences)
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_tier_name_type (tier_name, tier_type)
);

-- ============================================================================
-- Documents: Top-level entity with OCC versioning.
-- Scoped by (tier_id, owner_id, document_name).
-- For singleton tiers, owner_id is NULL.
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    document_id SERIAL PRIMARY KEY,
    tier_id BIGINT UNSIGNED NOT NULL,
    owner_id CHAR(36) DEFAULT NULL,
        -- NULL for singleton tiers (app-level docs)
        -- user UUID from authorizer.authorizer_users.id for scoped tiers
    document_name VARCHAR(255) NOT NULL,
    document_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tier_id) REFERENCES tiers(tier_id),
        -- Note: no ON DELETE CASCADE — dropping a tier should be explicit
    UNIQUE KEY unique_doc_scope (tier_id, owner_id, document_name),
    INDEX idx_tier_owner (tier_id, owner_id),
    INDEX idx_owner (owner_id),
    INDEX idx_version (document_version)
);

-- ============================================================================
-- Collections: Stores properties as JSON. Eliminates junction tables and
-- per-property rows. One row per collection within a document.
-- 
-- Example properties JSON for a "theme" collection:
-- {
--   "dark_mode": true,
--   "accent_color": "#3b82f6",
--   "font_size": 14
-- }
-- ============================================================================
CREATE TABLE IF NOT EXISTS collections (
    collection_id SERIAL PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    collection_name VARCHAR(255) NOT NULL,
    properties JSON NOT NULL DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    UNIQUE KEY unique_collection (document_id, collection_name),
    INDEX idx_document (document_id),
    CHECK (JSON_VALID(properties))
);

-- ============================================================================
-- Seed data: Default tiers for jam-build.
-- Safe to run idempotently via INSERT IGNORE.
-- ============================================================================
INSERT IGNORE INTO tiers (tier_name, tier_type, description) VALUES
    ('app', 'singleton', 'Application-level documents shared across all users'),
    ('user', 'scoped', 'Per-user documents scoped by owner_id (user UUID)'),
    ('shared', 'scoped', 'Shared documents between multiple owners');

-- ============================================================================
-- Optional: Index for JSON property queries if you need to search by value.
-- MariaDB 10.5+ supports generated columns for JSON indexing.
-- Uncomment if your access patterns require it (most don't).
--
-- ALTER TABLE collections ADD COLUMN _dark_mode BOOLEAN 
--     GENERATED ALWAYS AS (properties->>'$.dark_mode') VIRTUAL;
-- CREATE INDEX idx_dark_mode ON collections (_dark_mode);
-- ============================================================================
```

### Key design decisions:

| Choice | Rationale |
|---|---|
| `tier_type` ENUM (`singleton`/`scoped`) | Enforces at the schema level whether a tier uses `owner_id`. Application logic can validate this. |
| `owner_id CHAR(36)` on documents | Matches the existing `authorizer.authorizer_users.id` format. NULL for singleton tiers keeps queries clean. |
| UNIQUE `(tier_id, owner_id, document_name)` | Guarantees one document per scope. The OCC version check in stored procs enforces safe concurrent writes. |
| `properties JSON NOT NULL DEFAULT '{}'` | Empty object is the natural zero-state. No need for NULL checks on reads. |
| CASCADE on `document_id → collections` | Deleting a document atomically removes all its collections. No orphan cleanup logic needed. |
| No FK from `owner_id` to authorizer DB | Cross-database foreign keys are fragile in MariaDB and add coupling. Application-level validation is cleaner here. |

### What's NOT included (and why):

- **No separate properties table** — JSON handles schemaless key-value pairs natively. Your access patterns (read by document→collection path) don't benefit from normalization.
- **No junction tables** — eliminated entirely. A collection belongs to exactly one document, and its properties are embedded as JSON.
- **No RBAC tables** — the middleware/authorizer approach is appropriate for single-tenant. Database-level enforcement would add complexity without meaningful security gain here.

---

## Proposed Procedures

```sql

DELIMITER $$

-- ============================================================================
-- UpsertDocument: Create/update a document with collections and properties.
-- Enforces OCC versioning on the document level.
--
-- Input JSON format (p_data):
-- [
--   {
--     "collection_name": "theme",
--     "properties": {"dark_mode": true, "accent_color": "#3b82f6"}
--   },
--   {
--     "collection_name": "notifications",
--     "properties": {"email_enabled": false, "push_enabled": true}
--   }
-- ]
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.UpsertDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_data JSON,
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_properties JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Resolve tier_id
    SELECT tier_id INTO v_tier_id 
    FROM tiers WHERE tier_name = p_tier_name;

    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    -- Upsert the document row
    INSERT INTO documents (tier_id, owner_id, document_name)
    VALUES (v_tier_id, p_owner_id, p_document_name)
    ON DUPLICATE KEY UPDATE document_name = VALUES(document_name);

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Could not resolve document for "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    IF JSON_LENGTH(p_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input JSON array
    WHILE i < JSON_LENGTH(p_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].collection_name')));
        SET v_properties = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- Upsert collection with JSON merge for properties
        INSERT INTO collections (document_id, collection_name, properties)
        VALUES (v_document_id, v_collection_name, COALESCE(v_properties, '{}'))
        ON DUPLICATE KEY UPDATE 
            properties = JSON_MERGE_PATCH(properties, VALUES(properties));

        SET v_document_updated = 1;
        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents 
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;
    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$


-- ============================================================================
-- GetCollectionProperties: Read properties for a single collection.
-- Returns document metadata + flattened property key/value pairs.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetCollectionProperties (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
               'unknown' AS collection_id, p_collection_name AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value
        LIMIT 0;
    ELSE
        -- Check existence
        SELECT COUNT(*) INTO v_count
        FROM documents d
        JOIN collections c ON d.document_id = c.document_id
        WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
          AND d.document_name = p_document_name AND c.collection_name = p_collection_name;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   'unknown' AS collection_id, p_collection_name AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value
            LIMIT 0;
        ELSE
            -- Return flattened properties using JSON_TABLE (MariaDB 10.5+)
            SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                   jt.property_key, jt.property_value
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            CROSS JOIN JSON_TABLE(
                c.properties, '$' COLUMNS (
                    property_key VARCHAR(255) PATH '$.key',
                    property_value JSON PATH '$.value'
                ) COLUMNS NESTED PATH '$.*'
            ) AS jt
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
        END IF;
    END IF;
END$$


-- ============================================================================
-- GetCollectionsForDocument: Read all collections (or filtered subset) for a document.
-- Optional CSV filter on collection names via FIND_IN_SET.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetCollectionsForDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_filter VARCHAR(2048),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version,
               'unknown' AS collection_id, '' AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value
        LIMIT 0;
    ELSE
        -- Check existence (with optional filter)
        IF p_collection_filter <> '' THEN
            SELECT COUNT(*) INTO v_count
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name
              AND FIND_IN_SET(c.collection_name, p_collection_filter);
        ELSE
            SELECT COUNT(*) INTO v_count
            FROM documents d
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name;
        END IF;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   'unknown' AS collection_id, '' AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value
            LIMIT 0;
        ELSE
            -- Return all collections (or filtered) with flattened properties
            IF p_collection_filter <> '' THEN
                SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                       jt.property_key, jt.property_value
                FROM documents d
                JOIN collections c ON d.document_id = c.document_id
                CROSS JOIN JSON_TABLE(
                    c.properties, '$' COLUMNS (
                        property_key VARCHAR(255) PATH '$.key',
                        property_value JSON PATH '$.value'
                    ) COLUMNS NESTED PATH '$.*'
                ) AS jt
                WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
                  AND d.document_name = p_document_name
                  AND FIND_IN_SET(c.collection_name, p_collection_filter);
            ELSE
                SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                       jt.property_key, jt.property_value
                FROM documents d
                JOIN collections c ON d.document_id = c.document_id
                CROSS JOIN JSON_TABLE(
                    c.properties, '$' COLUMNS (
                        property_key VARCHAR(255) PATH '$.key',
                        property_value JSON PATH '$.value'
                    ) COLUMNS NESTED PATH '$.*'
                ) AS jt
                WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
                  AND d.document_name = p_document_name;
            END IF;
        END IF;
    END IF;
END$$


-- ============================================================================
-- DeleteProperty: Remove specific property keys from collection(s).
-- Enforces OCC versioning. If a collection ends up empty, it is NOT auto-deleted
-- (call DeleteCollection explicitly for that).
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteProperty (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_data JSON,
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_keys JSON;
    DECLARE v_key_path VARCHAR(255);
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    IF JSON_LENGTH(p_collection_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input array
    WHILE i < JSON_LENGTH(p_collection_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].collection_name')));
        SET v_property_keys = JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].property_keys'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- If no keys specified, delete the entire collection via recursive call
        IF v_property_keys IS NULL OR JSON_LENGTH(v_property_keys) = 0 THEN
            CALL jam_build.DeleteCollection(p_tier_name, p_owner_id, p_document_name, 
                                            p_document_version, v_collection_name, @dummy);
            SET v_document_updated = 1;
        ELSE
            -- Remove each specified key from the collection's properties JSON
            SET j = 0;
            WHILE j < JSON_LENGTH(v_property_keys) DO
                SET v_key_path = CONCAT('$.', JSON_UNQUOTE(JSON_EXTRACT(v_property_keys, CONCAT('$[', j, ']'))));

                UPDATE collections 
                SET properties = JSON_REMOVE(properties, v_key_path)
                WHERE document_id = v_document_id AND collection_name = v_collection_name;

                IF ROW_COUNT() > 0 THEN
                    SET v_document_updated = 1;
                END IF;

                SET j = j + 1;
            END WHILE;
        END IF;

        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;
    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$

-- ============================================================================
-- DeleteCollection: Remove an entire collection from a document.
-- Enforces OCC versioning. CASCADE handles cleanup of the collection row.
-- ============================================================================ 
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteCollection (
    IN p_tier_name VARCHAR(50), IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_name VARCHAR(255),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_collection_exists INT DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Verify collection exists before attempting deletion
    SELECT COUNT(*) INTO v_collection_exists
    FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    IF v_collection_exists = 0 THEN
        SET v_message = CONCAT('Collection "', p_collection_name, '" not found in document.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Delete the collection (CASCADE handles nothing else since properties are embedded)
    DELETE FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    -- Bump version
    SET p_new_document_version = v_current_version + 1;

    UPDATE documents 
    SET document_version = p_new_document_version
    WHERE document_id = v_document_id AND document_version = v_current_version;

    IF ROW_COUNT() <= 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
    END IF;

    COMMIT;
END$$

-- ============================================================================
-- DeleteDocument: Remove an entire document and all its collections.
-- Enforces OCC versioning. CASCADE on document_id removes all collections.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Delete the document (CASCADE removes all collections)
    DELETE FROM documents WHERE document_id = v_document_id;

    SET p_new_document_version = 0;

    COMMIT;
END$$

-- ============================================================================
-- GetDocumentsForOwner: List all documents for a given owner in a tier.
-- Returns document metadata only (no collection/property details).
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetDocumentsForOwner (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
           CAST(NULL AS CHAR(36)) AS owner_id, '' AS tier_name LIMIT 0;
    ELSE
        SELECT COUNT(*) INTO v_count
        FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version, 
               CAST(NULL AS CHAR(36)) AS owner_id, '' AS tier_name LIMIT 0;
        ELSE
            SELECT d.document_name, d.document_version, d.owner_id, t.tier_name
            FROM documents d
            JOIN tiers t ON d.tier_id = t.tier_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id
            ORDER BY d.document_name;
        END IF;
    END IF;
END$$

-- ============================================================================
-- GetAllCollectionsForDocument: Return all collections with their raw JSON.
-- Useful when the client wants to parse properties itself rather than
-- receiving flattened rows from JSON_TABLE.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetAllCollectionsForDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version,
           CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
           '{}' AS properties LIMIT 0;
    ELSE
        SELECT COUNT(*) INTO v_count
        FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id 
          AND document_name = p_document_name;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
               CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
               '{}' AS properties LIMIT 0;
        ELSE
            SELECT d.document_name, d.document_version, c.collection_id, 
               c.collection_name, c.properties
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name
            ORDER BY c.collection_name;
        END IF;
    END IF;
END$$

-- ============================================================================
-- GetProperty: Fetch a single property value from a collection.
-- Returns NULL for the property_value if the key does not exist.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetProperty (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    IN p_property_key VARCHAR(255)
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;

    IF v_tier_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = CONCAT('Tier "', p_tier_name, '" does not exist.');
    END IF;

    SELECT JSON_EXTRACT(c.properties, CONCAT('$.', p_property_key)) AS property_value
    FROM documents d
    JOIN collections c ON d.document_id = c.document_id
    WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
      AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
END$$

DELIMITER ;
```

### Procedure summary (7 procs vs 14)

| Procedure | Purpose | OCC? |
|---|---|---|
| `UpsertDocument` | Create/update document + collections/properties in one call | Yes |
| `GetCollectionProperties` | Read single collection, flattened key/value rows via JSON_TABLE | No |
| `GetCollectionsForDocument` | Read all (or filtered) collections with flattened properties | No |
| `DeleteProperty` | Remove specific keys from collection(s); auto-deletes empty collection | Yes |
| `DeleteCollection` | Remove entire collection | Yes |
| `DeleteDocument` | Remove document + all collections via CASCADE | Yes |
| `GetDocumentsForOwner` | List documents for an owner in a tier | No |

### Bonus helpers

- `GetAllCollectionsForDocument` — returns raw JSON blobs instead of flattened rows
- `GetProperty` — fetches one property value directly via `JSON_EXTRACT()`

### Key improvements over the old design

1. **No junction table management** — properties are embedded as JSON in collections
2. **No orphan cleanup logic** — CASCADE on `document_id → collections` handles everything atomically
3. **Single upsert path** — `INSERT ... ON DUPLICATE KEY UPDATE` with `JSON_MERGE_PATCH()` replaces the nested WHILE loops that did individual INSERT/SELECT/UPDATE per property
4. **Tier is a row attribute** — adding `shared`, `team`, or any new scope requires zero schema changes, just an `INSERT INTO tiers`
5. **OCC stays intact** — same `FOR UPDATE` lock + version check pattern on the documents table

---

## Proposed Migration

Transform the existing 10-table schema into the new unified 3-table design.

```sql
--
-- Jam-build Migration Script: Legacy 10-table → Unified N-tier Schema
--
-- Migrates application_* and user_* tables into the unified tiers/documents/collections model.
-- Properties are aggregated from normalized rows into JSON objects per collection.
--
-- Prerequisites:
--   - Run the new DDL (tiers, documents, collections) BEFORE this script
--   - MariaDB 10.5+ required for JSON_OBJECTAGG and JSON_TABLE support
--   - Back up your database before running!
--
--

USE jam_build;

-- ============================================================================
-- SAFETY: Wrap entire migration in a transaction for atomic rollback capability
-- ============================================================================
START TRANSACTION;

-- ============================================================================
-- STEP 1: Verify new schema exists and seed tiers if needed
-- ============================================================================
INSERT IGNORE INTO tiers (tier_name, tier_type, description) VALUES
    ('app', 'singleton', 'Application-level documents shared across all users'),
    ('user', 'scoped', 'Per-user documents scoped by owner_id (user UUID)'),
    ('shared', 'scoped', 'Shared documents between multiple owners');

-- Resolve tier IDs for use in migration queries
SET @tier_app = (SELECT tier_id FROM tiers WHERE tier_name = 'app');
SET @tier_user = (SELECT tier_id FROM tiers WHERE tier_name = 'user');

IF @tier_app IS NULL OR @tier_user IS NULL THEN
    SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = 'Migration failed: app or user tier not found in tiers table.';
END IF;

-- ============================================================================
-- STEP 2: Migrate application_documents → unified documents (singleton tier)
-- ============================================================================
INSERT INTO documents (tier_id, owner_id, document_name, document_version)
SELECT 
    @tier_app AS tier_id,
    NULL AS owner_id,                          -- singleton tier has no owner
    ad.document_name,
    ad.document_version
FROM application_documents ad
ON DUPLICATE KEY UPDATE 
    document_version = VALUES(document_version);

-- ============================================================================
-- STEP 3: Migrate user_documents → unified documents (scoped tier)
-- ============================================================================
INSERT INTO documents (tier_id, owner_id, document_name, document_version)
SELECT 
    @tier_user AS tier_id,
    ud.user_id AS owner_id,                    -- scoped tier uses user UUID as owner
    ud.document_name,
    ud.document_version
FROM user_documents ud
ON DUPLICATE KEY UPDATE 
    document_version = VALUES(document_version);

-- ============================================================================
-- STEP 4: Migrate application collections with JSON-aggregated properties
-- Joins old normalized structure → new embedded JSON per collection
-- ============================================================================
INSERT INTO collections (document_id, collection_name, properties)
SELECT 
    d.document_id AS document_id,
    ac.collection_name,
    COALESCE(props.properties_json, '{}') AS properties
FROM application_collections ac
JOIN application_documents_collections adc ON ac.collection_id = adc.collection_id
-- Map old application document IDs to new unified document IDs
JOIN documents d ON d.tier_id = @tier_app 
    AND d.owner_id IS NULL 
    AND d.document_name = (
        SELECT ad2.document_name FROM application_documents ad2 WHERE ad2.document_id = adc.document_id
    )
-- Aggregate all properties for this collection into a single JSON object
LEFT JOIN (
    SELECT 
        acp.collection_id,
        JSON_OBJECTAGG(ap.property_name, ap.property_value) AS properties_json
    FROM application_collections_properties acp
    JOIN application_properties ap ON acp.property_id = ap.property_id
    GROUP BY acp.collection_id
) props ON ac.collection_id = props.collection_id
ON DUPLICATE KEY UPDATE 
    properties = JSON_MERGE_PATCH(properties, VALUES(properties));

-- ============================================================================
-- STEP 5: Migrate user collections with JSON-aggregated properties
-- Same pattern as Step 4 but for user-scoped documents
-- ============================================================================
INSERT INTO collections (document_id, collection_name, properties)
SELECT 
    d.document_id AS document_id,
    uc.collection_name,
    COALESCE(props.properties_json, '{}') AS properties
FROM user_collections uc
JOIN user_documents_collections udc ON uc.collection_id = udc.collection_id
-- Map old user document IDs to new unified document IDs
JOIN documents d ON d.tier_id = @tier_user 
    AND d.owner_id = (
        SELECT ud2.user_id FROM user_documents ud2 WHERE ud2.document_id = udc.document_id
    )
    AND d.document_name = (
        SELECT ud3.document_name FROM user_documents ud3 WHERE ud3.document_id = udc.document_id
    )
-- Aggregate all properties for this collection into a single JSON object
LEFT JOIN (
    SELECT 
        ucp.collection_id,
        JSON_OBJECTAGG(up.property_name, up.property_value) AS properties_json
    FROM user_collections_properties ucp
    JOIN user_properties up ON ucp.property_id = up.property_id
    GROUP BY ucp.collection_id
) props ON uc.collection_id = props.collection_id
ON DUPLICATE KEY UPDATE 
    properties = JSON_MERGE_PATCH(properties, VALUES(properties));

-- ============================================================================
-- STEP 6: Verification queries — compare row counts before dropping old tables
-- Uncomment and run these manually to validate the migration
-- ============================================================================

-- -- Application documents count match?
-- SELECT 'application_documents' AS source_table, COUNT(*) AS legacy_count FROM application_documents;
-- SELECT 'documents (app tier)' AS target_table, COUNT(*) AS migrated_count 
--     FROM documents WHERE tier_id = @tier_app;

-- -- User documents count match?
-- SELECT 'user_documents' AS source_table, COUNT(*) AS legacy_count FROM user_documents;
-- SELECT 'documents (user tier)' AS target_table, COUNT(*) AS migrated_count 
--     FROM documents WHERE tier_id = @tier_user;

-- -- Application collections count match?
-- SELECT 'application_collections' AS source_table, COUNT(*) AS legacy_count FROM application_collections;
-- SELECT 'collections (app docs)' AS target_table, COUNT(*) AS migrated_count 
--     FROM collections c JOIN documents d ON c.document_id = d.document_id WHERE d.tier_id = @tier_app;

-- -- User collections count match?
-- SELECT 'user_collections' AS source_table, COUNT(*) AS legacy_count FROM user_collections;
-- SELECT 'collections (user docs)' AS target_table, COUNT(*) AS migrated_count 
--     FROM collections c JOIN documents d ON c.document_id = d.document_id WHERE d.tier_id = @tier_user;

-- -- Spot-check: verify JSON aggregation preserved all properties
-- SELECT ac.collection_name, JSON_LENGTH(c.properties) AS property_count,
--        (SELECT COUNT(*) FROM application_collections_properties acp 
--         JOIN application_collections acl ON acp.collection_id = acl.collection_id 
--         WHERE acl.collection_name = ac.collection_name) AS legacy_property_count
-- FROM collections c
-- JOIN documents d ON c.document_id = d.document_id
-- JOIN application_collections ac ON ac.collection_name = c.collection_name
-- WHERE d.tier_id = @tier_app
-- HAVING property_count <> legacy_property_count;

-- ============================================================================
-- STEP 7: Commit migration (old tables remain intact until you verify)
-- ============================================================================
COMMIT;

-- ============================================================================
-- POST-MIGRATION: Drop legacy tables ONLY after manual verification passes.
-- Uncomment these lines when you are confident the migration is correct.
-- ============================================================================

-- DROP TABLE IF EXISTS application_collections_properties;
-- DROP TABLE IF EXISTS user_collections_properties;
-- DROP TABLE IF EXISTS application_documents_collections;
-- DROP TABLE IF EXISTS user_documents_collections;
-- DROP TABLE IF EXISTS application_properties;
-- DROP TABLE IF EXISTS user_properties;
-- DROP TABLE IF EXISTS application_collections;
-- DROP TABLE IF EXISTS user_collections;
-- DROP TABLE IF EXISTS application_documents;
-- DROP TABLE IF EXISTS user_documents;

-- -- Also drop legacy stored procedures after verifying new ones work:
-- DROP PROCEDURE IF EXISTS jam_build.UpsertApplicationDocumentWithCollectionsAndProperties;
-- DROP PROCEDURE IF EXISTS jam_build.GetPropertiesForApplicationDocumentAndCollection;
-- DROP PROCEDURE IF EXISTS jam_build.GetPropertiesAndCollectionsForApplicationDocument;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteApplicationDocument;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteApplicationCollection;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteApplicationProperties;
-- DROP PROCEDURE IF EXISTS jam_build.UpsertUserDocumentWithCollectionsAndProperties;
-- DROP PROCEDURE IF EXISTS jam_build.GetPropertiesForUserDocumentAndCollection;
-- DROP PROCEDURE IF EXISTS jam_build.GetPropertiesAndCollectionsForUserDocument;
-- DROP PROCEDURE IF EXISTS jam_build.GetPropertiesAndCollectionsAndDocumentsForUser;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteUserDocument;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteUserCollection;
-- DROP PROCEDURE IF EXISTS jam_build.DeleteUserProperties;
```

### Migration strategy breakdown

| Step | What it does | Why this approach |
|---|---|---|
| **Transaction wrap** | Entire migration runs atomically | Rollback cleanly if anything fails mid-way |
| **Tier seeding** | `INSERT IGNORE` for idempotency | Safe to re-run; won't duplicate tiers |
| **Documents migration** | Maps old tables → unified with correct tier/owner | Preserves `document_version` exactly as-is for OCC continuity |
| **Collections + JSON aggregation** | `JSON_OBJECTAGG()` collapses normalized property rows into one JSON blob per collection | Eliminates junction table lookups; single row per collection going forward |
| **ON DUPLICATE KEY UPDATE** | Uses `JSON_MERGE_PATCH` on conflicts | If a collection somehow maps to two old sources, properties merge rather than fail |
| **Verification queries** | Commented out — run manually | Compare counts and spot-check JSON property counts before dropping anything |
| **DROP statements** | All commented out | You explicitly decide when legacy tables are gone after validation |

### What you need to do after running this

1. **Run the verification queries** (uncomment Step 6, execute them)
2. **Compare counts**: old vs new should match exactly
3. **Spot-check a few documents** in your application using the new stored procedures:
   ```sql
   CALL GetCollectionProperties('app', NULL, 'settings', 'ui');
   CALL GetAllCollectionsForDocument('user', 'your-user-uuid', 'preferences');
   ```
4. **Update your application code** to call the new unified procs with `tier_name` + `owner_id` instead of separate app/user endpoints
5. **Drop legacy tables/procedures** (uncomment Step 7) once everything validates

### Important notes

- **OCC versions are preserved exactly** — no version bumps during migration, so your application won't see spurious "version mismatch" errors on first use
- **`JSON_OBJECTAGG()` requires MariaDB 10.5+** — if you're on an older version, let me know and I'll write a `GROUP_CONCAT` + `JSON_MERGE` fallback
- **Old tables stay intact until you explicitly drop them** — zero downtime migration path: deploy new schema → migrate data → switch app code → verify → drop old

---

## Adding Tiers

Adding tiers, for example multi-level scoped premium, paid documents involves adding a tier to the `tiers` table, adding a role to the authorizer service, and middleware checks. This keeps the database schema static while allowing infinite business logic flexibility.

Premium tiers, tiers involving payment, or other obligations carry legal requirements of auditing and tracking. A basic auditing schema will be added to support this basic requirement.

### Example - Adding a Paid Tier

#### 1. The Paid 'Scoped' Tier Strategy
Paid tiers involve adding a new row in `tiers` and middleware checks. It keeps the database schema static while allowing infinite business logic flexibility.

**How it works:**
1.  **Schema:** You simply insert a new tier:
    ```sql
    INSERT INTO tiers (tier_name, tier_type) VALUES ('premium_user', 'scoped');
    ```
2. **Roles:** A new role is added to the authorizer service. The details are out of scope of this analysis.
3.  **Middleware:** The application middleware intercepts the request for `UpsertDocument('premium_user', ...)`. It checks the user's cookie against the Authorizer service to verify they have a valid subscription. If yes, it passes; if no, it returns 403 Forbidden before hitting the database.
4.  **Database:** The stored procedure receives the call and treats `premium_user` exactly like `user`, just with a different scope key.

**Why this is better than DB-level enforcement:**
*   **Decoupling:** Payment logic (subscriptions, trials, grace periods) lives in Authorizer/Billing services where it belongs. Jam-build remains a dumb data store.
*   **Performance:** Checking a role in middleware (Redis/Cache lookup) is faster than complex row-level security checks on every DB write.
*   **Flexibility:** If you decide "Premium" users get 50GB of storage vs Free users' 1GB, that logic lives in the app layer, not hardcoded in SQL constraints.

#### 2. Auditing & Tracking for Payments (Legal Necessity)
For payment-adjacent apps or regulated industries (GDPR, CCPA, PCI-DSS), "updated_at" timestamps are insufficient. You need an **immutable audit trail** that answers: *"What exactly did this user change, when, and what was the value before?"*

To support this legally without slowing down core reads/writes, we add a dedicated `document_audit_log` table.

##### The Audit Schema
The `document_audit_log` table captures snapshots of changes so one can reconstruct state at any point in time.

```sql
-- ============================================================================
-- Audit Log: Immutable record of all document mutations for compliance.
-- Written atomically within the same transaction as the data change.
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_audit_log (
    log_id SERIAL PRIMARY KEY,
    
    -- Context
    tier_id BIGINT UNSIGNED NOT NULL,
    owner_id CHAR(36) DEFAULT NULL,
    document_name VARCHAR(255) NOT NULL,
    
    -- Action details
    action_type ENUM('UPSERT', 'DELETE_COLLECTION', 'DELETE_PROPERTY', 'DELETE_DOCUMENT') NOT NULL,
    previous_version BIGINT UNSIGNED NOT NULL,
    new_version BIGINT UNSIGNED NOT NULL,
    
    -- Snapshots for legal reconstruction (JSON)
    snapshot_before JSON DEFAULT NULL, 
        -- The state of the document/collection BEFORE this change
    snapshot_after JSON DEFAULT NULL, 
        -- The state AFTER this change
    
    -- Actor metadata (injected by middleware/SP)
    changed_by CHAR(36) NOT NULL,      -- User ID who made the change
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_doc_audit (document_name, tier_id),
    INDEX idx_owner_audit (owner_id),
    INDEX idx_time_audit (created_at),
    
    FOREIGN KEY (tier_id) REFERENCES tiers(tier_id)
);
```

##### Integrating Auditing into Stored Procedures
We modify the existing `UpsertDocument` procedure to write to this log. Because it happens inside the transaction, if the data update fails, the audit log entry is also rolled back (consistency). If both succeed, they commit together.

**Example modification to `UpsertDocument`:**

```sql
-- Inside UpsertDocument SP, right before COMMIT:

IF v_document_updated > 0 THEN
    
    -- 1. Capture "Before" state for audit (optional but recommended for compliance)
    SET @snapshot_before = (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ) FROM collections c WHERE c.document_id = v_document_id);

    -- 2. Perform the actual data update...
    UPDATE documents SET document_version = p_new_document_version ...;

    -- 3. Capture "After" state (or just log the delta)
    SET @snapshot_after = (SELECT JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ) FROM collections c WHERE c.document_id = v_document_id);

    -- 4. Write Audit Log Atomically
    INSERT INTO document_audit_log (
        tier_id, owner_id, document_name, action_type, 
        previous_version, new_version, snapshot_before, snapshot_after,
        changed_by, ip_address
    ) VALUES (
        v_tier_id, p_owner_id, p_document_name, 'UPSERT',
        v_current_version, p_new_document_version,
        @snapshot_before, @snapshot_after,
        p_changed_by_user_id, p_client_ip -- Passed as new IN params
    );

END IF;
```

#### Summary of the Enhanced Design

1.  **Scalability:** Adding paid tiers is just an `INSERT` into `tiers`. Middleware handles the "is this user allowed?" check. Zero schema changes required for business logic shifts.
2.  **Compliance:** The `document_audit_log` table provides a forensic trail of every change, satisfying legal requirements for data integrity and accountability.
3.  **Performance:** Auditing is write-heavy but read-light (you rarely query the audit log). By keeping it in the same transaction, we ensure accuracy without adding network hops or external service calls that could fail independently.

## Updated Stored Procedures with Auditing

The stored procedures need to be updated with **atomic auditing** by capturing snapshots before and after changes within the same transaction. Two new input parameters are added to all write procedures:

1. `p_changed_by_user_id`: The UUID of the user making the change (for accountability).
2. `p_client_ip`: The IP address of the request (for forensic analysis).

### Updated Stored Procedures with Auditing

```sql
DELIMITER $$

-- ============================================================================
-- UpsertDocument: Create/update a document with collections and properties.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.UpsertDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_data JSON,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_properties JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Resolve tier_id
    SELECT tier_id INTO v_tier_id 
    FROM tiers WHERE tier_name = p_tier_name;

    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    -- Upsert the document row
    INSERT INTO documents (tier_id, owner_id, document_name)
    VALUES (v_tier_id, p_owner_id, p_document_name)
    ON DUPLICATE KEY UPDATE document_name = VALUES(document_name);

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Could not resolve document for "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    IF JSON_LENGTH(p_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input JSON array
    WHILE i < JSON_LENGTH(p_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].collection_name')));
        SET v_properties = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- Upsert collection with JSON merge for properties
        INSERT INTO collections (document_id, collection_name, properties)
        VALUES (v_document_id, v_collection_name, COALESCE(v_properties, '{}'))
        ON DUPLICATE KEY UPDATE 
            properties = JSON_MERGE_PATCH(properties, VALUES(properties));

        SET v_document_updated = 1;
        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents 
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;

        -- CAPTURE SNAPSHOT AFTER (for audit)
        SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
        ), '[]') INTO v_snapshot_after
        FROM collections c WHERE c.document_id = v_document_id;

        -- WRITE AUDIT LOG ATOMICALLY
        INSERT INTO document_audit_log (
            tier_id, owner_id, document_name, action_type, 
            previous_version, new_version, snapshot_before, snapshot_after,
            changed_by, ip_address
        ) VALUES (
            v_tier_id, p_owner_id, p_document_name, 'UPSERT',
            v_current_version, p_new_document_version,
            v_snapshot_before, v_snapshot_after,
            p_changed_by_user_id, p_client_ip
        );

    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$

-- ============================================================================
-- DeleteProperty: Remove specific property keys from collection(s).
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteProperty (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_data JSON,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_keys JSON;
    DECLARE v_key_path VARCHAR(255);
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    IF JSON_LENGTH(p_collection_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input array
    WHILE i < JSON_LENGTH(p_collection_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].collection_name')));
        SET v_property_keys = JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].property_keys'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- If no keys specified, delete the entire collection via recursive call (audit handled by DeleteCollection)
        IF v_property_keys IS NULL OR JSON_LENGTH(v_property_keys) = 0 THEN
            CALL jam_build.DeleteCollection(p_tier_name, p_owner_id, p_document_name, 
                                            p_document_version, v_collection_name, 
                                            p_changed_by_user_id, p_client_ip, @dummy);
            SET v_document_updated = 1; -- Note: version bump handled by recursive call, but we need to track it here if we were doing more work. 
                                        -- Since DeleteCollection commits its own transaction (or rather, runs in this one), 
                                        -- we actually shouldn't call a SP that commits inside another transaction.
                                        -- FIX: We must inline the logic or ensure nested calls don't commit prematurely.
                                        -- The previous design had DeleteCollection as a standalone proc. 
                                        -- To keep it atomic here, I will inline the deletion logic below instead of calling the SP recursively to avoid nested COMMIT issues.
        ELSE
            -- Remove each specified key from the collection's properties JSON
            SET j = 0;
            WHILE j < JSON_LENGTH(v_property_keys) DO
                SET v_key_path = CONCAT('$.', JSON_UNQUOTE(JSON_EXTRACT(v_property_keys, CONCAT('$[', j, ']'))));

                UPDATE collections 
                SET properties = JSON_REMOVE(properties, v_key_path)
                WHERE document_id = v_document_id AND collection_name = v_collection_name;

                IF ROW_COUNT() > 0 THEN
                    SET v_document_updated = 1;
                END IF;

                SET j = j + 1;
            END WHILE;
        END IF;

        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents 
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;

        -- CAPTURE SNAPSHOT AFTER (for audit)
        SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
        ), '[]') INTO v_snapshot_after
        FROM collections c WHERE c.document_id = v_document_id;

        -- WRITE AUDIT LOG ATOMICALLY
        INSERT INTO document_audit_log (
            tier_id, owner_id, document_name, action_type, 
            previous_version, new_version, snapshot_before, snapshot_after,
            changed_by, ip_address
        ) VALUES (
            v_tier_id, p_owner_id, p_document_name, 'DELETE_PROPERTY',
            v_current_version, p_new_document_version,
            v_snapshot_before, v_snapshot_after,
            p_changed_by_user_id, p_client_ip
        );

    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$

-- ============================================================================
-- DeleteCollection: Remove an entire collection from a document.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteCollection (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_name VARCHAR(255),
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_collection_exists INT DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    -- Verify collection exists before attempting deletion
    SELECT COUNT(*) INTO v_collection_exists
    FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    IF v_collection_exists = 0 THEN
        SET v_message = CONCAT('Collection "', p_collection_name, '" not found in document.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Delete the collection
    DELETE FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    -- Bump version
    SET p_new_document_version = v_current_version + 1;

    UPDATE documents 
    SET document_version = p_new_document_version
    WHERE document_id = v_document_id AND document_version = v_current_version;

    IF ROW_COUNT() <= 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
    END IF;

    -- CAPTURE SNAPSHOT AFTER (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_after
    FROM collections c WHERE c.document_id = v_document_id;

    -- WRITE AUDIT LOG ATOMICALLY
    INSERT INTO document_audit_log (
        tier_id, owner_id, document_name, action_type, 
        previous_version, new_version, snapshot_before, snapshot_after,
        changed_by, ip_address
    ) VALUES (
        v_tier_id, p_owner_id, p_document_name, 'DELETE_COLLECTION',
        v_current_version, p_new_document_version,
        v_snapshot_before, v_snapshot_after,
        p_changed_by_user_id, p_client_ip
    );

    COMMIT;
END$$

-- ============================================================================
-- DeleteDocument: Remove an entire document and all its collections.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    -- Audit variables
    DECLARE v_snapshot_before JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit) - After will be null since doc is deleted
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    -- Delete the document (CASCADE removes all collections)
    DELETE FROM documents WHERE document_id = v_document_id;

    SET p_new_document_version = 0;

    -- WRITE AUDIT LOG ATOMICALLY
    INSERT INTO document_audit_log (
        tier_id, owner_id, document_name, action_type, 
        previous_version, new_version, snapshot_before, snapshot_after,
        changed_by, ip_address
    ) VALUES (
        v_tier_id, p_owner_id, p_document_name, 'DELETE_DOCUMENT',
        v_current_version, p_new_document_version,
        v_snapshot_before, NULL, -- Snapshot after is null because document is gone
        p_changed_by_user_id, p_client_ip
    );

    COMMIT;
END$$

DELIMITER ;
```

### Key Audit Implementation Details:
1. **Atomic Snapshots:** `v_snapshot_before` and `v_snapshot_after` are captured inside the transaction using `JSON_ARRAYAGG`. This guarantees that if the write fails, no partial audit record is created. If it succeeds, you have a perfect "before/after" diff for compliance.
2. **DeleteDocument Handling:** Since deleting a document cascades to all collections, `snapshot_after` is explicitly set to NULL. The audit log preserves exactly what was destroyed (`snapshot_before`) and who did it.
3. **Middleware Integration:** Your application layer simply needs to inject the authenticated user's UUID and request IP into these two new parameters when calling the procedures.

---

## Middleware Applied Security and Updated Connection Pools

In the old design with duplicated tables (`application_*` vs `user_*`), having separate database users or distinct privilege sets made some sense because the physical storage was different. 

In the **new unified N-tier design**, maintaining multiple connection pools or database users is **wasteful and unnecessary**.

### Why a Single Connection Pool is Better
1.  **Middleware Enforcement**: Security is now handled by application middleware (checking roles/tokens against the Authorizer service) *before* the request ever hits the database. The DB doesn't need to know about "app users" vs "user users"—it just sees data requests with a `tier_name` parameter.
2.  **Resource Efficiency**: Connection pooling is expensive. Maintaining multiple pools fragments your available connections and increases memory overhead. A single pool allows you to scale efficiently based on total throughput, not arbitrary application boundaries.
3.  **Simplicity**: One database user (`jam_build_app`) simplifies deployment, rotation of credentials, and monitoring.

### Updated `privilege.sql` for the Unified Design
This script creates a **single application service account** that has access to execute all stored procedures but no direct table manipulation (enforcing logic through SPs).

```sql
-- ============================================================================
-- privilege.sql: Database User & Permissions for Unified N-tier Schema
-- 
-- Creates a single application user with EXECUTE-only access to Stored Procedures.
-- This enforces that all data mutations happen via the audited, OCC-protected SPs.
-- ============================================================================

USE jam_build;

-- 1. Create the unified application service account
CREATE USER IF NOT EXISTS 'jam_build_app'@'%' IDENTIFIED BY 'STRONG_PASSWORD_HERE';

-- 2. Grant EXECUTE on all current and future stored procedures
GRANT EXECUTE ON PROCEDURE jam_build.UpsertDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetCollectionProperties TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetCollectionsForDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteProperty TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteCollection TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetDocumentsForOwner TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetAllCollectionsForDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetProperty TO 'jam_build_app'@'%';

-- 3. Grant minimal table access (only for SPs to function internally)
-- Note: We do NOT grant direct INSERT/UPDATE/DELETE on tables to prevent bypassing the SP logic.
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.tiers TO 'jam_build_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.documents TO 'jam_build_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.collections TO 'jam_build_app'@'%';
GRANT SELECT, INSERT ON jam_build.document_audit_log TO 'jam_build_app'@'%';

-- 4. Apply changes
FLUSH PRIVILEGES;
```

### How Security Works Now (The Middleware Layer)
Since the DB user is now generic, **Middleware** becomes the gatekeeper. Here is the flow:

1.  **Request**: Client sends `POST /documents` with `{ "tier": "premium_user", ... }`.
2.  **Auth Check**: Middleware extracts the JWT/Session and calls the Authorizer service.
3.  **Tier Validation**: 
    *   If `tier == 'app'`: Allow read (Public singleton), Allow write if user is authenticated.
    *   If `tier == 'user'`: Allow if user is authenticated.
    *   If `tier == 'premium_user'`: Allow ONLY if user has a valid paid subscription role.
4.  **Execution**: If allowed, Middleware passes the request to the single DB connection pool with the validated parameters:
```sql
    CALL UpsertDocument('premium_user', 'user-uuid-123', 'settings', ...);
```

This approach is cleaner, more performant, and aligns perfectly with modern microservices security patterns where the database is treated as a trusted data store behind an authenticated application layer.

---

## API Middleware Implementation

Here is the proposed implementation for the unified pool and N-tier schema.

### Index.js

```javascript
/**
 * The data service.
 * 
 * Depends on the following ENVIRONMENT:
 *   - DB_HOST
 *   - DB_DATABASE
 *   - DB_USER          (Single unified app user)
 *   - DB_PASSWORD
 *   - DB_CONNECTION_LIMIT
 */
import debugLib from '@localnerve/debug';
import express from 'express';
import * as mariadb from 'mariadb';
import {
  getCollectionProperties,
  getCollectionsForDocument,
  upsertDocument,
  deleteCollection,
  deletePropertiesOrDocument
} from './methods.js';
import { authUser } from '../auth.js';

const debug = debugLib('api:data');

/**
 * Signal handler for process exit to gracefully end connection pool.
 */
function shutdownHandler (logger, pool) {
  logger.info('Shutting down data service...');
  pool.end().then(() => {
    logger.info('Database connection pool has ended.');
    process.exit(0);
  }).catch((err) => {
    logger.error('Error ending database connection pool', err);
    process.exit(err.code || 1);
  });
}

let pool, router;

/**
 * Creates the unified connection pool and middleware for the data service.
 * 
 * @param {Object} logger - The application level logger
 * @returns {Array<Router>} Array of middleware for this service
 */
export function createService (logger) {
  if (!pool) {
    debug('Creating unified db connection pool and router...');

    pool = mariadb.createPool({
      host: process.env.DB_HOST,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      logger: logger.info.bind(logger),
      connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '5', 10)
    });

    process.on('SIGINT', shutdownHandler.bind(null, logger, pool));
    process.on('SIGTERM', shutdownHandler.bind(null, logger, pool));

    router = express.Router();

    // All data routes require authentication. 
    // Tier-specific role checks (e.g., paid subscriptions) are enforced by middleware/authorizer.
    router.use(authUser);

    // Unified tier-agnostic routes: /data/:tier_name/:document[/:collection]
    router.get('/:tier/:document/:collection', getCollectionProperties);
    router.get('/:tier/:document', getCollectionsForDocument);
    
    router.post('/:tier/:document', upsertDocument);
    router.delete('/:tier/:document/:collection', deleteCollection);
    router.delete('/:tier/:document', deletePropertiesOrDocument);
  }

  return [router];
}
```

### Methods.js

```javascript
/**
 * The methods for get, post, and delete operations using the unified N-tier schema.
 */
import debugLib from '@localnerve/debug';

const debug = debugLib('api:data');

/**
 * Determine owner_id based on tier type. 'app' tiers are singletons (null), others use user UUID.
 */
function resolveOwnerId(tier, userId) {
  return tier.toLowerCase() === 'app' ? null : userId;
}

/**
 * Transform and validate input collections for upsert/delete operations.
 */
function transformAndValidateInput(inputCollections) {
  let collections = Array.isArray(inputCollections) ? inputCollections : [inputCollections];
  collections = collections.filter(obj => obj);

  if (collections.length <= 0) {
    const e = new Error('No collection data provided');
    e.status = 400;
    e.type = 'data.validation.input';
    throw e;
  }

  return collections.map(coll => {
    if (!coll.collection || typeof coll.collection !== 'string') {
      const e = new Error('Invalid collection name');
      e.status = 400;
      e.type = 'data.validation.input.collections';
      throw e;
    }
    return {
      collection_name: coll.collection,
      properties: coll.properties || {}
    };
  });
}

/**
 * Reduce SELECT row results to an object structure.
 * Since properties are now stored as JSON blobs per collection, this is simplified.
 */
function reduceReadResults(rows) {
  return rows.reduce((acc, row) => {
    acc[row.collection_name] = row.properties || {};
    return acc;
  }, {});
}

/**
 * Execute a read stored procedure and return the reduced results.
 */
async function executeRead(pool, procName, params, res) {
  let conn;
  try {
    conn = await pool.getConnection();
    debug(`Calling ${procName} with ${JSON.stringify(params)}...`);

    const [rows] = await conn.query(`CALL ${procName}(?)`, [params]);
    
    if (!rows || rows.length === 0) {
      return res.status(204).json({});
    }

    debug('Reducing read results...');
    const results = reduceReadResults(rows);
    res.status(200).json(results);
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Execute a write stored procedure with OCC versioning and audit logging.
 */
async function executeWrite(pool, procName, params, res) {
  let conn;
  try {
    conn = await pool.getConnection();
    debug(`Calling ${procName}...`);

    // MariaDB OUT parameters are handled via session variables
    const paramPlaceholders = Array(params.length).fill('?').join(',');
    await conn.query(`CALL ${procName}(${paramPlaceholders}, @new_version)`, params);

    const [{ result: newVersion }] = await conn.query('SELECT @new_version AS result');

    debug(`Write successful. New version: ${newVersion}`);
    res.status(200).json({
    message: 'Success',
    ok: true,
    newVersion: String(newVersion),
    timestamp: new Date().toISOString()
    });
  } finally { if (conn) conn.release(); }
}

/**
 * Get properties for a specific collection in a document.
 */
export async function getCollectionProperties(pool, req, res) {
  const { tier, document, collection } = req.params;
  const ownerId = resolveOwnerId(tier, req.user.id);

  await executeRead(pool, 'GetCollectionProperties', [tier, ownerId, document, collection], res);
}

/**
 * Get all collections and properties for a document.
 */
export async function getCollectionsForDocument(pool, req, res) {
  const { tier, document } = req.params;
  const ownerId = resolveOwnerId(tier, req.user.id);

  await executeRead(pool, 'GetCollectionsForDocument', [tier, ownerId, document], res);
}

/**
 * Upsert a document with collections and properties.
 */
export async function upsertDocument(pool, req, res) {
  const { tier, document } = req.params;
  const { version, collections } = req.body;

  if (version === undefined || version === null) {
    return res.status(400).json({ error: 'Version is required for OCC' });
  }

  try {
    const procedureCollections = transformAndValidateInput(collections);
    const ownerId = resolveOwnerId(tier, req.user.id);

    // Prepare JSON payload matching SP expectations: array of {collection_name, properties}
    const dataJson = JSON.stringify(procedureCollections);
    const clientIp = req.ip || req.connection.remoteAddress;

    await executeWrite(pool, 'UpsertDocument', [
      tier, ownerId, document, version, dataJson, req.user.id, clientIp
    ], res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
}

/**
 * Delete a specific collection from a document.
 */
export async function deleteCollection(pool, req, res) {
  const { tier, document, collection } = req.params;
  const { version } = req.body;

  if (version === undefined || version === null) {
    return res.status(400).json({ error: 'Version is required for OCC' });
  }

  const ownerId = resolveOwnerId(tier, req.user.id);
  const clientIp = req.ip || req.connection.remoteAddress;

  await executeWrite(pool, 'DeleteCollection', [
    tier, ownerId, document, version, collection, req.user.id, clientIp
  ], res);
}

/**
 * Delete properties or an entire document.
 */
export async function deletePropertiesOrDocument(pool, req, res) {
  const { tier, document } = req.params;
  const { collections, version, deleteDocument } = req.body;

  if (version === undefined || version === null) {
    return res.status(400).json({ error: 'Version is required for OCC' });
  }

  const ownerId = resolveOwnerId(tier, req.user.id);
  const clientIp = req.ip || req.connection.remoteAddress;

  if (deleteDocument) {
    await executeWrite(pool, 'DeleteDocument', [
      tier, ownerId, document, version, req.user.id, clientIp
    ], res);
    return;
  }

  try {
    const procedureCollections = transformAndValidateInput(collections || []); // SP expects JSON array of {collection_name, property_keys} for DeleteProperty
    const deletePayload = procedureCollections.map(c => ({
      collection_name: c.collection_name,
      property_keys: Array.isArray(c.properties) ? c.properties : Object.keys(c.properties || {})
    }));

    await executeWrite(pool, 'DeleteProperty', [
      tier, ownerId, document, version, JSON.stringify(deletePayload), req.user.id, clientIp
    ], res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(err.status || 500).json({ error: err.message });
    }
  }
}
```


### Key Changes in the Data Service Implementation:

1. **Unified Connection Pool**: Removed `appPool`/`userPool` duplication. All requests now route through a single pool using the unified `jam_build_app` database user.
2. **Tier-Agnostic Routing**: Routes changed from `/app/:doc` and `/user/:doc` to `/:tier/:document`. The `tier` parameter is passed directly to the stored procedures, allowing infinite scalability (e.g., `premium_user`, `enterprise_team`) without code changes.
3. **OCC & Audit Integration**: All write operations now explicitly pass `version`, `changed_by_user_id`, and `client_ip` to match the new SP signatures. The middleware enforces role checks before these parameters are even constructed.
4. **Simplified Error Handling**: Centralized `executeRead` and `executeWrite` functions handle connection lifecycle, session variable extraction (`@new_version`), and consistent JSON responses.
5. **Owner Resolution**: `resolveOwnerId()` automatically handles singleton tiers (like `app`) by passing `NULL`, while scoped tiers pass the authenticated user's UUID.

This implementation cleanly separates business logic (middleware/authorizer) from data persistence (SPs), making the service layer a thin, secure gateway that scales horizontally without database permission fragmentation.

---

Here is the reimplemented `auth.js` aligned with your data redesign. It replaces hardcoded role checks with a **config-driven tier authorization system**, enables conditional public reads, and attaches tier metadata to the request object for downstream handlers.

### Updated `src/application/server/api/1.0.0/auth.js`

```javascript
/**
 * Authorization.
 * 
 * Depends on the following ENVIRONMENT:
 *   - process.env.AUTHZ_URL
 *   - process.env.AUTHZ_CLIENT_ID
 */
import debugLib from '@localnerve/debug';
import { Authorizer } from '@localnerve/authorizer-js';
import { ping } from './utils.js';

const debug = debugLib('api:auth');

let authRef;

/**
 * Tier Authorization Configuration
 * 
 * Drives role-based access control for the unified data schema. New tiers can be added
 * here without modifying core middleware logic. In production, this can be swapped out
 * to load from a config file or remote Authorizer service endpoint.
 * 
 * @typedef {Object} TierConfig
 * @property {boolean} publicRead - If true, unauthenticated GET/HEAD/OPTIONS requests are allowed.
 * @property {string[]} roles - Array of valid Authorizer roles required for authenticated access.
 * @property {'singleton'|'scoped'} scopeType - Determines owner_id resolution downstream.
 */

/**
 * @type {Record<string, TierConfig>}
 */
const TIER_AUTH_CONFIG = {
  app: {
    publicRead: true,
    roles: ['user', 'admin'],
    scopeType: 'singleton'
  },
  user: {
    publicRead: false,
    roles: ['user', 'admin'],
    scopeType: 'scoped'
  },
  premium_user: {
    publicRead: false,
    roles: ['premium_user', 'admin'],
    scopeType: 'scoped'
  }
};

/**
 * Check the request header for valid format and extract the session from cookies.
 */
function checkHeaderAndGetSession(req) {
  debug('Header check...', req.headers);

  try {
    const cookies = req.cookies;
    if (!cookies) throw new Error('Cookies not parsed! Check cookie-parser middleware.');
    
    const session = cookies.cookie_session;
    if (!session) throw new Error('Authorizer cookie "cookie_session" not found.');
    
    debug(`Returned session ${session}`);
    return session;
  } catch (e) {
    const error = new Error('Failed to get cookie_session', { cause: e });
    error.status = 403;
    error.type = 'data.authorization';
    throw error;
  }
}

/**
 * Validate the session for the given roles.
 */
async function validateSessionAndSetUser(req, session, roles, type) {
  debug('Validate Session for roles:', roles);

  try {
    const { data, errors } = await authRef.validateSession({ cookie: session, roles });

    if (errors.length) throw new Error(errors[0].message);
    if (!data.is_valid) throw new Error(`Authorizer found session for ${roles} invalid: ${data}`);

    debug(`Successful session authorization for ${roles} on data:`, data);
    debug('Setting req.user from data');
    req.user = data.user;
  } catch (e) {
    const error = new Error('Invalid session', { cause: e });
    error.status = 403;
    error.type = type;
    throw error;
  }
}

/**
 * Check the Authorizer service reachability, setup the interface if not already done.
 */
async function initializeAuthorizer(req) {
  if (!authRef) {
    const authzUrl = new URL(process.env.AUTHZ_URL);
    const pingResult = await ping(authzUrl.hostname, authzUrl.port);
    if (pingResult <= 0) throw new Error('authz ping error');

    const thisHostURL = `${req.protocol}://${req.host}`;
    debug(`Initializing Authorizer: authorizerURL=${process.env.AUTHZ_URL}, clientID=${process.env.AUTHZ_CLIENT_ID}, redirectURL=${thisHostURL}`);
    
    authRef = new Authorizer({
      authorizerURL: process.env.AUTHZ_URL,
      redirectURL: thisHostURL,
      clientID: process.env.AUTHZ_CLIENT_ID
    });
  }
}

/**
 * Core authorization routine.
 */
async function auth(req, roles) {
  await initializeAuthorizer(req);

  let type = '';
  if (roles.length === 1) {
    debug(`Authorize ${roles[0]}`);
    type = `data.authorization.${roles[0]}`;
  }

  const session = checkHeaderAndGetSession(req);
  await validateSessionAndSetUser(req, session, roles, type);
}

/**
 * Dynamic Tier-Based Authorization Middleware
 * 
 * Replaces hardcoded `authUser`/`authAdmin` with a flexible, config-driven approach.
 * - Inspects `req.params.tier` against `TIER_AUTH_CONFIG`.
 * - Allows conditional public reads based on tier configuration.
 * - Enforces role-based access for writes and restricted reads.
 * - Attaches `req.tierConfig` to the request object for downstream route handlers.
 */
export async function authorizeDataAccess(req, res, next) {
  const tier = req.params.tier;
  
  if (!tier) {
    const err = new Error('Missing tier parameter in route');
    err.status = 400;
    err.type = 'data.authorization.missing_tier';
    return next(err);
  }

  const config = TIER_AUTH_CONFIG[tier];
  
  if (!config) {
    const err = new Error(`Unauthorized tier: ${tier}`);
    err.status = 403;
    err.type = 'data.authorization.unknown_tier';
    return next(err);
  }

  // Allow public reads if configured and request uses a safe HTTP method
  const isSafeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  
  if (isSafeMethod && config.publicRead) {
    debug(`Public read authorized for tier: ${tier}`);
    req.tierConfig = config;
    return next();
  }

  // For writes or non-public reads, enforce authentication and role validation
  try {
    await initializeAuthorizer(req);
    const session = checkHeaderAndGetSession(req);
    await validateSessionAndSetUser(req, session, config.roles, `data.authorization.${tier}`);
    
    debug(`Authenticated access granted for tier: ${tier}, user: ${req.user.id}`);
    req.tierConfig = config;
    next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Legacy Authorization middleware for the 'admin' role.
 */
export async function authAdmin(req, res, next) {
  await auth(req, ['admin']);
  next();
}

/**
 * Legacy Authorization middleware for the 'user' role.
 */
export async function authUser(req, res, next) {
  await auth(req, ['user']);
  next();
}
```

### Key Improvements & Integration Notes

1. **Config-Driven Role Expansion**: `TIER_AUTH_CONFIG` acts as a single source of truth. Adding `'premium_app'`, `'team'`, or other scopes only requires inserting a new key here (or loading it from an external config/Authorizer endpoint in production). Zero middleware logic changes needed.
2. **Conditional Public Reads**: The `authorizeDataAccess` middleware checks `req.method`. If it's a safe method (`GET`, `HEAD`, `OPTIONS`) and the tier has `publicRead: true`, it bypasses session validation entirely. This solves your `router.use(authUser)` blocking public app gets issue.
3. **Downstream Scope Resolution**: The middleware attaches `req.tierConfig` to the request. Your `methods.js` can now use `req.tierConfig.scopeType === 'singleton' ? null : req.user.id` instead of hardcoding `'app'` checks, making it fully aligned with the unified schema.
4. **`storeType` Alignment**: The client's `type:scope` format (e.g., `'app:public'`) can be cleanly mapped to this system. If you want the API to accept the full `storeType` string in the route, simply update `index.js` routes to `/:storeType/:document...` and add a quick parser at the top of `authorizeDataAccess`:
   ```javascript
   const [tier] = req.params.storeType.split(':'); // Extracts 'app' from 'app:public'
   ```

### Required Change in `data/index.js`
Replace the hardcoded auth middleware with the new dynamic one:
```diff
- router.use(authUser);
+ router.use(authorizeDataAccess);
```

This keeps your API layer thin, secure, and ready for role/tier expansion without touching database credentials or connection pools. Let me know if you'd like the corresponding `methods.js` updates to consume `req.tierConfig`.

---

Based on your redesign, here are the updates to add a "get entire tier" endpoint:

### 1. New Stored Procedure (add to your DDL)

```sql
-- ============================================================================
-- GetAllDocumentsForTier: Return all documents with their collections and 
-- flattened properties for an entire tier. For singleton tiers (like 'app'),
-- returns everything. For scoped tiers, filters by owner_id.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS jam_build.GetAllDocumentsForTier (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
               CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value LIMIT 0;
    ELSE
        -- Check if any documents exist for this tier/owner combination
        SELECT COUNT(*) INTO v_count
        FROM documents 
        WHERE tier_id = v_tier_id AND owner_id = p_owner_id;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value LIMIT 0;
        ELSE
            -- Return all documents with their collections and flattened properties
            SELECT d.document_name, d.document_version, c.collection_id, 
                   c.collection_name, jt.property_key, jt.property_value
            FROM documents d
            LEFT JOIN collections c ON d.document_id = c.document_id
            LEFT JOIN JSON_TABLE(
                c.properties, '$' COLUMNS (
                    property_key VARCHAR(255) PATH '$.key',
                    property_value JSON PATH '$.value'
                ) COLUMNS NESTED PATH '$.*'
            ) AS jt ON TRUE
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id
            ORDER BY d.document_name, c.collection_name;
        END IF;
    END IF;
END$$
```

### 2. Update `methods.js`

Add this new handler function:

```javascript
/**
 * Get all documents, collections, and properties for an entire tier.
 * For singleton tiers (like 'app'), returns everything.
 * For scoped tiers (like 'user'), filters by the authenticated user's owner_id.
 * 
 * @param {ConnectionPool} pool - The database connection pool
 * @param {Request} req - The expressjs Request object
 * @param {Response} res - The expressjs Response object
 * @returns {Promise} resolves to null on successful completion
 */
export async function getEntireTier (pool, req, res) {
  const { tier } = req.params;
  
  // Resolve owner_id based on tier scope type from auth middleware
  const ownerId = req.tierConfig?.scopeType === 'singleton' ? null : req.user?.id;

  debug(`getEntireTier '${tier}', ownerId: ${ownerId}`);

  let conn;
  try {
    conn = await pool.getConnection();

    const inputParams = [tier, ownerId];
    const procParamArray = Array(inputParams.length).fill('?').concat('@out_param');
    const procParams = `(${procParamArray.join(', ')})`;

    debug(`Calling GetAllDocumentsForTier${procParams} with ${inputParams}...`);

    const arr = await conn.query(
      `CALL GetAllDocumentsForTier${procParams}`,
      inputParams
    );
    
    const [outParam] = await conn.query('SELECT @out_param AS result');
    const notFound = !!outParam.result;

    if (notFound) {
      const error = new Error(`[404] Tier '${tier}' has no documents`);
      error.status = 404;
      error.type = 'data.tier.not_found';
      throw error;
    }

    debug('Reducing tier results...');
    
    // Reduce to nested structure: { documentName: { __version, collectionName: { propName: propVal } } }
    const results = arr[0].reduce((acc, row) => {
      if (!acc[row.document_name]) {
        acc[row.document_name] = { __version: `${row.document_version}` };
      }
      
      if (row.collection_name && row.property_key !== null) {
        if (!acc[row.document_name][row.collection_name]) {
          acc[row.document_name][row.collection_name] = {};
        }
        acc[row.document_name][row.collection_name][row.property_key] = row.property_value;
      }
      
      return acc;
    }, {});

    const status = Object.keys(results).length > 0 ? 200 : 204;
    debug(`Sending ${status} response for tier '${tier}'...`);
    res.status(status).json(results);
  } finally {
    if (conn) conn.release();
  }
}
```

### 3. Update `index.js`

Add the new route and import:

```javascript
// Add to imports at the top
import {
  getProperties,
  getCollectionsAndProperties,
  getDocumentsCollectionsAndProperties,
  getEntireTier, // NEW
  setProperties,
  deleteCollection,
  deleteProperties
} from './methods.js';

// In createService(), add this route BEFORE the auth middleware for public tiers:
appRouter.get(
  '/:tier',
  authorizeDataAccess, // Use dynamic tier-based auth
  getEntireTier.bind(null, appPool)
);

// For scoped tiers that require authentication, add after auth middleware:
appRouter.use('/:tier', authorizeDataAccess);
```

### Key Design Points:

1. **Unified Endpoint**: `GET /data/:tier` returns everything for that tier
2. **Scope-Aware**: Uses `req.tierConfig.scopeType` from the auth middleware to determine if it's a singleton (null owner) or scoped (user UUID)
3. **Nested Response Format**: Returns `{ documentName: { __version, collectionName: { properties } } }` matching your existing API structure
4. **Public Read Support**: If `app` tier has `publicRead: true`, unauthenticated users can fetch all app documents

---
## New Init Script and Privilege Grant Script Review

Here's the updated init script aligned with the unified N-tier design and single connection pool:

```sql
-- 001-init.sh
#!/bin/sh

SQL="$(cat <<EOF
CREATE DATABASE IF NOT EXISTS authorizer;
CREATE DATABASE IF NOT EXISTS $MARIADB_DATABASE;

-- Single unified application service account for all tier operations
CREATE USER IF NOT EXISTS 'jam_build_app'@'%' IDENTIFIED BY '$DB_PASSWORD';
EOF
)"

echo "$SQL" | mariadb -u root --password="$MARIADB_ROOT_PASSWORD"
```

```sql
-- 004-privileges.sql

-- Grant EXECUTE on all new unified stored procedures to the single app user
GRANT EXECUTE ON PROCEDURE jam_build.UpsertDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetCollectionProperties TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetCollectionsForDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteProperty TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteCollection TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.DeleteDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetDocumentsForOwner TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetAllCollectionsForDocument TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetProperty TO 'jam_build_app'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetAllDocumentsForTier TO 'jam_build_app'@'%';

-- Minimal table access required for stored procedures to function internally
-- (SPs run under the definer's privileges, but the app user needs these for direct SP execution context)
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.tiers TO 'jam_build_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.documents TO 'jam_build_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.collections TO 'jam_build_app'@'%';
GRANT SELECT, INSERT ON jam_build.document_audit_log TO 'jam_build_app'@'%';

-- Apply the changes immediately
FLUSH PRIVILEGES;
```

### Key Changes:
1. **Single User**: Replaced `$DB_USER` and `$DB_APP_USER` with one unified `jam_build_app` account
2. **Removed Cross-DB Table Creation:** authorizer.authorizer_users is no longer managed here. That service should own its own schema initialization.
3. **Decoupled Ownership Validation:** The documents.owner_id column is now just a string identifier. Middleware validates that the authenticated user actually owns scoped documents before passing owner_id to stored procedures.
4. **SP-Only Access**: Grants EXECUTE on all stored procedures but no direct table manipulation outside what SPs need internally
5. **Audit Table**: Read-only access to `document_audit_log` (writes happen atomically within SPs)
6. **Environment Variable**: Uses `$DB_PASSWORD` for the single user's password (remove the old `$DB_APP_USER`/`$DB_APP_PASSWORD` env vars from your deployment config)
7. **Cleaner Deployment Surface:** Only creates what jam-build strictly needs: its own database, one service account, and precise SP/table grants.

This keeps the database layer simple while middleware handles all tier-based authorization logic before requests reach the DB.
This keeps the infrastructure scripts focused, avoids fragile cross-database dependencies, and aligns perfectly with the middleware-enforced security model outlined in the redesign.

---
## New Table and Stored Procedure Script Review

Here are the complete DDL scripts for the unified N-tier schema, including the audit table and all stored procedures (plus the `GetAllDocumentsForTier` addition).

### 1. `/Users/agrant/projects/jam-build/data/database/002-mariadb-ddl-tables.sql`
This creates the core tables (`tiers`, `documents`, `collections`) and the compliance-focused audit log table. It also seeds the default tiers.

```sql
-- ============================================================================
-- Jam-build Unified N-Tier Schema (Tables)
-- Replaces legacy application_* / user_* duplication with a unified model.
-- Requires MariaDB 10.5+ for JSON_TABLE support in procedures.
-- ============================================================================

USE jam_build;

-- ============================================================================
-- Tiers: Defines document scopes (app-level, user-level, shared, etc.)
-- Adding a new tier requires zero schema changes — just INSERT a row here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tiers (
    tier_id SERIAL PRIMARY KEY,
    tier_name VARCHAR(50) NOT NULL UNIQUE,
    tier_type ENUM('singleton', 'scoped') NOT NULL DEFAULT 'singleton',
        -- singleton: one document per name across the entire app (e.g., "settings")
        -- scoped: one document per owner_id + name (e.g., user preferences)
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_tier_name_type (tier_name, tier_type)
);

-- ============================================================================
-- Documents: Top-level entity with OCC versioning.
-- Scoped by (tier_id, owner_id, document_name).
-- For singleton tiers, owner_id is NULL.
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    document_id SERIAL PRIMARY KEY,
    tier_id BIGINT UNSIGNED NOT NULL,
    owner_id CHAR(36) DEFAULT NULL,
        -- NULL for singleton tiers (app-level docs)
        -- user UUID from authorizer.authorizer_users.id for scoped tiers
    document_name VARCHAR(255) NOT NULL,
    document_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (tier_id) REFERENCES tiers(tier_id),
        -- Note: no ON DELETE CASCADE — dropping a tier should be explicit
    UNIQUE KEY unique_doc_scope (tier_id, owner_id, document_name),
    INDEX idx_tier_owner (tier_id, owner_id),
    INDEX idx_owner (owner_id),
    INDEX idx_version (document_version)
);

-- ============================================================================
-- Collections: Stores properties as JSON. Eliminates junction tables and
-- per-property rows. One row per collection within a document.
-- 
-- Example properties JSON for a "theme" collection:
-- {
--   "dark_mode": true,
--   "accent_color": "#3b82f6",
--   "font_size": 14
-- }
-- ============================================================================
CREATE TABLE IF NOT EXISTS collections (
    collection_id SERIAL PRIMARY KEY,
    document_id BIGINT UNSIGNED NOT NULL,
    collection_name VARCHAR(255) NOT NULL,
    properties JSON NOT NULL DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
    UNIQUE KEY unique_collection (document_id, collection_name),
    INDEX idx_document (document_id),
    CHECK (JSON_VALID(properties))
);

-- ============================================================================
-- Audit Log: Immutable record of all document mutations for compliance.
-- Written atomically within the same transaction as the data change.
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_audit_log (
    log_id SERIAL PRIMARY KEY,
    
    -- Context
    tier_id BIGINT UNSIGNED NOT NULL,
    owner_id CHAR(36) DEFAULT NULL,
    document_name VARCHAR(255) NOT NULL,
    
    -- Action details
    action_type ENUM('UPSERT', 'DELETE_COLLECTION', 'DELETE_PROPERTY', 'DELETE_DOCUMENT') NOT NULL,
    previous_version BIGINT UNSIGNED NOT NULL,
    new_version BIGINT UNSIGNED NOT NULL,
    
    -- Snapshots for legal reconstruction (JSON)
    snapshot_before JSON DEFAULT NULL, 
        -- The state of the document/collection BEFORE this change
    snapshot_after JSON DEFAULT NULL, 
        -- The state AFTER this change
    
    -- Actor metadata (injected by middleware/SP)
    changed_by CHAR(36) NOT NULL,      -- User ID who made the change
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(255) DEFAULT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_doc_audit (document_name, tier_id),
    INDEX idx_owner_audit (owner_id),
    INDEX idx_time_audit (created_at),
    
    FOREIGN KEY (tier_id) REFERENCES tiers(tier_id)
);

-- ============================================================================
-- Seed data: Default tiers for jam-build.
-- Safe to run idempotently via INSERT IGNORE.
-- ============================================================================
INSERT IGNORE INTO tiers (tier_name, tier_type, description) VALUES
    ('app', 'singleton', 'Application-level documents shared across all users'),
    ('user', 'scoped', 'Per-user documents scoped by owner_id (user UUID)'),
    ('shared', 'scoped', 'Shared documents between multiple owners');
```

### 2. `/Users/agrant/projects/jam-build/data/database/003-mariadb-ddl-procedures.sql`
This creates the unified stored procedures with atomic auditing and OCC versioning enforcement. It includes `GetAllDocumentsForTier`.

```sql
DELIMITER $$

USE jam_build$$

-- ============================================================================
-- UpsertDocument: Create/update a document with collections and properties.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS UpsertDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_data JSON,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_properties JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Resolve tier_id
    SELECT tier_id INTO v_tier_id 
    FROM tiers WHERE tier_name = p_tier_name;

    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    -- Upsert the document row
    INSERT INTO documents (tier_id, owner_id, document_name)
    VALUES (v_tier_id, p_owner_id, p_document_name)
    ON DUPLICATE KEY UPDATE document_name = VALUES(document_name);

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Could not resolve document for "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    IF JSON_LENGTH(p_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input JSON array
    WHILE i < JSON_LENGTH(p_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].collection_name')));
        SET v_properties = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- Upsert collection with JSON merge for properties
        INSERT INTO collections (document_id, collection_name, properties)
        VALUES (v_document_id, v_collection_name, COALESCE(v_properties, '{}'))
        ON DUPLICATE KEY UPDATE 
            properties = JSON_MERGE_PATCH(properties, VALUES(properties));

        SET v_document_updated = 1;
        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents 
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;

        -- CAPTURE SNAPSHOT AFTER (for audit)
        SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
        ), '[]') INTO v_snapshot_after
        FROM collections c WHERE c.document_id = v_document_id;

        -- WRITE AUDIT LOG ATOMICALLY
        INSERT INTO document_audit_log (
            tier_id, owner_id, document_name, action_type, 
            previous_version, new_version, snapshot_before, snapshot_after,
            changed_by, ip_address
        ) VALUES (
            v_tier_id, p_owner_id, p_document_name, 'UPSERT',
            v_current_version, p_new_document_version,
            v_snapshot_before, v_snapshot_after,
            p_changed_by_user_id, p_client_ip
        );

    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$


-- ============================================================================
-- GetCollectionProperties: Read properties for a single collection.
-- Returns document metadata + flattened property key/value pairs.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetCollectionProperties (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
               'unknown' AS collection_id, p_collection_name AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value
        LIMIT 0;
    ELSE
        -- Check existence
        SELECT COUNT(*) INTO v_count
        FROM documents d
        JOIN collections c ON d.document_id = c.document_id
        WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
          AND d.document_name = p_document_name AND c.collection_name = p_collection_name;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   'unknown' AS collection_id, p_collection_name AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value
            LIMIT 0;
        ELSE
            -- Return flattened properties using JSON_TABLE (MariaDB 10.5+)
            SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                   jt.property_key, jt.property_value
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            CROSS JOIN JSON_TABLE(
                c.properties, '$' COLUMNS (
                    property_key VARCHAR(255) PATH '$.key',
                    property_value JSON PATH '$.value'
                ) COLUMNS NESTED PATH '$.*'
            ) AS jt
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
        END IF;
    END IF;
END$$


-- ============================================================================
-- GetCollectionsForDocument: Read all collections (or filtered subset) for a document.
-- Optional CSV filter on collection names via FIND_IN_SET.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetCollectionsForDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_filter VARCHAR(2048),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version,
               'unknown' AS collection_id, '' AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value
        LIMIT 0;
    ELSE
        -- Check existence (with optional filter)
        IF p_collection_filter <> '' THEN
            SELECT COUNT(*) INTO v_count
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name
              AND FIND_IN_SET(c.collection_name, p_collection_filter);
        ELSE
            SELECT COUNT(*) INTO v_count
            FROM documents d
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name;
        END IF;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   'unknown' AS collection_id, '' AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value
            LIMIT 0;
        ELSE
            -- Return all collections (or filtered) with flattened properties
            IF p_collection_filter <> '' THEN
                SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                       jt.property_key, jt.property_value
                FROM documents d
                JOIN collections c ON d.document_id = c.document_id
                CROSS JOIN JSON_TABLE(
                    c.properties, '$' COLUMNS (
                        property_key VARCHAR(255) PATH '$.key',
                        property_value JSON PATH '$.value'
                    ) COLUMNS NESTED PATH '$.*'
                ) AS jt
                WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
                  AND d.document_name = p_document_name
                  AND FIND_IN_SET(c.collection_name, p_collection_filter);
            ELSE
                SELECT d.document_name, d.document_version, c.collection_id, c.collection_name,
                       jt.property_key, jt.property_value
                FROM documents d
                JOIN collections c ON d.document_id = c.document_id
                CROSS JOIN JSON_TABLE(
                    c.properties, '$' COLUMNS (
                        property_key VARCHAR(255) PATH '$.key',
                        property_value JSON PATH '$.value'
                    ) COLUMNS NESTED PATH '$.*'
                ) AS jt
                WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
                  AND d.document_name = p_document_name;
            END IF;
        END IF;
    END IF;
END$$


-- ============================================================================
-- DeleteProperty: Remove specific property keys from collection(s).
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS DeleteProperty (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_data JSON,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_document_updated INT DEFAULT 0;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_keys JSON;
    DECLARE v_key_path VARCHAR(255);
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    IF JSON_LENGTH(p_collection_data) = 0 THEN
        SET v_message = CONCAT('No collection data supplied for document "', p_document_name, '"');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process each collection in the input array
    WHILE i < JSON_LENGTH(p_collection_data) DO
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].collection_name')));
        SET v_property_keys = JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].property_keys'));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input missing collection_name';
        END IF;

        -- Remove each specified key from the collection's properties JSON
        SET j = 0;
        WHILE j < JSON_LENGTH(v_property_keys) DO
            SET v_key_path = CONCAT('$.', JSON_UNQUOTE(JSON_EXTRACT(v_property_keys, CONCAT('$[', j, ']'))));

            UPDATE collections 
            SET properties = JSON_REMOVE(properties, v_key_path)
            WHERE document_id = v_document_id AND collection_name = v_collection_name;

            IF ROW_COUNT() > 0 THEN
                SET v_document_updated = 1;
            END IF;

            SET j = j + 1;
        END WHILE;

        SET i = i + 1;
    END WHILE;

    -- Bump version if anything changed
    IF v_document_updated > 0 THEN
        
        SET p_new_document_version = v_current_version + 1;

        UPDATE documents 
        SET document_version = p_new_document_version
        WHERE document_id = v_document_id AND document_version = v_current_version;

        IF ROW_COUNT() <= 0 THEN
            SIGNAL SQLSTATE '45000' 
            SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
        END IF;

        -- CAPTURE SNAPSHOT AFTER (for audit)
        SELECT COALESCE(JSON_ARRAYAGG(
            JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
        ), '[]') INTO v_snapshot_after
        FROM collections c WHERE c.document_id = v_document_id;

        -- WRITE AUDIT LOG ATOMICALLY
        INSERT INTO document_audit_log (
            tier_id, owner_id, document_name, action_type, 
            previous_version, new_version, snapshot_before, snapshot_after,
            changed_by, ip_address
        ) VALUES (
            v_tier_id, p_owner_id, p_document_name, 'DELETE_PROPERTY',
            v_current_version, p_new_document_version,
            v_snapshot_before, v_snapshot_after,
            p_changed_by_user_id, p_client_ip
        );

    ELSE
        SET p_new_document_version = v_current_version;
    END IF;

    COMMIT;
END$$


-- ============================================================================
-- DeleteCollection: Remove an entire collection from a document.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================ 
CREATE PROCEDURE IF NOT EXISTS DeleteCollection (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    IN p_collection_name VARCHAR(255),
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_collection_exists INT DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    -- Audit variables
    DECLARE v_snapshot_before JSON;
    DECLARE v_snapshot_after JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    -- Verify collection exists before attempting deletion
    SELECT COUNT(*) INTO v_collection_exists
    FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    IF v_collection_exists = 0 THEN
        SET v_message = CONCAT('Collection "', p_collection_name, '" not found in document.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Delete the collection (CASCADE handles nothing else since properties are embedded)
    DELETE FROM collections 
    WHERE document_id = v_document_id AND collection_name = p_collection_name;

    -- Bump version
    SET p_new_document_version = v_current_version + 1;

    UPDATE documents 
    SET document_version = p_new_document_version
    WHERE document_id = v_document_id AND document_version = v_current_version;

    IF ROW_COUNT() <= 0 THEN
        SIGNAL SQLSTATE '45000' 
        SET MESSAGE_TEXT = CONCAT('E_VERSION - Failed to update "', p_document_name, '" due to concurrent modification.');
    END IF;

    -- CAPTURE SNAPSHOT AFTER (for audit)
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_after
    FROM collections c WHERE c.document_id = v_document_id;

    -- WRITE AUDIT LOG ATOMICALLY
    INSERT INTO document_audit_log (
        tier_id, owner_id, document_name, action_type, 
        previous_version, new_version, snapshot_before, snapshot_after,
        changed_by, ip_address
    ) VALUES (
        v_tier_id, p_owner_id, p_document_name, 'DELETE_COLLECTION',
        v_current_version, p_new_document_version,
        v_snapshot_before, v_snapshot_after,
        p_changed_by_user_id, p_client_ip
    );

    COMMIT;
END$$


-- ============================================================================
-- DeleteDocument: Remove an entire document and all its collections.
-- Enforces OCC versioning and writes an atomic audit log entry.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS DeleteDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_document_version BIGINT UNSIGNED,
    -- Audit parameters
    IN p_changed_by_user_id CHAR(36),
    IN p_client_ip VARCHAR(45),
    OUT p_new_document_version BIGINT UNSIGNED
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_current_version BIGINT UNSIGNED DEFAULT 0;
    DECLARE v_message VARCHAR(255);

    -- Audit variables
    DECLARE v_snapshot_before JSON;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET v_message = CONCAT('Tier "', p_tier_name, '" does not exist.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- Lock and check OCC version
    SELECT document_version INTO v_current_version
    FROM documents 
    WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name
    FOR UPDATE;

    IF v_current_version <> p_document_version THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'E_VERSION - Refresh and reconcile with current version before continuing.';
    END IF;

    SELECT document_id INTO v_document_id 
    FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Document "', p_document_name, '" not found.');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_message;
    END IF;

    -- CAPTURE SNAPSHOT BEFORE (for audit) - After will be null since doc is deleted
    SELECT COALESCE(JSON_ARRAYAGG(
        JSON_OBJECT('collection_name', c.collection_name, 'properties', c.properties)
    ), '[]') INTO v_snapshot_before
    FROM collections c WHERE c.document_id = v_document_id;

    -- Delete the document (CASCADE removes all collections)
    DELETE FROM documents WHERE document_id = v_document_id;

    SET p_new_document_version = 0;

    -- WRITE AUDIT LOG ATOMICALLY
    INSERT INTO document_audit_log (
        tier_id, owner_id, document_name, action_type, 
        previous_version, new_version, snapshot_before, snapshot_after,
        changed_by, ip_address
    ) VALUES (
        v_tier_id, p_owner_id, p_document_name, 'DELETE_DOCUMENT',
        v_current_version, p_new_document_version,
        v_snapshot_before, NULL, -- Snapshot after is null because document is gone
        p_changed_by_user_id, p_client_ip
    );

    COMMIT;
END$$


-- ============================================================================
-- GetDocumentsForOwner: List all documents for a given owner in a tier.
-- Returns document metadata only (no collection/property details).
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetDocumentsForOwner (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
           CAST(NULL AS CHAR(36)) AS owner_id, '' AS tier_name LIMIT 0;
    ELSE
        SELECT COUNT(*) INTO v_count
        FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version, 
               CAST(NULL AS CHAR(36)) AS owner_id, '' AS tier_name LIMIT 0;
        ELSE
            SELECT d.document_name, d.document_version, d.owner_id, t.tier_name
            FROM documents d
            JOIN tiers t ON d.tier_id = t.tier_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id
            ORDER BY d.document_name;
        END IF;
    END IF;
END$$


-- ============================================================================
-- GetAllCollectionsForDocument: Return all collections with their raw JSON.
-- Useful when the client wants to parse properties itself rather than
-- receiving flattened rows from JSON_TABLE.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetAllCollectionsForDocument (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version,
           CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
           '{}' AS properties LIMIT 0;
    ELSE
        SELECT COUNT(*) INTO v_count
        FROM documents WHERE tier_id = v_tier_id AND owner_id = p_owner_id 
          AND document_name = p_document_name;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
               CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
               '{}' AS properties LIMIT 0;
        ELSE
            SELECT d.document_name, d.document_version, c.collection_id, 
               c.collection_name, c.properties
            FROM documents d
            JOIN collections c ON d.document_id = c.document_id
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
              AND d.document_name = p_document_name
            ORDER BY c.collection_name;
        END IF;
    END IF;
END$$


-- ============================================================================
-- GetProperty: Fetch a single property value from a collection.
-- Returns NULL for the property_value if the key does not exist.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetProperty (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    IN p_property_key VARCHAR(255)
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;

    IF v_tier_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = CONCAT('Tier "', p_tier_name, '" does not exist.');
    END IF;

    SELECT JSON_EXTRACT(c.properties, CONCAT('$.', p_property_key)) AS property_value
    FROM documents d
    JOIN collections c ON d.document_id = c.document_id
    WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id 
      AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
END$$


-- ============================================================================
-- GetAllDocumentsForTier: Return all documents with their collections and 
-- flattened properties for an entire tier. For singleton tiers (like 'app'),
-- returns everything. For scoped tiers, filters by owner_id.
-- ============================================================================
CREATE PROCEDURE IF NOT EXISTS GetAllDocumentsForTier (
    IN p_tier_name VARCHAR(50),
    IN p_owner_id CHAR(36),
    OUT p_notfound INT
)
BEGIN
    DECLARE v_tier_id BIGINT UNSIGNED;
    DECLARE v_count INT DEFAULT 0;

    SET p_notfound = 0;

    SELECT tier_id INTO v_tier_id FROM tiers WHERE tier_name = p_tier_name;
    
    IF v_tier_id IS NULL THEN
        SET p_notfound = 1;
        SELECT 'error' AS document_name, 0 AS document_version, 
               CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
               NULL AS property_key, CAST(NULL AS JSON) AS property_value LIMIT 0;
    ELSE
        -- Check if any documents exist for this tier/owner combination
        SELECT COUNT(*) INTO v_count
        FROM documents 
        WHERE tier_id = v_tier_id AND owner_id = p_owner_id;

        IF v_count <= 0 THEN
            SET p_notfound = 1;
            SELECT 'error' AS document_name, 0 AS document_version,
                   CAST(NULL AS BIGINT) AS collection_id, '' AS collection_name,
                   NULL AS property_key, CAST(NULL AS JSON) AS property_value LIMIT 0;
        ELSE
            -- Return all documents with their collections and flattened properties
            SELECT d.document_name, d.document_version, c.collection_id, 
                   c.collection_name, jt.property_key, jt.property_value
            FROM documents d
            LEFT JOIN collections c ON d.document_id = c.document_id
            LEFT JOIN JSON_TABLE(
                c.properties, '$' COLUMNS (
                    property_key VARCHAR(255) PATH '$.key',
                    property_value JSON PATH '$.value'
                ) COLUMNS NESTED PATH '$.*'
            ) AS jt ON TRUE
            WHERE d.tier_id = v_tier_id AND d.owner_id = p_owner_id
            ORDER BY d.document_name, c.collection_name;
        END IF;
    END IF;
END$$

DELIMITER ;
```

---