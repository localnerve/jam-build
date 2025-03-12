/**
 * Handlebars block helpers.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

/**
 * Lift words from a sentence.
 * 
 * @param {String} sentence - The input sentence.
 * @param {Number} start - The start index.
 * @param {Number} end - The end index (word not included).
 * @returns {String} The sliced words in a string.
 */
export function subWords (sentence, start, end) {
  const words = sentence.match(/\b[^\s]+\b/g);
  if (words) {
    return words.slice(start, end).join(' ');
  }
  return '';
}

/**
 * Slice a given word string.
 * 
 * @param {String} word - The input word.
 * @param {Number} start - The start index.
 * @param {Number} end - The end index (end char not included).
 * @returns {String} The sliced chars as a new string.
 */
export function subChars (word, start, end) {
  return word.slice(start, end);
}

/**
 * Just for dumping template context
 *
 * @param {Array} targets - references to some objects you want to inspect
 */
/* eslint-disable no-console */
export function debug (...targets) {
  console.log('@@@ -- Current Context -- @@@');
  console.log(this);
  if (targets && targets.length > 0) {
    console.log('@@@ -- Targets -- @@@');
    targets.forEach((target, index) => {
      console.log(`Target ${index}:\n`, target);
    });
  }
  console.log('@@@ --------------------- @@@');
}
/* eslint-enable no-console */

/**
 * Helper to test strict equality.
 *
 * @param {*} value1 
 * @param {*} value2 
 * @returns true if strict equal, false otherwise.
 */
export function equals (value1, value2) {
  return value1 === value2;
}

/**
 * Return the svg partial name by page.
 *
 * @param {Object} hb - The handlebars instance
 * @param {String} page - The template data
 * @returns {String} The name of the svg template for the page or 'svg-none'
 */
export function svgPage (hb, page) {
  const svgPage = `svg-${page}`;
  if (svgPage in hb.partials) {
    return svgPage;
  }
  return 'svg-none';
}

export default {
  debug,
  equals,
  subChars,
  subWords,
  svgPage
};