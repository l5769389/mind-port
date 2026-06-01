import { ParseMindError, UnsupportedFormatError } from "../errors";
import type {
  DiagramConnector,
  DiagramDocument,
  DiagramPage,
  DiagramShape,
  DiagramShapeKind,
  DiagramStyle,
  MindFileInput,
  ParseDiagramOptions
} from "../types";
import { firstString, isRecord, parseJsonLikeInput, stableId, stripHtml, tryParseJson } from "../utils";

type ParsedDiagramStyle = {
  style?: DiagramStyle;
  properties: Record<string, unknown>;
};

export async function parseDiagramFile(input: MindFileInput, options: ParseDiagramOptions = {}): Promise<DiagramDocument> {
  const format = options.format ?? "auto";
  const lowerName = options.fileName?.toLowerCase() ?? "";

  if (format !== "auto" && format !== "processon") {
    throw new UnsupportedFormatError("Unable to detect diagram format. Pass format: 'processon'.");
  }

  if (format === "auto" && lowerName && !lowerName.endsWith(".pos") && !lowerName.endsWith(".json")) {
    throw new UnsupportedFormatError("Unable to detect diagram format. Pass format: 'processon'.");
  }

  return parseProcessOnDiagram(input);
}

export async function parseProcessOnDiagram(input: MindFileInput): Promise<DiagramDocument> {
  try {
    const raw = await parseJsonLikeInput(input);

    if (!raw) {
      throw new ParseMindError("ProcessOn diagram input is not valid JSON.");
    }

    const normalized = unwrapProcessOnPayload(raw);
    const pages = parseDiagramPages(normalized);

    if (!pages.length) {
      throw new ParseMindError("No diagram shapes or connectors found in ProcessOn JSON.");
    }

    return {
      sourceFormat: "processon",
      pages,
      raw
    };
  } catch (error) {
    if (error instanceof ParseMindError || error instanceof UnsupportedFormatError) {
      throw error;
    }

    throw new ParseMindError("Failed to parse ProcessOn diagram file.", error);
  }
}

function parseDiagramPages(raw: unknown): DiagramPage[] {
  if (Array.isArray(raw)) {
    const page = parseDiagramPage(raw, 0, "ProcessOn Diagram", raw);
    return page ? [page] : [];
  }

  if (!isRecord(raw)) {
    return [];
  }

  const explicitPages = firstArray(raw.sheets, raw.pages, raw.diagrams, raw.canvases);
  if (explicitPages) {
    return explicitPages.flatMap((pageRaw, index) => {
      const payload = unwrapProcessOnPayload(pageRaw);
      const records = findDiagramRecords(payload);
      if (!records) {
        return [];
      }

      const pageRecord = isRecord(payload) ? payload : {};
      const title = firstString(pageRecord.title, pageRecord.name, pageRecord.pageName) ?? `Page ${index + 1}`;
      const page = parseDiagramPage(records, index, title, payload);
      return page ? [page] : [];
    });
  }

  const records = findDiagramRecords(raw);
  const title = firstString(raw.title, raw.name, raw.pageName) ?? "ProcessOn Diagram";
  const page = records ? parseDiagramPage(records, 0, title, raw) : undefined;
  return page ? [page] : [];
}

function parseDiagramPage(records: unknown[], index: number, title: string, raw: unknown): DiagramPage | undefined {
  const sourceRecords = records.filter(isRecord);
  const shapes = sourceRecords
    .filter(record => !isConnectorRecord(record))
    .map((record, shapeIndex) => parseShape(record, shapeIndex))
    .filter((shape): shape is DiagramShape => Boolean(shape));
  const connectors = sourceRecords
    .filter(isConnectorRecord)
    .map((record, connectorIndex) => parseConnector(record, connectorIndex, shapes))
    .filter((connector): connector is DiagramConnector => Boolean(connector));

  if (!shapes.length && !connectors.length) {
    return undefined;
  }

  const rawPage = isRecord(raw) ? raw : {};
  const pageSize = parsePageSize(rawPage, shapes);

  return {
    id: firstString(rawPage.id, rawPage.uuid, rawPage.key) ?? stableId("diagram-page", index),
    title,
    ...(pageSize.width !== undefined ? { width: pageSize.width } : {}),
    ...(pageSize.height !== undefined ? { height: pageSize.height } : {}),
    ...(firstString(rawPage.background, rawPage.backgroundColor, rawPage.bgColor) ? { background: firstString(rawPage.background, rawPage.backgroundColor, rawPage.bgColor) } : {}),
    shapes,
    connectors,
    raw
  };
}

