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
 * Create a hex hash digest string for a given input string.
 * 
 * @param {String} input - A string to create the hash digest for
 * @returns {String} A hex string hash digest for the input
 */
export async function hashDigest (input) {
  const msgUint8 = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// -------------------
// storeType utilities
// -------------------

const storeTypeDelim = ':';

/**
 * Make storeType from store and scope
 */
export function makeStoreType (store, scope) {
  return `${store}${storeTypeDelim}${scope}`;
}

/**
 * Convert storeType to an array of tokens.
 * Strip any hex userId from storeType if it is there.
 * 
 * @param {String} storeType - The storeType path to a document
 * @returns {Array} an Array of the storeType tokens
 */
export function storeTypeToArray (storeType) {
  return storeType.split(storeTypeDelim).filter(t => !/^[0-9a-fA-F]+$/.test(t));
}