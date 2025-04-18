--
-- Stored procedures for jam_build database
--

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS GetPropertiesForApplicationDocumentAndCollection(
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255)
)
BEGIN
    SELECT p.property_id, p.property_name, p.property_value
    FROM application_documents d
    JOIN application_documents_collections dc ON d.document_id = dc.document_id
    JOIN application_collections c ON dc.collection_id = c.collection_id
    JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
    JOIN application_properties p ON cp.property_id = p.property_id
    WHERE d.document_name = p_document_name AND c.collection_name = p_collection_name;
END;
//

CREATE PROCEDURE IF NOT EXISTS GetPropertiesAndCollectionsForApplicationDocument(
    IN p_document_name VARCHAR(255)
)
BEGIN
    SELECT c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
    FROM application_documents d
    JOIN application_documents_collections dc ON d.document_id = dc.document_id
    JOIN application_collections c ON dc.collection_id = c.collection_id
    JOIN application_collections_properties cp ON c.collection_id = cp.collection_id
    JOIN application_properties p ON cp.property_id = p.property_id
    WHERE d.document_name = p_document_name;
END;
//

CREATE PROCEDURE IF NOT EXISTS InsertPropertiesForApplicationDocumentCollection(
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    IN p_properties JSON
)
BEGIN
    DECLARE v_document_id INT;
    DECLARE v_collection_id INT;
    DECLARE i INT DEFAULT 0;
    DECLARE property_count INT;
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_id INT;
    DECLARE v_property_value JSON;

    -- Check if the input JSON is valid
    IF NOT JSON_VALID(p_properties) THEN
        -- Exit proc and signal the error for invalid JSON
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid JSON format!';
    END IF;

    START TRANSACTION;

    -- Insert and get the document ID
    INSERT INTO application_documents (document_name) VALUES (p_document_name) ON DUPLICATE KEY UPDATE document_name = p_document_name;
    SELECT document_id INTO v_document_id FROM application_documents WHERE document_name = p_document_name;

    -- Insert and get the collection ID
    INSERT INTO application_collections (collection_name) VALUES (p_collection_name);
    SELECT  LAST_INSERT_ID() INTO v_collection_id;

    -- Associate document with collection if not already associated
    IF NOT EXISTS (SELECT 1 FROM application_documents_collections WHERE document_id = v_document_id AND collection_id = v_collection_id) THEN
        INSERT INTO application_documents_collections (document_id, collection_id) VALUES (v_document_id, v_collection_id);
    END IF;

    -- Get the count of name_value pairs
    SET property_count = JSON_LENGTH(p_properties);

    -- Loop through each name_value pair and insert or get the value_id
    WHILE i < property_count DO
        -- Extract property name and value from JSON array
        SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(p_properties, CONCAT('$[', i, '].property_name')));
        SET v_property_value = JSON_EXTRACT(p_properties, CONCAT('$[', i, '].property_value'));

        -- Insert or get the property_id
        INSERT INTO application_properties (property_name, property_value) VALUES (v_property_name, v_property_value) ON DUPLICATE KEY UPDATE property_name = v_property_name;
        SELECT property_id INTO v_property_id FROM application_properties WHERE property_name = v_property_name;

        -- Associate collection with namevalue if not already associated
        IF NOT EXISTS (SELECT 1 FROM application_collections_properties WHERE collection_id = v_collection_id AND property_id = v_property_id) THEN
            INSERT INTO application_collections_properties (collection_id, property_id) VALUES (v_collection_id, v_property_id);
        END IF;

        SET i = i + 1;
    END WHILE;

    COMMIT;
END;
//

CREATE PROCEDURE IF NOT EXISTS GetPropertiesForUserDocumentAndCollection(
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255)
)
BEGIN
    SELECT p.property_id, p.property_name, p.property_value
    FROM user_documents d
    JOIN user_documents_collections dc ON d.document_id = dc.document_id
    JOIN user_collections c ON dc.collection_id = c.collection_id
    JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
    JOIN user_properties p ON cp.property_id = p.property_id
    WHERE d.user_id = p_user_id AND d.document_name = p_document_name AND c.collection_name = p_collection_name;
END;
//

CREATE PROCEDURE IF NOT EXISTS GetPropertiesAndCollectionsForUserDocument(
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255)
)
BEGIN
    SELECT c.collection_id, c.collection_name, p.property_id, p.property_name, p.property_value
    FROM user_documents d
    JOIN user_documents_collections dc ON d.document_id = dc.document_id
    JOIN user_collections c ON dc.collection_id = c.collection_id
    JOIN user_collections_properties cp ON c.collection_id = cp.collection_id
    JOIN user_properties p ON cp.property_id = p.property_id
    WHERE d.user_id = p_user_id AND d.document_name = p_document_name;
END;
//

CREATE PROCEDURE IF NOT EXISTS InsertPropertiesForUserDocumentCollection(
    IN p_user_id CHAR(36),
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    IN p_properties JSON
)
BEGIN
    DECLARE v_document_id INT;
    DECLARE v_collection_id INT;
    DECLARE i INT DEFAULT 0;
    DECLARE property_count INT;
    DECLARE v_property_name VARCHAR(255);
    DECLARE v_property_id INT;
    DECLARE v_property_value JSON;

    -- Check if the input JSON is valid
    IF NOT JSON_VALID(p_properties) THEN
        -- Exit proc and signal the error for invalid JSON
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid JSON format!';
    END IF;

    START TRANSACTION;

    -- Insert and get the document ID
    INSERT INTO user_documents (user_id, document_name) VALUES (p_user_id, p_document_name) ON DUPLICATE KEY UPDATE user_id = p_user_id, document_name = p_document_name;
    SELECT document_id INTO v_document_id FROM user_documents WHERE document_name = p_document_name and user_id = p_user_id;

    -- Insert and get the collection ID
    INSERT INTO user_collections (collection_name) VALUES (p_collection_name);
    SELECT LAST_INSERT_ID() INTO v_collection_id;

    -- Associate document with collection if not already associated
    IF NOT EXISTS (SELECT 1 FROM user_documents_collections WHERE document_id = v_document_id AND collection_id = v_collection_id) THEN
        INSERT INTO user_documents_collections (document_id, collection_id) VALUES (v_document_id, v_collection_id);
    END IF;

    -- Get the count of name_value pairs
    SET property_count = JSON_LENGTH(p_properties);

    -- Loop through each name_value pair and insert or get the value_id
    WHILE i < property_count DO
        -- Extract property name and value from JSON array
        SET v_property_name = JSON_UNQUOTE(JSON_EXTRACT(p_properties, CONCAT('$[', i, '].property_name')));
        SET v_property_value = JSON_EXTRACT(p_properties, CONCAT('$[', i, '].property_value'));

        -- Insert or get the property_id
        INSERT INTO user_properties (property_name, property_value) VALUES (v_property_name, v_property_value) ON DUPLICATE KEY UPDATE property_name = v_property_name;
        SELECT property_id INTO v_property_id FROM user_properties WHERE property_name = v_property_name;

        -- Associate collection with namevalue if not already associated
        IF NOT EXISTS (SELECT 1 FROM user_collections_properties WHERE collection_id = v_collection_id AND property_id = v_property_id) THEN
            INSERT INTO user_collections_properties (collection_id, property_id) VALUES (v_collection_id, v_property_id);
        END IF;

        SET i = i + 1;
    END WHILE;

    COMMIT;
END;
//

DELIMITER ;