import type { DiagramConnector, DiagramDocument, DiagramPage, DiagramPoint, DiagramShape, DiagramStyle, RenderDiagramOptions, RenderTheme } from "../types";

const DEFAULT_THEME: RenderTheme = {
  background: "#f7f8fb",
  rootFill: "#183153",
  rootStroke: "#183153",
  nodeFill: "#ffffff",
  nodeStroke: "#c9d2df",
  text: "#172033",
  mutedText: "#65758b",
  connector: "#667085",
  relationship: "#f0a96b"
};

const INK_THEME: RenderTheme = {
  background: "#ffffff",
  rootFill: "#111827",
  rootStroke: "#111827",
  nodeFill: "#ffffff",
  nodeStroke: "#1f2937",
  text: "#111827",
  mutedText: "#4b5563",
  connector: "#374151",
  relationship: "#b45309"
};

type DiagramBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export function renderDiagramToSvg(document: DiagramDocument, options: RenderDiagramOptions = {}): string {
  const page = document.pages[options.pageIndex ?? 0];

  if (!page) {
    throw new Error("Cannot render an empty diagram document.");
  }

  const padding = options.padding ?? 48;
  const theme = resolveTheme(options.theme);
  const bounds = calculateBounds(page);
  const minX = Math.min(0, bounds.minX);
  const minY = Math.min(0, bounds.minY);
  const contentWidth = Math.max(page.width ?? 0, bounds.maxX - minX);
  const contentHeight = Math.max(page.height ?? 0, bounds.maxY - minY);
  const width = Math.ceil(contentWidth + padding * 2);
  const height = Math.ceil(contentHeight + padding * 2);
  const offset = {
    x: padding - minX,
    y: padding - minY
  };
  const background = page.background ?? theme.background;
  const fontFamily = options.fontFamily ?? "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  const shapes = [...page.shapes]
    .sort((a, b) => shapePaintOrder(a) - shapePaintOrder(b))
    .map(shape => renderShape(shape, offset, theme, fontFamily))
    .join("\n  ");
  const connectors = page.connectors
    .map(connector => renderConnector(connector, page.shapes, offset, theme, fontFamily))
    .join("\n  ");
  const xmlDeclaration = options.includeXmlDeclaration ? "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" : "";

  return `${xmlDeclaration}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeAttr(page.title)}">
  <defs>
    <marker id="mind-port-diagram-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/>
    </marker>
    <marker id="mind-port-diagram-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <circle cx="5" cy="5" r="4" fill="context-stroke"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${escapeAttr(background)}"/>
  ${shapes}
  ${connectors}
</svg>`;
}

function renderShape(shape: DiagramShape, offset: DiagramPoint, theme: RenderTheme, fontFamily: string): string {
  const x = shape.x + offset.x;
  const y = shape.y + offset.y;
  const width = shape.width;
  const height = shape.height;
  const style = shape.style;
  const fill = style?.fill ?? (shape.kind === "text" ? "transparent" : theme.nodeFill);
  const stroke = style?.stroke ?? (shape.kind === "text" ? "transparent" : theme.nodeStroke);
  const strokeWidth = style?.strokeWidth ?? (stroke === "transparent" ? 0 : 1.4);
  const opacity = style?.opacity ?? 1;
  const dash = style?.dashed ? ` stroke-dasharray="8 6"` : "";
  const common = `fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}"${dash}`;
  const shapeSvg = renderShapeGeometry(shape, x, y, width, height, common, theme);
  const imageSvg = shape.image ? renderShapeImage(shape, x, y, width, height) : "";
  const textSvg = shape.title ? renderShapeText(shape, x, y, width, height, style, theme, fontFamily) : "";

  return `<g data-diagram-shape-id="${escapeAttr(shape.id)}" opacity="${round(clamp(opacity, 0, 1))}">
    ${shapeSvg}
    ${imageSvg}
    ${textSvg}
  </g>`;
}

