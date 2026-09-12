import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDeterministicPitch,
  getPitchTemplatesCount,
  detectPitchIntent,
  detectAdvisorIntent,
  type PitchCategoryKey,
} from "../lib/scout-pitch-engine";

test("scout pitch engine provides at least 20 deterministic outputs", () => {
  const count = getPitchTemplatesCount();
  assert.ok(count >= 20, `Expected at least 20 templates, found ${count}`);
});

test("detectAdvisorIntent accurately catches @advisor and @scout triggers", () => {
  // @advisor pitch
  const trigger1 = detectAdvisorIntent("@advisor create a pitch for me");
  assert.equal(trigger1.type, "pitch");

  // @advisor with address
  const trigger2 = detectAdvisorIntent("@advisor pitch for 560 w 43rd");
  assert.equal(trigger2.type, "pitch");
  if (trigger2.type === "pitch") {
    assert.match(trigger2.requestedAddress ?? "", /560 w 43rd/i);
  }

  // legacy @scout pitch
  const triggerLegacy = detectAdvisorIntent("@scout draft a message to broker about 187 johnson");
  assert.equal(triggerLegacy.type, "pitch");

  // @advisor scan
  const triggerScan = detectAdvisorIntent("@advisor scan my links");
  assert.equal(triggerScan.type, "scan");

  // @advisor general
  const triggerGeneral = detectAdvisorIntent("@advisor what can you do?");
  assert.equal(triggerGeneral.type, "general");

  // regular roommate chat
  const nonTrigger = detectAdvisorIntent("Hey guys did anyone check out the new place?");
  assert.equal(nonTrigger.type, "none");
});

test("pitch generator synthesizes grounded facts with zero hallucinated figures", () => {
  const pitch = generateDeterministicPitch({
    listingAddress: "560 W 43rd St",
    unit: "Apt 34K",
    neighborhood: "Hell's Kitchen",
    monthlyRent: 8469,
    oldPrice: 8974,
    priceDropAmount: 505,
    percentDrop: 6,
    roommateCount: 3,
    roommateNames: ["Samyan", "Alex", "Maya"],
    senderName: "Samyan",
    categories: ["price_drop", "financial_readiness", "tour_speed"],
    tone: "executive",
  });

  // Verify real facts are present
  assert.match(pitch.subject, /560 W 43rd St/);
  assert.match(pitch.body, /560 W 43rd St Apt 34K/);
  assert.match(pitch.body, /\$8,469\/mo/);
  assert.match(pitch.body, /-\$505\/mo/);
  assert.match(pitch.body, /3 working professionals/);
  assert.match(pitch.body, /Samyan, Alex, Maya/);
  assert.match(pitch.body, /Samyan and roommates/);

  // Strict no-hallucination verification: no made-up salaries or arbitrary credit numbers
  assert.doesNotMatch(pitch.body, /\$2[0-9]{2},000/);
  assert.doesNotMatch(pitch.body, /\b(?:7[5-9][0-9]|8[0-4][0-9]|850)\b/);
});

test("checklist combinations yield distinct specialized angles across tones", () => {
  const categoriesToTest: PitchCategoryKey[][] = [
    ["price_drop", "financial_readiness", "tour_speed"],
    ["financial_readiness", "tour_speed", "lease_urgency"],
    ["financial_readiness", "stable_tenants"],
    ["price_drop", "financial_readiness", "stable_tenants"],
    ["financial_readiness", "tour_speed"],
    ["stable_tenants", "tour_speed"],
    ["price_drop", "financial_readiness", "stable_tenants", "tour_speed"],
    ["price_drop"],
    ["financial_readiness"],
    ["tour_speed"],
    ["stable_tenants"],
    ["lease_urgency", "tour_speed"],
  ];

  for (const cats of categoriesToTest) {
    const exec = generateDeterministicPitch({
      listingAddress: "187 Johnson Ave",
      unit: "1F",
      monthlyRent: 4300,
      roommateCount: 2,
      senderName: "Sam",
      categories: cats,
      tone: "executive",
    });
    const warm = generateDeterministicPitch({
      listingAddress: "187 Johnson Ave",
      unit: "1F",
      monthlyRent: 4300,
      roommateCount: 2,
      senderName: "Sam",
      categories: cats,
      tone: "warm",
    });

    assert.ok(exec.subject.length > 5);
    assert.ok(exec.body.length > 50);
    assert.ok(warm.subject.length > 5);
    assert.ok(warm.body.length > 50);
    assert.notEqual(exec.body, warm.body);
  }
});
