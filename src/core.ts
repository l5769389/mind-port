import { UnsupportedFormatError } from "./errors";
import { parseDiagramFile } from "./parsers/diagram";
import { parseMindFile } from "./parser";
import { renderDiagramToSvg } from "./renderer/diagram-svg";
import { renderToSvg } from "./renderer/svg";
import type { MindFileInput, MindPortDocument, ParseDiagramOptions, ParseFileOptions, RenderDocumentOptions, RenderFileOptions } from "./types";
import { inputToText, inputToUint8Array, isRecord, isZipBytes, tryParseJson } from "./utils";

export async function parseFile(input: MindFileInput, options: ParseFileOptions = {}): Promise<MindPortDocument> {
  const kind = options.kind ?? "auto";
  const lowerName = options.fileName?.toLowerCase() ?? "";

  if (kind === "mind") {
    return {
      kind: "mind",
      document: await parseMindFile(input, options)
    };
  }

  if (kind === "diagram") {
    return {
      kind: "diagram",
      document: await parseDiagramFile(input, diagramOptionsFor(options))
    };
  }

  if (options.format === "xmind" || lowerName.endsWith(".xmind")) {
    return {
      kind: "mind",
      document: await parseMindFile(input, options)
    };
  }

  const bytes = await inputToUint8Array(input);
  if (isZipBytes(bytes)) {
    return {
      kind: "mind",
      document: await parseMindFile(bytes, options)
    };
  }

  if (looksLikeJson(bytes)) {
    const parsed = tryParseJson(await inputToText(input));
    if (looksLikeDiagramPayload(parsed)) {
      try {
        return {
          kind: "diagram",
          document: await parseDiagramFile(input, diagramOptionsFor(options))
        };
      } catch {
        return {
          kind: "mind",
          document: await parseMindFile(input, options),
          warnings: [
            {
              code: "diagram-detection-fallback",
              message: "Input looked like a geometry diagram but was rendered through the mind-map parser after diagram parsing failed.",
              severity: "warning"
            }
          ]
        };
      }
    }

    try {
      return {
        kind: "mind",
        document: await parseMindFile(input, options)
      };
    } catch (mindError) {
      try {
        return {
          kind: "diagram",
          document: await parseDiagramFile(input, diagramOptionsFor(options)),
          warnings: [
            {
              code: "mind-detection-fallback",
              message: "Input was rendered through the diagram parser after mind-map parsing failed.",
              severity: "info"
            }
          ]
        };
      } catch {
        throw mindError;
      }
    }
  }

  throw new UnsupportedFormatError("Unable to detect mind-port format. Pass kind: 'mind' or 'diagram'.");
}

function diagramOptionsFor(options: ParseFileOptions): ParseDiagramOptions {
  return {
    fileName: options.fileName,
    format: options.format === "processon" ? "processon" : "auto"
  };
}

export function renderDocumentToSvg(document: MindPortDocument, options: RenderDocumentOptions = {}): string {
  if (document.kind === "diagram") {
    return renderDiagramToSvg(document.document, options);
  }

  const renderMode = options.compatibilityMode === "preview"
    ? "auto"
    : options.compatibilityMode === "semantic"
      ? "semantic"
      : options.renderMode;

  return renderToSvg(document.document, {
    ...options,
    ...(renderMode ? { renderMode } : {})
  });
}

export async function renderFileToSvg(input: MindFileInput, options: RenderFileOptions = {}): Promise<string> {
  const document = await parseFile(input, options);
  return renderDocumentToSvg(document, options);
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

function looksLikeDiagramPayload(value: unknown): boolean {
  const records = findRecords(value);
  if (!records.length) {
    return false;
  }

  const edgeCount = records.filter(record => isEdgeRecord(record)).length;
  const geometryCount = records.filter(hasGeometry).length;
  return edgeCount > 0 || geometryCount >= 2;
}

function findRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["nodes", "cells", "elements", "mxCell", "items", "shapes", "figures"]) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord);
    }

    const found = findRecords(nested, depth + 1);
    if (found.length) {
      return found;
    }
  }

  for (const key of ["diagram", "content", "data", "definition", "model", "json"]) {
    const nested = value[key];
    if (typeof nested === "string") {
      const parsed = tryParseJson(nested);
      const found = findRecords(parsed, depth + 1);
      if (found.length) {
        return found;
      }
    } else {
      const found = findRecords(nested, depth + 1);
      if (found.length) {
        return found;
      }
    }
  }

  return [];
}

function isEdgeRecord(record: Record<string, unknown>): boolean {
  return record.edge === true ||
    record.edge === "1" ||
    record.type === "edge" ||
    record.type === "connector" ||
    Boolean((record.source || record.sourceId || record.from || record.startId) && (record.target || record.targetId || record.to || record.endId));
}

function hasGeometry(record: Record<string, unknown>): boolean {
  const geometry = isRecord(record.geometry) ? record.geometry : isRecord(record.mxGeometry) ? record.mxGeometry : undefined;
  return hasFiniteNumber(record.x) ||
    hasFiniteNumber(record.y) ||
    hasFiniteNumber(record.width) ||
    hasFiniteNumber(record.height) ||
    hasFiniteNumber(geometry?.x) ||
    hasFiniteNumber(geometry?.y) ||
    hasFiniteNumber(geometry?.width) ||
    hasFiniteNumber(geometry?.height);
}

function hasFiniteNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "string") {
    return Number.isFinite(Number(value.trim()));
  }

  return false;
}
