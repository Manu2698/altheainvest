import { env as cloudflareEnv } from "cloudflare:workers";

const PREFIX = "v1.";

async function encryptionKey(): Promise<CryptoKey> {
  const runtimeEnv = cloudflareEnv as unknown as Record<string, string | undefined>;
  const configured = runtimeEnv["ALPACA_CREDENTIALS_ENCRYPTION_KEY"] ?? process.env["ALPACA_CREDENTIALS_ENCRYPTION_KEY"];
  if (!configured?.trim()) throw new Error("ALPACA_CREDENTIALS_ENCRYPTION_KEY non configurata.");

  const secret = configured.trim();
  let raw: Uint8Array | undefined;

  // Accept a canonical Base64-encoded 32-byte key when supplied.
  try {
    const binary = atob(secret);
    const decoded = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    if (decoded.byteLength === 32 && btoa(binary) === secret) raw = decoded;
  } catch {
    // A high-entropy secret string is also supported below.
  }

  // Cloudflare dashboard secrets are often entered as opaque strings rather than Base64.
  // Derive a fixed 256-bit AES key from those strings without exposing or storing the key.
  if (!raw) {
    const encodedSecret = new TextEncoder().encode(secret);
    if (encodedSecret.byteLength < 32) {
      throw new Error("ALPACA_CREDENTIALS_ENCRYPTION_KEY deve contenere almeno 32 byte oppure essere una chiave Base64 da 32 byte.");
    }
    raw = new Uint8Array(await crypto.subtle.digest("SHA-256", encodedSecret));
  }

  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
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
