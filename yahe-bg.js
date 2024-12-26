/* global chrome, browser */
const isChrome =
  typeof chrome !== 'undefined' && typeof browser === 'undefined';

const defaults = {
  focusOnNewTab: false,
  newTabPosition: 'relatedAfterCurrent',
};

function getTabIndex(sender) {
  if (typeof sender.tab === 'undefined') {
    return undefined;
  }
  return sender.tab.index;
}

function nextTabIndexFromCurrentIndex(newTabPosition, index) {
  // Current index not known? Next one is not known either.
  if (typeof index === 'undefined') {
    return undefined;
  }
  switch (newTabPosition) {
    case 'relatedAfterCurrent':
      return undefined;
    case 'afterCurrent':
      return index + 1;
    case 'atEnd':
      // Selecting a huge number as the tab index will hopefully
      // place the tab to end of the tab strip. If you have more
      // tabs than the number below (wow!), then the tab will not
      // be placed all the way to the end.
      return 100000;
    default:
      return undefined;
  }
}

function openLink(options, sender, { url }) {
  const currentTabIndex = getTabIndex(sender);
  const params = {
    url,
    active: options.focusOnNewTab,
    index: nextTabIndexFromCurrentIndex(
      options.newTabPosition,
      currentTabIndex,
    ),
  };
  if (isChrome) {
    chrome.tabs.create(params);
  } else {
    browser.tabs.create(params);
  }
}

function isValidMessage(message) {
  return typeof message.url === 'string';
}

function loadStorage(f) {
  if (isChrome) {
    chrome.storage.local.get(null, f);
  } else {
    browser.storage.local.get().then(f);
  }
}

function messageHandler(message, sender) {
  if (isValidMessage(message)) {
    loadStorage((options) =>
      openLink({ ...defaults, ...options }, sender, message),
    );
  }
}

if (isChrome) {
  chrome.runtime.onMessage.addListener(messageHandler);
} else {
  browser.runtime.onMessage.addListener(messageHandler);
}
