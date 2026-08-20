import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Homeboard account to join a shared rental workspace.",
};

export default function RegisterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
