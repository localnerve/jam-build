--
-- Creates the database structure for a jam-build application.
-- It's a two user, generic document 1=< collections *=< properties relation, one for application properties, one for user properties.
--
-- Prerequisistes:
-- The jam-build database, jbadmin and jbuser users should have already been created.
-- The authorizer database should already exist on this instance.
--

-- The database should have been created at image creation in docker-compose.yml
CREATE DATABASE IF NOT EXISTS jam_build;
USE jam_build;

-- Create the application_documents table
CREATE TABLE IF NOT EXISTS application_documents (
    document_id SERIAL PRIMARY KEY,
    document_name VARCHAR(255) NOT NULL UNIQUE,
    document_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the application_collections table
CREATE TABLE IF NOT EXISTS application_collections (
    collection_id SERIAL PRIMARY KEY,
    collection_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the application_properties table
CREATE TABLE IF NOT EXISTS application_properties (
    property_id SERIAL PRIMARY KEY,
    property_name VARCHAR(255) NOT NULL,
    property_value JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (JSON_VALID(property_value))
);

-- Create the application_documents_collections junction table
CREATE TABLE IF NOT EXISTS application_documents_collections (
    document_id BIGINT UNSIGNED NOT NULL,
    collection_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (document_id, collection_id),
    FOREIGN KEY (document_id) REFERENCES application_documents(document_id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES application_collections(collection_id) ON DELETE CASCADE
);

-- Create the application_collections_properties junction table
CREATE TABLE IF NOT EXISTS application_collections_properties (
    collection_id BIGINT UNSIGNED NOT NULL,
    property_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (collection_id, property_id),
    FOREIGN KEY (collection_id) REFERENCES application_collections(collection_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES application_properties(property_id) ON DELETE CASCADE
);

-- Create the user_documents table
CREATE TABLE IF NOT EXISTS user_documents (
    document_id SERIAL,
    user_id CHAR(36) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, document_name),
    UNIQUE KEY (document_id),
    FOREIGN KEY (user_id) REFERENCES authorizer.authorizer_users(id) ON DELETE CASCADE
);

-- Create the user_collections table
CREATE TABLE IF NOT EXISTS user_collections (
    collection_id SERIAL PRIMARY KEY,
    collection_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create the user_properties table
CREATE TABLE IF NOT EXISTS user_properties (
    property_id SERIAL PRIMARY KEY,
    property_name VARCHAR(255) NOT NULL,
    property_value JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (JSON_VALID(property_value))
);

-- Create the user_documents_collections junction table
CREATE TABLE IF NOT EXISTS user_documents_collections (
    document_id BIGINT UNSIGNED NOT NULL,
    collection_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (document_id, collection_id),
    FOREIGN KEY (document_id) REFERENCES user_documents(document_id) ON DELETE CASCADE,
    FOREIGN KEY (collection_id) REFERENCES user_collections(collection_id) ON DELETE CASCADE
);

-- Create the user_collections_properties junction table
CREATE TABLE IF NOT EXISTS user_collections_properties (
    collection_id BIGINT UNSIGNED NOT NULL,
    property_id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (collection_id, property_id),
    FOREIGN KEY (collection_id) REFERENCES user_collections(collection_id) ON DELETE CASCADE,
    FOREIGN KEY (property_id) REFERENCES user_properties(property_id) ON DELETE CASCADE
);