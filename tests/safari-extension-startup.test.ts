import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  resolve(process.cwd(), "ios/HomeboardNative/HomeboardSafariExtension/Resources/background.js"),
  "utf8",
);

type Listener = (...args: unknown[]) => unknown;

function loadBackground(openTabs: Array<{ id: number; url: string }>) {
  const listeners: Record<string, Listener> = {};
  const injections: number[] = [];
  const event = (name: string) => ({ addListener: (listener: Listener) => { listeners[name] = listener; } });
  const browser = {
    runtime: {
      onInstalled: event("installed"),
      onStartup: event("startup"),
      onMessage: event("message"),
      getPlatformInfo: async () => ({ os: "ios" }),
      sendNativeMessage: async () => ({}),
    },
    tabs: {
      onUpdated: event("updated"),
      query: async () => openTabs,
      sendMessage: async () => ({ started: true }),
    },
    scripting: {
      executeScript: async ({ target }: { target: { tabId: number } }) => { injections.push(target.tabId); },
    },
    action: {
      onClicked: event("clicked"),
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async () => {},
    },
  };
  vm.runInNewContext(source, { browser, URL, console, navigator: { platform: "iPhone" }, setTimeout });
  return { listeners, injections };
}

test("extension startup injects the scanner into already-open supported tabs", async () => {
  const background = loadBackground([
    { id: 4, url: "https://www.zillow.com/homedetails/123" },
    { id: 5, url: "https://example.com/" },
    { id: 6, url: "https://streeteasy.com/building/example" },
  ]);
  background.listeners.startup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(background.injections.sort(), [4, 6]);
});

test("first install injects the scanner into a listing that is already open", async () => {
  const background = loadBackground([
    { id: 12, url: "https://www.zillow.com/homedetails/already-open" },
  ]);
  background.listeners.installed();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(background.injections, [12]);
});

test("a supported SPA navigation injects without requiring a page refresh", async () => {
  const background = loadBackground([]);
  background.listeners.updated(9, { url: "https://www.zillow.com/homedetails/456" }, { id: 9 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(background.injections, [9]);

  background.listeners.updated(10, { status: "complete" }, { id: 10, url: "https://example.com/" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(background.injections, [9]);
});
