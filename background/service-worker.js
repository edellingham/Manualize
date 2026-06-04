/**
 * Manualize — Service Worker (MV3)
 *
 * Coordinates content script ↔ side panel communication.
 * Pre-captures tab screenshots on mousedown for accurate dropdown capture.
 * All state is persisted in chrome.storage — no global variables that matter.
 *
 * Event listeners are registered synchronously at the top level
 * so Chrome replays events on service-worker restart.
 */

/* ====== SIDE PANEL SETUP ====== */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

/* ====== PORT — PANEL KEEPALIVE & DISCONNECT DETECTION ====== */

let panelPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'manualize-panel') return;
  panelPort = port;

  port.onDisconnect.addListener(async () => {
    panelPort = null;
    const { manualizeRecording } = await chrome.storage.local.get(
      'manualizeRecording'
    );
    if (manualizeRecording) {
      await chrome.storage.local.set({
        manualizeRecording: false,
        manualizeGuideId: null,
      });
      try {
        await chrome.action.setBadgeText({ text: '' });
      } catch (_e) {
        /* ignore */
      }
    }
  });
});

/* ====== PRE-CAPTURE STATE ====== */

// Screenshot captured on mousedown, before UI changes (dropdown closing etc.)
let pendingScreenshot = null;
let pendingScreenshotTime = 0;

/* ====== MESSAGE ROUTER ====== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'PRE_CAPTURE':
      // Capture screenshot immediately on mousedown
      if (sender.tab) {
        (async () => {
          try {
            pendingScreenshot = await chrome.tabs.captureVisibleTab(
              sender.tab.windowId,
              { format: 'png' }
            );
            pendingScreenshotTime = Date.now();
          } catch (_e) {
            pendingScreenshot = null;
          }
        })();
      }
      return false;

    case 'STEP_RECORDED':
      if (sender.tab) {
        handleStepRecorded(message.data, sender.tab);
      }
      return false;

    case 'START_RECORDING':
      (async () => {
        await handleStartRecording(message.data);
        sendResponse({ success: true });
      })();
      return true;

    case 'STOP_RECORDING':
      (async () => {
        await handleStopRecording();
        sendResponse({ success: true });
      })();
      return true;

    case 'GET_RECORDING_STATE':
      (async () => {
        const state = await chrome.storage.local.get([
          'manualizeRecording',
          'manualizeGuideId',
        ]);
        sendResponse(state);
      })();
      return true;

    case 'CONTENT_READY':
      return false;

    default:
      return false;
  }
});

/* ====== INSTALL HANDLER ====== */

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    manualizeRecording: false,
    manualizeGuideId: null,
  });
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (_e) {
    /* ignore */
  }
});

/* ====== RECORDING CONTROL ====== */

async function handleStartRecording(data) {
  await chrome.storage.local.set({
    manualizeRecording: true,
    manualizeGuideId: data.guideId,
    manualizeRecordingStartTime: Date.now(),
  });
  try {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } catch (_e) {
    /* ignore */
  }
}

async function handleStopRecording() {
  await chrome.storage.local.set({
    manualizeRecording: false,
    manualizeGuideId: null,
  });
  try {
    await chrome.action.setBadgeText({ text: '' });
  } catch (_e) {
    /* ignore */
  }
}

/* ====== SCREENSHOT CAPTURE ====== */

async function handleStepRecorded(stepData, tab) {
  // Use the pre-captured screenshot if available and recent (< 3s old)
  let screenshotDataUrl = null;
  if (pendingScreenshot && Date.now() - pendingScreenshotTime < 3000) {
    screenshotDataUrl = pendingScreenshot;
  }
  pendingScreenshot = null;

  // Fallback: capture now if pre-capture missed
  if (!screenshotDataUrl) {
    try {
      screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
      });
    } catch (err) {
      console.warn('Manualize: Tab capture failed:', err.message);
    }
  }

  // Forward step + screenshot to the side panel
  const payload = {
    type: 'STEP_CAPTURED',
    data: {
      ...stepData,
      screenshotDataUrl,
    },
  };

  try {
    await chrome.runtime.sendMessage(payload);
  } catch (_e) {
    console.warn('Manualize: Side panel unreachable, step discarded.');
  }
}
