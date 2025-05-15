/**
 * A timer for the service worker.
 * 
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
const timers = {};

/**
 * Start or reset a timer by name.
 * 
 * @param {Number} duration - The timer duration
 * @param {Number} resolution - The timer resolution
 * @param {String} timerName - The name identifying the timer
 * @param {Function} callback - The callback
 */
export function startTimer (duration, resolution, timerName, callback) {
  if (timers[timerName]) {
    clearInterval(timers[timerName].intervalId);
  }

  timers[timerName] = {
    timeLeft: duration
  };

  timers[timerName].intervalId = setInterval(() => {
    const timer = timers[timerName];

    if (timer.timeLeft <= 0) {
      clearInterval(timer.intervalId);
      callback();
    }

    timer.timeLeft -= resolution;
  }, resolution);
}
