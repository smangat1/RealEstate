import "server-only";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2:3b";
const DEFAULT_OLLAMA_EXTRACT_MODEL = "qwen2:1.5b";
const DEFAULT_OLLAMA_REPLY_MODEL = "llama3.2:3b";

type OllamaGenerateResponse = {
  response?: string;
};

function getOllamaUrl() {
  return process.env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL;
}

function getOllamaModel() {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

function getModelOverride(task?: "extract" | "reply") {
  if (task === "extract") {
    return process.env.OLLAMA_EXTRACT_MODEL?.trim() || DEFAULT_OLLAMA_EXTRACT_MODEL;
  }

  if (task === "reply") {
    return process.env.OLLAMA_REPLY_MODEL?.trim() || DEFAULT_OLLAMA_REPLY_MODEL;
  }

  return getOllamaModel();
}

export async function generateWithOllama(
  prompt: string,
  options?: {
    format?: "json" | Record<string, unknown>;
    temperature?: number;
    task?: "extract" | "reply";
  },
) {
  const response = await fetch(`${getOllamaUrl()}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getModelOverride(options?.task),
      prompt,
      stream: false,
      format: options?.format,
      options: {
        temperature: options?.temperature ?? 0.2,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  return (data.response || "").trim();
}
