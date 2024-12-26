/*
YAHE: Yet Another Hints Extension
*/
/* global chrome, browser */

// Default options used in YAHE.
const defaultOptions = {
  // The hint characters to use in order of appearance.
  hintCharacters: 'fdjkghslrueicnxmowabzpt',

  // Modifier key for activate key
  activateModifier: 'ctrl',

  // Activation key code
  activateKey: 77, // 77 = m

  // Whether the hints should always be hidden after hint activation or not.
  // By default, they are only hidden after hitting something
  // that should be focused rather than followed, i.e. a form input.
  deactivateAfterHit: false,
};

// Key modifiers that can be used with activating YAHE
const possibleKeyModifiers = ['ctrl', 'alt', 'meta'];

// Parses options from given JS object.
// If an option is missing or it's invalid,
// a default option will be used (see `defaultOptions` above).
const parseOptions = (() => {
  function getActivateKey({ activateKey }) {
    return typeof activateKey === 'string'
      ? activateKey.toUpperCase().charCodeAt(0)
      : null;
  }

  function getActivateModifier({ activateModifier }) {
    return possibleKeyModifiers.includes(activateModifier)
      ? activateModifier
      : null;
  }

  return (rawOpts) => {
    const raw = rawOpts || {};
    return {
      activateKey: getActivateKey(raw) || defaultOptions.activateKey,
      activateModifier:
        getActivateModifier(raw) || defaultOptions.activateModifier,
      hintCharacters:
        typeof raw.hintCharacters === 'string'
          ? raw.hintCharacters
          : defaultOptions.hintCharacters,
      deactivateAfterHit:
        typeof raw.deactivateAfterHit === 'boolean'
          ? raw.deactivateAfterHit
          : defaultOptions.deactivateAfterHit,
    };
  };
})();

// Enum for all the states of YAHE
const inputStates = {
  selected: 'selected',
  activated: 'activated',
  deactivated: 'deactivated',
};

function State() {
  const self = this;
  let active = false;
  let input = '';
  let hints = {};

  // Only call the given function when active flag is true.
  self.whenActive = (f) => {
    if (active) {
      f();
      return true;
    }
    return false;
  };

  // Get the current hint based on the current input
  self.currentHint = () => hints[input.toLowerCase()];

  // Call a function with the currently selected hint,
  // if one is selected.
  self.withCurrentHint = (f) => {
    const hint = self.currentHint();
    if (hint) {
      f(hint);
    }
  };

  self.getInput = () => input;

  self.addInput = (s) => {
    input += s;
  };

  self.clearInput = () => {
    input = '';
  };

  self.setHints = (hs) => {
    hints = hs;
  };

  self.activate = () => {
    active = true;
  };

  self.deactivate = () => {
    active = false;
    self.clearInput();
  };

  self.inputState = () => {
    if (input.length > 0) {
      return inputStates.selected;
    }
    if (active) {
      return inputStates.activated;
    }
    return inputStates.deactivated;
  };
}

function sanitizeHintCharacters(hintCharacters) {
  return [...hintCharacters.toLowerCase()].filter(
    (value, index, self) => self.indexOf(value) === index,
  );
}

// Generates hint strings in the order of the given hint characters.
function HintIdGenerator(rawHintCharacters) {
  const self = this;
  const hintCharacters = sanitizeHintCharacters(rawHintCharacters);
  const charSet = new Set(hintCharacters);

  // Check if the given character is part of the hint characters
  self.includes = (c) => charSet.has(c);

  // Start a new hint generator function.
  // One hint string is created per each call to the resulting function.
  self.start = () => {
    const len = hintCharacters.length;

    // Number of hints generator so far.
    // Used for tracking the starting point for the next hint.
    let counter = 0;

    return () => {
      let text = ''; // hint text buffer
      let charCount = 0; // number of characters needed for the hint
      let charIndex; // index of the next hint character

      // Calculate how many characters are needed for the hint
      // based on how many hints have been generated so far,
      // and which character is the next one to be used.
      let num = counter;
      while (num >= 0) {
        charIndex = num;
        num -= len ** (1 + charCount);
        charCount += 1;
      }

      // Build the hint string
      for (let i = 0; i < charCount; i += 1) {
        text = hintCharacters[charIndex % len] + text;
        charIndex = Math.floor(charIndex / len);
      }

      // Increment the starting point for the next hint.
      counter += 1;
      return text;
    };
  };
}

