/**
 * inline browser javascript.
 * 
 * Variables replaced at bundle time:
 *   POLY_TEST_FN - a function that returns true if polyfill is required
 *   POLY_TEST - the name of that function
 *   POLY_URL - the url to get the polyfills from
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import './app.js';     // App Comm mediator
import './sw.js';      // Forward msgs from sw

(function () {
  /**
   * Main loader.
   * Conditionally polyfill the browser, call app entry when done.
   */
  function loader () {
    POLY_TEST_FN // eslint-disable-line
    const polyRequired = (
      typeof POLY_TEST === 'function' && (POLY_TEST)() // eslint-disable-line
    );
    const polyUrl = POLY_URL; // eslint-disable-line

    const appjs = document.querySelector('[name="appjs"]').getAttribute('content');
    const swRegjs = document.querySelector('[name="swregjs"]').getAttribute('content');

    const urls = [appjs];

    if (swRegjs) {
      urls.unshift(swRegjs);
    }

    if (polyRequired) {
      urls.unshift(polyUrl);
    }

    function load (s, url) {
      let started = false;
      s.onload = function () {
        if ('App' in window && !started) {
          started = true;
          window.App.exec('start', { once: true });
        }
      };
      s.onerror = function (e) {
        e.preventDefault();
        e.stopPropagation();
      };
      s.setAttribute('async', true);
      s.setAttribute('type', 'module');
      s.setAttribute('src', url);
      document.head.appendChild(s);
    }

    for (let i = 0; i < urls.length; i++) {
      load(
        document.createElement('script'),
        urls[i]
      );
    }
  }

  const htmlElement = document.documentElement;
  htmlElement.classList.remove('no-js');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loader, { once: true });
  } else {
    loader();
  }
}());