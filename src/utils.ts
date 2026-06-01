import type { MindFileInput } from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return stripHtml(value).trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

export function stableId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

export async function inputToUint8Array(input: MindFileInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }

  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }

  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }

  return new TextEncoder().encode(JSON.stringify(input));
}

export async function inputToText(input: MindFileInput): Promise<string> {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof Uint8Array || input instanceof ArrayBuffer || (typeof Blob !== "undefined" && input instanceof Blob)) {
    const bytes = await inputToUint8Array(input);
    return new TextDecoder("utf-8").decode(bytes);
  }

  if (isRecord(input) || Array.isArray(input)) {
    return JSON.stringify(input);
  }

  const bytes = await inputToUint8Array(input);
  return new TextDecoder("utf-8").decode(bytes);
}

export async function parseJsonLikeInput(input: MindFileInput): Promise<unknown | undefined> {
  if (!isBytesLikeInput(input) && (isRecord(input) || Array.isArray(input))) {
    return input;
  }

  return tryParseJson(await inputToText(input));
}

function isBytesLikeInput(input: MindFileInput): boolean {
  return input instanceof Uint8Array ||
    input instanceof ArrayBuffer ||
    (typeof Blob !== "undefined" && input instanceof Blob);
}

export function isZipBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function tryParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  const cloned = new Uint8Array(bytes.byteLength);
  cloned.set(bytes);
  return cloned;
}

export function guessMimeType(path: string): string | undefined {
  const lower = path.toLowerCase();

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".gif")) {
    return "image/gif";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }

  return undefined;
}

export function normalizeAssetRef(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return value.replace(/^xap:\/\//, "").replace(/^file:\/\//, "").replace(/^\/+/, "");
}
