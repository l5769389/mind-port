import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { ParseMindError } from "../errors";
import type { MindAsset, MindBoundary, MindDocument, MindFileInput, MindNode, MindPosition, MindRelationship, MindSheet, MindStyle, MindSummary } from "../types";
import {
  asArray,
  cloneBytes,
  firstString,
  guessMimeType,
  inputToUint8Array,
  isRecord,
  normalizeAssetRef,
  stableId
} from "../utils";

export async function parseXMind(input: MindFileInput): Promise<MindDocument> {
  const bytes = await inputToUint8Array(input);

  try {
    const zip = await JSZip.loadAsync(bytes);
    const assets = await extractAssets(zip);
    const contentJson = zip.file("content.json");

    if (contentJson) {
      const raw = JSON.parse(await contentJson.async("text"));
      return {
        sourceFormat: "xmind",
        sheets: parseXMindContentJson(raw),
        assets,
        raw
      };
    }

    const contentXml = zip.file("content.xml");

    if (contentXml) {
      const rawXml = await contentXml.async("text");
      return {
        sourceFormat: "xmind",
        sheets: parseLegacyContentXml(rawXml),
        assets,
        raw: rawXml
      };
    }

    throw new ParseMindError("XMind archive does not contain content.json or content.xml.");
  } catch (error) {
    if (error instanceof ParseMindError) {
      throw error;
    }

    throw new ParseMindError("Failed to parse XMind file.", error);
  }
}

function parseXMindContentJson(raw: unknown): MindSheet[] {
  const sheets = asArray(raw);

  return sheets.map((sheetRaw, sheetIndex) => {
    const sheet = isRecord(sheetRaw) ? sheetRaw : {};
    const rootRaw = isRecord(sheet.rootTopic) ? sheet.rootTopic : {};
    const theme = isRecord(sheet.theme) ? sheet.theme : undefined;
    const sheetStyle = parseXMindMapStyle(sheet.style, theme?.map);
    const root = parseXMindTopic(rootRaw, stableId(`sheet-${sheetIndex + 1}-topic`, 0), {
      theme,
      role: "centralTopic",
      depth: 0,
      branchColors: getMapBranchColors(theme)
    });
    const floatingTopics = parseXMindDetachedTopics(rootRaw.children, theme);
    const title = firstString(sheet.title, root.title) ?? `Sheet ${sheetIndex + 1}`;

    return {
      id: firstString(sheet.id) ?? stableId("sheet", sheetIndex),
      title,
      root,
      ...(sheetStyle ? { style: sheetStyle } : {}),
      ...(floatingTopics.length ? { floatingTopics } : {}),
      relationships: parseXMindRelationships(sheet.relationships),
      raw: sheetRaw
    };
  });
}

type XMindTopicRole = "centralTopic" | "mainTopic" | "subTopic" | "floatingTopic";

type XMindTopicContext = {
  theme?: Record<string, unknown>;
  role: XMindTopicRole;
  depth: number;
  branchColor?: string;
  branchColors?: string[];
};

type XMindStyleRole = XMindTopicRole | "boundary" | "summary" | "summaryTopic";

