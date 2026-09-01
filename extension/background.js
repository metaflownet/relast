'use strict';

const CLOSE_REORDER_WINDOW_MS = 10000;
const MAX_HISTORY_SIZE = 100;

function normalizeHistory(history) {
  const seen = new Set();
  return (Array.isArray(history) ? history : []).filter((tabId) => {
    if (!Number.isInteger(tabId) || tabId < 0 || seen.has(tabId)) {
      return false;
    }
    seen.add(tabId);
    return true;
  }).slice(0, MAX_HISTORY_SIZE);
}

function recordActivation(history, tabId, eventTime) {
  const current = normalizeHistory(history);
  if (!Number.isInteger(tabId) || tabId < 0 || current[0] === tabId) {
    return { history: current, activation: null };
  }

  return {
    history: [tabId, ...current.filter((id) => id !== tabId)].slice(0, MAX_HISTORY_SIZE),
    activation: { tabId, eventTime, previousHistory: current },
  };
}

function planTabClose(history, removedTabId, lastActivation, removalTime) {
  const current = normalizeHistory(history);
  const delay = removalTime - (lastActivation?.eventTime ?? Number.NaN);
  const reorderedBySafari =
    lastActivation?.tabId === current[0] &&
    lastActivation.tabId !== removedTabId &&
    lastActivation.previousHistory?.[0] === removedTabId &&
    delay >= 0 &&
    delay <= CLOSE_REORDER_WINDOW_MS;
  const beforeClose = reorderedBySafari
    ? normalizeHistory(lastActivation.previousHistory)
    : current;
  const closedActiveTab = beforeClose[0] === removedTabId;
  const historyAfterClose = beforeClose.filter((tabId) => tabId !== removedTabId);

  return {
    history: historyAfterClose,
    targetTabId: closedActiveTab ? (historyAfterClose[0] ?? null) : null,
    closedActiveTab,
    reorderedBySafari,
  };
}

function startExtension(chromeApi) {
  const historyByWindow = new Map();
  const activationByWindow = new Map();
  const queuedEvents = [];
  let ready = false;

  const runWhenReady = (task) => {
    if (ready) task();
    else queuedEvents.push(task);
  };

  const recordActiveTab = (windowId, tabId, eventTime) => {
    const result = recordActivation(historyByWindow.get(windowId), tabId, eventTime);
    historyByWindow.set(windowId, result.history);
    if (result.activation) activationByWindow.set(windowId, result.activation);
  };

  const removeFromEveryHistory = (removedTabId) => {
    for (const [windowId, history] of historyByWindow) {
      historyByWindow.set(windowId, history.filter((tabId) => tabId !== removedTabId));
    }
  };

  const activateFirstAvailable = (windowId, candidates, index = 0) => {
    const tabId = candidates[index];
    if (!Number.isInteger(tabId)) return;

    chromeApi.tabs.get(tabId, (tab) => {
      const failed = Boolean(chromeApi.runtime.lastError);
      if (failed || !tab || tab.windowId !== windowId) {
        activateFirstAvailable(windowId, candidates, index + 1);
        return;
      }
      chromeApi.tabs.update(tabId, { active: true }, () => {
        void chromeApi.runtime.lastError;
      });
    });
  };

  chromeApi.tabs.onCreated.addListener((tab) => {
    const eventTime = Date.now();
    runWhenReady(() => {
      if (tab.active) recordActiveTab(tab.windowId, tab.id, eventTime);
    });
  });

  chromeApi.tabs.onActivated.addListener((info) => {
    const eventTime = Date.now();
    runWhenReady(() => recordActiveTab(info.windowId, info.tabId, eventTime));
  });

  chromeApi.tabs.onRemoved.addListener((tabId, info) => {
    const removalTime = Date.now();
    runWhenReady(() => {
      const plan = planTabClose(
        historyByWindow.get(info.windowId),
        tabId,
        activationByWindow.get(info.windowId),
        removalTime,
      );
      historyByWindow.set(info.windowId, plan.history);
      removeFromEveryHistory(tabId);
      activationByWindow.delete(info.windowId);

      if (!info.isWindowClosing && plan.targetTabId !== null) {
        activateFirstAvailable(info.windowId, plan.history);
      }
    });
  });

  chromeApi.windows.onRemoved.addListener((windowId) => {
    runWhenReady(() => {
      historyByWindow.delete(windowId);
      activationByWindow.delete(windowId);
    });
  });

  chromeApi.tabs.query({}, (tabs) => {
    void chromeApi.runtime.lastError;
    for (const tab of tabs || []) {
      if (tab.active) recordActiveTab(tab.windowId, tab.id, Date.now());
    }
    ready = true;
    for (const task of queuedEvents.splice(0)) task();
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs && chrome.windows) {
  startExtension(chrome);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeHistory, recordActivation, planTabClose };
}
