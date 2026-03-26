import crypto from "crypto";

const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    throw new Error(
      "ENCRYPTION_KEY ortam değişkeni tanımlı değil. .env dosyasına 32 baytlık anahtarın base64 değerini ekleyin."
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY, base64 ile kodlanmış tam 32 bayt olmalıdır. Örnek: openssl rand -base64 32"
    );
  }
  return key;
}

/**
 * AES-256-GCM ile şifreler. Çıktı: base64(iv || authTag || ciphertext)
 */
export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * encryptSecret çıktısını çözer.
 */
export function decryptSecret(payload: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Geçersiz şifreli veri.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

/**
 * UI için son birkaç karakteri gösterir.
 */
export function maskSecret(value: string, visibleChars = 4): string {
  const v = value?.trim() ?? "";
  if (!v) return "—";
  if (v.length <= visibleChars) return "****";
  return `****${v.slice(-visibleChars)}`;
}
