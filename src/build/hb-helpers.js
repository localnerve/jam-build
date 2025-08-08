/**
 * Handlebars block helpers.
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
 * Helper to concatenate given strings.
 * 
 * @param  {Array} args - The arguments, strings are filtered from here.
 * @returns {String} A concatenated string from given strings.
 */
export function concat (...args) {
  return args.filter(arg => typeof arg === 'string').join('');
}

/**
 * Helper to extract parts of a string that are word characters but exclude other words.
 * 
 * @param {String} subject - The string to operate on.
 * @param {Array} args - zero or more substrings to remove.
 * @returns {String} Space delimited words
 */
export function strip (subject, ...args) {
  const exclusions = args.filter(arg => typeof arg === 'string');
  const intermediate = subject.match(/[A-Z]+/gi);

  const words = [];
  for (let i = 0; i < intermediate.length; i++) {
    if (!exclusions.includes(intermediate[i])) {
      words.push(intermediate[i]);
    }
  }

  return words.join(' ');
}

/**
 * Store a temporary state variable.
 * 
 * @param {Object} reference - A storage object.
 * @param {*} value1 - A value to store.
 */
export function setState (reference, value1) {
  reference.__state = value1;
}

/**
 * Retrieve a temporary state variable.
 *
 * @param {Object} reference - A storage object.
 * @returns {*} some state variable.
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
 * Helper to test strict equality.
 *
 * @param {*} value1 
 * @param {*} value2 
 * @returns {Boolean} true if strict equal, false otherwise.
 */
export function equals (value1, value2) {
  return value1 === value2;
}

/**
 * Helper to evaluate 'or' truth.
 * 
 * @param {*} value1 - The first operand.
 * @param {*} value2 - The second operand.
 * @returns {Boolean} true if either val1 or val2 are true, false otherwise.
 */
export function or (value1, value2) {
  return value1 || value2;
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

/**
 * Helper to root all file urls to the file web root.
 * 
 * @param {String} root - The root of the file on the web.
 * @param {String} file - The relative path to the file.
 * @returns {String} The full url to the image.
 */
export function fileUrl (root, file) {
  return `${root}/${file}`;
}

export default {
  capFirst,
  concat,
  debug,
  equals,
  fileUrl,
  getState,
  inc,
  or,
  setState,
  strip,
  subChars,
  subWords,
  svgPage
};