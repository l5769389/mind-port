import { UnsupportedFormatError } from "./errors";
import { parseProcessOn } from "./parsers/processon";
import { parseXMind } from "./parsers/xmind";
import type { MindDocument, MindFileInput, ParseMindOptions } from "./types";
import { inputToUint8Array, isZipBytes } from "./utils";

export async function parseMindFile(input: MindFileInput, options: ParseMindOptions = {}): Promise<MindDocument> {
  const format = options.format ?? "auto";

  if (format === "xmind") {
    return parseXMind(input);
  }

  if (format === "processon") {
    return parseProcessOn(input);
  }

  const lowerName = options.fileName?.toLowerCase() ?? "";

  if (lowerName.endsWith(".xmind")) {
    return parseXMind(input);
  }

  if (lowerName.endsWith(".pos") || lowerName.endsWith(".json")) {
    return parseProcessOn(input);
  }

  const bytes = await inputToUint8Array(input);

  if (isZipBytes(bytes)) {
    return parseXMind(bytes);
  }

  if (looksLikeJson(bytes)) {
    return parseProcessOn(input);
  }

  throw new UnsupportedFormatError("Unable to detect mind map format. Pass format: 'xmind' or 'processon'.");
}

function looksLikeJson(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte <= 0x20) {
      continue;
    }

    return byte === 0x7b || byte === 0x5b;
  }

  return false;
}
