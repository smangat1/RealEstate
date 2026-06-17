import type { Metadata } from "next";
import Script from "next/script";
import { Cormorant_Garamond, Inter } from "next/font/google";

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
  title: "Rental Search Advisor MVP",
  description: "Chat-first rental search board powered by dummy local data.",
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
