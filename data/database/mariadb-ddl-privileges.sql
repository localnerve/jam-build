--
-- Jam-build database privilege grants.
--
-- Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
-- Private use for LocalNerve, LLC only. Unlicensed for any other use.
--

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the application_documents and user_documents tables to jbadmin
-- Grant SELECT permissions on application_documents to jbuser
-- Grant SELECT, INSERT, UPDATE, DELETE on user_documents to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.application_documents TO 'jbadmin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_documents TO 'jbadmin'@'%';
GRANT SELECT ON jam_build.application_documents TO 'jbuser'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_documents TO 'jbuser'@'%';

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the application_collections and user_collections tables to jbadmin
-- Grant SELECT permissions on application_collections to jbuser
-- Grant SELECT, INSERT, UPDATE, DELETE permissions on user_collections to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.application_collections TO 'jbadmin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_collections TO 'jbadmin'@'%';
GRANT SELECT ON jam_build.application_collections TO 'jbuser'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_collections TO 'jbuser'@'%';

-- Grant SELECT, INSERT, UPDATE, DELETE permissions on the application_properties and user_properties tables to jbadmin
-- Grant SELECT permissions on application_properties to jbuser
-- Grant SELECT, INSERT, UPDATE, DELETE permissions on user_properties to jbuser
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.application_properties TO 'jbadmin'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_properties TO 'jbadmin'@'%';
GRANT SELECT ON jam_build.application_properties TO 'jbuser'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON jam_build.user_properties TO 'jbuser'@'%';

-- Grant execute permission on GetPropertiesForApplication/UserDocumentAndCollection to jbadmin, jbuser
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesForApplicationDocumentAndCollection TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesForApplicationDocumentAndCollection TO 'jbuser'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesForUserDocumentAndCollection TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesForUserDocumentAndCollection TO 'jbuser'@'%';

-- Grant execute permission on GetPropertiesAndCollectionsForApplication/UserDocument to jbadmin, jbuser
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsForApplicationDocument TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsForApplicationDocument TO 'jbuser'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsForUserDocument TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsForUserDocument TO 'jbuser'@'%';

-- Grant execute permission on GetPropertiesAndCollectionsAndDocumentsForApplication/ForUser to jbadmin, jbuser
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsAndDocumentsForApplication TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsAndDocumentsForApplication TO 'jbuser'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsAndDocumentsForUser TO 'jbadmin'@'%';
GRANT EXECUTE ON PROCEDURE jam_build.GetPropertiesAndCollectionsAndDocumentsForUser TO 'jbuser'@'%';

-- Grant execute permission on InsertPropertiesForApplicationDocumentCollection to jbadmin
GRANT EXECUTE ON PROCEDURE jam_build.UpsertApplicationDocumentWithCollectionsAndProperties TO 'jbadmin'@'%';

-- Grant execute permission on InsertPropertiesForUserDocumentCollection to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.UpsertUserDocumentWithCollectionsAndProperties TO 'jbuser'@'%';

-- Grant execute permission on DeleteApplicationDocument to jbadmin
GRANT EXECUTE ON PROCEDURE jam_build.DeleteApplicationDocument TO 'jbadmin'@'%';

-- Grant execute permission on DeleteApplicationCollection to jbadmin
GRANT EXECUTE ON PROCEDURE jam_build.DeleteApplicationCollection TO 'jbadmin'@'%';

-- Grant execute permission on DeleteApplicationProperties to jbadmin
GRANT EXECUTE ON PROCEDURE jam_build.DeleteApplicationProperties TO 'jbadmin'@'%';

-- Grant execute permission on DeleteUserDocument to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.DeleteUserDocument TO 'jbuser'@'%';

-- Grant execute permission on DeleteUserCollection to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.DeleteUserCollection TO 'jbuser'@'%';

-- Grant execute permission on DeleteUserProperties to jbuser
GRANT EXECUTE ON PROCEDURE jam_build.DeleteUserProperties TO 'jbuser'@'%';

-- Apply the changes immediately
FLUSH PRIVILEGES;
