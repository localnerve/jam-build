--
-- Stored procedures for jam_build database
--

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesForApplicationDocumentAndCollection(
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    SELECT COUNT(*) INTO @temp_count
    FROM application_documents d
    JOIN application_documents_collections dc ON d.document_id = dc.document_id
    JOIN application_collections c ON dc.collection_id = c.collection_id
    WHERE d.document_name = p_document_name AND c.collection_name = p_collection_name;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE
        SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
        FROM application_documents d
        JOIN application_documents_collections dc ON d.document_id = dc.document_id
        JOIN application_collections c ON dc.collection_id = c.collection_id
        JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
        JOIN application_properties p ON cp.property_id = p.property_id
        WHERE d.document_name = p_document_name AND c.collection_name = p_collection_name;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesAndCollectionsForApplicationDocument(
    IN p_document_name VARCHAR(255),
    IN p_collections VARCHAR(2048),
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    IF p_collections <> '' THEN
        SELECT COUNT(*) INTO @temp_count
        FROM application_documents d
        JOIN application_documents_collections dc ON d.document_id = dc.document_id
        JOIN application_collections c ON dc.collection_id = c.collection_id
        WHERE d.document_name = p_document_name
          AND FIND_IN_SET(c.collection_name, p_collections);
    ELSE
        SELECT COUNT(*) INTO @temp_count
        FROM application_documents d
        WHERE d.document_name = p_document_name;
    END IF;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE
        -- Use FIND_IN_SET to filter collections based on the provided CSV string
        IF p_collections <> '' THEN
            SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
            FROM application_documents d
            JOIN application_documents_collections dc ON d.document_id = dc.document_id
            JOIN application_collections c ON dc.collection_id = c.collection_id
            JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
            JOIN application_properties p ON cp.property_id = p.property_id
            WHERE d.document_name = p_document_name
              AND FIND_IN_SET(c.collection_name, p_collections);
        ELSE
            -- If no CSV string is provided, use the original query
            SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
            FROM application_documents d
            JOIN application_documents_collections dc ON d.document_id = dc.document_id
            JOIN application_collections c ON dc.collection_id = c.collection_id
            JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
            JOIN application_properties p ON cp.property_id = p.property_id
            WHERE d.document_name = p_document_name;
        END IF;
    END IF;
END;

//

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesAndCollectionsAndDocumentsForApplication(
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    SELECT COUNT(*) INTO @temp_count
    FROM application_documents d;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE
        SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
        FROM application_documents d
        JOIN application_documents_collections dc ON d.document_id = dc.document_id
        JOIN application_collections c ON dc.collection_id = c.collection_id
        JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
        JOIN application_properties p ON cp.property_id = p.property_id;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.UpsertApplicationDocumentWithCollectionsAndProperties (
    p_document_name VARCHAR(255),
    p_data JSON
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_collection_id BIGINT UNSIGNED;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_id BIGINT UNSIGNED;
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_value JSON;
    DECLARE v_properties JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;

    SET v_document_id = NULL;

    -- Insert or update document
    INSERT INTO application_documents (document_name)
    VALUES (p_document_name)
    ON DUPLICATE KEY UPDATE document_name = VALUES(document_name);

    -- Get the document_id for the given document_name
    SELECT document_id INTO v_document_id FROM application_documents WHERE document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Could not find document for INPUT document_name "', p_document_name, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process collections and their associated properties
    WHILE i < JSON_LENGTH(p_data) DO
        SET v_collection_id = NULL;
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].collection_name')));
    
        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'JSON input did not contain a proper collection_name';
        END IF;

        -- Check if the collection already exists for this document
        SELECT collection_id INTO v_collection_id 
        FROM application_documents_collections 
        WHERE document_id = v_document_id AND collection_id IN (
            SELECT collection_id 
            FROM application_collections 
            WHERE collection_name = v_collection_name
        );

        IF v_collection_id IS NULL THEN
            -- Insert collection if it doesn't exist
            INSERT INTO application_collections (collection_name)
            VALUES (v_collection_name);

            -- Get the newly inserted collection_id
            SET v_collection_id = LAST_INSERT_ID();

            -- Associate document with collection
            INSERT INTO application_documents_collections (document_id, collection_id)
            VALUES (v_document_id, v_collection_id);
        END IF;

        -- Process properties for the current collection, can have 0 properties
        SET j = 0;
        SET v_properties = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties'));
        WHILE j < (SELECT CASE WHEN v_properties IS NULL THEN 0 ELSE JSON_LENGTH(v_properties) END) DO
            SET v_property_id = NULL;
            SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties[', j, '].property_name')));
            SET v_property_value = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties[', j, '].property_value'));

            IF v_property_name IS NULL OR v_property_value IS NULL THEN
                SET v_message = CONCAT('JSON input for collection_name "', v_collection_name, '" had bad property_name or property_value');
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = v_message;
            END IF;

            -- Check if the property already exists in this collection
            SELECT property_id INTO v_property_id 
            FROM application_collections_properties 
            WHERE collection_id = v_collection_id AND property_id IN (
                SELECT property_id 
                FROM application_properties 
                WHERE property_name = v_property_name
            );

            IF v_property_id IS NULL THEN
                -- Insert property if it doesn't exist
                INSERT INTO application_properties (property_name, property_value)
                VALUES (v_property_name, v_property_value);

                -- Get the newly inserted property_id
                SET v_property_id = LAST_INSERT_ID();

                -- Associate collection with property
                INSERT INTO application_collections_properties (collection_id, property_id)
                VALUES (v_collection_id, v_property_id);
            ELSE
                -- Check if the property_value is different to update
                SELECT property_value INTO @current_property_value 
                FROM application_properties 
                WHERE property_id = v_property_id;

                IF NOT JSON_EQUALS(@current_property_value, v_property_value) THEN
                    -- Update property value if it already exists for this collection
                    UPDATE application_properties
                    SET property_value = v_property_value
                    WHERE property_id = v_property_id;
                END IF;
            END IF;

            SET j = j + 1;
        END WHILE;

        SET i = i + 1;
    END WHILE;

    -- Commit the transaction
    COMMIT;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteApplicationDocument (
    IN p_document_name VARCHAR(255)
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_message VARCHAR(255);

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;

    SET v_document_id = NULL;

    -- Get the document_id for the given document_name
    SELECT document_id INTO v_document_id FROM application_documents WHERE document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        -- Delete the document itself (CASCADE will handle deletions in application_documents_collections)
        DELETE FROM application_documents WHERE document_id = v_document_id;
        
        -- Clean up unused application_collections
        DELETE FROM application_collections 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM application_documents_collections
        );
        
        -- Clean up unused application_collections_properties
        DELETE FROM application_collections_properties 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM application_documents_collections
        );
        
        -- Clean up unused application_properties
        DELETE FROM application_properties 
        WHERE property_id NOT IN (
            SELECT property_id FROM application_collections_properties
        );
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Commit the transaction
    COMMIT;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteApplicationCollection (
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255)
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_collection_id BIGINT UNSIGNED;
    DECLARE v_message VARCHAR(255);

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        IF @in_transaction IS NULL THEN
            -- Rollback the transaction on any error
            ROLLBACK;
        END IF;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    IF @in_transaction IS NULL THEN
        -- Start a new transaction
        START TRANSACTION;
    END IF;

    SET v_document_id = NULL;

    -- Get the document_id for the given document_name
    SELECT document_id INTO v_document_id FROM application_documents WHERE document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        SET v_collection_id = NULL;

        -- Get the collection_id for the given collection_name within the document
        SELECT collection_id INTO v_collection_id FROM application_collections 
        WHERE collection_id IN (
            SELECT collection_id FROM application_documents_collections 
            WHERE document_id = v_document_id AND collection_id IN (
                SELECT collection_id FROM application_collections WHERE collection_name = p_collection_name
            )
        );

        IF v_collection_id IS NOT NULL THEN
            -- Delete the collection from application_documents_collections (CASCADE will handle deletions in application_collections_properties)
            DELETE FROM application_documents_collections 
            WHERE document_id = v_document_id AND collection_id = v_collection_id;
            
            -- Clean up unused application_collections
            DELETE FROM application_collections 
            WHERE collection_id NOT IN (
                SELECT collection_id FROM application_documents_collections
            );
            
            -- Clean up unused application_collections_properties
            DELETE FROM application_collections_properties 
            WHERE collection_id NOT IN (
                SELECT collection_id FROM application_documents_collections
            );
            
            -- Clean up unused application_properties
            DELETE FROM application_properties 
            WHERE property_id NOT IN (
                SELECT property_id FROM application_collections_properties
            );
        ELSE
            SET v_message = CONCAT('Could not find collection_id for the input collection_name "', p_collection_name, '"');
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_message;
        END IF;
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    IF @in_transaction IS NULL THEN
        -- Commit the transaction
        COMMIT;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteApplicationProperties (
    IN p_document_name VARCHAR(255),
    IN p_collection_data JSON
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_collection_id BIGINT UNSIGNED;
    DECLARE v_property_names JSON;
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_id INT;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        SET @in_transaction = NULL;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;

    SET @in_transaction = 1;
    SET v_document_id = NULL;

    -- Get the document_id for the given document_name
    SELECT document_id INTO v_document_id FROM application_documents WHERE document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        WHILE i < JSON_LENGTH(p_collection_data) DO
            SET v_collection_id = NULL;

            -- Get the collection name and property names for this iteration
            SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].collection_name')));
            SET v_property_names = JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].property_names'));

            IF v_collection_name IS NULL THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input did not contain an expected collection_name';
            END IF;

            -- Get the collection_id for the given collection_name within the document
            SELECT collection_id INTO v_collection_id FROM application_collections 
            WHERE collection_id IN (
                SELECT collection_id FROM application_documents_collections 
                WHERE document_id = v_document_id AND collection_id IN (
                    SELECT collection_id FROM application_collections WHERE collection_name = v_collection_name
                )
            );

            IF v_collection_id IS NOT NULL THEN
                -- If property_names is empty, delete the whole collection
                IF v_property_names IS NULL OR JSON_LENGTH(v_property_names) = 0 THEN
                    CALL jam_build.DeleteApplicationCollection(p_document_name, v_collection_name);
                ELSE
                    -- Delete specified properties for this collection
                    WHILE j < JSON_LENGTH(v_property_names) DO
                        SET v_property_id = NULL;

                        -- Get the property name for this iteration
                        SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(v_property_names, CONCAT('$[', j, ']')));

                        IF v_property_name IS NULL THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input did not contain expected array of property names';
                        END IF;

                        -- Get the property_id for the given property_name
                        SELECT property_id INTO v_property_id FROM application_properties
                            WHERE property_name = v_property_name AND property_id IN (
                                SELECT property_id from application_collections_properties WHERE collection_id = v_collection_id
                            );

                        IF v_property_id IS NOT NULL THEN
                            -- Delete the property from the collection (CASCADE will handle deletions in application_collections_properties)
                            DELETE FROM application_collections_properties 
                            WHERE collection_id = v_collection_id AND property_id = v_property_id;
                        END IF;

                        SET j = j + 1;
                    END WHILE;
                END IF;
            END IF;

            SET i = i + 1;
        END WHILE;

        -- Clean up unused application_collections
        DELETE FROM application_collections 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM application_documents_collections
        );

        -- Clean up unused application_collections_properties
        DELETE FROM application_collections_properties 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM application_documents_collections
        );
        
        -- Clean up unused application_properties
        DELETE FROM application_properties 
        WHERE property_id NOT IN (
            SELECT property_id FROM application_collections_properties
        );
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Commit the transaction
    COMMIT;
    SET @in_transaction = NULL;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesForUserDocumentAndCollection(
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    SELECT COUNT(*) INTO @temp_count
    FROM user_documents d
    JOIN user_documents_collections dc ON d.document_id = dc.document_id
    JOIN user_collections c ON dc.collection_id = c.collection_id
    WHERE d.user_id = p_user_id AND d.document_name = p_document_name AND c.collection_name = p_collection_name;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE
        SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
        FROM user_documents d
        JOIN user_documents_collections dc ON d.document_id = dc.document_id
        JOIN user_collections c ON dc.collection_id = c.collection_id
        JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
        JOIN user_properties p ON cp.property_id = p.property_id
        WHERE d.user_id = p_user_id AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesAndCollectionsForUserDocument(
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collections VARCHAR(2048),
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    IF p_collections <> '' THEN
        SELECT COUNT(*) INTO @temp_count
        FROM user_documents d
        JOIN user_documents_collections dc ON d.document_id = dc.document_id
        JOIN user_collections c ON dc.collection_id = c.collection_id
        WHERE d.document_name = p_document_name AND d.user_id = p_user_id
          AND FIND_IN_SET(c.collection_name, p_collections);
    ELSE
        SELECT COUNT(*) INTO @temp_count
        FROM user_documents d
        WHERE d.document_name = p_document_name AND d.user_id = p_user_id;
    END IF;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE
        -- Use FIND_IN_SET to filter collections based on the provided CSV string
        IF p_collections <> '' THEN
            SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
            FROM user_documents d
            JOIN user_documents_collections dc ON d.document_id = dc.document_id
            JOIN user_collections c ON dc.collection_id = c.collection_id
            JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
            JOIN user_properties p ON cp.property_id = p.property_id
            WHERE d.user_id = p_user_id AND d.document_name = p_document_name
              AND FIND_IN_SET(c.collection_name, p_collections);
        ELSE
            -- If no CSV string is provided, use the original query
            SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
            FROM user_documents d
            JOIN user_documents_collections dc ON d.document_id = dc.document_id
            JOIN user_collections c ON dc.collection_id = c.collection_id
            JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
            JOIN user_properties p ON cp.property_id = p.property_id
            WHERE d.user_id = p_user_id AND d.document_name = p_document_name;
        END IF;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.GetPropertiesAndCollectionsAndDocumentsForUser(
    IN p_user_id CHAR(36),
    OUT p_notfound INT
)
BEGIN
    SET p_notfound = 0;

    SELECT COUNT(*) INTO @temp_count
    FROM user_documents d
    WHERE d.user_id = p_user_id;

    IF @temp_count <= 0 THEN
        SET p_notfound = 1;
    ELSE    
        SELECT d.document_name, c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
        FROM user_documents d
        JOIN user_documents_collections dc ON d.document_id = dc.document_id
        JOIN user_collections c ON dc.collection_id = c.collection_id
        JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
        JOIN user_properties p ON cp.property_id = p.property_id
        WHERE d.user_id = p_user_id;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.UpsertUserDocumentWithCollectionsAndProperties (
    p_user_id CHAR(36),
    p_document_name VARCHAR(255),
    p_data JSON
)
BEGIN
    DECLARE v_document_id INT;
    DECLARE v_collection_id INT;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_id INT;
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_value JSON;
    DECLARE v_properties JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;

    SET v_document_id = NULL;

    -- Insert or update document
    INSERT INTO user_documents (user_id, document_name)
    VALUES (p_user_id, p_document_name)
    ON DUPLICATE KEY UPDATE document_name = VALUES(document_name);

    -- Get the document_id for the given user_id and document_name
    SELECT document_id INTO v_document_id FROM user_documents WHERE user_id = p_user_id AND document_name = p_document_name;

    IF v_document_id IS NULL THEN
        SET v_message = CONCAT('Could not find document for INPUT document_name "', p_document_name, '" and user_id "', p_user_id, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Process collections and their associated properties
    WHILE i < JSON_LENGTH(p_data) DO
        SET v_collection_id = NULL;
        SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].collection_name')));

        IF v_collection_name IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'JSON input did not contain a proper collection_name';
        END IF;

        -- Check if the collection already exists for this user's document
        SELECT collection_id INTO v_collection_id
        FROM user_documents_collections
        WHERE document_id = v_document_id AND collection_id IN (
            SELECT collection_id
            FROM user_collections
            WHERE collection_name = v_collection_name
        );

        IF v_collection_id IS NULL THEN
            -- Insert collection if it doesn't exist
            INSERT INTO user_collections (collection_name)
            VALUES (v_collection_name);

            -- Get the newly inserted collection_id
            SET v_collection_id = LAST_INSERT_ID();

            -- Associate document with collection
            INSERT INTO user_documents_collections (document_id, collection_id)
            VALUES (v_document_id, v_collection_id);
        END IF;

        -- Process properties for the current collection, can have 0 properties
        SET j = 0;
        SET v_properties = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties'));
        WHILE j < (SELECT CASE WHEN v_properties IS NULL THEN 0 ELSE JSON_LENGTH(v_properties) END) DO
            SET v_property_id = NULL;
            SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties[', j, '].property_name')));
            SET v_property_value = JSON_EXTRACT(p_data, CONCAT('$[', i, '].properties[', j, '].property_value'));

            IF v_property_name IS NULL OR v_property_value IS NULL THEN
                SET v_message = CONCAT('JSON input for collection_name "', v_collection_name, '" had bad property_name or property_value');
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = v_message;
            END IF;

            -- Check if the property already exists in this collection
            SELECT property_id INTO v_property_id 
            FROM user_collections_properties 
            WHERE collection_id = v_collection_id AND property_id IN (
                SELECT property_id 
                FROM user_properties 
                WHERE property_name = v_property_name
            );

            IF v_property_id IS NULL THEN
                -- Insert property if it doesn't exist
                INSERT INTO user_properties (property_name, property_value)
                VALUES (v_property_name, v_property_value);

                -- Get the newly inserted property_id
                SET v_property_id = LAST_INSERT_ID();

                -- Associate collection with property if not already associated
                INSERT INTO user_collections_properties (collection_id, property_id)
                VALUES (v_collection_id, v_property_id);
            ELSE
                -- Check if the property_value is different to update
                SELECT property_value INTO @current_property_value 
                FROM user_properties 
                WHERE property_id = v_property_id;

                IF NOT JSON_EQUALS(@current_property_value, v_property_value) THEN
                    -- Update property value if it already exists for this collection
                    UPDATE user_properties
                    SET property_value = v_property_value
                    WHERE property_id = v_property_id;
                END IF;
            END IF;

            SET j = j + 1;
        END WHILE;

        SET i = i + 1;
    END WHILE;

    -- Commit the transaction if all operations are successful
    COMMIT;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteUserDocument (
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255)
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_message VARCHAR(255);

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;

    SET v_document_id = NULL;

    -- Get the document_id for the given user_id and document_name
    SELECT document_id INTO v_document_id FROM user_documents WHERE user_id = p_user_id AND document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        -- Delete the document itself (CASCADE will handle deletions in user_documents_collections)
        DELETE FROM user_documents WHERE document_id = v_document_id;
        
        -- Clean up unused user_collections
        DELETE FROM user_collections 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM user_documents_collections
        );
        
        -- Clean up unused user_collections_properties
        DELETE FROM user_collections_properties 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM user_documents_collections
        );
        
        -- Clean up unused user_properties
        DELETE FROM user_properties 
        WHERE property_id NOT IN (
            SELECT property_id FROM user_collections_properties
        );
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '" and user_id "', p_user_id, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Commit the transaction
    COMMIT;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteUserCollection (
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255)
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_collection_id BIGINT UNSIGNED;
    DECLARE v_message VARCHAR(255);

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        IF @in_user_transaction IS NULL THEN
            -- Rollback the transaction on any error
            ROLLBACK;
        END IF;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    IF @in_user_transaction IS NULL THEN
        -- Start a new transaction
        START TRANSACTION;
    END IF;

    SET v_document_id = NULL;

    -- Get the document_id for the given user_id and document_name
    SELECT document_id INTO v_document_id FROM user_documents WHERE user_id = p_user_id AND document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        SET v_collection_id = NULL;

        -- Get the collection_id for the given collection_name within the document
        SELECT collection_id INTO v_collection_id FROM user_collections 
        WHERE collection_id IN (
            SELECT collection_id FROM user_documents_collections 
            WHERE document_id = v_document_id AND collection_id IN (
                SELECT collection_id FROM user_collections WHERE collection_name = p_collection_name
            )
        );

        IF v_collection_id IS NOT NULL THEN
            -- Delete the collection from user_documents_collections (CASCADE will handle deletions in user_collections_properties)
            DELETE FROM user_documents_collections 
            WHERE document_id = v_document_id AND collection_id = v_collection_id;
            
            -- Clean up unused user_collections
            DELETE FROM user_collections 
            WHERE collection_id NOT IN (
                SELECT collection_id FROM user_documents_collections
            );
            
            -- Clean up unused user_collections_properties
            DELETE FROM user_collections_properties 
            WHERE collection_id NOT IN (
                SELECT collection_id FROM user_documents_collections
            );
            
            -- Clean up unused user_properties
            DELETE FROM user_properties 
            WHERE property_id NOT IN (
                SELECT property_id FROM user_collections_properties
            );
        ELSE
            SET v_message = CONCAT('Could not find collection_id for the input collection_name "', p_collection_name, '"');
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = v_message;
        END IF;
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '" and user_id "', p_user_id, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    IF @in_user_transaction IS NULL THEN
        -- Commit the transaction
        COMMIT;
    END IF;
