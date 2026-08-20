import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Board invitation",
  description: "Join a shared Homeboard rental workspace.",
};

export default function InviteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