function parseShape(raw: Record<string, unknown>, index: number): DiagramShape | undefined {
  const geometry = parseGeometry(raw);
  const title = getTitle(raw);
  const image = firstString(raw.image, raw.imageUrl, raw.img, getRecord(raw.data)?.image, getRecord(raw.data)?.imageUrl);

  if (!geometry && !title && !image) {
    return undefined;
  }

  const fallbackWidth = image ? 160 : title ? Math.max(96, title.length * 9 + 30) : 120;
  const fallbackHeight = image ? 100 : title ? 48 : 60;
  const parsedStyle = parseDiagramStyle(raw);
  const x = geometry?.x ?? parseNumber(raw.left, getRecord(raw.position)?.x) ?? 0;
  const y = geometry?.y ?? parseNumber(raw.top, getRecord(raw.position)?.y) ?? 0;
  const width = geometry?.width ?? fallbackWidth;
  const height = geometry?.height ?? fallbackHeight;

  return {
    id: getId(raw, "diagram-shape", index),
    title: title ?? "",
    kind: inferShapeKind(raw, parsedStyle.properties),
    x,
    y,
    width,
    height,
    ...(firstString(raw.parentId, raw.parent, raw.pid, raw.group) ? { parentId: firstString(raw.parentId, raw.parent, raw.pid, raw.group) } : {}),
    ...(image ? { image } : {}),
    ...(parsedStyle.style ? { style: parsedStyle.style } : {}),
    raw
  };
}

function parseConnector(raw: Record<string, unknown>, index: number, shapes: DiagramShape[]): DiagramConnector | undefined {
  const from = firstString(raw.from, raw.source, raw.sourceId, raw.start, raw.startId);
  const to = firstString(raw.to, raw.target, raw.targetId, raw.end, raw.endId);
  const points = parseConnectorPoints(raw);
  const resolvedPoints = points.length ? points : inferConnectorPoints(from, to, shapes);
  const parsedStyle = parseDiagramStyle(raw);

  if (!from && !to && resolvedPoints.length < 2) {
    return undefined;
  }

  return {
    id: getId(raw, "diagram-connector", index),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(getTitle(raw) ? { title: getTitle(raw) } : {}),
    points: resolvedPoints,
    ...(parsedStyle.style ? { style: parsedStyle.style } : {}),
    raw
  };
}

function parseConnectorPoints(raw: Record<string, unknown>): Array<{ x: number; y: number }> {
  const rawPoints = firstArray(raw.points, raw.waypoints, raw.controlPoints, raw.path);
  if (!rawPoints) {
    const start = parsePoint(raw.startPoint ?? raw.sourcePoint);
    const end = parsePoint(raw.endPoint ?? raw.targetPoint);
    return start && end ? [start, end] : [];
  }

  return rawPoints.map(parsePoint).filter((point): point is { x: number; y: number } => Boolean(point));
}

function inferConnectorPoints(from: string | undefined, to: string | undefined, shapes: DiagramShape[]): Array<{ x: number; y: number }> {
  const start = from ? shapes.find(shape => shape.id === from) : undefined;
  const end = to ? shapes.find(shape => shape.id === to) : undefined;

  if (!start || !end) {
    return [];
  }

  return [
    edgePoint(start, end),
    edgePoint(end, start)
  ];
}

function edgePoint(from: DiagramShape, to: DiagramShape): { x: number; y: number } {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: fromCenter.x + Math.sign(dx || 1) * from.width / 2,
      y: fromCenter.y
    };
  }

  return {
    x: fromCenter.x,
    y: fromCenter.y + Math.sign(dy || 1) * from.height / 2
  };
}

