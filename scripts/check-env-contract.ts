import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const platformVariables = new Set([
  "NEXT_RUNTIME",
  "NODE_ENV",
  "VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_ENV",
  "GIT_COMMIT_SHA",
  "SOURCE_VERSION",
  "VERCEL_GIT_COMMIT_SHA",
]);
const sourceFiles = execFileSync(
  "git",
  ["ls-files", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs"],
  { encoding: "utf8" },
).split("\n").filter(Boolean);

const usedVariables = new Set<string>();
for (const file of sourceFiles) {
  if (file === "scripts/check-env-contract.ts") continue;
  if (!existsSync(file)) continue;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    usedVariables.add(match[1]);
  }
}

const example = readFileSync(".env.example", "utf8");
const documentedVariables = new Set(
  [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
);
const undocumented = [...usedVariables]
  .filter((name) => !platformVariables.has(name) && !documentedVariables.has(name))
  .sort();
const unsafePublicVariables = [...documentedVariables]
  .filter((name) => name.startsWith("NEXT_PUBLIC_") && /(?:SECRET|PRIVATE|PASSWORD|TOKEN)/.test(name))
  .sort();

if (undocumented.length || unsafePublicVariables.length) {
  if (undocumented.length) {
    console.error(`Undocumented environment variables: ${undocumented.join(", ")}`);
  }
  if (unsafePublicVariables.length) {
    console.error(`Secret-looking variables must not be public: ${unsafePublicVariables.join(", ")}`);
  }
  process.exit(1);
}

console.log(`Environment contract check passed (${usedVariables.size} referenced variables documented or platform-provided).`);