function renderShapeGeometry(shape: DiagramShape, x: number, y: number, width: number, height: number, common: string, theme: RenderTheme): string {
  if (shape.kind === "text" && shape.style?.fill === undefined && shape.style?.stroke === undefined) {
    return "";
  }

  if (shape.kind === "ellipse") {
    return `<ellipse cx="${round(x + width / 2)}" cy="${round(y + height / 2)}" rx="${round(width / 2)}" ry="${round(height / 2)}" ${common}/>`;
  }

  if (shape.kind === "diamond") {
    return `<polygon points="${round(x + width / 2)},${round(y)} ${round(x + width)},${round(y + height / 2)} ${round(x + width / 2)},${round(y + height)} ${round(x)},${round(y + height / 2)}" ${common}/>`;
  }

  if (shape.kind === "parallelogram") {
    const inset = Math.min(28, width * 0.18);
    return `<polygon points="${round(x + inset)},${round(y)} ${round(x + width)},${round(y)} ${round(x + width - inset)},${round(y + height)} ${round(x)},${round(y + height)}" ${common}/>`;
  }

  if (shape.kind === "hexagon") {
    const inset = Math.min(24, width * 0.16);
    return `<polygon points="${round(x + inset)},${round(y)} ${round(x + width - inset)},${round(y)} ${round(x + width)},${round(y + height / 2)} ${round(x + width - inset)},${round(y + height)} ${round(x + inset)},${round(y + height)} ${round(x)},${round(y + height / 2)}" ${common}/>`;
  }

  if (shape.kind === "swimlane") {
    const headerHeight = Math.min(42, Math.max(28, height * 0.16));
    const headerFill = shape.style?.fill ?? "#eef2f7";
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="4" ${common}/>
    <rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(headerHeight)}" rx="4" fill="${escapeAttr(headerFill)}" stroke="${escapeAttr(shape.style?.stroke ?? theme.nodeStroke)}" stroke-width="${round(shape.style?.strokeWidth ?? 1.4)}"/>`;
  }

  if (shape.kind === "container") {
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="6" ${common} fill-opacity="0.22"/>`;
  }

  const rx = shape.kind === "roundRectangle" ? Math.min(14, height / 3) : 2;
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="${round(rx)}" ${common}/>`;
}

function renderShapeImage(shape: DiagramShape, x: number, y: number, width: number, height: number): string {
  if (!shape.image) {
    return "";
  }

  const href = shape.image;
  if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("data:")) {
    return "";
  }

  return `<image href="${escapeAttr(href)}" x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" preserveAspectRatio="xMidYMid meet"/>`;
}

function renderShapeText(shape: DiagramShape, x: number, y: number, width: number, height: number, style: DiagramStyle | undefined, theme: RenderTheme, fontFamily: string): string {
  const fontSize = style?.fontSize ?? 14;
  const lineHeight = Math.max(17, fontSize * 1.24);
  const lines = wrapText(shape.title, Math.max(1, width - 18), fontSize, Math.max(1, Math.floor((height - 10) / lineHeight)));
  const totalHeight = Math.max(0, lines.length - 1) * lineHeight;
  const startY = y + height / 2 - totalHeight / 2 + fontSize * 0.36;
  const fill = style?.color ?? theme.text;
  const resolvedFont = style?.fontFamily ? `${quoteFontFamily(style.fontFamily)}, ${fontFamily}` : fontFamily;

  return lines.map((line, index) => `<text x="${round(x + width / 2)}" y="${round(startY + index * lineHeight)}" text-anchor="middle" fill="${escapeAttr(fill)}" font-family="${escapeAttr(resolvedFont)}" font-size="${round(fontSize)}" font-weight="${escapeAttr(String(style?.fontWeight ?? 500))}">${escapeText(line)}</text>`).join("\n    ");
}

function renderConnector(connector: DiagramConnector, shapes: DiagramShape[], offset: DiagramPoint, theme: RenderTheme, fontFamily: string): string {
  const points = connector.points.length >= 2
    ? connector.points
    : inferConnectorPoints(connector, shapes);

  if (points.length < 2) {
    return "";
  }

  const shifted = points.map(point => ({ x: point.x + offset.x, y: point.y + offset.y }));
  const style = connector.style;
  const stroke = style?.stroke ?? theme.connector;
  const strokeWidth = style?.strokeWidth ?? 2;
  const dash = style?.dashed ? ` stroke-dasharray="8 6"` : "";
  const markerStart = markerFor(style?.arrowStart, "start");
  const markerEnd = markerFor(style?.arrowEnd ?? (connector.to ? "block" : undefined), "end");
  const path = connectorPath(shifted);
  const label = connector.title ? renderConnectorLabel(connector.title, shifted, style, theme, fontFamily) : "";

  return `<g data-diagram-connector-id="${escapeAttr(connector.id)}">
    <path d="${path}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${dash}${markerStart}${markerEnd}/>
    ${label}
  </g>`;
}

