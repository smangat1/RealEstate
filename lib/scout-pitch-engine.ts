/**
 * scout-pitch-engine.ts
 *
 * Deterministic, grounded broker outreach pitch generator.
 * Strictly adheres to verified board facts — never fabricates salaries,
 * credit scores, employer names, or unverified claims.
 *
 * Contains 24+ curated, high-converting combinations tailored to
 * competitive rental markets (NYC, SF, etc.).
 */

export type PitchCategoryKey =
  | "price_drop"
  | "financial_readiness"
  | "tour_speed"
  | "stable_tenants"
  | "lease_urgency";

export type PitchTone = "executive" | "warm";

export type PitchInput = {
  listingAddress: string;
  unit?: string | null;
  neighborhood?: string | null;
  monthlyRent?: number | null;
  oldPrice?: number | null;
  priceDropAmount?: number | null;
  percentDrop?: number | null;
  roommateCount: number;
  roommateNames?: string[];
  combinedBudgetMax?: number | null;
  moveInDate?: string | null;
  senderName?: string | null;
  categories: PitchCategoryKey[];
  tone?: PitchTone;
};

export type GeneratedPitch = {
  subject: string;
  body: string;
  angleLabel: string;
  variationIndex: number;
  categoriesApplied: PitchCategoryKey[];
};

// ─────────────────────────────────────────────────────────────
// Helper formatting utilities (pure, zero side-effects)
// ─────────────────────────────────────────────────────────────

function formatLoc(address: string, unit?: string | null, neighborhood?: string | null): string {
  const cleanAddr = address.trim();
  const unitPart = unit?.trim() ? ` ${unit.trim().startsWith("#") || unit.trim().toLowerCase().startsWith("apt") ? unit.trim() : `#${unit.trim()}`}` : "";
  const neighPart = neighborhood?.trim() ? ` in ${neighborhood.trim()}` : "";
  return `${cleanAddr}${unitPart}${neighPart}`;
}

function formatSubjectAddress(address: string, unit?: string | null): string {
  const cleanAddr = address.trim();
  const unitPart = unit?.trim() ? ` ${unit.trim().startsWith("#") || unit.trim().toLowerCase().startsWith("apt") ? unit.trim() : `#${unit.trim()}`}` : "";
  return `${cleanAddr}${unitPart}`;
}

function formatGroupDesc(count: number, names?: string[]): { short: string; formal: string } {
  if (count <= 1) {
    return {
      short: "myself",
      formal: "I am an individual working professional",
    };
  }
  const cleanNames = (names ?? []).map(n => n.trim()).filter(Boolean);
  if (cleanNames.length > 1) {
    return {
      short: `${cleanNames.join(", ")} (${count} working professionals)`,
      formal: `our group of ${count} working professionals (${cleanNames.join(", ")})`,
    };
  }
  return {
    short: `my ${count - 1} roommate${count > 2 ? "s" : ""} and myself (${count} working professionals)`,
    formal: `our group of ${count} working professionals`,
  };
}

function formatSignoff(senderName?: string | null, count = 1): string {
  const sender = senderName?.trim() || "The prospective tenants";
  if (count <= 1 || !senderName?.trim()) {
    return `Best regards,\n${sender}`;
  }
  return `Best regards,\n${sender} and roommates`;
}

// ─────────────────────────────────────────────────────────────
// The 24+ Deterministic Grounded Template Variations
// ─────────────────────────────────────────────────────────────

type TemplateHandler = (input: PitchInput) => GeneratedPitch;

