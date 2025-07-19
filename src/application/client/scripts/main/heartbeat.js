/**
 * Heartbeat management. Maintains serviceWorker timer activity windows.
 * serviceWorker activity windows are used to manage batch updates (and state saves).
 * 
 * Notes on visibilitychange to save state:
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event
 * >> https://www.igvita.com/2015/11/20/dont-lose-user-and-app-state-use-page-visibility/
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import debugLib from '@localnerve/debug';

const debug = debugLib('heartbeat');

const heartbeats = Object.create(null);

/**
 * Update the lastUserActivity timestamp.
 * 
 * @param {Object} heartbeats - A reference to the heartbeats object
 * @param {String} name - The timer name
 */
function updateUserActivity (heartbeats, name) {
  heartbeats[name].lastUserActivity = Date.now();
}

/**
 * Update the lastUserActivity timestamp and connect to activity events.
 * 
 * @param {String} name - The timer name
 */
function userActivityStart (name) {
  debug('starting user activity monitor');

  heartbeats[name].lastUserActivity = Date.now();
  window.addEventListener('mousemove', heartbeats[name].updateUserActivity);
  window.addEventListener('keydown', heartbeats[name].updateUserActivity);
  window.addEventListener('touchstart', heartbeats[name].updateUserActivity);
}

/**
 * Remove the activity events.
 * 
 * @param {String} name - The timer name
 */
function userActivityStop (name) {
  debug('stopping user activity monitor');

  window.removeEventListener('mousemove', heartbeats[name].updateUserActivity);
  window.removeEventListener('keydown', heartbeats[name].updateUserActivity);
  window.removeEventListener('touchstart', heartbeats[name].updateUserActivity);
}

/**
 * See if elapsed time has exceeded maxInactive time.
 * 
 * @param {String} name - The timer name
 * @returns {Boolean} true if exceeded, false otherwise
 */
function userActivityCheck (name) {
  const heartbeat = heartbeats[name];
  const currentTime = Date.now();
  return currentTime - heartbeat.lastUserActivity > heartbeat.maxInactiveTime;
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
  
  heartbeatStop(name);

  const reg = await navigator.serviceWorker.ready; // eslint-disable-line compat/compat

  heartbeats[name] = {
    interval: setInterval(name => {
      reg.active.postMessage({
        action: 'heartbeat-beat',
        payload: {
          name,
          inactive: userActivityCheck(name)
        }
      });
    }, interval, name),
    updateUserActivity: updateUserActivity.bind(null, heartbeats, name),
    maxInactiveTime: maxInactive,
    lastUserActivity: 0
  };

  userActivityStart(name);

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
  debug('stop heartbeat', name, !!heartbeats[name]);

  if (heartbeats[name]) {
    userActivityStop(name);
    clearInterval(heartbeats[name].interval);
    delete heartbeats[name];
  }
}

/**
 * Service worker event handler.
 * 
 * @param {Event} event - The service worker message event
 */
function swMessageHandler (event) {
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
 * If visibilitychange visibilityState == 'hidden' service all timers now.
 */
async function visibilityHandler () {
  if (document.visibilityState == 'hidden') {
    debug('visibilityState == hidden, request service all timers now');
  
    const reg = await navigator.serviceWorker.ready;
    const timerNames = Object.keys(heartbeats);

    for (const name of timerNames) {
      heartbeatStop(name);
    }

    reg.active.postMessage({
      action: 'service-timers-now',
      payload: { timerNames }
    });
  }
}

/**
 * Setup heartbeat messaging.
 * 
 * @param {Object} support - The browser support matrix
 */
export default function setup (support) {
  if (support.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', swMessageHandler);
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}