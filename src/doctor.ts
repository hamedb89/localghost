import { execa } from "execa";

export type DoctorResult = {
  ok: boolean;
  caddy: {
    found: boolean;
    version?: string;
    installHint: string;
  };
};

export async function checkCaddy(): Promise<DoctorResult["caddy"]> {
  try {
    const result = await execa("caddy", ["version"], { reject: false });
    const version = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    return {
      found: result.exitCode === 0,
      ...(version ? { version } : {}),
      installHint: "brew install caddy"
    };
  } catch {
    return {
      found: false,
      installHint: "brew install caddy"
    };
  }
}

export async function runDoctor(): Promise<DoctorResult> {
  const caddy = await checkCaddy();
  return {
    ok: caddy.found,
    caddy
  };
}