function parseXMindTopic(raw: Record<string, unknown>, fallbackId: string, context: XMindTopicContext): MindNode {
  const id = firstString(raw.id) ?? fallbackId;
  const children = parseXMindChildren(raw.children, context);
  const labels = asArray(raw.labels).map(String).filter(Boolean);
  const markers = asArray(raw.markers).map(marker => {
    if (isRecord(marker)) {
      return firstString(marker.markerId, marker.id) ?? JSON.stringify(marker);
    }

    return String(marker);
  }).filter(Boolean);
  const notes = parseXMindNotes(raw.notes);
  const image = parseXMindImage(raw.image);
  const summaries = parseXMindSummaries(raw, context.theme);
  const boundaries = parseXMindBoundaries(raw.boundaries, context.theme);
  const style = parseXMindStyle(raw.style, getThemeStyle(context.theme, context.role), context.role, context.branchColor);
  const position = parseXMindPosition(raw.position);
  const extensionInfo = parseXMindExtensions(raw.extensions);
  const title = firstString(raw.title, raw.text, raw.label, extensionInfo.mathText) ?? (image ? "" : "Untitled");

  return {
    id,
    title,
    children,
    ...(notes ? { notes } : {}),
    ...(labels.length ? { labels } : {}),
    ...([...markers, ...extensionInfo.markers].length ? { markers: [...markers, ...extensionInfo.markers] } : {}),
    ...(summaries.length ? { summaries } : {}),
    ...(boundaries.length ? { boundaries } : {}),
    ...(image ? { image } : {}),
    ...(style ? { style } : {}),
    ...(position ? { position } : {}),
    ...(typeof raw.folded === "boolean" ? { collapsed: raw.folded } : {}),
    raw
  };
}

function parseXMindChildren(rawChildren: unknown, context: XMindTopicContext): MindNode[] {
  if (!isRecord(rawChildren)) {
    return [];
  }

  const attached = asArray(rawChildren.attached);
  const nextRole: XMindTopicRole = context.role === "centralTopic" && context.depth === 0 ? "mainTopic" : "subTopic";

  return attached
    .filter(isRecord)
    .map((child, index) => {
      const nextBranchColor = context.role === "centralTopic" && context.depth === 0
        ? context.branchColors?.[index % (context.branchColors.length || 1)]
        : context.branchColor;

      return parseXMindTopic(child, stableId("xmind-topic", index), {
        theme: context.theme,
        role: nextRole,
        depth: context.depth + 1,
        branchColor: nextBranchColor,
        branchColors: context.branchColors
      });
    });
}

function parseXMindDetachedTopics(rawChildren: unknown, theme?: Record<string, unknown>): MindNode[] {
  if (!isRecord(rawChildren)) {
    return [];
  }

  return asArray(rawChildren.detached)
    .filter(isRecord)
    .map((topic, index) => parseXMindTopic(topic, stableId("xmind-floating-topic", index), {
      theme,
      role: "floatingTopic",
      depth: 0
    }));
}

function parseXMindNotes(rawNotes: unknown): string | undefined {
  if (typeof rawNotes === "string") {
    return rawNotes.trim() || undefined;
  }

  if (!isRecord(rawNotes)) {
    return undefined;
  }

  const plain = isRecord(rawNotes.plain) ? rawNotes.plain : undefined;
  const html = isRecord(rawNotes.html) ? rawNotes.html : undefined;

  return firstString(plain?.content, html?.content, rawNotes.content);
}

function parseXMindImage(rawImage: unknown): string | undefined {
  if (typeof rawImage === "string") {
    return normalizeAssetRef(rawImage);
  }

  if (!isRecord(rawImage)) {
    return undefined;
  }

  return normalizeAssetRef(rawImage.src ?? rawImage.source ?? rawImage.path);
}

function parseXMindSummaries(rawTopic: Record<string, unknown>, theme?: Record<string, unknown>): MindSummary[] {
  const rawChildren = rawTopic.children;
  if (!isRecord(rawChildren)) {
    return [];
  }

  const summaryRanges = asArray(rawTopic.summaries).filter(isRecord);
  const rangeByTopicId = new Map<string, Record<string, unknown>>();

  for (const summaryRange of summaryRanges) {
    const topicId = firstString(summaryRange.topicId, summaryRange.summaryTopicId);
    if (topicId) {
      rangeByTopicId.set(topicId, summaryRange);
    }
  }

  return asArray(rawChildren.summary)
    .filter(isRecord)
    .map((summary, index) => {
      const id = firstString(summary.id) ?? stableId("summary", index);
      const summaryRange = rangeByTopicId.get(id) ?? summaryRanges[index];
      const style = parseXMindStyle(summary.style, getThemeStyle(theme, "summaryTopic"), "subTopic");
      const lineStyle = parseXMindLineStyle(isRecord(summaryRange?.style) ? summaryRange?.style : undefined, getThemeStyle(theme, "summary"));
      const range = parseXMindRange(summaryRange?.range);

      return {
        id,
        title: firstString(summary.title, summary.text, summary.label) ?? "",
        ...(range ? { range } : {}),
        ...(style ? { style } : {}),
        ...(lineStyle ? { lineStyle } : {}),
        ...(parseXMindPosition(summary.position) ? { position: parseXMindPosition(summary.position) } : {}),
        raw: {
          topic: summary,
          summary: summaryRange
        }
      };
    })
    .filter(summary => summary.title);
}