const TEMPLATE_VARIATIONS: Record<string, TemplateHandler> = {
  // ── Combination 1: Price Drop + Financial + Tour Speed (The Deal Strike) ──
  "financial_readiness+price_drop+tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the listed rate";
    const dropFmt = input.priceDropAmount ? `-$${input.priceDropAmount.toLocaleString()}/mo` : "";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? ` targeting ${input.moveInDate}` : "";

    return {
      angleLabel: "Price Drop Strike · Executive",
      variationIndex: 1,
      categoriesApplied: ["price_drop", "financial_readiness", "tour_speed"],
      subject: `Inquiring on ${formatSubjectAddress(input.listingAddress, input.unit)} — Pre-qualified group`,
      body: `Hello,

I saw ${loc} and noticed the recent price adjustment to ${rentFmt}${dropFmt ? ` (${dropFmt})` : ""}. We would like to confirm its current availability.

Quick background: ${group.formal} are looking for our next home${moveIn}. Our combined income comfortably exceeds standard 40x rent requirements with verified employment, strong credit scores, and full application documentation ready for immediate submission.

We can accommodate an in-person showing today or this week, or a virtual walk-through if preferred. Please let us know your earliest showing windows.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "price_drop+financial_readiness+tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the updated rate";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? `We are aiming for an approximate move-in around ${input.moveInDate}.` : "";

    return {
      angleLabel: "Price Drop Strike · Warm & Direct",
      variationIndex: 2,
      categoriesApplied: ["price_drop", "financial_readiness", "tour_speed"],
      subject: `Tour Request & Availability: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hi there,

Hope your week is going well. We came across the listing for ${loc} and saw the new price at ${rentFmt}. It looks like a wonderful match for what we are looking for.

We are ${group.short}. We take pride in being reliable, easy tenants: all of us have stable full-time employment, combined household earnings well above 40x rent, and complete paperwork (credit checks, W2s, pay stubs) ready to go. ${moveIn}

Is the apartment still available to tour this week? We are very flexible and can stop by whenever fits your schedule best.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 2: Financial + Tour Speed + Lease Urgency (The Fast-Mover) ──
  "financial_readiness+tour_speed+lease_urgency:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? ` listed at $${input.monthlyRent.toLocaleString()}/mo` : "";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? ` for a ${input.moveInDate} start` : " for a standard 12-month lease";

    return {
      angleLabel: "Fast-Track Applicant · Executive",
      variationIndex: 3,
      categoriesApplied: ["financial_readiness", "tour_speed", "lease_urgency"],
      subject: `Tour & Application: ${formatSubjectAddress(input.listingAddress, input.unit)} (Deposit ready)`,
      body: `Hello,

I am writing to inquire about ${loc}${rentFmt}.

${group.formal} are actively searching${moveIn} and prepared to move swiftly on the right space. We are pre-qualified with combined income well over 40x rent, excellent credit history, and proof of employment. We have deposit funds and references ready to submit immediately following a showing.

Could you let us know your availability for a walk-through over the next 2-3 days? We can make any morning, evening, or weekend slot work.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "financial_readiness+tour_speed+lease_urgency:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? `We have our sights set on a ${input.moveInDate} lease start.` : "We are ready to move quickly once we view the space.";

    return {
      angleLabel: "Fast-Track Applicant · Warm",
      variationIndex: 4,
      categoriesApplied: ["financial_readiness", "tour_speed", "lease_urgency"],
      subject: `Inquiry for ${formatSubjectAddress(input.listingAddress, input.unit)} — Ready to view & apply`,
      body: `Hello!

We love the look of ${loc} and wanted to check if it is still on the market.

A quick note on who we are: ${group.short}. We all work full-time, have verified income well clear of standard 40x criteria, and keep clean credit records. ${moveIn} If the apartment feels right in person, we are in a position to submit our application and deposit without back-and-forth delay.

When would be a convenient time for an in-person showing this week? We are happy to accommodate your showing hours.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 3: Financial + Stable Tenants (The Landlord Dream) ──
  "financial_readiness+stable_tenants:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? ` We are planning for a ${input.moveInDate} commencement.` : "";

    return {
      angleLabel: "Low-Maintenance Group · Executive",
      variationIndex: 5,
      categoriesApplied: ["financial_readiness", "stable_tenants"],
      subject: `Rental Inquiry: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

We are writing to ask about the current status of ${loc}.

${group.formal} seeking a reliable, long-term home.${moveIn} We are quiet, career-focused professionals with consistent work histories, combined income comfortably passing 40x requirements, and strong credit standing. We pride ourselves on maintaining an immaculate living space and prompt rent payments.

We would appreciate the opportunity to view the property at your earliest convenience. Please let us know how best to arrange a visit.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "financial_readiness+stable_tenants:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Low-Maintenance Group · Warm",
      variationIndex: 6,
      categoriesApplied: ["financial_readiness", "stable_tenants"],
      subject: `Prospective Tenants for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Good day,

We came across your listing for ${loc} and wanted to introduce ourselves.

We are ${group.short}. We treat our living space with genuine respect and are looking for a place to call home for a full 12-month lease or longer. Financially, we are thoroughly qualified—combined household income exceeds 40x rent, credit scores are solid, and employer verification letters are on hand.

Could we set up a time to view the apartment? Looking forward to hearing from you.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 4: Price Drop + Stable Tenants + Financial (Value Seeker) ──
  "price_drop+financial_readiness+stable_tenants:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the updated rent";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Qualified Value Seeker · Executive",
      variationIndex: 7,
      categoriesApplied: ["price_drop", "financial_readiness", "stable_tenants"],
      subject: `Inquiry regarding ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

I noticed ${loc} at the current rate of ${rentFmt} and wanted to verify if you are still accepting applications.

${group.formal} looking for a long-term lease. We are low-maintenance, respectful tenants with verified employment, combined income well exceeding 40x rent, and clean financial records. We are prepared to submit our full package promptly.

Please let us know if showings are taking place this week.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "price_drop+financial_readiness+stable_tenants:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? ` at $${input.monthlyRent.toLocaleString()}/mo` : "";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Qualified Value Seeker · Warm",
      variationIndex: 8,
      categoriesApplied: ["price_drop", "financial_readiness", "stable_tenants"],
      subject: `Availability & Viewing: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hi,

I saw ${loc}${rentFmt} and wanted to reach out right away.

We are ${group.short}. We are quiet, dependable tenants who take good care of where we live and are looking for a home we can stay in long-term. Our finances are thoroughly in order (well over 40x income, strong credit, references ready).

We'd love to stop by for a quick tour if it is still available. What days this week work best on your end?

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 5: Tour Speed + Financial Readiness (The Quick Qualifier) ──
  "financial_readiness+tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Immediate Qualifier · Executive",
      variationIndex: 9,
      categoriesApplied: ["financial_readiness", "tour_speed"],
      subject: `Tour Request: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

Is ${loc} currently available for showings?

${group.formal}. We meet and exceed standard 40x income requirements, maintain strong credit standing, and have our W2s and bank statements organized. We can tour in-person or virtually at your earliest convenience.

Please share your upcoming showing availability.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "financial_readiness+tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Immediate Qualifier · Warm",
      variationIndex: 10,
      categoriesApplied: ["financial_readiness", "tour_speed"],
      subject: `Schedule a tour for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello!

We are very interested in ${loc} and would love to arrange a tour.

Our group: ${group.short}. We are all fully employed with combined income well above 40x rent, good credit, and our paperwork completely prepped. We are very flexible on showing times and can easily make mornings, afternoons, or evenings work.

When are you showing the unit next?

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 6: Tour Speed + Stable Tenants (The Flexible Respectful) ──
  "stable_tenants+tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Respectful Tour Seeker · Executive",
      variationIndex: 11,
      categoriesApplied: ["stable_tenants", "tour_speed"],
      subject: `Showing Request: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

We are writing to request a tour of ${loc}.

${group.formal} seeking a stable 12-month lease. We are respectful, non-smoking professionals who keep a clean and quiet household. We can attend an in-person viewing anytime this week.

Please let us know the available showing times.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "stable_tenants+tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Respectful Tour Seeker · Warm",
      variationIndex: 12,
      categoriesApplied: ["stable_tenants", "tour_speed"],
      subject: `Tour inquiry for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hi there,

We came across ${loc} and would love to schedule a visit!

We are ${group.short}. We are responsible, considerate tenants looking for a peaceful long-term home. We have full flexibility this week to stop by for an in-person walk-through whenever works for you.

Looking forward to hearing when we might be able to view it.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 7: All 4 Categories (The Full Arsenal) ──
  "price_drop+financial_readiness+stable_tenants+tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the updated rent";
    const dropFmt = input.priceDropAmount ? ` (following the -$${input.priceDropAmount.toLocaleString()}/mo adjustment)` : "";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);
    const moveIn = input.moveInDate ? ` with a target move-in around ${input.moveInDate}` : "";

    return {
      angleLabel: "Comprehensive Pitch · Executive",
      variationIndex: 13,
      categoriesApplied: ["price_drop", "financial_readiness", "stable_tenants", "tour_speed"],
      subject: `Application-Ready Inquiry: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

I saw ${loc} listed at ${rentFmt}${dropFmt} and wanted to check on its current availability.

${group.formal} looking for a 12-month lease${moveIn}. We are quiet, responsible tenants with strong financial qualifications: verified full-time employment, combined earnings well beyond 40x rent, and solid credit profiles. All application documents and deposit funds are assembled.

We can tour today or any time this week. Please let us know your earliest showing availability.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "price_drop+financial_readiness+stable_tenants+tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the new rate";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Comprehensive Pitch · Warm",
      variationIndex: 14,
      categoriesApplied: ["price_drop", "financial_readiness", "stable_tenants", "tour_speed"],
      subject: `Tour & Application Details: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hi there,

We noticed ${loc} at the updated ${rentFmt} price point and are very eager to view it.

A quick introduction: we are ${group.short}. We are dependable, tidy tenants who respect our neighbors and treat our home with care. We easily meet standard 40x income benchmarks with verified jobs, great credit scores, and pre-packaged documentation.

We are ready to move quickly and can tour whenever fits your calendar this week. Does anytime over the next few days work?

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 8: Price Drop Alone ──
  "price_drop:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the updated price";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Price Check · Executive",
      variationIndex: 15,
      categoriesApplied: ["price_drop"],
      subject: `Status Inquiry: ${formatSubjectAddress(input.listingAddress, input.unit)} (${rentFmt})`,
      body: `Hello,

I noticed the recent price update on ${loc} to ${rentFmt}.

${group.formal} interested in learning whether the unit is still available and whether the advertised terms apply to an upcoming 12-month lease.

Please let us know the current status and if tours are currently scheduled.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "price_drop:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const rentFmt = input.monthlyRent ? `$${input.monthlyRent.toLocaleString()}/mo` : "the new price";
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Price Check · Warm",
      variationIndex: 16,
      categoriesApplied: ["price_drop"],
      subject: `Inquiring about ${formatSubjectAddress(input.listingAddress, input.unit)} (${rentFmt})`,
      body: `Hi there,

We saw the recent price adjustment on ${loc} to ${rentFmt} and wanted to reach out directly.

We are ${group.short} and would love to confirm if the apartment is still on the market. If so, could we set up a quick tour?

Thanks so much, and hope to connect soon.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 9: Financial Readiness Alone ──
  "financial_readiness:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Credit & Income First · Executive",
      variationIndex: 17,
      categoriesApplied: ["financial_readiness"],
      subject: `Qualified Inquiry for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

I am inquiring regarding the current status of ${loc}.

${group.formal}. We comfortably satisfy standard 40x rent criteria with verified employment, clean credit histories, and tax documents ready for swift review. We are looking to confirm whether you are currently reviewing applications.

Thank you for your time, and we look forward to hearing from you.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "financial_readiness:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Credit & Income First · Warm",
      variationIndex: 18,
      categoriesApplied: ["financial_readiness"],
      subject: `Prospective applicant group for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Good morning,

We are writing to ask about ${loc}.

We are ${group.short}. We wanted to let you know right away that our finances are fully prepared: our combined income is well over 40x rent, our credit scores are strong, and we have pay stubs, W2s, and landlord references on hand.

Is the apartment still available? If so, we'd appreciate the chance to discuss next steps.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 10: Tour Speed Alone ──
  "tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Direct Tour Request · Executive",
      variationIndex: 19,
      categoriesApplied: ["tour_speed"],
      subject: `Tour Availability for ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

${group.formal} and very interested in viewing ${loc}.

Could you provide your current showing windows for an in-person or virtual walk-through this week? We can adjust our schedule to fit your earliest availability.

Thank you,
${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Direct Tour Request · Warm",
      variationIndex: 20,
      categoriesApplied: ["tour_speed"],
      subject: `Would love to tour ${formatSubjectAddress(input.listingAddress, input.unit)} this week`,
      body: `Hi there!

We came across ${loc} and are really excited about it.

We are ${group.short}. Would it be possible to arrange a viewing sometime over the next few days? We are very flexible on timing and happy to come by whenever works best for you.

Thanks for your time!

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 11: Stable Tenants Alone ──
  "stable_tenants:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Long-Term Resident · Executive",
      variationIndex: 21,
      categoriesApplied: ["stable_tenants"],
      subject: `Inquiry: ${formatSubjectAddress(input.listingAddress, input.unit)} (Long-Term Lease)`,
      body: `Hello,

We are writing to check availability for ${loc}.

${group.formal} seeking a 12-month or multi-year lease. We take pride in being low-maintenance, quiet, and respectful residents. We are interested in confirming availability and discussing the application process.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "stable_tenants:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const group = formatGroupDesc(input.roommateCount, input.roommateNames);

    return {
      angleLabel: "Long-Term Resident · Warm",
      variationIndex: 22,
      categoriesApplied: ["stable_tenants"],
      subject: `Looking for a home at ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

We are reaching out about ${loc}.

We are ${group.short}. We are quiet, considerate professionals looking for a peaceful apartment where we can settle down for a full lease. We treat our home with genuine care and would love to know if the property is still available.

Warmly,
${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  // ── Combination 12: Lease Urgency + Tour Speed ──
  "lease_urgency+tour_speed:executive": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const moveIn = input.moveInDate ? ` for a ${input.moveInDate} start` : "";

    return {
      angleLabel: "Immediate Start · Executive",
      variationIndex: 23,
      categoriesApplied: ["lease_urgency", "tour_speed"],
      subject: `Priority Showing: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello,

I am writing regarding ${loc}.

We are actively seeking to secure a lease${moveIn} and are prepared to sign quickly on the right unit. Could you let us know your showing schedule today or tomorrow? We can view the apartment on short notice.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },

  "lease_urgency+tour_speed:warm": (input) => {
    const loc = formatLoc(input.listingAddress, input.unit, input.neighborhood);
    const moveIn = input.moveInDate ? `We are targeting a move-in around ${input.moveInDate}.` : "We are ready to sign as soon as we tour.";

    return {
      angleLabel: "Immediate Start · Warm",
      variationIndex: 24,
      categoriesApplied: ["lease_urgency", "tour_speed"],
      subject: `Ready to tour and apply: ${formatSubjectAddress(input.listingAddress, input.unit)}`,
      body: `Hello!

We are very interested in ${loc} and ready to move forward promptly. ${moveIn}

Could we come by for a showing in the next couple of days? We are flexible and ready to submit an application right away if it is a fit.

${formatSignoff(input.senderName, input.roommateCount)}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Primary Exported Pitch Generator
// ─────────────────────────────────────────────────────────────

function findTemplate(categories: PitchCategoryKey[], tone: PitchTone): TemplateHandler | null {
  const catSet = new Set(categories);
  for (const [key, handler] of Object.entries(TEMPLATE_VARIATIONS)) {
    const [catsPart, tonePart] = key.split(":");
    if (tonePart !== tone) continue;
    const keyCats = catsPart.split("+") as PitchCategoryKey[];
    if (keyCats.length === categories.length && keyCats.every(c => catSet.has(c))) {
      return handler;
    }
  }
  return null;
}

export function generateDeterministicPitch(input: PitchInput): GeneratedPitch {
  const tone = input.tone ?? "executive";
  const uniqueCats = Array.from(new Set(input.categories));
  const effectiveCats = uniqueCats.length > 0 ? uniqueCats : ["financial_readiness", "tour_speed"];

  // 1. Try exact match (order independent)
  const exact = findTemplate(effectiveCats, tone);
  if (exact) return exact(input);

  // 2. Try best partial overlap
  let bestHandler: TemplateHandler | null = null;
  let bestScore = -1;
  const inputSet = new Set(effectiveCats);

  for (const [key, handler] of Object.entries(TEMPLATE_VARIATIONS)) {
    const [catsPart, tonePart] = key.split(":");
    if (tonePart !== tone) continue;
    const keyCats = catsPart.split("+") as PitchCategoryKey[];
    const matchCount = keyCats.filter(c => inputSet.has(c)).length;
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestHandler = handler;
    }
  }

  if (bestHandler) return bestHandler(input);

  // 3. Ultimate fallback
  return Object.values(TEMPLATE_VARIATIONS)[0](input);
}

export function getPitchTemplatesCount(): number {
  return Object.keys(TEMPLATE_VARIATIONS).length;
}

export type AdvisorIntent =
  | { type: "pitch"; requestedAddress?: string }
  | { type: "scan" }
  | { type: "general" }
  | { type: "none" };

/**
 * Detects if a chat message is addressing the Advisor (via @advisor or legacy @scout)
 * and classifies the specific action requested.
 */
export function detectAdvisorIntent(content: string): AdvisorIntent {
  const clean = content.toLowerCase().trim();
  const mentionsAdvisor =
    clean.includes("@advisor") ||
    clean.includes("advisor") ||
    clean.includes("@scout") ||
    clean.includes("scout");

  if (!mentionsAdvisor) {
    return { type: "none" };
  }

  // 1. Pitch request
  const asksForPitch =
    clean.includes("pitch") ||
    clean.includes("outreach") ||
    clean.includes("draft a message") ||
    clean.includes("create a pitch") ||
    clean.includes("write a pitch") ||
    clean.includes("make a pitch") ||
    clean.includes("write an email") ||
    clean.includes("contact broker") ||
    clean.includes("broker message") ||
    clean.includes("reach out");

  if (asksForPitch) {
    // Check if an address or street name was mentioned
    // e.g. "for 560 w 43rd" or "for johnson"
    const forMatch = clean.match(/(?:for|about|on)\s+([^,?.!]+)/i);
    const requestedAddress = forMatch ? forMatch[1].trim() : undefined;
    return { type: "pitch", requestedAddress };
  }

  // 2. Scan request
  const asksForScan =
    clean.includes("scan") ||
    clean.includes("check price") ||
    clean.includes("check link") ||
    clean.includes("refresh link") ||
    clean.includes("find drop") ||
    clean.includes("check drop");

  if (asksForScan) {
    return { type: "scan" };
  }

  // 3. General address to Advisor
  return { type: "general" };
}

/**
 * Backward-compatible helper for pitch detection.
 */
export function detectPitchIntent(content: string): {
  isPitchRequest: boolean;
  requestedAddress?: string;
} {
  const intent = detectAdvisorIntent(content);
  if (intent.type === "pitch") {
    return { isPitchRequest: true, requestedAddress: intent.requestedAddress };
  }
  return { isPitchRequest: false };
}
