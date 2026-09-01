browser.runtime.onInstalled.addListener(() => {
  console.info("Save to Homeboard is ready.");
});

const nativeApplicationIds = [
  "com.homeboard.native",
  "com.homeboard.native.mac",
  "com.homeboard.native.mac.dev"
];

async function sendNativeMessage(message) {
  let lastError = null;
  for (const applicationId of nativeApplicationIds) {
    try {
      return await browser.runtime.sendNativeMessage(applicationId, message);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Homeboard is not connected on this device.");
}

async function startPageScan(tab) {
  const tabId = tab?.id;
  if (!Number.isInteger(tabId)) {
    throw new Error("Safari did not provide the active tab.");
  }

  let presentation = /mac/i.test(globalThis.navigator?.platform || "")
    ? "compact"
    : "visual";
  try {
    const platform = await browser.runtime.getPlatformInfo();
    if (platform?.os === "mac") presentation = "compact";
  } catch {
    // Older Safari versions can omit platform information. Navigator supplies the fallback.
  }
  const request = {
    type: "homeboard.startPageScan",
    presentation
  };

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch {
    // The declared content script may already be installed on this page.
  }
  await browser.tabs.sendMessage(tabId, request);
}

browser.action.onClicked.addListener((tab) => {
  startPageScan(tab).catch((error) => {
    console.error("Homeboard could not start the page scan.", error);
  });
});

browser.runtime.onMessage.addListener((request) => {
  if (request?.type === "homeboard.analyzeListing") {
    return sendNativeMessage({
      type: "analyzeListing",
      ...(request.capture || {})
    });
  }

  if (request?.type === "homeboard.saveListing") {
    return sendNativeMessage({
      type: "saveListing",
      ...(request.capture || {})
    });
  }

  return undefined;
});
