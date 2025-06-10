/**
 * utility functions.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Copyrights licensed under the BSD License. See the accompanying LICENSE file for terms.
 */

/**
 * Pull the numeric part of a string and parse as float.
 *
 * @param {String} input - The string to parse as float.
 * @returns {Number} The parsed float.
 */
export function getNumber (input) {
  const reNotNum = /[^.+\-\d]+/;
  return parseFloat(input.replace(reNotNum, ''));
}

/**
 * Get the numeric value of one or more style props. Adds multiple props together.
 *
 * @param {Object} style - A CSSStyleDeclaration object.
 * @param {Array} props - One or more property names.
 * @returns {Number} The sum of all the float values of the props.
 */
export function getStyleNumber (style, ...props) {
  return props.reduce(
    (acc, prop) => acc + getNumber(style.getPropertyValue(prop) || '0'),
    0
  );
}

/**
 * Stringify a simple object (no circular refs considered).
 * 
 * @param {Object} obj - The object to JSON.stringify
 * @returns {String} The stringified object
 */
/*
export function stringifyObject (obj) {
  if (typeof obj !== 'object' || obj === null) {
    return JSON.stringify(obj);
  }

  // eslint-disable-next-line no-param-reassign
  if (Object.prototype.toString.call(obj) === '[object RegExp]') obj = {
    pattern: obj.source,
    flags: obj.flags
  };

  const props = Object.keys(obj);

  const values = props.map(key => {
    let value = obj[key];
    if (typeof value === 'object' && !Array.isArray(value)) {
      return `"${key}":${stringifyObject(value)}`;
    } else {
      if (typeof value === 'bigint') value = `${value}`;
      if (typeof value === 'undefined') value = null;
      if (typeof value === 'symbol') value = null;
      return `"${key}":${JSON.stringify(value)}`;
    }
  });

  return `{${values.join(',')}}`;
}
*/