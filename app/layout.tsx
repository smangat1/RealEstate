import type { Metadata } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Inter } from "next/font/google";

import { shouldNoIndexSite } from "@/lib/site-visibility";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  applicationName: "Homeboard",
  title: {
    default: "Homeboard — Pick your next home on vibes",
    template: "%s · Homeboard",
  },
  description: "Save rental listings together, compare real commutes, and understand the tradeoffs before your group chooses a home.",
  keywords: ["rental search", "roommates", "apartment comparison", "commute comparison", "shared shortlist"],
  category: "real estate",
  openGraph: {
    type: "website",
    siteName: "Homeboard",
    title: "Homeboard — Pick your next home on vibes",
    description: "Save rental listings together. Homeboard handles commute math, comparisons, and group tradeoffs.",
  },
  twitter: {
    card: "summary",
    title: "Homeboard — Pick your next home on vibes",
    description: "Save rental listings together. Homeboard handles commute math, comparisons, and group tradeoffs.",
  },
  formatDetection: {
    address: false,
    email: false,
    telephone: false,
  },
  robots: shouldNoIndexSite()
    ? {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true,
        },
      }
    : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cormorant.variable}`}>
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {`
            (function() {
              try {
                var saved = window.localStorage.getItem('rental-advisor-theme');
                var theme = saved === 'light' || saved === 'dark'
                  ? saved
                  : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                document.documentElement.dataset.theme = theme;
              } catch (error) {}
            })();
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
