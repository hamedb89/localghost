import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

export function canPrompt() {
  return Boolean(input.isTTY && output.isTTY);
}

export async function withPrompt<T>(run: (prompt: (question: string) => Promise<string>) => Promise<T>) {
  const rl = createInterface({ input, output });
  try {
    return await run((question) => rl.question(question));
  } finally {
    rl.close();
  }
}

export async function confirm(question: string, defaultValue = true) {
  return withPrompt(async (prompt) => {
    const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
    const answer = (await prompt(`${question}${suffix}`)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === "y" || answer === "yes";
  });
}

export async function ask(question: string, defaultValue?: string) {
  return withPrompt(async (prompt) => {
    const suffix = defaultValue ? ` (${defaultValue}) ` : " ";
    const answer = (await prompt(`${question}${suffix}`)).trim();
    return answer || defaultValue || "";
  });
}