function parseGeometry(raw: Record<string, unknown>): { x: number; y: number; width: number; height: number } | undefined {
  const geometry = getRecord(raw.geometry) ?? getRecord(raw.mxGeometry) ?? getRecord(raw.bounds) ?? getRecord(raw.rect) ?? getRecord(raw.size);
  const x = parseNumber(raw.x, raw.left, geometry?.x, geometry?.left);
  const y = parseNumber(raw.y, raw.top, geometry?.y, geometry?.top);
  const width = parseNumber(raw.width, raw.w, geometry?.width, geometry?.w);
  const height = parseNumber(raw.height, raw.h, geometry?.height, geometry?.h);

  if (x === undefined && y === undefined && width === undefined && height === undefined) {
    return undefined;
  }

  return {
    x: x ?? 0,
    y: y ?? 0,
    width: width !== undefined && width > 0 ? width : 120,
    height: height !== undefined && height > 0 ? height : 60
  };
}

function parsePoint(raw: unknown): { x: number; y: number } | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const x = parseNumber(raw.x, raw.left);
  const y = parseNumber(raw.y, raw.top);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

function parsePageSize(raw: Record<string, unknown>, shapes: DiagramShape[]): { width?: number; height?: number } {
  const width = parseNumber(raw.width, raw.pageWidth, getRecord(raw.page)?.width);
  const height = parseNumber(raw.height, raw.pageHeight, getRecord(raw.page)?.height);

  if (width !== undefined || height !== undefined) {
    return {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {})
    };
  }

  if (!shapes.length) {
    return {};
  }

  return {
    width: Math.max(...shapes.map(shape => shape.x + shape.width)),
    height: Math.max(...shapes.map(shape => shape.y + shape.height))
  };
}

function parseDiagramStyle(raw: Record<string, unknown>): ParsedDiagramStyle {
  const styleSource = raw.style ?? raw.styles ?? raw.attrs ?? getRecord(raw.data)?.style;
  const properties = {
    ...parseStyleString(typeof styleSource === "string" ? styleSource : undefined),
    ...(isRecord(styleSource) ? styleSource : {}),
    ...parseStyleString(firstString(raw.styleText, raw.styleString))
  };

  if (!Object.keys(properties).length) {
    return { properties };
  }

  const fill = getStyleString(properties.fill, properties.fillColor, properties.background, properties.backgroundColor, properties.bgColor);
  const stroke = getStyleString(properties.stroke, properties.strokeColor, properties.borderColor, properties.lineColor);
  const color = getStyleString(properties.color, properties.fontColor, properties.textColor);
  const fontFamily = getStyleString(properties.fontFamily, properties.font);
  const fontSize = parseNumber(properties.fontSize, properties["font-size"]);
  const strokeWidth = parseNumber(properties.strokeWidth, properties.lineWidth, properties.borderWidth, properties["stroke-width"]);
  const dashed = properties.dashed === true ||
    properties.dashed === "1" ||
    properties.dash === true ||
    properties.linePattern === "dashed" ||
    String(properties.strokeDasharray ?? "").length > 0;
  const opacity = parseOpacity(properties.opacity);
  const style: DiagramStyle = {
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke } : {}),
    ...(strokeWidth !== undefined ? { strokeWidth } : {}),
    ...(color ? { color } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSize !== undefined ? { fontSize } : {}),
    ...(firstString(properties.fontWeight, properties["font-weight"]) ? { fontWeight: firstString(properties.fontWeight, properties["font-weight"]) } : {}),
    ...(dashed ? { dashed } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(firstString(properties.startArrow, properties.arrowStart, properties.startFill) ? { arrowStart: firstString(properties.startArrow, properties.arrowStart, properties.startFill) } : {}),
    ...(firstString(properties.endArrow, properties.arrowEnd, properties.endFill) ? { arrowEnd: firstString(properties.endArrow, properties.arrowEnd, properties.endFill) } : {}),
    raw: styleSource ?? raw
  };

  return { style, properties };
}

