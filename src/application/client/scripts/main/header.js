/**
 * Header intersection transitions, offscreen navigation
 *
 * Copyright (c) 2025 Alex Grant (@localnerve), LocalNerve LLC
 * Private use for LocalNerve, LLC only. Unlicensed for any other use.
 */
import { getNumber } from '#client-utils/browser.js';

const headerClass = 'fixed';
const offscreenNavClass = 'show';

/**
 * Derive all intersection data from the header.
 * Calculates the intersection height from hdrHeight.
 * SIDE-EFFECT: Update intersection target.style.top, height.
 *
 * @param {Object} elements - page elements.
 * @param {HTMLElement} elements.hdr - The header element.
 * @param {HTMLElement} elements.target - The intersection observation target element.
 * @returns {Object} intersection height and intermediate data used to calculate it.
 */
function calcIntersectionData ({ hdr, target }) {
  const hdrHeight = getNumber(window.getComputedStyle(hdr).height);
  const intersectionHeight = hdrHeight / 1.5;
  const targetStyle = target.style;
  const hdrFactor = 1.08;

  targetStyle.top = `${hdrHeight * hdrFactor}px`;
  targetStyle.height =
    `${hdr.parentElement.offsetHeight - (hdrHeight * hdrFactor)}px`;

  return {
    hdrHeight,
    intersectionHeight
  };
}

/**
 * Setup the header intersection behavior.
 * Uses a big negative bottom margin to expose a small intersection window
 * near the top of the viewport, a portion of the header height.
 *
 * @param {Object} elements - Page elements.
 * @param {HtmlElement} elements.hdr - The header element.
 * @param {HtmlElement} elements.target - The observation target element.
 * @param {Function} [installResize] - A function to call prior to starting observe.
 * @returns {IntersectionObserver} The created intersection observer.
 */
function installIntersectionObserver (elements, installResize) {
  const {
    hdr, target
  } = elements;

  const {
    intersectionHeight
  } = calcIntersectionData(elements);

  const hdrObserver = new IntersectionObserver(entries => {
    const entry = entries[0];
    const targetInfo = entry.boundingClientRect;
    const rootBoundsInfo = entry.rootBounds;

    if (targetInfo.top <= rootBoundsInfo.bottom) {
      hdr.classList.add(headerClass);
    }

    if (targetInfo.top > rootBoundsInfo.bottom) {
      hdr.classList.remove(headerClass);
    }
  }, {
    rootMargin: `0px 0px -${window.innerHeight - intersectionHeight}px 0px`
  });

  if (typeof installResize === 'function') {
    installResize(elements, hdrObserver);
  }

  hdrObserver.observe(target);
  return hdrObserver;
}

/**
 * Install resize handler.
 *
 * NOTE:
 * Could not use ResizeObserver because if only the window height dimension changes,
 * even the highest level document element would not result in a callback.
 *   Viewport height is essential to calculation of the intersection root bounds.
 *
 * @param {Object} support - The application support object.
 * @param {Object} elements - page elements.
 * @param {IntersectionObserver} observer - An intersection observer.
 */
function installResizeObserver (support, elements, observer) {
  const resizeWait = 350;
  let resizeTick = false;
  let hdrObserver = observer;

  window.addEventListener('resize', () => {
    if (!resizeTick) {
      resizeTick = true;
      hdrObserver.disconnect();
      setTimeout(() => {
        hdrObserver = installIntersectionObserver(elements);
        resizeTick = false;
      }, resizeWait);
    }
  }, support.passiveEvent ? {
    passive: true
  } : false);
}

/**
 * Wire-up events for off-screen compact navigation.
 *
 * @param {Object} elements - The page elements
 * @param {HTMLElement} elements.hamburger - The hamburger icon element.
 * @param {HTMLElement} elements.closeNav - The offscreen navigation close button.
 * @param {HTMLElement} elements.offscreenNav - The offscreen navigation element.
 * @param {Array<HTMLElement>} elements.navItems - The navigation li elements.
 * @param {HTMLElement} elements.body - The body element.
 */
