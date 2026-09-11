const supportedListingPatterns = [
  "*://*.zillow.com/*",
  "*://*.streeteasy.com/*",
  "*://*.realtor.com/*",
  "*://*.apartments.com/*",
  "*://*.redfin.com/*",
  "*://*.rent.com/*",
  "*://*.renthop.com/*",
  "*://*.craigslist.org/*",
  "*://*.compass.com/*",
  "*://*.corcoran.com/*",
  "*://*.elliman.com/*",
  "*://*.serhant.com/*",
  "*://*.sothebysrealty.com/*"
];

function isSupportedListingURL(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return [
      "zillow.com", "streeteasy.com", "realtor.com", "apartments.com",
      "redfin.com", "rent.com", "renthop.com", "craigslist.org",
      "compass.com", "corcoran.com", "elliman.com", "serhant.com",
      "sothebysrealty.com"
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function installScanner(tabId) {
  if (!Number.isInteger(tabId)) return;
  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    // Safari blocks internal pages and tabs that are still changing documents.
  }
}

async function installScannerInOpenTabs() {
  let tabs = [];
  try {
    tabs = await browser.tabs.query({ url: supportedListingPatterns });
  } catch {
    // Some Safari versions do not implement URL-filtered tab queries.
    try { tabs = await browser.tabs.query({}); } catch { return; }
  }
  await Promise.all(tabs
    .filter((tab) => isSupportedListingURL(tab?.url))
    .map((tab) => installScanner(tab.id)));
}

browser.runtime.onInstalled.addListener(() => {
  installScannerInOpenTabs();
});

browser.runtime.onStartup?.addListener(() => {
  installScannerInOpenTabs();
});

browser.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo?.url || tab?.url;
  if ((typeof changeInfo?.url === "string" || changeInfo?.status === "complete")
      && isSupportedListingURL(url)) {
    installScanner(tabId);
  }
});

const nativeApplicationIds = [
  "com.homeboard.native",
  "com.homeboard.native.mac",
  "com.homeboard.native.mac.dev"
];
let successfulNativeApplicationId = null;

async function orderedNativeApplicationIds() {
  const preferred = successfulNativeApplicationId;
  if (preferred) {
    return [preferred, ...nativeApplicationIds.filter((id) => id !== preferred)];
  }
  try {
    const platform = await browser.runtime.getPlatformInfo();
    if (platform?.os === "mac") {
      return [
        "com.homeboard.native.mac",
        "com.homeboard.native.mac.dev",
        "com.homeboard.native"
      ];
    }
  } catch {
    // Fall back to the iPhone-first order when Safari omits platform details.
  }
  return nativeApplicationIds;
}

async function sendNativeMessage(message) {
  let lastError = null;
  for (const applicationId of await orderedNativeApplicationIds()) {
    try {
      const response = await browser.runtime.sendNativeMessage(applicationId, message);
      successfulNativeApplicationId = applicationId;
      return response;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Homeboard is not connected on this device.");
}

async function resolveActiveTab(tab) {
  if (Number.isInteger(tab?.id)) return tab;
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs.find((candidate) => Number.isInteger(candidate?.id));
  if (activeTab) return activeTab;
  throw new Error("Safari did not provide the active tab.");
}

async function showActionFailure(tab) {
  let activeTab;
  try {
    activeTab = await resolveActiveTab(tab);
  } catch {
    return;
  }
  const tabId = activeTab.id;
  try {
    await browser.action.setBadgeBackgroundColor({ tabId, color: "#B42318" });
    await browser.action.setBadgeText({ tabId, text: "!" });
    globalThis.setTimeout(() => {
      browser.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    }, 4000);
  } catch {
    // Some Safari versions do not display action badges.
  }
}

async function startPageScan(tab) {
  const activeTab = await resolveActiveTab(tab);
  const tabId = activeTab.id;

  let presentation = /mac/i.test(globalThis.navigator?.platform || "")
    ? "compact"
    : "mobile-pills";
  try {
    const platform = await browser.runtime.getPlatformInfo();
    presentation = platform?.os === "mac" ? "compact" : "mobile-pills";
  } catch {
    // Older Safari versions can omit platform information. Navigator supplies the fallback.
  }
  const request = {
    type: "homeboard.startPageScan",
    presentation
  };

  try {
    await installScanner(tabId);
  } catch {
    // The declared content script may already be installed on this page.
  }
  const response = await browser.tabs.sendMessage(tabId, request);
  if (response?.started !== true) {
    throw new Error("The Homeboard page scanner did not start.");
  }
}

browser.action.onClicked.addListener((tab) => {
  startPageScan(tab).catch((error) => {
    console.error("Homeboard could not start the page scan.", error);
    showActionFailure(tab);
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
