import "server-only";

import { z } from "zod";

import { generateWithOllama } from "@/lib/ollama";
import type { ConversationHint } from "@/lib/rental-logic";
import type { SearchProfileData } from "@/lib/types";

const updatesSchema = z.object({
  name: z.string().optional(),
  city: z.string().nullable().optional(),
  moveInDate: z.string().nullable().optional(),
  intent: z.enum(["rent", "buy"]).nullable().optional(),
  propertyType: z.enum(["apartment", "house", "condo", "room", "unknown"]).nullable().optional(),
  locations: z.array(z.string()).optional(),
  budgetMin: z.number().int().nullable().optional(),
  budgetMax: z.number().int().nullable().optional(),
  stretchBudget: z.number().int().nullable().optional(),
  groupSize: z.number().int().nullable().optional(),
  hasRoommates: z.boolean().nullable().optional(),
  bedroomsPreferred: z.number().nullable().optional(),
  bedroomsFlexible: z.array(z.string()).optional(),
  moveInTimeframe: z.string().nullable().optional(),
  neighborhoods: z.array(z.string()).optional(),
  mustHaves: z.array(z.string()).optional(),
  niceToHaves: z.array(z.string()).optional(),
  dealbreakers: z.array(z.string()).optional(),
  priorities: z.array(z.string()).optional(),
  pets: z.boolean().nullable().optional(),
  parking: z.boolean().nullable().optional(),
  petsRequired: z.boolean().nullable().optional(),
  parkingRequired: z.boolean().nullable().optional(),
  laundryRequired: z.boolean().nullable().optional(),
  commuteTarget: z.string().nullable().optional(),
  maxCommuteMinutes: z.number().int().nullable().optional(),
  rentalReadiness: z
    .object({
      hasOfferLetter: z.boolean().optional(),
      needsGuarantor: z.boolean().optional(),
      hasProofOfIncome: z.boolean().optional(),
    })
    .optional(),
  notes: z.string().nullable().optional(),
});

const extractionSchema = z.object({
  updates: updatesSchema.default({}),
  confidence: z.enum(["low", "medium", "high"]).default("medium"),
});

type ExtractedUpdates = z.infer<typeof updatesSchema>;

