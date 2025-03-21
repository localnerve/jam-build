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
 * Capitalize the first character of every word in a sentence.
 * 
 * @param {String} sentence - A sentence of words.
 */
export function capFirst (sentence) {
  const words = sentence.match(/\b[^\s]+\b/g);
  if (words) {
    const newWords = new Array(words.length);
    let newWord;
    for (let i = 0; i < words.length; i++) {
      newWord = `${words[i][0].toLocaleUpperCase()}${words[i].slice(1)}`;
      newWords[i] = newWord;
    }
    return newWords.join(' ');
  }
  return '';
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
 * Helper to concatenate given strings.
 * 
 * @param  {...any} args - The arguments, strings are filtered from here.
 * @returns A concatenated string from given strings.
 */
export function concat (...args) {
  return args.filter(arg => typeof arg === 'string').join('');
}

/**
 * Store a temporary state variable.
 * 
 * @param {Object} reference - A storage object.
 * @param {any} value1 - A value to store.
 */
export function setState (reference, value1) {
  reference.__state = value1;
}

/**
 * Retrieve a temporary state variable.
 *
 * @param {Object} reference - A storage object.
 * @returns {Any} some state variable.
 */
export function getState (reference) {
  return reference.__state;
}

/**
 * Add one to a given numeric input.
 * 
 * @param {String|Number} input - A numeric value.
 * @returns {String} A number incremented by one.
 */
export function inc (input) {
  return ((+input) + 1).toString();
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
  capFirst,
  concat,
  debug,
  equals,
  getState,
  inc,
  setState,
  subChars,
  subWords,
  svgPage
};