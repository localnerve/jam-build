/**
 * Service Worker Application data constants.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
export const schemaVersion = SCHEMA_VERSION; // eslint-disable-line -- assigned at bundle time
export const apiVersion = API_VERSION; // eslint-disable-line -- assigned at bundle time
export const versionStoreType = 'version';
export const batchStoreType = 'batch';
export const conflictStoreType = 'conflict';
export const dbname = 'jam_build';
export const baseStoreType = 'base';
export const fetchTimeout = 4500;
export const E_REPLAY = 0x062de3cc;
export const E_CONFLICT = 0x32c79766;
export const offlineRetentionTime = 30; // 30 minutes, session time
export const queueName = `${dbname}-requests-${apiVersion}`;
export const STALE_BASE_LIFESPAN = 60000; // 1 minute, baseStoreType documents older than this are considered expired
export const batchCollectionWindow = process?.env?.NODE_ENV !== 'production' ? 12000 : 12000; // eslint-disable-line -- assigned at bundle time
export const mainStoreTypes = ['app', 'user'];