const FALLBACK_SITE_URL = "https://real-estate-samyanmangat-6662s-projects.vercel.app";

export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    FALLBACK_SITE_URL;
  const withProtocol = /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  return new URL(withProtocol);
}
