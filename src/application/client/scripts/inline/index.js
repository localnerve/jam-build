/**
 * inline browser javascript.
 * 
 * This app runs the whole page every time, no state.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import './app.js';     // App Comm mediator
import './sw.js';      // Forward msgs from sw

(function () {

  /**
   * Maintain no-nav pseudo-state by root element class or qs.
   */
  function noNavCheck (htmlElement) {
    function noNavUpdate () {
      let anchors, href, hasNn, i;
      const currentHostname = window.location.hostname;
      htmlElement.classList.add('no-nav');
      anchors = document.querySelectorAll('a');
      if (anchors && anchors.length > 0) {
        for (i = 0; i < anchors.length; i++) {
          if (anchors[i].hostname === currentHostname) {
            href = anchors[i].getAttribute('href');
            hasNn = href.indexOf('?') > -1 && href.indexOf('nonav') > -1;
            if (!hasNn) {
              href += '?nonav=true';
              anchors[i].setAttribute('href', href);
            }
          }
        }
      }
    }

    let nonav = htmlElement.classList.contains('no-nav');
    if (!nonav) {
      const m = /nonav=([^&]+)/.exec(window.location.search);
      nonav = m && m.length > 1 && m[1].toLowerCase().trim() === 'true';
    }
    if (nonav) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', noNavUpdate, {
          once: true
        });
      } else {
        noNavUpdate();
      }
    }
  }

  /**
   * Detect if the browser can use the modern app build.
   * This covers partial support of safari 10.1 (not modernjs)
   */
  /*
  function isModernJS () {
    return 'noModule' in HTMLScriptElement.prototype;
  }
  */

  /**
   * Main loader.
   * Conditionally polyfill the browser, call app entry when done.
   */
  function loader () {
    const polyRequired = !(
      'fetch' in window &&
      'IntersectionObserver' in window &&
      'Promise' in window &&
      'from' in Array
    );
    const polyUrl = 'https://polyfill-fastly.io/v3/polyfill.min.js?features=IntersectionObserver,fetch,es6';

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

  noNavCheck(htmlElement);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loader, { once: true });
  } else {
    loader();
  }
}());