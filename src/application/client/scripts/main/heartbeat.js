/**
 * Heartbeat management. Maintains serviceWorker timer activity windows.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

const heartbeats = Object.create(null);
const maxInactive = 10000;

let lastUserActivity;

/**
 * Update the lastUserActivity timestamp.
 */
function updateUserActivity() {
  lastUserActivity = Date.now();
}

/**
 * Update the lastUserActivity timestamp and connect to activity events.
 */
function userActivityStart () {
  lastUserActivity = Date.now();
  window.addEventListener('mousemove', updateUserActivity);
  window.addEventListener('keydown', updateUserActivity);
  window.addEventListener('touchstart', updateUserActivity);
}

/**
 * Remove the activity events.
 */
function userActivityStop () {
  window.removeEventListener('mousemove', updateUserActivity);
  window.removeEventListener('keydown', updateUserActivity);
  window.removeEventListener('touchstart', updateUserActivity);
}

/**
 * See if elapsed time has exceeded maxInactive time.
 * 
 * @returns {Boolean} true if exceeded, false otherwise.
 */
function userActivityCheck () {
  const currentTime = Date.now();
  return currentTime - lastUserActivity > maxInactive;
}

/**
 * Start the heartbeat interval, monitor user activity, tell the service worker.
 */
async function heartbeatStart (name, interval) {
  const reg = await navigator.serviceWorker.ready;

  heartbeats[name] = setInterval(() => {
    reg.active.postMessage({
      action: 'heartbeat-beat',
      payload: {
        name,
        inactive: userActivityCheck()
      }
    });
  }, interval);

  userActivityStart();

  reg.active.postMessage({
    action: 'heartbeat-start',
    payload: { name }
  });
}

/**
 * Stop the user activity monitor, clear the heartbeat interval.
 */
function heartbeatStop (name) {
  userActivityStop();
  clearInterval(heartbeats[name]);
}

/**
 * Service worker event handler.
 */
function messageHandler (event) {
  const msgId = event?.data?.meta;
  const payload = event?.data?.payload;

  switch (msgId) {
    case 'heartbeat-start':
      heartbeatStart(payload.name, payload.interval);
      break;

    case 'heartbeat-stop':
      heartbeatStop(payload.name);
      break;
  }
}

/**
 * Setup heartbeat messaging.
 */
export function setup (support) {
  if (support.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', messageHandler);
  }
}