function parseXMindBoundaries(rawBoundaries: unknown, theme?: Record<string, unknown>): MindBoundary[] {
  const fallbackStyle = getThemeStyle(theme, "boundary");

  return asArray(rawBoundaries)
    .filter(isRecord)
    .map((boundary, index) => {
      const style = parseXMindBoundaryStyle(boundary.style, fallbackStyle);
      const range = parseXMindRange(boundary.range);

      return {
        id: firstString(boundary.id) ?? stableId("boundary", index),
        ...(firstString(boundary.title, boundary.text, boundary.label) ? { title: firstString(boundary.title, boundary.text, boundary.label) } : {}),
        ...(range ? { range } : {}),
        ...(style ? { style } : {}),
        raw: boundary
      };
    });
}

function parseXMindRange(rawRange: unknown): MindBoundary["range"] | undefined {
  if (typeof rawRange !== "string") {
    return undefined;
  }

  const match = rawRange.trim().match(/^\((\d+)\s*,\s*(\d+)\)$/);
  if (!match) {
    return undefined;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
    return undefined;
  }

  return { start, end };
}

function parseXMindExtensions(rawExtensions: unknown): { markers: string[]; mathText?: string } {
  const markers: string[] = [];
  let mathText: string | undefined;

  for (const extension of asArray(rawExtensions).filter(isRecord)) {
    const provider = firstString(extension.provider);
    const content = isRecord(extension.content) ? extension.content : {};

    if (provider === "org.xmind.ui.task") {
      markers.push(`task-${firstString(content.status) ?? "todo"}`);
    }

    if (provider === "org.xmind.ui.mathJax") {
      mathText = firstString(content.content);
    }
  }

  return { markers, ...(mathText ? { mathText } : {}) };
}

function parseXMindRelationships(rawRelationships: unknown): MindRelationship[] {
  return asArray(rawRelationships)
    .filter(isRecord)
    .map((relationship, index) => ({
      id: firstString(relationship.id) ?? stableId("relationship", index),
      from: firstString(relationship.end1Id, relationship.from, relationship.source) ?? "",
      to: firstString(relationship.end2Id, relationship.to, relationship.target) ?? "",
      ...(firstString(relationship.title) ? { title: firstString(relationship.title) } : {}),
      raw: relationship
    }))
    .filter(relationship => relationship.from && relationship.to);
}

