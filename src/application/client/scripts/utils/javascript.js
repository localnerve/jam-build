/**
 * General javascript utility functions.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

export const isObj = thing => Object.prototype.toString.call(thing) === '[object Object]';

export const hasOwnProperty = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

export const isNullish = val => val === undefined || val === null;