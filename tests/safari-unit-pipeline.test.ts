import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = readFileSync(resolve(process.cwd(), "ios/HomeboardNative/HomeboardSafariExtension/Resources/content.js"), "utf8");
type Unit = { id: string; label: string; unit: string; price: number; bedrooms: number; bathrooms: number };
type Capture = { availabilityPageEvidence: string; semanticPageEvidence: string; secondaryPageEvidence: string; unitOptions: Unit[]; allowSystemModel: boolean; [key: string]: unknown };
const units = (count: number): Unit[] => Array.from({ length: count }, (_, index) => ({
  id: `${index + 1}A`, label: `Unit ${index + 1}A`, unit: `${index + 1}A`,
  price: 3000 + index * 100, bedrooms: 2, bathrooms: 1,
}));
const rows = (options: Unit[], identifiedCount: number) => options.map((option, index) => `<tr ${index < identifiedCount ? `data-unit-number="${option.unit}"` : ""}><td>${option.unit}</td>\n<td>2 beds, 1 bath</td>\n<td>850</td>\n<td>Now</td>\n<td>$${option.price}</td></tr>`).join("");

function fixture(options: Unit[], analyzed: Unit[] = options, identifiedCount = 2, mobile = false, accelerateTimers = false) {
  let finalOptions = analyzed;
  let nextAnalysisGate: Promise<void> | null = null;
  const dom = new JSDOM(`<!doctype html><html><head><title>123 Main Street</title></head><body><main>
    <h1>123 Main Street</h1>
    <section id="available-units"><h2>Available units</h2><p>All (${options.length})</p><table><tbody>${rows(options, identifiedCount)}</tbody></table></section>
    <section class="unavailable-units"><h2>Unavailable units</h2><table><tbody><tr><td>99Z</td><td>3 beds, 2 baths</td><td>$7000</td></tr></tbody></table></section>
    <section data-testid="recommended"><h2>Similar buildings nearby</h2><p>Unit 88Z 2 beds 1 bath $4500</p></section>
    </main></body></html>`, { url: "https://streeteasy.com/building/example-building", runScripts: "outside-only", pretendToBeVisual: true });
  let listener: (request: { type: string; presentation?: string }) => Promise<unknown>;
  const captures: Capture[] = [];
  const saves: Capture[] = [];
  const window = dom.window;
  if (accelerateTimers) {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: Parameters<typeof window.setTimeout>[0], timeout?: number, ...args: unknown[]) =>
      originalSetTimeout(handler, Math.min(timeout ?? 0, 5), ...args)) as typeof window.setTimeout;
  }
  if (mobile) Object.defineProperty(window.navigator, "userAgent", { value: "iPhone Safari" });
  Object.assign(window, {
    browser: { runtime: {
      onMessage: { addListener: (callback: typeof listener) => { listener = callback; } },
      sendMessage: async (request: { type: string; capture: Capture }) => {
        if (request.type === "homeboard.analyzeListing") {
          captures.push(request.capture);
          const responseOptions = finalOptions;
          const gate = nextAnalysisGate;
          nextAnalysisGate = null;
          if (gate) await gate;
          return { analyzed: true, analysis: {
            scope: "building", facts: { address: request.capture.address }, options: responseOptions,
            missingFields: [], usedOnDeviceModel: false,
          } };
        }
        if (request.type === "homeboard.saveListing") {
          saves.push(request.capture);
          return { saved: true, synced: true };
        }
        return { connected: true, boards: [] };
      },
    } },
  });
  window.eval(source);
  return {
    dom, captures, saves,
    extract: () => listener({ type: "homeboard.extractListing" }) as Promise<Capture>,
    scan: () => listener({ type: "homeboard.startPageScan", presentation: "mobile-pills" }),
    pauseNextAnalysis() {
      let release!: () => void;
      nextAnalysisGate = new Promise<void>((resolve) => { release = resolve; });
      return release;
    },
    updateUnits(next: Unit[]) {
      finalOptions = next;
      window.document.querySelector("#available-units")!.innerHTML = `<h2>Available units</h2><p>All (${next.length})</p><table><tbody>${rows(next, 2)}</tbody></table>`;
    },
    pills: () => [...window.document.querySelector("#homeboard-page-scan-root")?.shadowRoot?.querySelectorAll<HTMLButtonElement>(".listing-pill:not(.edit-pill)") || []],
  };
}

