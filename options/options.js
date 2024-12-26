/* global chrome, browser */
const isChrome =
  typeof chrome !== 'undefined' && typeof browser === 'undefined';

const defaults = {
  activateModifier: 'ctrl',
  hintCharacters: 'fdjkghslrueicnxmowabzpt',
  activateKey: 'm',
  deactivateAfterHit: false,
  focusOnNewTab: false,
  newTabPosition: 'relatedAfterCurrent',
};

function opt(id) {
  return document.getElementById(id);
}

function optValue(id, alternative) {
  return opt(id).value || alternative;
}

function getChecked(name) {
  return document.querySelector(`input[name=${name}]:checked`).value;
}

function selectedModifier() {
  return getChecked('mod') || defaults.activateModifier;
}

function selectedDeactivate() {
  const v = getChecked('deactivate');
  if (v === 'normal') return false;
  if (v === 'always') return true;
  return defaults.deactivateAfterHit;
}

function showStatus() {
  const status = document.getElementById('status');
  status.textContent = 'Options saved';
  window.setTimeout(
    () => {
      status.textContent = '';
    },
    750,
    false,
  );
}

function saveOptions(e) {
  e.preventDefault();
  const options = {
    hintCharacters: optValue('hintcharacters', defaults.hintCharacters),
    activateKey: optValue('activate_key', defaults.activateKey),
    activateModifier: selectedModifier(),
    deactivateAfterHit: selectedDeactivate(),
    focusOnNewTab: opt('focus_on_newtab').checked || defaults.focusOnNewTab,
    newTabPosition: getChecked('newTabPosition'),
  };
  if (isChrome) {
    chrome.storage.local.set(options, showStatus);
  } else {
    browser.storage.local.set(options).then(showStatus);
  }
}

function restoreOptions() {
  function restore(foundOpts) {
    const options = { ...defaults, ...foundOpts };
    const mod = options.activateModifier;
    opt('hintcharacters').value = options.hintCharacters;
    opt('activate_key').value = options.activateKey;
    opt('mod_ctrl').checked = mod === 'ctrl';
    opt('mod_alt').checked = mod === 'alt';
    opt('mod_meta').checked = mod === 'meta';
    opt('deactivate_normal').checked = !options.deactivateAfterHit;
    opt('deactivate_always').checked = options.deactivateAfterHit;
    opt('focus_on_newtab').checked = options.focusOnNewTab;
    opt('newTabPosition_default').checked =
      options.newTabPosition === 'relatedAfterCurrent';
    opt('newTabPosition_afterCurrent').checked =
      options.newTabPosition === 'afterCurrent';
    opt('newTabPosition_atEnd').checked = options.newTabPosition === 'atEnd';
  }

  if (isChrome) {
    chrome.storage.local.get(null, restore);
  } else {
    browser.storage.local.get().then(restore);
  }
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('form').addEventListener('submit', saveOptions);
