import { env as cloudflareEnv } from "cloudflare:workers";

const PREFIX = "v1.";

async function encryptionKey(): Promise<CryptoKey> {
  const runtimeEnv = cloudflareEnv as unknown as Record<string, string | undefined>;
  // The Preview build does not preserve ad-hoc Worker secrets across version uploads.
  // Derive a dedicated AES-256 key from the already-bound high-entropy cron secret,
  // using HKDF domain separation so it cannot be reused as the cron authentication key.
  const configured = runtimeEnv["ALTHEA_CRON_SECRET"] ?? process.env["ALTHEA_CRON_SECRET"];
  if (!configured?.trim()) throw new Error("Segreto server ALTHEA_CRON_SECRET non configurato.");

  const secret = new TextEncoder().encode(configured.trim());
  if (secret.byteLength < 32) {
    throw new Error("ALTHEA_CRON_SECRET deve contenere almeno 32 byte per derivare la chiave di cifratura.");
  }

  const material = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("althea-credential-encryption-v1"),
      info: new TextEncoder().encode("AES-256-GCM"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function encryptCredential(value: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return PREFIX + toBase64(iv) + "." + toBase64(new Uint8Array(ciphertext));
}

export async function decryptCredential(value: string): Promise<string> {
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext, re-encrypted on authenticated read
  const parts = value.slice(PREFIX.length).split(".");
  if (parts.length !== 2) throw new Error("Formato credenziale cifrata non valido.");
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(parts[0]) },
    key,
    fromBase64(parts[1]),
  );
  return new TextDecoder().decode(plaintext);
}
