import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shared board",
  description: "Review listings, commutes, preferences, and group decisions in a shared Homeboard workspace.",
};

export default function BoardsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
