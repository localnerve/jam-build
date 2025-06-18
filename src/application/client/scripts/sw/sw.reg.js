/**
 * Service Worker Registration.
 * 
 * This is the only request not cached.
 * Update here to perform normative interruptive change.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

import { Workbox } from 'workbox-window';

function handleAfterInstall (event) {
  window.App.exec('pageReloadOnUpdate', {
    args: {
      isUpdate: event.isUpdate,
      duration: 1500
    }
  });
}

function handleWaiting (wb) {
  window.App.exec('pageInstallPrompt', {
    args: {
      startInstall: () => {
        wb.messageSkipWaiting();
      }
    }
  });
}

if ('serviceWorker' in navigator) {
  const wb = new Workbox('/sw.main.js');
  wb.addEventListener('waiting', handleWaiting.bind(null, wb));
  wb.addEventListener('controlling', handleAfterInstall);
  wb.register();
}
