/**
 * Top level Application.
 * 
 * Application execution mediator, eliminates code existence requirement, no guarrantee.
 * Allows on-demand exec BY NAME, without guarrantee, in any order:
 *   On exec, if a function is not yet present, it will be exec'd when added.
 *   On add, if a function was already requested for execution (BY NAME), execute.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
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