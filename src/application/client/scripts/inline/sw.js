/**
 * Service worker related inline code.
 * 
 * ServiceWorker 'message' handler, Why here?
 * Per https://developers.google.com/web/tools/workbox/modules/workbox-broadcast-update:
 *   "Make sure to add the message event listener before the DOMContentLoaded event, 
 *    as browsers will queue messages received early in the page load (before your JavaScript code has had a chance to run)
 *    up until (but not after) the DOMContentLoaded event."
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

(function () {
  /**
   * Service Worker Message Handler
   * Handle early messages from sw to the page.
   *
   * @param {Event} event - Message Event
   * @param {Object} event.data - Service Worker message data envelope
   * @param {String} event.data.meta - Identifier for the message
   * @param {String} [event.data.payload] - A message payload
   */
  function swMessageHandler (event) {
    const msgId = event?.data?.meta;
    const payload = event?.data?.payload;

    switch (msgId) {
      case 'workbox-broadcast-update':
        window.App.exec('pageUpdatePrompt');
        break;
      case 'database-update-required':
        window.App.exec('pageSwMessage', {
          args: {
            isUpdate: true,
            duration: 1000
          }
        });
        break;
      case 'database-data-update':
        window.App.exec('pageDataUpdate', {
          args: payload
        });
        break;
      default:
        break;
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', swMessageHandler);

    // defer install prompt
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      const installPromptEvent = new CustomEvent('installPromptAvailable', { detail: e });
      window.App.add('installPromptEvent', () => {
        document.dispatchEvent(installPromptEvent);
      });
    });
  }
}());