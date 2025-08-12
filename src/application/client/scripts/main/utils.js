/**
 * utility functions.
 *
 * Jam-build, a web application practical reference.
 * Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC
 *
 * This file is part of Jam-build.
 * Jam-build is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 * Jam-build is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 * You should have received a copy of the GNU Affero General Public License along with Jam-build.
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *   by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *   in this material, copies, or source code of derived works.
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
