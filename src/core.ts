import { UnsupportedFormatError } from "./errors";
import { parseDiagramFile } from "./parsers/diagram";
import { parseMindFile } from "./parser";
import { renderDiagramToSvg } from "./renderer/diagram-svg";
import { resolveStructureStyle } from "./renderer/layout";
import { renderToSvg } from "./renderer/svg";
import type {
  DiagramShape,
  MindFileInput,
  MindNode,
  MindPortDocument,
  MindPortInspection,
  MindPortRenderOptions,
  MindPortRenderResult,
  MindPortWarning,
  ParseDiagramOptions,
  ParseFileOptions,
  RenderDocumentOptions,
  RenderFileOptions,
  RenderHtmlOptions
} from "./types";
import { inputToText, inputToUint8Array, isRecord, isZipBytes, tryParseJson } from "./utils";

export const parse = parseFile;

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

export function renderSvg(document: MindPortDocument, options: RenderDocumentOptions = {}): string {
  return renderDocumentToSvg(document, withMindPortDefaults(options));
}

export async function renderFileToSvg(input: MindFileInput, options: RenderFileOptions = {}): Promise<string> {
  const document = await parseFile(input, options);
  return renderDocumentToSvg(document, options);
}

export async function inspect(input: MindFileInput, options: ParseFileOptions = {}): Promise<MindPortInspection> {
  const document = await parseFile(input, options);
  return inspectDocument(document, options.fileName);
}

export function inspectDocument(document: MindPortDocument, fileName?: string): MindPortInspection {
  const warnings = collectWarnings(document);
  const assets = document.document.assets ? Object.keys(document.document.assets).length : 0;

  if (document.kind === "diagram") {
    const pages = document.document.pages;
    const firstPage = pages[0];
    return {
      ...(fileName ? { fileName } : {}),
      kind: "diagram",
      sourceFormat: document.document.sourceFormat,
      ...(firstPage?.title ? { title: firstPage.title } : {}),
      sheets: 0,
      pages: pages.length,
      nodes: 0,
      floatingTopics: 0,
      relationships: 0,
      shapes: pages.reduce((sum, page) => sum + page.shapes.length, 0),
      connectors: pages.reduce((sum, page) => sum + page.connectors.length, 0),
      assets,
      warnings
    };
  }

  const sheets = document.document.sheets;
  const firstSheet = sheets[0];
  return {
    ...(fileName ? { fileName } : {}),
    kind: "mind",
    sourceFormat: document.document.sourceFormat,
    ...(firstSheet?.title ? { title: firstSheet.title } : {}),
    ...(firstSheet ? { structureStyle: resolveStructureStyle(firstSheet.root) } : {}),
    sheets: sheets.length,
    pages: 0,
    nodes: sheets.reduce((sum, sheet) => sum + countMindNodes(sheet.root) + (sheet.floatingTopics ?? []).reduce((floatingSum, node) => floatingSum + countMindNodes(node), 0), 0),
    floatingTopics: sheets.reduce((sum, sheet) => sum + (sheet.floatingTopics?.length ?? 0), 0),
    relationships: sheets.reduce((sum, sheet) => sum + (sheet.relationships?.length ?? 0), 0),
    shapes: 0,
    connectors: 0,
    assets,
    warnings
  };
}

export function renderHtml(document: MindPortDocument, options: RenderHtmlOptions = {}): string {
  const {
    title,
    lang = "en",
    className = "mind-port-document",
    includeMetadataPanel = true,
    minHeight = "100vh",
    ...renderOptions
  } = options;
  const inspection = inspectDocument(document);
  const resolvedTitle = title ?? inspection.title ?? "MindPort preview";
  const minHeightValue = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  const rootClassName = ["mind-port-document", className === "mind-port-document" ? "" : className].filter(Boolean).join(" ");
  const svg = renderSvg(document, renderOptions);
  const metadata = includeMetadataPanel ? renderMetadataPanel(inspection) : "";

  return `<!doctype html>
<html lang="${escapeAttr(lang)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeText(resolvedTitle)} - MindPort</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: ${escapeAttr(minHeightValue)}; background: #eef2f6; color: #172033; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .mind-port-document { min-height: ${escapeAttr(minHeightValue)}; display: grid; grid-template-rows: auto 1fr; }
      .mind-port-html-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 18px; border-bottom: 1px solid #d4dce7; background: rgba(255,255,255,.94); backdrop-filter: blur(8px); }
      .mind-port-html-title { margin: 0; font-size: 15px; font-weight: 700; }
      .mind-port-html-meta { display: flex; flex-wrap: wrap; gap: 8px; color: #526173; font-size: 12px; }
      .mind-port-html-meta span { padding: 4px 8px; border: 1px solid #d7dee9; border-radius: 999px; background: #fff; }
      .mind-port-html-canvas { overflow: auto; padding: 18px; }
      .mind-port-html-canvas svg { display: block; max-width: none; }
    </style>
  </head>
  <body>
    <main class="${escapeAttr(rootClassName)}">
      <header class="mind-port-html-header">
        <h1 class="mind-port-html-title">${escapeText(resolvedTitle)}</h1>
        ${metadata}
      </header>
      <section class="mind-port-html-canvas">${svg}</section>
    </main>
  </body>
</html>`;
}

