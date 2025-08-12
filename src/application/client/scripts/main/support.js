/**
 * Determine browser support.
 * Hacks to reason about the browser capabilities.
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
/* eslint-disable compat/compat */

function detectNoCanvas () {
  const elem = document.createElement('canvas');
  return !(elem.getContext && elem.getContext('2d'));
}

function detectIE () {
  return matchMedia(
    '(-ms-high-contrast: active), (-ms-high-contrast: none)'
  ).matches;
}

function detectSafariDesktop () {
  return !!window.safari;
}

function detectIOSWebkit () {
  const ua = window.navigator.userAgent;
  const iOS = !!ua.match(/(iPod|iPhone|iPad)/);
  const webkit = !!ua.match(/WebKit/i);
  return iOS && webkit;
}

function detectSafariDesktopOrIOSWebkit () {
  return detectSafariDesktop() || detectIOSWebkit();
}

function detectSafariMobile () {
  const ua = window.navigator.userAgent;
  const iosWebkit = detectIOSWebkit();
  return iosWebkit && !ua.match(/CriOS/i);
}

function detectNoRegisterProperty () {
  return !('registerProperty' in window.CSS);
}

function detectSafari () {
  return detectSafariDesktop() || detectSafariMobile();
}

function determineBackgroundSyncSupport () {
  if ('ServiceWorkerRegistration' in window) {
    const hasSync =
      Object.prototype.hasOwnProperty.call(ServiceWorkerRegistration.prototype, 'sync');
    if (hasSync) {
      return navigator.serviceWorker.ready.then(reg => {
        return new Promise(resolve => {
          navigator.serviceWorker.addEventListener('message', event => {
            const { action, result } = event.data;
            if (action === 'ln-background-sync-support-test') {
              resolve(result);
            }
          }, {
            once: true
          });
          reg.active.postMessage({ action: 'ln-background-sync-support-test' });
        });
      });
    }
    return Promise.resolve(false);
  }
  return Promise.resolve(false);
}

function lazySetBackgroundSyncSupport (support) {
  support.backgroundSync = false;
  support.backgroundExec(determineBackgroundSyncSupport, 3500)
    .then(result => {
      if (support) {
        // console.log('@@@ set support.backgroundSync', result);
        support.backgroundSync = result;
      }
    })
    .catch(e => {
      /* eslint-disable no-console */
      console.error('backgroundSyncSupport', e);
      /* eslint-enable no-console */
    });
}

function detectMessagingSupport () {
  return (
    'PushManager' in window &&
    'Notification' in window &&
    'ServiceWorkerRegistration' in window &&
    'PushSubscription' in window &&
    Object.prototype.hasOwnProperty.call(ServiceWorkerRegistration.prototype, 'showNotification') &&
    Object.prototype.hasOwnProperty.call(PushSubscription.prototype, 'getKey')
  );
}

/**
 * Create the support flags.
 *
 * @return Promise resolves to support object.
 */
export default function setup () {
  const nomsgClassname = 'no-messaging';
  const support = {
    passiveEvent: false,
    serviceWorker: 'serviceWorker' in navigator,
    isSafari: detectSafari(),
    isSafariDesktop: detectSafariDesktop(),
    isFF: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
    isIE: detectIE(),
    isIOSWebkit: detectIOSWebkit(),
    messaging: detectMessagingSupport(),
    htmlElement: document.querySelector('html'),
    backgroundExec: (asyncFn, timeout) => {
      return new Promise ((resolve, reject) => {
        const wrapper = () => {
          asyncFn().then(resolve).catch(reject);
        };
        let bgExec;
        if ('requestIdleCallback' in window) {
          bgExec = requestIdleCallback.bind(null, wrapper, { timeout });
        } else {
          bgExec = setTimeout.bind(null, wrapper, timeout);
        }
        bgExec();
      });
    },

    forceNoMessaging () {
      if (this.htmlElement) {
        this.htmlElement.classList.add(nomsgClassname);
      }
    },
  
    init () {
      const classList = [];
      const tests = [{
        fn: detectNoCanvas,
        className: 'no-canvas'
      }, {
        fn: detectNoRegisterProperty,
        className: 'no-register-property'
      }, {
        fn: detectSafari,
        className: 'safari'
      }, {
        fn: detectIOSWebkit,
        className: 'ios-webkit'
      }, {
        fn: detectSafariMobile,
        className: 'safari-mobile'
      }, {
        fn: detectSafariDesktop,
        className: 'safari-desktop'
      }, {
        fn: detectSafariDesktopOrIOSWebkit,
        className: 'safari-or-ios-webkit'
      }, {
        fn: detectMessagingSupport,
        className: nomsgClassname
      }];

      tests.forEach(test => {
        if (test.fn()) {
          classList.push(test.className);
        }
      });
    
      if (classList.length > 0) {
        this.htmlElement.classList.add(...classList);
      }
    }
  };

  function determinePassiveEventSupport (done) {
    let completed = false;
    function complete () {
      !completed && done();
      completed = true;
    }

    try {
      const options = {
        get passive () {
          support.passiveEvent = true;
          complete();
          return true;
        }
      };
  
      window.addEventListener('test', null, options);
      window.removeEventListener('test');
    } catch {
      complete();
    }
    setTimeout(complete, 50);
  }

  return new Promise(resolve => {
    lazySetBackgroundSyncSupport(support);
    determinePassiveEventSupport(() => {
      resolve(support);
    });
  });
}