async function until(condition: () => boolean) {
  const end = Date.now() + 5000;
  while (!condition()) {
    assert.ok(Date.now() < end, "The scanner did not settle");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("availability evidence preserves ten complete rows and excludes unavailable and nearby units", async () => {
  const page = fixture(units(10));
  try {
    const capture = await page.extract();
    for (const option of units(10)) {
      assert.ok(capture.availabilityPageEvidence.replace(/\n+/g, "\n").includes(`${option.unit}\n2 beds, 1 bath\n850\nNow\n$${option.price}`), capture.availabilityPageEvidence);
    }
    assert.doesNotMatch(capture.availabilityPageEvidence, /99Z|88Z/);
    assert.doesNotMatch(capture.semanticPageEvidence, /99Z|88Z/);
    assert.ok(capture.secondaryPageEvidence.includes("10A"));
  } finally { page.dom.window.close(); }
});

test("nested structured units retain their shared layout without adding the parent floor plan", async () => {
  const page = fixture([]);
  try {
    const script = page.dom.window.document.createElement("script");
    script.type = "application/json";
    script.textContent = JSON.stringify({ building: {
      streetAddress: "123 Main Street", floorPlans: [{
        name: "A Floor Plan", beds: 2, baths: 1, minPrice: 3000, availableFrom: "Now",
        units: units(10).map((unit) => ({ unitNumber: unit.unit, price: unit.price })),
      }],
    } });
    page.dom.window.document.head.append(script);
    const capture = await page.extract();
    assert.deepEqual(Array.from(capture.unitOptions, (unit) => unit.unit), units(10).map((unit) => unit.unit));
    assert.ok(capture.unitOptions.every((unit) => unit.bedrooms === 2 && unit.bathrooms === 1));
    assert.ok(String(capture.structuredUnitEvidence).includes('"unit":"10A"'));
  } finally { page.dom.window.close(); }
});

test("the mobile carousel displays all ten analyzed units and saves only the tapped unit", async () => {
  const expected = units(10);
  const page = fixture(expected);
  try {
    await page.scan();
    await until(() => page.pills().length === 10);
    assert.equal(page.captures.length, 1);
    assert.equal(page.captures[0].allowSystemModel, true);
    assert.equal(page.captures[0].unitOptions.length, 2);
    assert.deepEqual(page.pills().map((pill) => pill.dataset.optionId), expected.map((unit) => unit.id));
    assert.equal(page.saves.length, 0);
    page.pills()[9].click();
    await until(() => page.saves.length === 1);
    assert.equal(page.saves[0].unit, "10A");
    assert.equal(page.saves[0].price, 3900);
    assert.equal(page.saves[0].address, "123 Main Street");
  } finally { page.dom.window.close(); }
});

test("the final two-unit analysis replaces five initial candidates", async () => {
  const page = fixture(units(5), units(2), 5);
  try {
    await page.scan();
    await until(() => page.pills().length === 2);
    assert.equal(page.captures[0].unitOptions.length, 5);
    assert.deepEqual(page.pills().map((pill) => pill.dataset.optionId), ["1A", "2A"]);
    assert.equal(page.saves.length, 0);
  } finally { page.dom.window.close(); }
});

test("an empty building analysis does not resurrect an initial candidate as a listing pill", async () => {
  const page = fixture(units(1), []);
  try {
    await page.scan();
    await until(() => page.captures.length === 1);
    await until(() => page.dom.window.document.querySelector("#homeboard-page-scan-root")?.shadowRoot?.querySelector(".complete-card")?.classList.contains("hidden") === true);
    assert.equal(page.pills().length, 0);
    assert.equal(page.saves.length, 0);
  } finally { page.dom.window.close(); }
});

test("late availability is sent through native analysis before refreshing the choices", async () => {
  const page = fixture(units(2));
  try {
    await page.scan();
    await until(() => page.pills().length === 2);
    page.updateUnits(units(10));
    await until(() => page.pills().length === 10);
    assert.equal(page.captures.length, 2);
    assert.ok(page.captures[1].availabilityPageEvidence.includes("10A"));
    assert.equal(page.captures[1].allowSystemModel, true);
    assert.equal(page.saves.length, 0);
  } finally { page.dom.window.close(); }
});

test("a slow first listing remains eligible after the old startup retry window", async () => {
  const page = fixture([], [], 2, true, true);
  try {
    // With accelerated timers this is later than the old six-attempt window.
    await new Promise((resolve) => setTimeout(resolve, 45));
    assert.equal(page.captures.length, 0);
    page.updateUnits(units(2));
    await until(() => page.pills().length === 2);
    assert.ok(page.captures.length >= 1);
    assert.deepEqual(page.pills().map((pill) => pill.dataset.optionId), ["1A", "2A"]);
  } finally { page.dom.window.close(); }
});

test("a rescan does not overwrite details the user is editing", async () => {
  const page = fixture(units(2));
  try {
    await page.scan();
    await until(() => page.pills().length === 2);
    const shadow = page.dom.window.document.querySelector("#homeboard-page-scan-root")!.shadowRoot!;
    shadow.querySelector<HTMLButtonElement>(".edit-pill")!.click();
    const field = shadow.querySelector<HTMLInputElement>('#fieldUnit')!;
    assert.ok(field);
    field.value = "12B";
    field.dispatchEvent(new page.dom.window.Event("input"));
    page.updateUnits(units(10));
    await until(() => page.captures.length === 2);
    assert.equal(field.value, "12B");
    assert.equal(page.pills().length, 2);
  } finally { page.dom.window.close(); }
});

test("switching listings clears the old pill even when Zillow keeps the URL and old embedded data", async () => {
  const page = fixture(units(2), units(2), 2, true);
  try {
    const document = page.dom.window.document;
    document.querySelector("h1")!.textContent = "17B Maple Pl, # B, Hopewell Junction, NY 12533";
    const oldState = document.createElement("script");
    oldState.type = "application/json";
    oldState.textContent = JSON.stringify({ "@type": "Apartment", zpid: "old-listing", streetAddress: "17B Maple Pl", price: 1700, bedrooms: 1, bathrooms: 1 });
    document.head.append(oldState);
    await until(() => page.pills().length === 2);
    const oldPill = page.pills()[0];
    document.querySelector("h1")!.textContent = "Hopewell Gardens Apartments";
    const address = document.createElement("h2");
    address.textContent = "228 Route 376, Hopewell Junction, NY 12533";
    document.querySelector("h1")!.after(address);
    page.updateUnits(units(3));
    oldPill.click();
    assert.equal(page.saves.length, 0, "A stale pill must not save, even before the mutation observer runs");
    assert.equal(page.pills().length, 0);
    await until(() => page.pills().length === 3);
    assert.match(String(page.captures.at(-1)!.address), /^228 Route 376/);
    assert.doesNotMatch(String(page.captures.at(-1)!.structuredUnitEvidence), /Maple|1700/);
    page.pills()[0].click();
    await until(() => page.saves.length === 1);
    assert.match(String(page.saves[0].address), /^228 Route 376/);
  } finally { page.dom.window.close(); }
});

test("a delayed analysis from the previous URL cannot replace the new listing", async () => {
  const page = fixture(units(2), units(2), 2, true);
  try {
    const resume = page.pauseNextAnalysis();
    await until(() => page.captures.length === 1);
    const document = page.dom.window.document;
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = page.dom.window.location.href;
    document.head.append(canonical);
    page.dom.window.history.pushState({}, "", "/building/hopewell-gardens");
    document.querySelector("h1")!.textContent = "228 Route 376";
    page.updateUnits(units(3));
    await until(() => page.pills().length === 3);
    resume();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(page.pills().length, 3);
    assert.match(String(page.captures.at(-1)!.canonicalURL), /hopewell-gardens$/);
    assert.equal(page.saves.length, 0);
  } finally { page.dom.window.close(); }
});