function inferConnectorPoints(connector: DiagramConnector, shapes: DiagramShape[]): DiagramPoint[] {
  const start = connector.from ? shapes.find(shape => shape.id === connector.from) : undefined;
  const end = connector.to ? shapes.find(shape => shape.id === connector.to) : undefined;

  if (!start || !end) {
    return [];
  }

  return [
    edgePoint(start, end),
    edgePoint(end, start)
  ];
}

function edgePoint(from: DiagramShape, to: DiagramShape): DiagramPoint {
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

function connectorPath(points: DiagramPoint[]): string {
  const [first, ...rest] = points;
  if (!first) {
    return "";
  }

  return `M ${round(first.x)} ${round(first.y)} ${rest.map(point => `L ${round(point.x)} ${round(point.y)}`).join(" ")}`;
}

function renderConnectorLabel(title: string, points: DiagramPoint[], style: DiagramStyle | undefined, theme: RenderTheme, fontFamily: string): string {
  const mid = points[Math.floor(points.length / 2)] ?? points[0];
  if (!mid) {
    return "";
  }

  const fontSize = style?.fontSize ?? 12;
  const textWidth = estimateTextWidth(title, fontSize) + 14;

  return `<g data-diagram-connector-label>
      <rect x="${round(mid.x - textWidth / 2)}" y="${round(mid.y - fontSize - 9)}" width="${round(textWidth)}" height="${round(fontSize + 10)}" rx="4" fill="#ffffff" opacity="0.86"/>
      <text x="${round(mid.x)}" y="${round(mid.y - 8)}" text-anchor="middle" fill="${escapeAttr(style?.color ?? theme.text)}" font-family="${escapeAttr(fontFamily)}" font-size="${round(fontSize)}">${escapeText(title)}</text>
    </g>`;
}

function markerFor(value: string | undefined, position: "start" | "end"): string {
  if (!value || value === "none" || value === "0") {
    return "";
  }

  const marker = value.includes("dot") || value === "oval"
    ? "mind-port-diagram-dot"
    : "mind-port-diagram-arrow";

  return ` marker-${position}="url(#${marker})"`;
}

function calculateBounds(page: DiagramPage): DiagramBounds {
  const initial: DiagramBounds = { minX: 0, minY: 0, maxX: page.width ?? 1, maxY: page.height ?? 1 };

  return page.shapes.reduce((bounds, shape) => ({
    minX: Math.min(bounds.minX, shape.x),
    minY: Math.min(bounds.minY, shape.y),
    maxX: Math.max(bounds.maxX, shape.x + shape.width),
    maxY: Math.max(bounds.maxY, shape.y + shape.height)
  }), page.connectors.reduce((bounds, connector) => {
    for (const point of connector.points) {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    }

    return bounds;
  }, initial));
}

function shapePaintOrder(shape: DiagramShape): number {
  if (shape.kind === "container" || shape.kind === "swimlane") {
    return -shape.width * shape.height;
  }

  return 0;
}

function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  const lines: string[] = [];
  let current = "";

  for (const char of chars) {
    const next = `${current}${char}`;
    if (current && estimateTextWidth(next, fontSize) > maxWidth) {
      lines.push(current.trim());
      current = char;
      if (lines.length >= maxLines - 1) {
        break;
      }
      continue;
    }

    current = next;
  }

  if (current && lines.length < maxLines) {
    lines.push(current.trim());
  }

  return lines.length ? lines : [text.slice(0, 24)];
}

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;

  for (const char of text) {
    width += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(char)
      ? fontSize
      : fontSize * 0.56;
  }

  return width;
}

function resolveTheme(theme: RenderDiagramOptions["theme"]): RenderTheme {
  if (!theme || theme === "default") {
    return DEFAULT_THEME;
  }

  if (theme === "ink") {
    return INK_THEME;
  }

  return {
    ...DEFAULT_THEME,
    ...theme
  };
}

function quoteFontFamily(fontFamily: string): string {
  const normalized = fontFamily.trim().replace(/^["']|["']$/g, "");
  return /\s/.test(normalized) ? `"${normalized.replace(/"/g, "\\\"")}"` : normalized;
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
    .replace(/'/g, "&apos;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
