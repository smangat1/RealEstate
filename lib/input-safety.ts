const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MULTILINE_WHITESPACE = /[ \t]+/g;
const SINGLE_LINE_WHITESPACE = /\s+/g;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;
const ENCODED_CONTROL_CHARACTER = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

export function sanitizePlainText(
  value: unknown,
  maxLength: number,
  options: { multiline?: boolean } = {},
) {
  if (typeof value !== "string" || maxLength <= 0) return "";

  const withoutControls = value.replace(CONTROL_CHARACTERS, "");
  const normalized = options.multiline
    ? withoutControls
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(MULTILINE_WHITESPACE, " ").trimEnd())
        .join("\n")
        .trim()
    : withoutControls.replace(SINGLE_LINE_WHITESPACE, " ").trim();

  return normalized.slice(0, maxLength);
}

export function readFormText(
  formData: FormData,
  name: string,
  maxLength: number,
  options: { multiline?: boolean } = {},
) {
  return sanitizePlainText(formData.get(name), maxLength, options);
}

export function readFormIdentifier(formData: FormData, name: string) {
  const value = readFormText(formData, name, 160);
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

export function safeRelativePath(value: unknown, fallback = "/") {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || candidate.includes("\\")
    || /[\u0000-\u001F\u007F]/.test(candidate)
    || ENCODED_PATH_SEPARATOR.test(candidate)
    || ENCODED_CONTROL_CHARACTER.test(candidate)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://homeboard.invalid");
    if (parsed.origin !== "https://homeboard.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function isSafeHttpUrl(value: string) {
  if (value.length > 2_000) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:")
      && parsed.username === ""
      && parsed.password === ""
    );
  } catch {
    return false;
  }
}