function parseXMindPosition(rawPosition: unknown): MindPosition | undefined {
  if (!isRecord(rawPosition)) {
    return undefined;
  }

  const x = Number(rawPosition.x);
  const y = Number(rawPosition.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return { x, y };
}

function getThemeStyle(theme: Record<string, unknown> | undefined, role: XMindStyleRole): unknown {
  const themeStyle = theme?.[role];
  return isRecord(themeStyle) ? themeStyle : undefined;
}

function parseXMindStyle(rawStyle: unknown, fallbackStyle: unknown, role: XMindTopicRole, branchColor?: string): MindStyle | undefined {
  const fallbackProperties = isRecord(fallbackStyle) && isRecord(fallbackStyle.properties) ? fallbackStyle.properties : {};
  const rawProperties = isRecord(rawStyle) && isRecord(rawStyle.properties) ? rawStyle.properties : {};
  const properties = {
    ...fallbackProperties,
    ...rawProperties
  };
  const rawHasFill = getStyleString(rawProperties["svg:fill"]) !== undefined;
  const rawHasColor = getStyleString(rawProperties["fo:color"]) !== undefined;
  const fillPattern = firstString(properties["fill-pattern"]);
  const rawNoFill = firstString(rawProperties["fill-pattern"]) === "none";

  if (rawHasFill && !rawHasColor) {
    delete properties["fo:color"];
  }

  if (rawNoFill) {
    delete properties["svg:fill"];
  }

  if (!Object.keys(properties).length) {
    return isRecord(rawStyle) ? { raw: rawStyle } : undefined;
  }

  const style: MindStyle = {
    raw: isRecord(rawStyle) ? rawStyle : fallbackStyle
  };
  const fill = getStyleString(properties["svg:fill"]);
  const color = getStyleString(properties["fo:color"]);
  const stroke = getStyleString(properties["border-line-color"], properties["line-color"]) ?? branchColor;
  const fontFamily = getStyleString(properties["fo:font-family"]);
  const fontWeight = getStyleString(properties["fo:font-weight"]);
  const shape = getStyleString(properties["shape-class"]);
  const fontSize = parseCssSize(properties["fo:font-size"]);
  const strokeWidth = parseCssSize(properties["border-line-width"]);
  const hasHandDrawnFill = fillPattern === "solid-hand-drawn";
  const shouldRenderAsBranchLine = role === "subTopic" && !fill && !stroke && !shape && !hasHandDrawnFill;

  if (fill) {
    style.fill = fill;
  } else if (hasHandDrawnFill) {
    style.fill = "#D9D9D9CC";
  }

  if (color) {
    style.color = color;
  }

  if (stroke) {
    style.stroke = stroke;
  }

  if (fontWeight) {
    style.fontWeight = fontWeight;
  }

  if (fontFamily) {
    style.fontFamily = fontFamily;
  }

  if (shape) {
    style.shape = shape;
  } else if (shouldRenderAsBranchLine) {
    style.shape = "xmind.branchLine";
  }

  if (fontSize !== undefined) {
    style.fontSize = fontSize;
  }

  if (strokeWidth !== undefined) {
    style.strokeWidth = strokeWidth;
  }

  return style;
}

function parseXMindBoundaryStyle(rawStyle: unknown, fallbackStyle: unknown): MindStyle | undefined {
  const style = parseXMindStyle(rawStyle, fallbackStyle, "subTopic");
  const rawProperties = isRecord(rawStyle) && isRecord(rawStyle.properties) ? rawStyle.properties : {};
  const fallbackProperties = isRecord(fallbackStyle) && isRecord(fallbackStyle.properties) ? fallbackStyle.properties : {};
  const fillPattern = firstString(rawProperties["fill-pattern"], fallbackProperties["fill-pattern"]);

  if (fillPattern === "hachure" || fillPattern === "solid-hand-drawn") {
    return {
      ...style,
      fill: "#D2D2D2CC",
      strokeWidth: 0,
      raw: isRecord(rawStyle) ? rawStyle : fallbackStyle
    };
  }

  return style;
}

function parseXMindLineStyle(rawStyle: unknown, fallbackStyle: unknown): MindStyle | undefined {
  const fallbackProperties = isRecord(fallbackStyle) && isRecord(fallbackStyle.properties) ? fallbackStyle.properties : {};
  const rawProperties = isRecord(rawStyle) && isRecord(rawStyle.properties) ? rawStyle.properties : {};
  const properties = {
    ...fallbackProperties,
    ...rawProperties
  };
  const stroke = getStyleString(properties["line-color"], properties["border-line-color"]);
  const strokeWidth = parseCssSize(properties["line-width"], properties["border-line-width"]);

  if (!stroke && strokeWidth === undefined && !Object.keys(properties).length) {
    return undefined;
  }

  return {
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    raw: isRecord(rawStyle) ? rawStyle : fallbackStyle
  };
}

function parseXMindMapStyle(rawStyle: unknown, fallbackStyle: unknown): MindStyle | undefined {
  const fallbackProperties = isRecord(fallbackStyle) && isRecord(fallbackStyle.properties) ? fallbackStyle.properties : {};
  const rawProperties = isRecord(rawStyle) && isRecord(rawStyle.properties) ? rawStyle.properties : {};
  const properties = {
    ...fallbackProperties,
    ...rawProperties
  };
  const fill = getStyleString(properties["svg:fill"]);

  return fill ? { fill, raw: isRecord(rawStyle) ? rawStyle : fallbackStyle } : undefined;
}

function getMapBranchColors(theme: Record<string, unknown> | undefined): string[] {
  const map = isRecord(theme?.map) ? theme.map : undefined;
  const properties = isRecord(map?.properties) ? map.properties : {};
  const raw = firstString(properties["multi-line-colors"]);

  return raw ? raw.split(/\s+/).map(color => color.trim()).filter(Boolean) : [];
}

function getStyleString(...values: unknown[]): string | undefined {
  const value = firstString(...values);

  if (!value || value === "inherited" || value === "none") {
    return undefined;
  }

  return value;
}

function parseCssSize(...values: unknown[]): number | undefined {
  const value = values.find(candidate => typeof candidate === "number" || typeof candidate === "string");
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const match = value.trim().match(/^([0-9.]+)\s*(pt|px)?$/);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return match[2] === "pt" ? amount * 1.333 : amount;
}

function parseLegacyContentXml(rawXml: string): MindSheet[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true
  });
  const raw = parser.parse(rawXml) as unknown;
  const root = isRecord(raw) ? raw["xmap-content"] ?? raw["xmap-content-2.0"] ?? raw : raw;
  const sheetValues = isRecord(root) ? asArray(root.sheet).filter(isRecord) : [];

  return sheetValues.map((sheet, sheetIndex) => {
    const topicRaw = isRecord(sheet.topic) ? sheet.topic : {};
    const rootNode = parseLegacyTopic(topicRaw, stableId(`legacy-sheet-${sheetIndex + 1}-topic`, 0));

    return {
      id: firstString(sheet["@_id"]) ?? stableId("sheet", sheetIndex),
      title: firstString(sheet.title, rootNode.title) ?? `Sheet ${sheetIndex + 1}`,
      root: rootNode,
      raw: sheet
    };
  });
}

