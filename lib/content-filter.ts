export type ObjectionableTextCategory = "hate" | "sexual" | "threat";

export type ObjectionableTextResult = {
  isObjectionable: boolean;
  category: ObjectionableTextCategory | null;
};

const substitutions: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
};

function normalizedWords(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (character) => substitutions[character] ?? character)
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalWords(text: string) {
  return text.split(" ").map((word) => word.replace(/(.)\1+/g, "$1"));
}

const hateTerms = new Set([
  "chink", "fag", "fagot", "kike", "niger", "spic", "trany",
]);

const sexualPhrases = [
  "send nude", "send nudes", "send me nude", "send me nudes",
  "want to fuck", "wana to fuck", "would like to fuck",
  "sex for money", "sex for rent", "sex for cash",
  "show your dick", "show me your dick", "send your dick", "send me your dick",
  "show your pusy", "show me your pusy", "send your pusy", "send me your pusy",
  "show your tits", "show me your tits", "send your tits", "send me your tits",
].map((phrase) => canonicalWords(phrase).join(" "));

const threatPhrases = [
  "kill you", "i will kill you", "im going to kill you",
  "murder you", "i will murder you", "im going to murder you",
  "shoot you", "i will shoot you", "im going to shoot you",
  "stab you", "i will stab you", "im going to stab you",
  "rape you", "i will rape you", "im going to rape you",
  "burn your home", "burn down your home", "burn your house", "burn down your house",
  "burn your apartment", "burn down your apartment", "you are dead", "youre dead",
].map((phrase) => canonicalWords(phrase).join(" "));

function includesPhrase(text: string, phrases: string[]) {
  const padded = ` ${text} `;
  return phrases.some((phrase) => padded.includes(` ${phrase} `));
}

export function checkObjectionableText(text: string): ObjectionableTextResult {
  const normalized = normalizedWords(text);
  if (!normalized) return { isObjectionable: false, category: null };
  const words = canonicalWords(normalized);
  const canonical = words.join(" ");

  if (words.some((word) => hateTerms.has(word))) {
    return { isObjectionable: true, category: "hate" };
  }
  if (includesPhrase(canonical, sexualPhrases)) {
    return { isObjectionable: true, category: "sexual" };
  }
  if (includesPhrase(canonical, threatPhrases)) {
    return { isObjectionable: true, category: "threat" };
  }
  return { isObjectionable: false, category: null };
}

