/**
 * Page data mutation utility functions.
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
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com> (https://www.localnerve.com), LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */
import { expect } from '#test/fixtures.js';

export const slowTimeoutAddition = 20000;

/**
 * Do mutations on a refernce to an editable-object control.
 * Assumes input data presets from testdata.js
 * 
 * By default:
 * Update property1, property2
 * Delete property3, property4
 * Create property5
 * 
 * @param {EditableObjectControl} control - The editable-object control to operate on
 * @param {Object} [mutations] - The creates, updates, and deletes to do
 * @param {Array<Array>} [mutations.doCreates] - Array of [name, value] pairs to create
 * @param {Array<String>} [mutations.doUpdates] - Array of property names to update (values are always increment the lastchar)
 * @param {Array<String>} [mutations.doDeletes] - Array of property names to delete
 * @param {Number} [mutations.deletePosition] - The position in the property array to start consecutive delets from
 * @returns {Object} of updateProps, createProps, and deleteProps
 */
export async function doMutations (control, {
  doCreates = [ ['property5', 'value55'] ],
  doUpdates = ['property1', 'property2'],
  doDeletes = ['property3', 'property4'],
  deletePosition = 2
} = {}) {
  /**
   * Updates
   */
  let lastProp;
  const updateProps = doUpdates.reduce((acc, cur) => {
    acc[cur] = null;
    return acc;
  }, {});
  for (const propName of Object.keys(updateProps)) {
    lastProp = control.getByLabel(propName);
    
    const value = await lastProp.inputValue();
    const newValue = `${value}${value.charAt(value.length - 1)}`;
    updateProps[propName] = newValue;

    await lastProp.dblclick(); // set to edit mode
    await lastProp.fill(newValue);
    await lastProp.press('Enter');
  }

  // assist any visual debugging
  await lastProp.scrollIntoViewIfNeeded();

  // mutationQueue 67ms, plus 
  await new Promise(res => setTimeout(res, 167)); // increase this to visually debug

  /**
   * Delete props
   */
  const deleteProps = doDeletes;
  for (const propName of deleteProps) {
    const prop = control.getByLabel(propName);
    // * not sure why I have to click before this, but I do. probably visibility in the control...
    await prop.click();

    const propLI = (await control.getByRole('listitem').all())[deletePosition];
    await propLI.getByTitle('Remove').click();
  }

  // mutationQueue 67ms, plus 
  await new Promise(res => setTimeout(res, 167)); // increase this to visually debug

  /**
   * Create props
   */
  const createProps = doCreates.reduce((acc, [name, value]) => {
    acc[name] = value;
    return acc;
  }, {});
  for (const [newPropName, newPropValue] of Object.entries(createProps)) {
    const newProp = control.getByLabel('New Property and Value');
    await newProp.fill(`${newPropName}:${newPropValue}`);
    await newProp.press('Enter');
  }

  // mutationQueue 67ms, plus 
  await new Promise(res => setTimeout(res, 167)); // increase this to visually debug

  return {
    updateProps,
    createProps,
    deleteProps
  };
}

/**
 * Quick test to see if a stale data message exists.
 */
export async function testMessageExists (page, expectMessageExists = false) {
  // Check for an app message.
  const message = page.locator('.pp-message');
  if (!expectMessageExists) {
    await expect(message).toBeHidden();
  } else {
    await expect(message).toBeVisible();
  }
}

/**
 * Verify the mutations from doMutations were successful at this moment.
 */
export async function testMutations (page, control, mutations, messageExists = false) {
  await testMessageExists(page, messageExists);

  // Test updates
  for (const [propName, propValue] of Object.entries(mutations.updateProps)) {
    await expect(control.getByLabel(propName)).toHaveValue(propValue);
  }

  // Test creates
  for (const [propName, propValue] of Object.entries(mutations.createProps)) {
    await expect(control.getByLabel(propName)).toHaveValue(propValue);
  }

  // Test deletes
  for (const propName of mutations.deleteProps) {
    await expect(control.locator(`input[name="${propName}"]`)).toHaveCount(0);
  }
}

/**
 * Force a batch terminus by navigating away and back.
 *
 * @param {Page} page - The page to navigate
 * @param {String} away - aria-label label of the away anchor
 * @param {String} baseUrl - The baseUrl
 * @param {Number} clickWait - The wait time after navigation clicks
 */
export async function forceBatchTerminusNav (page, away, baseUrl, clickWait) {
  const activeLocator = page.locator('a[class="active"]');
  const activeAnchor = await activeLocator.nth(1);
  const activeLabel = await activeAnchor.getAttribute('aria-label');

  const awayLocator = page.locator(`a[aria-label="${away}"]`);
  const awayAnchor = await awayLocator.nth(1);
  const awayUrl = `${baseUrl}/${away.toLowerCase()}`;

  await awayAnchor.click();
  await page.waitForURL(awayUrl, {
    timeout: 5000
  });
  await expect(page).toHaveURL(awayUrl);

  await new Promise(res => setTimeout(res, clickWait));

  const backLocator = page.locator(`a[aria-label="${activeLabel}"]`);
  const backAnchor = await backLocator.nth(1);
  const backUrl = activeLabel == 'Home' ? baseUrl : `${baseUrl}/${activeLabel.toLowerCase()}`;

  await backAnchor.click();
  await page.waitForURL(backUrl, {
    timeout: 5000
  });
  await expect(page).toHaveURL(backUrl);

  await new Promise(res => setTimeout(res, clickWait));
}