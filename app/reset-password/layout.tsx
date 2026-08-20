import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Finish resetting the password for your Homeboard account.",
};

export default function ResetPasswordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
