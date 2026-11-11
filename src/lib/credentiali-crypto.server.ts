import { env as cloudflareEnv } from "cloudflare:workers";

const PREFIX = "v1.";

function encryptionKey(): Promise<CryptoKey> {
  const runtimeEnv = cloudflareEnv as unknown as Record<string, string | undefined>;
  const encoded = runtimeEnv["ALPACA_CREDENTIALS_ENCRYPTION_KEY"] ?? process.env["ALPACA_CREDENTIALS_ENCRYPTION_KEY"];
  if (!encoded) throw new Error("ALPACA_CREDENTIALS_ENCRYPTION_KEY non configurata.");
  let raw: Uint8Array;
  try {
    const binary = atob(encoded.trim());
    raw = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    throw new Error("ALPACA_CREDENTIALS_ENCRYPTION_KEY deve essere Base64 valida.");
  }
  if (raw.byteLength !== 32) throw new Error("La chiave di cifratura deve contenere esattamente 32 byte.");
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