function setupNavCompact ({
  hamburger, closeNav, offscreenNav, navItems, body
}) {
  // Expand the click surface of 'nav.compact li' items
  if (navItems) {
    Array.from(navItems).forEach(item => {
      let selfTrigger = false;
      const navItem = item;
      if (!navItem.dataset.listener) {
        navItem.onclick = function (e) {
          if (!selfTrigger) {
            selfTrigger = true;
            e.preventDefault();
            e.stopPropagation();
            this.firstElementChild.click();
            selfTrigger = false;
          }
        };
      }
    });
  }

  if (hamburger && closeNav && offscreenNav) {
    const hambExpanded =
      hamburger.attributes.getNamedItem('aria-expanded') ?? { value: '' };
    const offsHidden =
      offscreenNav.attributes.getNamedItem('aria-hidden') ?? { value: ''};
    hamburger.addEventListener('click', e => {
      hambExpanded.value = 'true';
      offsHidden.value = 'false';
      offscreenNav.classList.add(offscreenNavClass);
      e.preventDefault();
      e.stopPropagation();
    });
    [body, closeNav].forEach(el => {
      el.addEventListener('click', e => {
        if (e.target === closeNav) {
          closeNav.blur();
        }
        hambExpanded.value = 'false';
        offsHidden.value = 'true';
        offscreenNav.classList.remove(offscreenNavClass);
      });
    });
  }
}

/**
 * Ensure the header style is in the correct state.
 *
 * @param {Object} elements - page elements.
 * @param {HTMLElement} elements.hdr - The header element.
 */
function maintainHeaderStyle (elements) {
  const { hdr } = elements;
  const checkWait = 100;
  setTimeout(() => {
    const { intersectionHeight } = calcIntersectionData(elements);
    const method = window.pageYOffset < intersectionHeight ? 'remove': 'add';
    hdr.classList[method](headerClass);
  }, checkWait);
}

/**
 * Wrap navigation anchor clicks for header maintenance purposes.
 *
 * @param {Object} elements - Page elements.
 * @param {Array<HTMLElement>} elements.navAnchors - array of navigation anchors
 */
export function wrapNavAnchorClick (elements) {
  const { navAnchors } = elements;

  if (navAnchors) {
    const maintenance = maintainHeaderStyle.bind(null, elements);
    navAnchors.forEach(anchor => anchor.addEventListener('click', maintenance));
  }
}

/**
 * Get references to all the pages elements referenced.
 *
 * @returns {Object} of all the page elements to be referenced.
 */
function getPageElements () {
  const hdr = document.querySelector('.ln-header');

  const target = document.createElement('div');
  target.style.position = 'absolute';
  target.style.width = '100%';
  target.style.pointerEvents = 'none';
  hdr.parentElement.insertBefore(target, hdr.nextElementSibling);

  return {
    hamburger: document.querySelector('.ln-header .menu'),
    closeNav: document.querySelector('nav.compact .close'),
    offscreenNav: document.querySelector('nav.compact'),
    navItems: Array.from(document.querySelectorAll('nav.compact li')),
    navAnchors: Array.from(document.querySelectorAll('nav a'))
      .concat(Array.from(document.querySelectorAll('a[href^="#"]'))),
    hdr: document.querySelector('.ln-header'),
    target,
    body: document.querySelector('body')
  };
}

/**
 * Setup the header at page load.
 * 
 * @param {Object} support - The application support object.
 */
export default function setup (support) {
  const elements = getPageElements();
  setupNavCompact(elements);
  wrapNavAnchorClick(elements);
  support.backgroundExec(() => Promise.resolve().then(() => 
    installIntersectionObserver(elements, installResizeObserver.bind(null, support))
  ), 100);
}