export async function renderFileToHtml(input: MindFileInput, options: RenderFileOptions & RenderHtmlOptions = {}): Promise<string> {
  const document = await parseFile(input, options);
  return renderHtml(document, options);
}

export async function render(input: MindFileInput, options: MindPortRenderOptions = {}): Promise<MindPortRenderResult> {
  const document = await parse(input, options);
  const inspection = inspectDocument(document, options.fileName);
  const { output = "svg", html, ...renderOptions } = options;
  const content = output === "html"
    ? renderHtml(document, { ...renderOptions, ...html })
    : renderSvg(document, renderOptions);

  return {
    document,
    inspection,
    output,
    content,
    warnings: inspection.warnings
  };
}

function withMindPortDefaults<T extends RenderDocumentOptions>(options: T): T {
  return {
    theme: "mindport",
    ...options
  };
}

function collectWarnings(document: MindPortDocument): MindPortWarning[] {
  const warnings = [...(document.warnings ?? [])];

  if (document.kind === "mind") {
    if (!document.document.sheets.length) {
      warnings.push({ code: "empty-mind-document", message: "Mind document has no sheets.", severity: "warning" });
    }

    const assetNames = new Set(Object.keys(document.document.assets ?? {}));
    for (const sheet of document.document.sheets) {
      if (!sheet.root) {
        warnings.push({ code: "empty-mind-sheet", message: `Mind sheet '${sheet.title}' has no root topic.`, severity: "warning" });
      }

      for (const node of [sheet.root, ...(sheet.floatingTopics ?? [])]) {
        collectMissingImages(node, assetNames, warnings);
      }
    }
  } else {
    if (!document.document.pages.length) {
      warnings.push({ code: "empty-diagram-document", message: "Diagram document has no pages.", severity: "warning" });
    }

    for (const page of document.document.pages) {
      if (!page.shapes.length && !page.connectors.length) {
        warnings.push({ code: "empty-diagram-page", message: `Diagram page '${page.title}' has no shapes or connectors.`, severity: "warning" });
      }

      for (const shape of page.shapes) {
        collectShapeWarnings(shape, warnings);
      }
    }
  }

  return warnings;
}

function collectMissingImages(node: MindNode, assets: Set<string>, warnings: MindPortWarning[]): void {
  if (node.image && !isExternalImage(node.image) && !assets.has(node.image)) {
    warnings.push({
      code: "missing-image-resource",
      message: `Image resource '${node.image}' referenced by topic '${node.title}' was not found in document assets.`,
      path: node.id,
      severity: "warning"
    });
  }

  for (const child of node.children) {
    collectMissingImages(child, assets, warnings);
  }
}

function collectShapeWarnings(shape: DiagramShape, warnings: MindPortWarning[]): void {
  if (shape.kind === "unknown") {
    warnings.push({
      code: "unknown-diagram-shape",
      message: `Unknown diagram shape '${shape.title || shape.id}' was rendered with a fallback geometry.`,
      path: shape.id,
      severity: "info"
    });
  }

  if (shape.image && !isExternalImage(shape.image)) {
    warnings.push({
      code: "external-image-required",
      message: `Diagram image '${shape.image}' is not an inline data URI or HTTP(S) URL and may not render in SVG output.`,
      path: shape.id,
      severity: "warning"
    });
  }
}

function isExternalImage(value: string): boolean {
  return value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://");
}

function countMindNodes(node: MindNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countMindNodes(child), 0);
}

function renderMetadataPanel(inspection: MindPortInspection): string {
  const stats = inspection.kind === "mind"
    ? [
        `${inspection.sheets} sheets`,
        `${inspection.nodes} topics`,
        `${inspection.relationships} relationships`
      ]
    : [
        `${inspection.pages} pages`,
        `${inspection.shapes} shapes`,
        `${inspection.connectors} connectors`
      ];
  const warnings = inspection.warnings.length ? [`${inspection.warnings.length} warnings`] : [];

  return `<div class="mind-port-html-meta">${[inspection.kind, inspection.sourceFormat, `${inspection.assets} assets`, ...stats, ...warnings].map(item => `<span>${escapeText(item)}</span>`).join("")}</div>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
