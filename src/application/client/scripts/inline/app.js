/**
 * Top level Application.
 * 
 * Application execution mediator, eliminates code existence requirement, no guarrantee.
 * Allows on-demand exec BY NAME, without guarrantee, in any order:
 *   On exec, if a function is not yet present, it will be exec'd when added.
 *   On add, if a function was already requested for execution (BY NAME), execute.
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
 * If not, see <https://www.gnu.org/licenses/>.
 * Additional terms under GNU AGPL version 3 section 7:
 * a) The reasonable legal notice of original copyright and author attribution must be preserved
 *    by including the string: "Copyright (c) 2025 Alex Grant <info@localnerve.com>, LocalNerve LLC"
 *    in this material, copies, or source code of derived works.
 */

class Application {
  constructor () {
    this._methods = Object.create(null);
    this._execOnAdd = Object.create(null);
  }

  add (name, method) {
    if (this._methods[name]) {
      return false;
    }
    this._methods[name] = method;
    const execOnAdd = this._execOnAdd[name];
    if (execOnAdd) {
      this._methods[name](execOnAdd.args);
      if (execOnAdd.once) {
        delete this._methods[name];
      }
    }
    return true;
  }

  exec (name, opts = {}) {
    if (this._methods[name]) {
      this._methods[name](opts.args);
      if (opts.once) {
        delete this._methods[name];
      }
    } else {
      this._execOnAdd[name] = opts;
    }
  }
}

window.App = new Application();