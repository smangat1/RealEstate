import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Homeboard for Safari: Save rentals from your Mac",
  description: "Connect Homeboard to Safari on your Mac, review a rental in one click, and save it to the same shared board as your phone.",
  openGraph: {
    type: "website",
    siteName: "Homeboard",
    title: "Homeboard for Safari",
    description: "One click in Safari sends a reviewed rental to your group's Homeboard.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Homeboard for Safari",
    description: "Save the rental in front of you to the same Homeboard as your phone.",
  },
};

export default function SafariLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
