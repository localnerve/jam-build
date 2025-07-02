/**
 * Heartbeat management. Maintains serviceWorker timer activity windows.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';

const debug = debugLib('heartbeat');

const heartbeats = Object.create(null);

let maxInactiveTime;
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
  debug('starting user activity monitor');

  lastUserActivity = Date.now();
  window.addEventListener('mousemove', updateUserActivity);
  window.addEventListener('keydown', updateUserActivity);
  window.addEventListener('touchstart', updateUserActivity);
}

/**
 * Remove the activity events.
 */
function userActivityStop () {
  debug('stopping user activity monitor');

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
  return currentTime - lastUserActivity > maxInactiveTime;
}

/**
 * Start the heartbeat interval, monitor user activity, tell the service worker.
 * 
 * @param {String} name - The timer name
 * @param {Number} interval - The timer interval
 * @param {Number} maxInactive - The max time of inactivity
 */
async function heartbeatStart (name, interval, maxInactive) {
  debug('start heartbeat', name, interval, maxInactive);

  const reg = await navigator.serviceWorker.ready; // eslint-disable-line compat/compat

  maxInactiveTime = maxInactive;

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
 * 
 * @param {String} name - The timer name
 */
function heartbeatStop (name) {
  debug('stop heartbeat', name);

  userActivityStop();
  clearInterval(heartbeats[name]);
}

/**
 * Service worker event handler.
 * 
 * @param {Event} event - The service worker message event
 */
function messageHandler (event) {
  const msgId = event?.data?.meta;
  const payload = event?.data?.payload;

  switch (msgId) {
    case 'heartbeat-start':
      heartbeatStart(payload.name, payload.interval, payload.maxInactive);
      break;

    case 'heartbeat-stop':
      heartbeatStop(payload.name);
      break;
  }
}

/**
 * Setup heartbeat messaging.
 * 
 * @param {Object} support - The browser support matrix
 */
export default function setup (support) {
  if (support.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', messageHandler);
  }
}