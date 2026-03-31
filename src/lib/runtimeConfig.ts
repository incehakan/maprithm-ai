type RuntimeCheck = {
  key: string;
  required: boolean;
  value?: string | undefined;
};

let validated = false;

export function validateRuntimeConfig(options?: { strict?: boolean }): {
  ok: boolean;
  missing: string[];
  warnings: string[];
} {
  const strict = options?.strict ?? process.env.NODE_ENV === "production";
  const checks: RuntimeCheck[] = [
    { key: "DATABASE_URL", required: true, value: process.env.DATABASE_URL },
    { key: "NEXTAUTH_SECRET", required: true, value: process.env.NEXTAUTH_SECRET },
    { key: "AUTH_TRUST_HOST", required: true, value: process.env.AUTH_TRUST_HOST },
    { key: "ENCRYPTION_KEY", required: true, value: process.env.ENCRYPTION_KEY },
    { key: "CRON_SECRET", required: false, value: process.env.CRON_SECRET },
    { key: "OPENAI_API_KEY", required: false, value: process.env.OPENAI_API_KEY },
    {
      key: "TRENDYOL_WEBHOOK_ORDER_TOKEN",
      required: false,
      value: process.env.TRENDYOL_WEBHOOK_ORDER_TOKEN
    }
  ];

  const missing = checks
    .filter((c) => c.required && (!c.value || !c.value.trim()))
    .map((c) => c.key);
  const warnings = checks
    .filter((c) => !c.required && (!c.value || !c.value.trim()))
    .map((c) => `${c.key} tanımlı değil (opsiyonel).`);

  if (strict && missing.length > 0) {
    throw new Error(`Runtime config missing: ${missing.join(", ")}`);
  }

  validated = true;
  return { ok: missing.length === 0, missing, warnings };
}

export function ensureRuntimeConfigValidated(): void {
  if (validated) return;
  validateRuntimeConfig({ strict: false });
}

