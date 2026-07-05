export type LocalghostEnvironment = NodeJS.ProcessEnv;

const PRODUCTION_ENV_KEYS = ["NODE_ENV", "VERCEL_ENV", "NETLIFY", "CF_PAGES_BRANCH", "LOCALGHOST_ENV"] as const;

export function getProductionReason(env: LocalghostEnvironment = process.env) {
  if (env.LOCALGHOST_ENV === "production") return "LOCALGHOST_ENV=production";
  if (env.NODE_ENV === "production") return "NODE_ENV=production";
  if (env.VERCEL_ENV === "production") return "VERCEL_ENV=production";
  if (env.NETLIFY === "true" && env.CONTEXT === "production") return "NETLIFY=true and CONTEXT=production";
  if (env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH === env.CF_PAGES_PRODUCTION_BRANCH) {
    return "CF_PAGES_BRANCH matches CF_PAGES_PRODUCTION_BRANCH";
  }

  return null;
}

export function isProductionLike(env: LocalghostEnvironment = process.env) {
  return getProductionReason(env) !== null;
}

export function assertLocalDevelopment(command: string, env: LocalghostEnvironment = process.env) {
  const reason = getProductionReason(env);
  if (!reason) return;

  throw new Error(`Localghost only runs in local development. Refusing \`${command}\` because ${reason}.`);
}

export function getProductionEnvKeys() {
  return PRODUCTION_ENV_KEYS;
}
