/**
 * Setup and handle page messages/prompts.
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */

/**
 * bfCache pageshow handler.
 * Do not show a prompt on a cached page, it can be stale.
 * 
 * @param {Event} event - PageShow event
 * @param {Boolean} event.persisted - true if restored from bfcache.
 */
function bfCacheHandler (event) {
  const prompt = bfCacheHandler.prompt;
  if (event.persisted) {
    prompt.classList.remove('hide', 'show');
  }
}

/**
 * Called when the user has agreed to install a new service worker version.
 * @see src/application/client/sw/sw.reg.js
 * 
 * @param {Object} args - Install action arguments.
 * @param {Function} onAccept - The acceptance function to execute.
 */
function installAction (args) {
  const { spinner, prompt } = installAction;
  spinner.classList.add('show');

  closePrompt(prompt);

  setTimeout(args.startInstall, 250);
}

/**
 * Called when the user has agreed to install to home screen.
 */
function homescreenAction () {
  /* eslint-disable no-console */
  console.log('@@@ TODO: homescreen action handler');
  /* eslint-enable no-console */
}

/**
 * Called when the user has agreed to update the stale page.
 * Update all runtime pages, so the user doesn't get another stale page.
 */
function updateAction () {
  navigator.serviceWorker.ready.then(reg => {
    reg.active.postMessage({ action: 'runtime-update' });
  });
  // Don't wait, the current page is already here.
  // Show spinner just to let the user know something happened.
  const { spinner } = updateAction;
  spinner.classList.add('show');
  setTimeout(() => {
    spinner.classList.remove('show');
    window.location.reload();
  }, 500);
}

const promptQueue = [];

/**
 * Show the prompt.
 * Either both buttons are supplied, or none are supplied.
 * No buttons is treated as a message.
 *
 * @param {Object} prompt - The prompt-specific properties
 * @param {HTMLElement} [prompt.actionButton] - The prompt action button
 * @param {HTMLElement} [prompt.closeButton] - The prompt dismiss button
 * @param {String} prompt.class - The prompt-specific class
 * @param {Function} prompt.handler - The prompt click action handler
 * @param {HTMLElement} prompt.container - The prompt container element
 * @param {Object} handlerArgs - args for the action handler
 */
function showPrompt (prompt, handlerArgs) {
  if (prompt.actionButton && prompt.closeButton) {
    const handler = () => {
      prompt.handler(handlerArgs);
      nextPrompt();
    };
    prompt.actionButton.addEventListener('click', handler, { once: true });
    prompt.closeButton.addEventListener('click', closePrompt.bind(
      null, prompt, handler
    ), { once: true });
  } else {
    prompt.class = handlerArgs.isUpdate ? 'updated' : 'welcome';
    setTimeout(() => {
      closePrompt(prompt);
      if (prompt.handler) {
        setTimeout(() => {
          prompt.handler(handlerArgs);
        }, 250);
      }
    }, handlerArgs.duration || 1000);
  }

  prompt.container.classList.add('show', prompt.class);
  prompt.container.focus();
}

/**
 * Hide the prompt.
 *
 * @param {Object} prompt - The prompt-specific properties
 * @param {HTMLElement} prompt.container - The prompt container element
 * @param {HTMLElement} [prompt.actionButton] - The prompt action button
 * @param {String} prompt.class - The prompt-specific class
 * @param {Function} [actionHandler] - The action handler to remove
 */
function closePrompt (prompt, actionHandler) {
  if (prompt.actionButton && actionHandler) {
    prompt.actionButton.removeEventListener('click', actionHandler);
  }

  prompt.container.classList.add('hide');
  setTimeout(() => {
    prompt.container.classList.remove('show', 'hide', prompt.class);
    nextPrompt();
  }, 250); // after 200ms transition, _prompt.scss
}

/**
 * Remove current prompt from queue.
 * If another prompt has arrived in the meantime, show it.
 */
function nextPrompt () {
  promptQueue.shift();
  if (promptQueue.length > 0) {
    setTimeout(() => {
      showPrompt(promptQueue[0].prompt, promptQueue[0].handlerArgs);
    }, 500);
  }
}

/**
 * Add a prompt to the queue. If it is the only prompt, show it now.
 *
 * @param {Object} prompt - prompt specific properties
 * @param {Object} handlerArgs - args for the action handler
 */
function addPrompt (prompt, handlerArgs) {
  promptQueue.push({ prompt, handlerArgs });
  if (promptQueue.length === 1) {
    showPrompt(prompt, handlerArgs);
  }
}

/**
 * Setup page level prompt handling.
 */
export default function setup () {
  const pagePrompt = document.querySelector('.pp-prompt');
  const pageUpdateClose = document.querySelector('.pp-update .pp-close');
  const pageUpdateAction = document.querySelector('.pp-update .pp-action');
  const pageInstallClose = document.querySelector('.pp-install .pp-close');
  const pageInstallAction = document.querySelector('.pp-install .pp-action');
  const pageHomescreenClose = document.querySelector('.pp-homescreen .pp-close');
  const pageHomescreenAction = document.querySelector('.pp-homescreen .pp-action');
  const pageSpinner = document.querySelector('.page-spinner');
  
  bfCacheHandler.prompt = pagePrompt;
  window.removeEventListener('pageshow', bfCacheHandler);
  window.addEventListener('pageshow', bfCacheHandler);

  [{
    name: 'pageUpdatePrompt',
    class: 'update',
    closeButton: pageUpdateClose,
    actionButton: pageUpdateAction,
    handler: updateAction,
    container: pagePrompt
  }, {
    name: 'pageInstallPrompt',
    class: 'install',
    closeButton: pageInstallClose,
    actionButton: pageInstallAction,
    handler: installAction,
    container: pagePrompt
  }, {
    name: 'pageSwMessage',
    class: '',
    container: pagePrompt,
    handler: function reloadOnUpdate (args) {
      reloadOnUpdate.spinner.classList.remove('show');
      if (args.isUpdate) {
        window.location.reload();
      }
    }
  }, {
    name: 'pageHomescreenPrompt',
    class: 'homescreen',
    closeButton: pageHomescreenClose,
    actionButton: pageHomescreenAction,
    handler: homescreenAction,
    container: pagePrompt
  }].forEach(prompt => {
    if (prompt.handler) {
      prompt.handler.spinner = pageSpinner;
      prompt.handler.prompt = prompt;
    }
    window.App.add(prompt.name, addPrompt.bind(null, prompt));
  });
}