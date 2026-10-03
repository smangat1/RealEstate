import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Homeboard for Mac: Save rentals from your laptop",
  description: "Connect Homeboard to your Mac, capture rentals in one click, and doomscroll between your laptop and phone.",
  openGraph: {
    type: "website",
    siteName: "Homeboard",
    title: "Homeboard for Mac",
    description: "Capture rentals on your Mac and sync seamlessly to your group's board.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Homeboard for Mac",
    description: "Save rentals on your Mac to the same Homeboard as your phone.",
  },
};

export default function MacLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
