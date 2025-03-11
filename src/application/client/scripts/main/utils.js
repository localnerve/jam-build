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