function parseLegacyTopic(raw: Record<string, unknown>, fallbackId: string): MindNode {
  const id = firstString(raw["@_id"], raw.id) ?? fallbackId;
  const children = parseLegacyChildren(raw.children);

  return {
    id,
    title: firstString(raw.title, raw["@_title"]) ?? "Untitled",
    children,
    raw
  };
}

function parseLegacyChildren(rawChildren: unknown): MindNode[] {
  if (!isRecord(rawChildren)) {
    return [];
  }

  const topicsContainers = asArray(rawChildren.topics).filter(isRecord);
  const topicValues = topicsContainers.flatMap(container => asArray(container.topic).filter(isRecord));

  return topicValues.map((topic, index) => parseLegacyTopic(topic, stableId("legacy-topic", index)));
}

async function extractAssets(zip: JSZip): Promise<Record<string, MindAsset>> {
  const entries = Object.values(zip.files).filter(file => !file.dir);
  const assets: Record<string, MindAsset> = {};

  for (const file of entries) {
    if (isMetadataFile(file.name)) {
      continue;
    }

    const data = await file.async("uint8array");
    assets[file.name] = {
      id: file.name,
      name: file.name.split(/[\\/]/).pop() ?? file.name,
      mimeType: guessMimeType(file.name),
      data: cloneBytes(data)
    };
  }

  return assets;
}

function isMetadataFile(name: string): boolean {
  const lower = name.toLowerCase();

  return lower === "content.json" ||
    lower === "content.xml" ||
    lower === "metadata.json" ||
    lower === "manifest.json" ||
    lower.endsWith(".json") ||
    lower.endsWith(".xml");
}
