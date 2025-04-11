--
-- Creates the database structure for a jam-build application.
-- The jam-build database and jbuser should have already been created.
--

-- The database should have been created at image creation in docker-compose.yml
USE jam_build;

-- Create the Documents table
CREATE TABLE IF NOT EXISTS Documents (
    document_id INT AUTO_INCREMENT PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the Collections table
CREATE TABLE IF NOT EXISTS Collections (
    collection_id INT AUTO_INCREMENT PRIMARY KEY,
    collection_name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the NameValues table
CREATE TABLE IF NOT EXISTS NameValues (
    value_id INT AUTO_INCREMENT PRIMARY KEY,
    value_name VARCHAR(255) NOT NULL UNIQUE,
    value_value JSON,  -- Can store any valid JSON value (string, number, boolean, null, object, array)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the Document_Collections junction table
CREATE TABLE IF NOT EXISTS Document_Collections (
    document_id INT NOT NULL,
    collection_id INT NOT NULL,
    PRIMARY KEY (document_id, collection_id),
    FOREIGN KEY (document_id) REFERENCES Documents(document_id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES Collections(collection_id) ON DELETE CASCADE
);

-- Create the Collection_NameValues junction table
CREATE TABLE IF NOT EXISTS Collection_NameValues (
    collection_id INT NOT NULL,
    value_id INT NOT NULL,
    PRIMARY KEY (collection_id, value_id),
    FOREIGN KEY (collection_id) REFERENCES Collections(collection_id) ON DELETE CASCADE,
    FOREIGN KEY (value_id) REFERENCES NameValues(value_id) ON DELETE CASCADE
);

DELIMITER //

CREATE PROCEDURE IF NOT EXISTS GetValuesForDocumentAndCollection(
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255)
)
BEGIN
    SELECT nv.value_id, nv.value_name, nv.value_value
    FROM Documents d
    JOIN Document_Collections dc ON d.document_id = dc.document_id
    JOIN Collections c ON dc.collection_id = c.collection_id
    JOIN Collection_NameValues cv ON c.collection_id = cv.collection_id
    JOIN NameValues nv ON cv.value_id = nv.value_id
    WHERE d.document_name = p_document_name AND c.collection_name = p_collection_name;
END //

CREATE PROCEDURE IF NOT EXISTS InsertDocumentCollectionNameValues(
    IN p_document_name VARCHAR(255),
    IN p_collection_name VARCHAR(255),
    IN p_name_values JSON
)
BEGIN
    DECLARE v_document_id INT;
    DECLARE v_collection_id INT;
    DECLARE i INT DEFAULT 0;
    DECLARE name_value_count INT;
    DECLARE v_value_name VARCHAR(255);
    DECLARE v_value_id INT;
    DECLARE v_value_value JSON;

    -- Insert or get the document ID
    INSERT INTO Documents (document_name) VALUES (p_document_name) ON DUPLICATE KEY UPDATE document_name = p_document_name;
    SELECT document_id INTO v_document_id FROM Documents WHERE document_name = p_document_name;

    -- Insert or get the collection ID
    INSERT INTO Collections (collection_name) VALUES (p_collection_name) ON DUPLICATE KEY UPDATE collection_name = p_collection_name;
    SELECT collection_id INTO v_collection_id FROM Collections WHERE collection_name = p_collection_name;

    -- Associate document with collection if not already associated
    IF NOT EXISTS (SELECT 1 FROM Document_Collections WHERE document_id = v_document_id AND collection_id = v_collection_id) THEN
        INSERT INTO Document_Collections (document_id, collection_id) VALUES (v_document_id, v_collection_id);
    END IF;

    -- Get the count of name_value pairs
    SET name_value_count = JSON_LENGTH(p_name_values);

    -- Loop through each name_value pair and insert or get the value_id
    WHILE i < name_value_count DO
        -- Extract name and value from JSON array
        SET v_value_name = JSON_UNQUOTE(JSON_EXTRACT(p_name_values, CONCAT('$[', i, '].value_name')));
        SET v_value_value = JSON_EXTRACT(p_name_values, CONCAT('$[', i, '].value_value'));

        -- Insert or get the value_id
        INSERT INTO NameValues (value_name, value_value) VALUES (v_value_name, v_value_value) ON DUPLICATE KEY UPDATE value_name = v_value_name;
        SELECT value_id INTO v_value_id FROM NameValues WHERE value_name = v_value_name;

        -- Associate collection with namevalue if not already associated
        IF NOT EXISTS (SELECT 1 FROM Collection_NameValues WHERE collection_id = v_collection_id AND value_id = v_value_id) THEN
            INSERT INTO Collection_NameValues (collection_id, value_id) VALUES (v_collection_id, v_value_id);
        END IF;

        SET i = i + 1;
    END WHILE;
END //

CREATE PROCEDURE IF NOT EXISTS GetCollectionsAndValues(
    IN p_document_name VARCHAR(255)
)
BEGIN
    SELECT c.collection_id, c.collection_name, nv.value_id, nv.value_name, nv.value_value
    FROM Documents d
    JOIN Document_Collections dc ON d.document_id = dc.document_id
    JOIN Collections c ON dc.collection_id = c.collection_id
    JOIN Collection_NameValues cv ON c.collection_id = cv.collection_id
    JOIN NameValues nv ON cv.value_id = nv.value_id
    WHERE d.document_name = p_document_name;
END //

DELIMITER ;

-- The 'jbuser' user must already exist
-- Create the user jbuser with a password (replace 'your_password' with a secure password)
-- CREATE USER IF NOT EXISTS 'jbuser'@'localhost' IDENTIFIED BY 'your_password';

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the Documents table to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.Documents TO 'jbuser'@'localhost';

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the Collections table to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.Collections TO 'jbuser'@'localhost';

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the NameValues table to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.NameValues TO 'jbuser'@'localhost';

-- Grant execute permission on GetValuesForDocumentAndCollection to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.GetValuesForDocumentAndCollection TO 'jbuser'@'localhost';

-- Grant execute permission on InsertDocumentCollectionNameValues to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.InsertDocumentCollectionNameValues TO 'jbuser'@'localhost';

-- Grant execute permission on GetCollectionsAndValues to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.GetCollectionsAndValues TO 'jbuser'@'localhost';

-- Apply the changes immediately
FLUSH PRIVILEGES;
