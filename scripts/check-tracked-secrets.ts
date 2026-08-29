import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const secretPatterns = [
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { label: "password-bearing database URL", pattern: /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
];

const findings: string[] = [];
for (const file of trackedFiles) {
  if (file === "scripts/check-tracked-secrets.ts") continue;
  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;

  const source = buffer.toString("utf8");
  for (const { label, pattern } of secretPatterns) {
    if (pattern.test(source)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Potential tracked secrets found (values intentionally hidden):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Tracked-secret check passed (${trackedFiles.length} files scanned).`);
