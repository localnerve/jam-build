/**
 * A timer for the service worker.
 * The timer requires a heartbeat with clients so that it can have some assurance it is not irrelevant or possibly about to be shutdown.
 * There are no guarantees, but a heartbeat is as close as we get to having a viable timer mechanism in a service worker.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { debug, sendMessage } from './sw.utils.js';

const timers = Object.create(null);
const heartbeat = Object.create(null);

/**
 * Message handler for heartbeat messages
 */
self.addEventListener('message', event => {
  const { action, payload = {} } = event.data;

  switch (action) {
    case 'heartbeat-start':
      debug(`heartbeat-start ${payload.name}, ${Date.now()}`);
      if (heartbeat[payload.name]) {
        heartbeat[payload.name].set(event.source.id, {
          time: Date.now(),
          inactive: false
        });
      } else {
        heartbeat[payload.name] = new Map([[event.source.id, {
          time: Date.now(),
          inactive: false
        }]]);
      }
      break;

    case 'heartbeat-beat':
      debug(`heartbeat-beat ${payload.name}, ${Date.now()}, inactive: `, payload.inactive);
      if (heartbeat[payload.name]) {
        heartbeat[payload.name].set(event.source.id, {
          time: Date.now(),
          inactive: payload.inactive
        });
      }
      break;

    case 'service-timers-now':
      debug(`service-timers-now ${payload.timerNames}`);
      for (const name of payload.timerNames) {
        serviceTimer(name);
      }
      break;

    default:
      break;
  }
});

/**
 * Begin heartbeat for a named timer.
 * 
 * @param {String} timerName - The timer name
 * @param {Number} interval - The heartbeat interval
 */
async function startHeartbeat (timerName, interval, maxInactive) {
  await sendMessage('heartbeat-start', {
    name: timerName,
    interval,
    maxInactive
  });
}

/**
 * End heartbeat for a named timer.
 * 
 * @param {String} timerName - The timer name
 */
async function stopHeartbeat (timerName) {
  delete heartbeat[timerName];

  await sendMessage('heartbeat-stop', {
    name: timerName
  });
}

/**
 * Check heartbeat for a named timer.
 * If no heartbeat under resolution time OR if all clients are inactive then return false,
 * indicating that the timer should be serviced and reset.
 *  > If there are active clients AND we have a valid heartbeat return true
 *
 * @param {String} timerName - The timer name
 * @param {Number} resolution - The timer resolution
 * @returns {Boolean} true if timer should continue, false otherwise.
 */
function checkHeartbeat (timerName, resolution) {
  debug(`checkHeartbeat ${timerName}`, heartbeat);

  const clientCount = heartbeat[timerName].size;
  let lastTime = Number.MAX_SAFE_INTEGER;
  let inactiveCount = 0;
  
  // Get the shortest heartbeat time and track the client activity
  for (const beat of heartbeat[timerName].values()) {
    if (beat.time < lastTime) lastTime = beat.time;
    if (beat.inactive) inactiveCount++;
  }

  debug(`clients have heartbeat: ${Date.now() - lastTime <= resolution}`);
  debug(`clients are inactive: ${inactiveCount === clientCount}`);

  // If there are active clients AND we have a valid heartbeat return true
  return inactiveCount !== clientCount && Date.now() - lastTime <= resolution;
}

/**
 * Service the function expressed by the timer.
 * 
 * @param {String} timerName - The name identifying the timer
 */
function serviceTimer (timerName) {
  if (timers[timerName]) {
    debug(`servicing timer ${timerName}`);

    clearInterval(timers[timerName].intervalId);

    const callback = timers[timerName].callback;
    callback();
    
    stopHeartbeat(timerName);
    delete timers[timerName];
  } else {
    debug(`Timer ${timerName} already serviced, SKIPPING`);
  }
}

/**
 * Service all timers currently in the timers object.
 */
export function serviceAllTimers () {
  const timerNames = Object.keys(timers);

  debug(`serviceAllTimers ${timerNames}`);

  for (const timerName of timerNames) {
    serviceTimer(timerName);
  }
}

/**
 * Start or reset a timer by name.
 * Start a heartbeat for a new timer.
 * If the heartbeat skips, consider the timer expired and service the timer.
 * 
 * @param {Number} duration - The timer duration
 * @param {String} timerName - The name identifying the timer
 * @param {Function} callback - The callback,
 * @param {Number} [resolution] - The timer resolution, defaults to 500 ms
 */
export function startTimer (duration, timerName, callback, resolution = 500) {
  if (timers[timerName]) {
    clearInterval(timers[timerName].intervalId);
  } else {
    startHeartbeat(
      timerName,
      parseInt(Math.floor(resolution * 0.95), 10),
      parseInt(Math.ceil(resolution * 16), 10)
    );
  }

  timers[timerName] = {
    timeLeft: duration,
    callback
  };

  timers[timerName].intervalId = setInterval(() => {
    const timer = timers[timerName];

    if (timer.timeLeft <= 0) {
      return serviceTimer(timerName);
    }

    timer.timeLeft -= resolution;
    if (!checkHeartbeat(timerName, resolution)) {
      serviceTimer(timerName);
    }
  }, resolution);
}
