/**
 * Service Worker Application data constants.
 * 
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC
 * 
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>
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