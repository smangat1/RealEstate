export const MARKETING_SLIDES = [
  {
    key: "vibes",
    hash: "#top",
    label: "Vibes",
    title: "Pick your next home on vibes.",
    description: "We’ll do the thinking. Save the places you fall for, then compare what actually works.",
    background: "#F4EADE",
    foreground: "#27362F",
    accent: "#53755B",
  },
  {
    key: "problem",
    hash: "#problem",
    label: "The first problem",
    title: "You shouldn’t have to open Maps every time you find somewhere that matches your aesthetic.",
    description: "One place you love. Seven tabs. No actual answer. Rent is one number. Your life is not.",
    background: "#FBF5ED",
    foreground: "#27362F",
    accent: "#48695C",
  },
  {
    key: "thinking",
    hash: "#thinking",
    label: "The better way",
    title: "Doomscroll first. Optimize later.",
    description: "Homeboard turns 27 saved listings into one shared decision.",
    background: "#2E4038",
    foreground: "#F7EADC",
    accent: "#AED8B7",
  },
  {
    key: "product",
    hash: "#product",
    label: "What Homeboard does",
    title: "Save what catches your eye. See what actually works.",
    description: "Collect listings, compare real commutes, and make every tradeoff visible to the group.",
    background: "#A8CDB0",
    foreground: "#27362F",
    accent: "#3D504A",
  },
] as const;

export type MarketingSlide = (typeof MARKETING_SLIDES)[number];
export type MarketingSlideKey = MarketingSlide["key"];

export function getMarketingSlide(value?: string | null): MarketingSlide {
  const normalized = value?.trim().toLowerCase().replace(/^#/, "");
  if (!normalized || normalized === "top") return MARKETING_SLIDES[0];
  return MARKETING_SLIDES.find((slide) => slide.key === normalized) ?? MARKETING_SLIDES[0];
}

export function getMarketingSlideIndex(value?: string | null) {
  const slide = getMarketingSlide(value);
  return MARKETING_SLIDES.findIndex((candidate) => candidate.key === slide.key);
}