// KeyMapper is used for mapping key presses to various function calls
function KeyMapper(window) {
  const self = this;

  function modifiersMatch(modifierSet, e) {
    function modMatch(modifier) {
      const expected = modifierSet.has(modifier) || false;
      const actual = e[`${modifier}Key`] || false;
      return expected === actual;
    }

    return modifierSet.size === 0 || possibleKeyModifiers.every(modMatch);
  }

  function addKeyDownHandler({ document }, handler, predicate) {
    const h = (e) => {
      if (predicate(e) && handler(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', h, true);
  }

  function noModifiers({ shiftKey, ctrlKey, metaKey, altKey }) {
    return !shiftKey && !ctrlKey && !metaKey && !altKey;
  }

  self.addHandler = (keyCode, modifiers, handler) => {
    const modifierSet = new Set(modifiers);
    addKeyDownHandler(
      window,
      handler,
      (e) => e.keyCode === keyCode && modifiersMatch(modifierSet, e),
    );
  };

  self.addDefaultNonModifierHandler = (handler) => {
    addKeyDownHandler(window, handler, noModifiers);
  };
}

// List of all the elements that can be activated using hints
const hintableSelectors = [
  'a',
  'input:not([type=hidden])',
  'textarea',
  'select',
  'button',
  '[onclick]',
  '[onmousedown]',
].join(', ');

// Set of all the input types that can be focused on using hints
// instead of activating them.
const inputTypes = new Set([
  'text',
  'password',
  'search',
  'tel',
  'url',
  'email',
  'number',
  'datetime',
  'datetime-local',
]);

// IDs and class names used for YAHE DOM elements
const hintContainerId = 'yahe-hint-container';
const hintClass = 'yahe-hint-node';
const hintHighlightClass = 'yahe-hint-highlight';

// Representation of a hint on screen
function Hint(window, click, hintId, hintable) {
  const self = this;
  self.hintId = hintId;
  self.hintable = hintable;

  // DOM node for the hint tag
  self.hintNode = (() => {
    const { document, pageYOffset, pageXOffset } = window;
    const cr = hintable.getBoundingClientRect();
    const span = document.createElement('span');
    const spanTop = pageYOffset + (cr.top > 0 ? cr.top : 0);
    const spanLeft =
      pageXOffset + (cr.left > 0 ? cr.left : 0) - span.offsetWidth;

    span.textContent = hintId;
    span.className = hintClass;
    span.style.top = `${spanTop}px`;
    span.style.left = `${spanLeft}px`;
    return span;
  })();

  self.highlight = () => {
    self.hintNode.classList.add(hintHighlightClass);
  };

  self.dehighlight = () => {
    self.hintNode.classList.remove(hintHighlightClass);
  };

  self.activate = (modifiers) => {
    if (self.shouldFocus()) {
      self.hintable.focus();
    } else {
      click(self.hintable, modifiers);
    }
  };

  self.shouldFocus = () => {
    const el = self.hintable;
    const isInput = el.tagName === 'INPUT' && inputTypes.has(el.type);
    return isInput || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  };
}

// Check if the given node is within view port
function inViewPort(node) {
  const cr = node.getBoundingClientRect();
  return cr.bottom > 0 && cr.right > 0 && cr.width > 0 && cr.height > 0;
}

// Checks if the given target should be opened in a new tab
function shouldOpenInTab({ navigator }, { href }, { metaKey, ctrlKey }) {
  const isUrl = typeof href === 'string' && href !== '' && !href.endsWith('/#');
  const isMac = navigator.appVersion.includes('Mac');
  const isOpenNewTabClick = (isMac && metaKey) || ctrlKey;
  return isUrl && isOpenNewTabClick;
}

// Simulate a mouse click on a DOM element
function simulateClick(relatedTarget, { ctrlKey, altKey, shiftKey, metaKey }) {
  const event = new MouseEvent('click', {
    ctrlKey,
    altKey,
    shiftKey,
    metaKey,
    relatedTarget,
  });
  relatedTarget.dispatchEvent(event);
}

// Click simulator with alternative new tab behaviour
function doClick({ window, target, mods, openInTab }) {
  if (shouldOpenInTab(window, target, mods)) {
    openInTab(target.href);
  } else {
    simulateClick(target, mods);
  }
}

// Engine renders the given hints on the browser DOM
// and handles the UI logic
function Engine(window, state, hintIdGenerator, env, options) {
  const self = this;
  const { document } = window;
  const { openInTab } = env;

  // DOM node containing all the hint nodes
  const container = (() => {
    const c = document.createElement('div');
    c.id = hintContainerId;
    c.style.display = 'none';
    document.documentElement.appendChild(c);
    return c;
  })();

  // Clear the hints container and hide it
  function clearHints() {
    container.innerHTML = '';
    container.style.display = 'none';
  }

  // Show the hints container
  function showHints() {
    container.style.display = 'block';
  }

  // Perform a click action on the given element with the given keyboard modifiers
  function clicker(target, mods) {
    doClick({
      window,
      target,
      mods,
      openInTab,
    });
  }

  // Generate hint elements for all the visible hintable elements,
  // and place them to the hints container
  function generateHints(idGenerator) {
    const hints = {};
    const nodes = document.querySelectorAll(hintableSelectors);
    const fragment = document.createDocumentFragment();

    nodes.forEach((node) => {
      if (inViewPort(node)) {
        const hintId = idGenerator();
        const hint = new Hint(window, clicker, hintId, node);
        fragment.appendChild(hint.hintNode);
        hints[hintId] = hint;
      }
    });
    container.appendChild(fragment);

    return hints;
  }

  // Deactivate the current hint and erase the input buffer
  function clearInput() {
    const hint = state.currentHint();
    if (hint) {
      hint.dehighlight();
    }
    state.clearInput();
  }

  function activate() {
    state.activate();
    const hints = generateHints(hintIdGenerator.start());
    state.setHints(hints);
    showHints();
  }

  // Toggle the activation state
  self.toggle = () => {
    switch (state.inputState()) {
      case inputStates.selected:
        clearInput();
        break;
      case inputStates.activated:
        self.deactivate();
        break;
      case inputStates.deactivated:
        activate();
        break;
      default:
        break;
    }
    return true;
  };

  self.deactivate = () => {
    state.deactivate();
    clearInput();
    clearHints();
  };

  self.cancel = () => {
    state.whenActive(self.deactivate);
  };

  self.clickCurrentHint = (e) =>
    state.whenActive(() => {
      state.withCurrentHint((h) => {
        h.activate(e);
        if (h.shouldFocus() || options.deactivateAfterHit) {
          self.deactivate();
        }
      });
      clearInput();
    });

  self.addCharacter = ({ keyCode }) =>
    state.whenActive(() => {
      const c = String.fromCharCode(keyCode).toLowerCase();
      if (hintIdGenerator.includes(c)) {
        state.withCurrentHint((h) => {
          h.dehighlight();
        });
        state.addInput(c);
        state.withCurrentHint((h) => {
          h.highlight();
        });
      }
    });
}

// Boot is the entrypoint for all browser versions of YAHE
// Window is your browser window object, options include options seen above,
// and the env provides browser specific features.
function boot(window, options, env) {
  const generator = new HintIdGenerator(options.hintCharacters);
  const state = new State();
  const engine = new Engine(window, state, generator, env, options);

  // set up key mappings and other event listeners
  const km = new KeyMapper(window);
  km.addHandler(
    options.activateKey,
    [options.activateModifier],
    engine.toggle.bind(engine),
  );
  km.addHandler(
    27, // 27 = esc key
    null,
    engine.cancel.bind(engine),
  );
  km.addHandler(
    13, // 13 = enter key
    null,
    engine.clickCurrentHint.bind(engine),
  );
  km.addDefaultNonModifierHandler(engine.addCharacter.bind(engine));
  window.addEventListener('beforeunload', engine.deactivate.bind(engine), true);
}

// Check which browser is running, load the appropriate environment, and boot up YAHE!
//
// Each environment includes the following functionalities:
//   * openInTab: function for opening links in new tabs
//
(() => {
  // Web extension
  if (typeof browser !== 'undefined') {
    const env = {
      openInTab: (url) => {
        browser.runtime.sendMessage(null, { url });
      },
    };
    browser.storage.local.get().then((response) => {
      boot(window, parseOptions(response), env);
    });
    return;
  }

  // Chrome
  if (typeof chrome !== 'undefined' && typeof browser === 'undefined') {
    const env = {
      openInTab: (url) => {
        chrome.runtime.sendMessage(null, { url });
      },
    };
    chrome.storage.local.get(null, (response) => {
      boot(window, parseOptions(response), env);
    });
    return;
  }

  // NodeJS -- export everything we want to test
  if (typeof module !== 'undefined') {
    module.exports = {
      HintIdGenerator,
    };
    return;
  }

  console.error('yahe: unknown browser!');
})();