END;
//

CREATE PROCEDURE IF NOT EXISTS jam_build.DeleteUserProperties (
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_data JSON
)
BEGIN
    DECLARE v_document_id BIGINT UNSIGNED;
    DECLARE v_collection_id BIGINT UNSIGNED;
    DECLARE v_collection_name VARCHAR(255);
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_id INT;
    DECLARE v_property_names JSON;
    DECLARE v_message VARCHAR(255);
    DECLARE i INT DEFAULT 0;
    DECLARE j INT DEFAULT 0;

    -- Declare a handler for SQL exceptions
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        -- Rollback the transaction on any error
        ROLLBACK;
        SET @in_user_transaction = NULL;
        -- Optionally, you can raise an error to notify the caller
        RESIGNAL;
    END;

    -- Start a new transaction
    START TRANSACTION;
    
    SET @in_user_transaction = 1;
    SET v_document_id = NULL;

    -- Get the document_id for the given user_id and document_name
    SELECT document_id INTO v_document_id FROM user_documents WHERE user_id = p_user_id AND document_name = p_document_name;

    IF v_document_id IS NOT NULL THEN
        WHILE i < JSON_LENGTH(p_collection_data) DO
            SET v_collection_id = NULL;

            -- Get the collection name and property names for this iteration
            SET v_collection_name = JSON_UNQUOTE(JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].collection_name')));
            SET v_property_names = JSON_EXTRACT(p_collection_data, CONCAT('$[', i, '].property_names'));

            IF v_collection_name IS NULL THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input did not contain an expected collection_name';
            END IF;
            
            -- Get the collection_id for the given collection_name within the document
            SELECT collection_id INTO v_collection_id FROM user_collections 
            WHERE collection_id IN (
                SELECT collection_id FROM user_documents_collections 
                WHERE document_id = v_document_id AND collection_id IN (
                    SELECT collection_id FROM user_collections WHERE collection_name = v_collection_name
                )
            );

            IF v_collection_id IS NOT NULL THEN
                -- if v_property_names is empty, then delete the whole collection
                IF v_property_names IS NULL OR JSON_LENGTH(v_property_names) = 0 THEN
                    CALL jam_build.DeleteUserCollection(p_document_name, v_collection_name);
                ELSE
                    -- Delete specified properties for this collection
                    WHILE j < JSON_LENGTH(v_property_names) DO
                        SET v_property_id = NULL;
            
                        -- Get the property name for this iteration
                        SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(v_property_names, CONCAT('$[', j, ']')));

                        IF v_property_name IS NULL THEN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'JSON input did not contain expected array of property names';
                        END IF;

                        -- Get the property_id for the given property_name
                        SELECT property_id INTO v_property_id FROM user_properties
                            WHERE property_name = v_property_name AND property_id IN (
                                SELECT property_id from user_collections_properties WHERE collection_id = v_collection_id
                            );

                        IF v_property_id IS NOT NULL THEN
                            -- Delete the property from the collection (CASCADE will handle deletions in user_collections_properties)
                            DELETE FROM user_collections_properties 
                            WHERE collection_id = v_collection_id AND property_id = v_property_id;
                        END IF;

                        SET j = j + 1;
                    END WHILE;
                END IF;
            END IF;

            SET i = i + 1;
        END WHILE;

        -- Clean up unused user_collections
        DELETE FROM user_collections 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM user_documents_collections
        );

        -- Clean up unused user_collections_properties
        DELETE FROM user_collections_properties 
        WHERE collection_id NOT IN (
            SELECT collection_id FROM user_documents_collections
        );
        
        -- Clean up unused user_properties
        DELETE FROM user_properties 
        WHERE property_id NOT IN (
            SELECT property_id FROM user_collections_properties
        );
    ELSE
        SET v_message = CONCAT('Could not find document_id for the input document_name "', p_document_name, '" and user_id "', p_user_id, '"');
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = v_message;
    END IF;

    -- Commit the transaction
    COMMIT;
    SET @in_user_transaction = NULL;
END;
//

DELIMITER ;