const extractionJsonSchema = {
  type: "object",
  properties: {
    updates: {
      type: "object",
      properties: {
        intent: { type: ["string", "null"], enum: ["rent", "buy", null] },
        propertyType: { type: ["string", "null"], enum: ["apartment", "house", "condo", "room", "unknown", null] },
        locations: { type: "array", items: { type: "string" } },
        city: { type: ["string", "null"] },
        moveInDate: { type: ["string", "null"] },
        name: { type: "string" },
        budgetMin: { type: ["integer", "null"] },
        budgetMax: { type: ["integer", "null"] },
        stretchBudget: { type: ["integer", "null"] },
        groupSize: { type: ["integer", "null"] },
        hasRoommates: { type: ["boolean", "null"] },
        bedroomsPreferred: { type: ["number", "null"] },
        bedroomsFlexible: { type: "array", items: { type: "string" } },
        moveInTimeframe: { type: ["string", "null"] },
        neighborhoods: { type: "array", items: { type: "string" } },
        mustHaves: { type: "array", items: { type: "string" } },
        niceToHaves: { type: "array", items: { type: "string" } },
        dealbreakers: { type: "array", items: { type: "string" } },
        priorities: { type: "array", items: { type: "string" } },
        pets: { type: ["boolean", "null"] },
        parking: { type: ["boolean", "null"] },
        petsRequired: { type: ["boolean", "null"] },
        parkingRequired: { type: ["boolean", "null"] },
        laundryRequired: { type: ["boolean", "null"] },
        commuteTarget: { type: ["string", "null"] },
        maxCommuteMinutes: { type: ["integer", "null"] },
        rentalReadiness: {
          type: "object",
          properties: {
            hasOfferLetter: { type: "boolean" },
            needsGuarantor: { type: "boolean" },
            hasProofOfIncome: { type: "boolean" },
          },
          additionalProperties: false,
        },
        notes: { type: ["string", "null"] },
      },
      additionalProperties: false,
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["updates", "confidence"],
  additionalProperties: false,
} as const;

function profileSnapshot(profile: SearchProfileData) {
  return {
    intent: profile.intent,
    name: profile.name,
    city: profile.city,
    moveInDate: profile.moveInDate,
    propertyType: profile.propertyType,
    locations: profile.locations,
    budgetMin: profile.budgetMin,
    budgetMax: profile.budgetMax,
    stretchBudget: profile.stretchBudget,
    groupSize: profile.groupSize,
    hasRoommates: profile.hasRoommates,
    bedroomsPreferred: profile.bedroomsPreferred,
    bedroomsFlexible: profile.bedroomsFlexible,
    moveInTimeframe: profile.moveInTimeframe,
    neighborhoods: profile.neighborhoods,
    mustHaves: profile.mustHaves,
    niceToHaves: profile.niceToHaves,
    dealbreakers: profile.dealbreakers,
    priorities: profile.priorities,
    pets: profile.pets,
    parking: profile.parking,
    petsRequired: profile.petsRequired,
    parkingRequired: profile.parkingRequired,
    laundryRequired: profile.laundryRequired,
    commuteTarget: profile.commuteTarget,
    maxCommuteMinutes: profile.maxCommuteMinutes,
    rentalReadiness: profile.rentalReadiness,
    notes: profile.notes,
  };
}

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function dedupe(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export async function extractSearchProfileUpdatesWithAI(input: {
  profile: SearchProfileData;
  message: string;
  recentMessages: Array<{ role: string; content: string; authorName?: string | null }>;
  conversationHint: ConversationHint;
}) {
  const prompt = `
You extract rental-search preference updates from conversation.
Return strict JSON only.

Current profile:
${JSON.stringify(profileSnapshot(input.profile), null, 2)}

Conversation hint:
${input.conversationHint ?? "none"}

Recent conversation:
${JSON.stringify(input.recentMessages.slice(-8), null, 2)}

Latest user message:
${JSON.stringify(input.message)}

Rules:
- Understand casual speech and indirect answers.
- This is onboarding, not open-ended apartment advice.
- If the user is answering the assistant's question, interpret the answer in that context.
- "probably 4500" or "around 4500" should usually map to budgetMax 4500.
- If the user gives a comfort budget and a stretch budget, keep both.
- "with two roommates" means groupSize 3 and hasRoommates true.
- If they mention multiple priorities like "commute and price", both can be high.
- If they narrow geography like "only Jersey City, not Hoboken", reflect that directly.
- Only include fields that should change.
- Do not output markdown.

Return exactly:
{
  "updates": {},
  "confidence": "medium"
}
`;

  try {
    const raw = await generateWithOllama(prompt, {
      format: extractionJsonSchema as unknown as Record<string, unknown>,
      temperature: 0.1,
      task: "extract",
    });
    const parsed = safeJsonParse(raw);
    const validated = extractionSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
}

export function mergeProfileUpdates(profile: SearchProfileData, updates: ExtractedUpdates) {
  return {
    ...profile,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
    neighborhoods: updates.neighborhoods ? dedupe(updates.neighborhoods) : profile.neighborhoods,
    locations: updates.locations ? dedupe(updates.locations) : profile.locations,
    bedroomsFlexible: updates.bedroomsFlexible ? dedupe(updates.bedroomsFlexible) : profile.bedroomsFlexible,
    mustHaves: updates.mustHaves ? dedupe(updates.mustHaves) : profile.mustHaves,
    niceToHaves: updates.niceToHaves ? dedupe(updates.niceToHaves) : profile.niceToHaves,
    dealbreakers: updates.dealbreakers ? dedupe(updates.dealbreakers) : profile.dealbreakers,
    priorities: updates.priorities ? dedupe(updates.priorities) : profile.priorities,
    updatedAt: new Date().toISOString(),
  };
}

export async function generateConversationalReplyWithAI(input: {
  previousProfile: SearchProfileData;
  nextProfile: SearchProfileData;
  message: string;
  recentMessages: Array<{ role: string; content: string; authorName?: string | null }>;
  missingFields: string[];
  listingsCount: number;
  fallbackReply: string;
}) {
  const prompt = `
You are Homeboard's onboarding assistant.
Write one natural reply to the user.

Latest user message:
${JSON.stringify(input.message)}

Recent conversation:
${JSON.stringify(input.recentMessages.slice(-8), null, 2)}

Previous profile:
${JSON.stringify(profileSnapshot(input.previousProfile), null, 2)}

Updated profile:
${JSON.stringify(profileSnapshot(input.nextProfile), null, 2)}

Missing fields:
${JSON.stringify(input.missingFields)}

Current listing context count:
${input.listingsCount}

Rules:
- Sound warm, natural, and conversational.
- Frame the conversation as onboarding and setup for the shared rental board.
- Do not sound templated or robotic.
- Accept indirect answers naturally.
- Mention what you understood when helpful.
- Ask one next-best question unless the search is ready enough to browse.
- No bullets.
- Under 90 words.
- Plain text only.
`;

  try {
    const raw = await generateWithOllama(prompt, { temperature: 0.45, task: "reply" });
    const cleaned = raw.replace(/^["'\s]+|["'\s]+$/g, "");
    return cleaned || input.fallbackReply;
  } catch {
    return input.fallbackReply;
  }
}