function parseStyleString(style: string | undefined): Record<string, unknown> {
  if (!style) {
    return {};
  }

  const output: Record<string, unknown> = {};
  for (const part of style.split(";")) {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim();
    const value = rawValue.join("=").trim();
    if (key && value) {
      output[key] = value;
    }
  }

  return output;
}

function inferShapeKind(raw: Record<string, unknown>, styleProperties: Record<string, unknown>): DiagramShapeKind {
  const rawKind = firstString(raw.shape, raw.shapeType, raw.type, raw.category, raw.name, styleProperties.shape, styleProperties.shapeType);
  const normalized = (rawKind ?? "").toLowerCase();

  if (firstString(raw.image, raw.imageUrl, raw.img)) {
    return "image";
  }

  if (normalized.includes("swimlane")) {
    return "swimlane";
  }

  if (normalized.includes("container") || normalized.includes("group")) {
    return "container";
  }

  if (normalized.includes("ellipse") || normalized.includes("circle")) {
    return "ellipse";
  }

  if (normalized.includes("diamond") || normalized.includes("rhombus")) {
    return "diamond";
  }

  if (normalized.includes("parallelogram")) {
    return "parallelogram";
  }

  if (normalized.includes("hexagon")) {
    return "hexagon";
  }

  if (normalized.includes("text")) {
    return "text";
  }

  if (normalized.includes("round") || styleProperties.rounded === "1" || styleProperties.rounded === true) {
    return "roundRectangle";
  }

  if (normalized.includes("rect") || rawKind === undefined) {
    return "rectangle";
  }

  return "unknown";
}

function unwrapProcessOnPayload(raw: unknown): unknown {
  let current = raw;

  for (let depth = 0; depth < 6; depth += 1) {
    if (!isRecord(current)) {
      return current;
    }

    const nested = firstNestedPayload(current);
    if (!nested || nested === current) {
      return current;
    }

    current = nested;
  }

  return current;
}

function firstNestedPayload(raw: Record<string, unknown>): unknown | undefined {
  for (const key of ["diagram", "content", "data", "definition", "model", "json"]) {
    const value = raw[key];

    if (typeof value === "string") {
      const parsed = tryParseJson(value);
      if (parsed) {
        return parsed;
      }
    }

    if (isRecord(value) || Array.isArray(value)) {
      if (findDiagramRecords(value)) {
        return value;
      }
    }
  }

  return undefined;
}

function findDiagramRecords(raw: unknown): unknown[] | undefined {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return undefined;
  }

  for (const key of ["nodes", "cells", "elements", "mxCell", "items", "shapes", "figures"]) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (isRecord(value)) {
      const nested = findDiagramRecords(value);
      if (nested) {
        return nested;
      }
    }
  }

  const modelRoot = getRecord(raw.mxGraphModel)?.root ?? getRecord(raw.model)?.root;
  return findDiagramRecords(modelRoot);
}

function isConnectorRecord(raw: Record<string, unknown>): boolean {
  return raw.edge === true ||
    raw.edge === "1" ||
    raw.type === "edge" ||
    raw.type === "connector" ||
    Boolean((raw.source || raw.sourceId || raw.from || raw.startId) && (raw.target || raw.targetId || raw.to || raw.endId));
}

function getId(raw: Record<string, unknown>, prefix: string, index: number): string {
  return firstString(raw.id, raw.uuid, raw.key, raw.cellId) ?? stableId(prefix, index);
}

function getTitle(raw: Record<string, unknown>): string | undefined {
  const data = getRecord(raw.data);
  const value = firstString(raw.title, raw.text, raw.name, raw.label, raw.value, data?.title, data?.text, data?.label);
  return value ? stripHtml(value) : undefined;
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function parseNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const match = value.trim().match(/^-?[0-9.]+/);
      if (match) {
        const parsed = Number(match[0]);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

function parseOpacity(value: unknown): number | undefined {
  const opacity = parseNumber(value);
  if (opacity === undefined) {
    return undefined;
  }

  return opacity > 1 ? opacity / 100 : opacity;
}

function getStyleString(...values: unknown[]): string | undefined {
  const value = firstString(...values);
  return value && value !== "none" && value !== "transparent" ? value : undefined;
}
