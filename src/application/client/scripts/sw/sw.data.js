/**
 * Service Worker application data handling.
 * 
 * Build time replacements:
 *   API_VERSION - The X-Api-Version header value that corresponds to the api for this app version.
 *   SCHEMA_VERSION - The schema version corresponding to this app version.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

export function testFunc () {
  const apiVersion = API_VERSION; // eslint-disable-line
  const schemaVersion = SCHEMA_VERSION; // eslint-disable-line
  return {
    apiVersion,
    schemaVersion
  };
}