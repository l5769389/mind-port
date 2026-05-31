import type { MindAsset, MindBoundary, MindDocument, MindLayout, MindNode, MindRelationship, MindSummary, PositionedMindNode, RenderSettings, RenderSvgOptions, RenderTheme } from "../types";
import { layoutMindSheet } from "./layout";

const DEFAULT_THEME: RenderTheme = {
  background: "#f7f8fb",
  rootFill: "#183153",
  rootStroke: "#183153",
  nodeFill: "#ffffff",
  nodeStroke: "#c9d2df",
  text: "#172033",
  mutedText: "#65758b",
  connector: "#91a0b6",
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

const CLEAN_RENDER_SETTINGS: RenderSettings = {
  connectorScale: 1,
  showBoundaries: false,
  showGroupBackgrounds: false,
  boundaryOpacity: 0.78,
  groupBackgroundOpacity: 0.72,
  relationshipStyle: "clean"
};

const XMIND_RENDER_SETTINGS: RenderSettings = {
  connectorScale: 1.65,
  showBoundaries: true,
  showGroupBackgrounds: false,
  boundaryOpacity: 0.88,
  groupBackgroundOpacity: 0.62,
  relationshipStyle: "hidden"
};

const FISHBONE_RIB_JOINT_GAP = 132;

export function renderToSvg(document: MindDocument, options: RenderSvgOptions = {}): string {
  const renderMode = options.renderMode ?? "semantic";
  if (renderMode === "thumbnail" || renderMode === "auto") {
    const thumbnail = renderEmbeddedThumbnail(document, options);
    if (thumbnail || renderMode === "thumbnail") {
      return thumbnail ?? renderSemanticSvg(document, options);
    }
  }

  return renderSemanticSvg(document, options);
}

function renderSemanticSvg(document: MindDocument, options: RenderSvgOptions = {}): string {
  const sheet = document.sheets[options.sheetIndex ?? 0];

  if (!sheet) {
    throw new Error("Cannot render an empty mind document.");
  }

  const theme = resolveTheme(options.theme);
  const layout = layoutMindSheet(sheet, options);
  const background = sheet.style?.fill ?? theme.background;
  const renderTheme = adaptThemeToBackground(theme, background);
  const renderSettings = resolveRenderSettings(options, sheet);
  const fontFamily = options.fontFamily ?? "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  const canvasWidth = layout.width + getSummaryCanvasPadding(sheet.root);
  const boundaries = renderBoundaries(layout, sheet.root, renderSettings);
  const groupBackgrounds = renderGroupBackgrounds(layout, sheet.root, renderSettings);
  const edges = renderConnectors(layout, renderTheme, renderSettings);
  const relationships = renderRelationships(layout, sheet.relationships ?? [], renderTheme, renderSettings, sheet.root.id);
  const summaries = renderSummaries(layout, sheet.root, renderTheme, fontFamily, canvasWidth);
  const nodes = layout.nodes.map(node => renderNode(node, renderTheme, fontFamily, document.assets)).join("\n");
  const xmlDeclaration = options.includeXmlDeclaration ? "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" : "";

  return `${xmlDeclaration}<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${layout.height}" viewBox="0 0 ${canvasWidth} ${layout.height}" role="img" aria-label="${escapeAttr(sheet.title)}">
  <defs>
    <marker id="mind-port-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/>
    </marker>
    <marker id="mind-port-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">
      <circle cx="5" cy="5" r="4" fill="context-stroke"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${escapeAttr(background)}"/>
  ${boundaries}
  ${groupBackgrounds}
  ${edges}
  ${relationships}
  ${summaries}
  ${nodes}
</svg>`;
}

function renderEmbeddedThumbnail(document: MindDocument, options: RenderSvgOptions): string | undefined {
  const thumbnail = findEmbeddedThumbnail(document.assets);
  if (!thumbnail) {
    return undefined;
  }

  const size = getImageSize(thumbnail);
  if (!size) {
    return undefined;
  }

  const padding = options.padding ?? 0;
  const width = Math.ceil(size.width + padding * 2);
  const height = Math.ceil(size.height + padding * 2);
  const image = toDataUri(thumbnail);
  const xmlDeclaration = options.includeXmlDeclaration ? "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" : "";

  return `${xmlDeclaration}<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Embedded XMind preview">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <image href="${escapeAttr(image)}" x="${padding}" y="${padding}" width="${round(size.width)}" height="${round(size.height)}" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

function renderBoundaries(layout: MindLayout, root: MindNode, settings: RenderSettings): string {
  if (!settings.showBoundaries) {
    return "";
  }

  const output: string[] = [];
  visit(root);
  return output.join("\n  ");

  function visit(node: MindNode): void {
    if (node.boundaries?.length && node.children.length) {
      for (const boundary of node.boundaries) {
        const range = boundary.range ?? { start: 0, end: node.children.length - 1 };
        const boundedNodes = node.children
          .slice(range.start, range.end + 1)
          .map(child => layout.byId.get(child.id))
          .filter(Boolean) as PositionedMindNode[];

        if (boundedNodes.length) {
          output.push(renderBoundaryBackground(boundedNodes, boundary, output.length, settings));
        }
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  }
}

function renderGroupBackgrounds(layout: MindLayout, root: MindNode, settings: RenderSettings): string {
  if (!settings.showGroupBackgrounds) {
    return "";
  }

  const output: string[] = [];
  visit(root);
  return output.join("\n  ");

  function visit(node: MindNode): void {
    const parent = layout.byId.get(node.id);
    const children = node.children.map(child => layout.byId.get(child.id)).filter(Boolean) as PositionedMindNode[];
    const shouldRender = parent &&
      parent.depth >= 2 &&
      children.length >= 2 &&
      !node.summaries?.length &&
      children.every(child => !child.node.children.length);

    if (shouldRender) {
      output.push(renderRoughBackground(children, output.length, {
        dataAttribute: "data-group-background",
        fill: "#D2D2D2",
        opacity: settings.groupBackgroundOpacity,
        hatchOpacity: 0.32
      }));
    }

    for (const child of node.children) {
      visit(child);
    }
  }
}

function renderBoundaryBackground(nodes: PositionedMindNode[], boundary: MindBoundary, index: number, settings: RenderSettings): string {
  const properties = getBoundaryStyleProperties(boundary);
  const fillPattern = String(properties["fill-pattern"] ?? "");
  const linePattern = String(properties["line-pattern"] ?? "");
  const shape = String(properties["shape-class"] ?? "");
  const isSolidBoundary = fillPattern === "solid" || shape.includes("boundaryShape");

  if (isSolidBoundary && !fillPattern.includes("hand") && !linePattern.includes("hand")) {
    return renderSolidBoundary(nodes, boundary, index, settings, properties);
  }

  return renderRoughBackground(nodes, index, {
    dataAttribute: `data-boundary-id="${escapeAttr(boundary.id)}"`,
    fill: boundary.style?.fill ?? "#D2D2D2",
    opacity: settings.boundaryOpacity,
    hatchOpacity: 0.42,
    paddingX: 20,
    paddingY: 12
  });
}

function renderSolidBoundary(
  nodes: PositionedMindNode[],
  boundary: MindBoundary,
  index: number,
  settings: RenderSettings,
  properties: Record<string, unknown>
): string {
  const paddingX = 20;
  const paddingY = 12;
  const bounds = nodes.map(node => estimateNodeVisualBounds(node));
  const minX = Math.min(...bounds.map(bound => bound.minX)) - paddingX;
  const maxX = Math.max(...bounds.map(bound => bound.maxX)) + paddingX;
  const minY = Math.min(...bounds.map(bound => bound.minY)) - paddingY;
  const maxY = Math.max(...bounds.map(bound => bound.maxY)) + paddingY;
  const width = maxX - minX;
  const height = maxY - minY;
  const stroke = getStyleString(properties["line-color"]) ?? boundary.style?.stroke ?? "#94a3b8";
  const strokeWidth = parseSvgSize(properties["line-width"]) ?? boundary.style?.strokeWidth ?? 2;
  const dash = String(properties["line-pattern"] ?? "").includes("dash") ? ` stroke-dasharray="9 7"` : "";
  const rx = String(properties["shape-class"] ?? "").includes("rounded") ? 8 : 0;
  const fill = boundary.style?.fill && boundary.style.fill !== "transparent"
    ? boundary.style.fill
    : "transparent";
  const fillOpacity = fill === "transparent" ? 0 : Math.min(settings.boundaryOpacity, 0.12);
  const title = boundary.title ? renderBoundaryTitle(boundary.title, minX, minY, stroke, index) : "";

  return `<g data-boundary-id="${escapeAttr(boundary.id)}">
    <rect x="${round(minX)}" y="${round(minY)}" width="${round(width)}" height="${round(height)}" rx="${round(rx)}" fill="${escapeAttr(fill)}" fill-opacity="${round(fillOpacity)}" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}"${dash}/>
    ${title}
  </g>`;
}

function renderBoundaryTitle(title: string, minX: number, minY: number, stroke: string, index: number): string {
  const fontSize = 12;
  const labelWidth = Math.max(92, estimateLabelWidth(title, fontSize) + 20);
  const labelHeight = 24;
  const x = minX + 16;
  const y = minY - labelHeight + 2;
  const fill = isDarkColor(stroke) ? "#ffffff" : stroke;
  const textFill = isDarkColor(fill) ? "#ffffff" : "#172033";
  const clipId = `mind-port-boundary-title-${index}`;

  return `<g data-boundary-title>
      <clipPath id="${clipId}"><rect x="${round(x)}" y="${round(y)}" width="${round(labelWidth)}" height="${round(labelHeight)}" rx="5"/></clipPath>
      <rect x="${round(x)}" y="${round(y)}" width="${round(labelWidth)}" height="${round(labelHeight)}" rx="5" fill="${escapeAttr(fill)}" opacity="0.92"/>
      <text x="${round(x + labelWidth / 2)}" y="${round(y + 16)}" text-anchor="middle" fill="${escapeAttr(textFill)}" font-size="${fontSize}" font-weight="500" clip-path="url(#${clipId})">${escapeText(title)}</text>
    </g>`;
}

function getBoundaryStyleProperties(boundary: MindBoundary): Record<string, unknown> {
  const raw = boundary.style?.raw ?? boundary.raw;
  if (!raw || typeof raw !== "object") {
    return {};
  }

  if ("properties" in raw) {
    const properties = (raw as { properties?: unknown }).properties;
    return properties && typeof properties === "object" ? properties as Record<string, unknown> : {};
  }

  if ("style" in raw) {
    return getStyleProperties(raw);
  }

  return {};
}

type RoughBackgroundOptions = {
  dataAttribute: string;
  fill: string;
  opacity: number;
  hatchOpacity: number;
  paddingX?: number;
  paddingY?: number;
};

function renderRoughBackground(nodes: PositionedMindNode[], index: number, options: RoughBackgroundOptions): string {
  const paddingX = options.paddingX ?? 22;
  const paddingY = options.paddingY ?? 14;
  const bounds = nodes.map(node => estimateNodeVisualBounds(node));
  const minX = Math.min(...bounds.map(bound => bound.minX)) - paddingX;
  const maxX = Math.max(...bounds.map(bound => bound.maxX)) + paddingX;
  const minY = Math.min(...bounds.map(bound => bound.minY)) - paddingY;
  const maxY = Math.max(...bounds.map(bound => bound.maxY)) + paddingY;
  const width = maxX - minX;
  const height = maxY - minY;
  const path = roughRectPath(minX, minY, width, height);
  const hatch = renderHatchLines(minX, minY, width, height);
  const clipId = `mind-port-rough-${index}`;

  return `<g ${options.dataAttribute} opacity="${round(clamp(options.opacity, 0, 1))}">
    <clipPath id="${clipId}"><path d="${path}"/></clipPath>
    <path d="${path}" fill="${escapeAttr(options.fill)}" stroke="none"/>
    <g clip-path="url(#${clipId})" opacity="${round(clamp(options.hatchOpacity, 0, 1))}">${hatch}</g>
  </g>`;
}

type VisualBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function estimateNodeVisualBounds(node: PositionedMindNode): VisualBounds {
  const base: VisualBounds = {
    minX: node.x - node.width / 2,
    maxX: node.x + node.width / 2,
    minY: node.y - node.height / 2,
    maxY: node.y + node.height / 2
  };
  const text = estimateNodeTextBounds(node);

  if (!text) {
    return base;
  }

  return {
    minX: Math.min(base.minX, text.minX),
    maxX: Math.max(base.maxX, text.maxX),
    minY: Math.min(base.minY, text.minY),
    maxY: Math.max(base.maxY, text.maxY)
  };
}

function estimateNodeTextBounds(node: PositionedMindNode): VisualBounds | undefined {
  const lines = node.lines.filter(Boolean);
  const labelLines = node.labelLines.filter(Boolean);
  if (!lines.length && !labelLines.length) {
    return undefined;
  }

  const isRoot = node.side === "root";
  const noFill = hasNoFillPattern(node.node);
  const isUnderline = node.node.style?.shape?.endsWith("underline") ?? false;
  let fill = node.node.style?.shape === "xmind.branchLine" || isUnderline
    ? "transparent"
    : node.node.style?.fill ?? (noFill ? "transparent" : isRoot ? DEFAULT_THEME.rootFill : DEFAULT_THEME.nodeFill);
  const strokeWidth = node.node.style?.strokeWidth ?? (noFill ? 0 : node.node.style?.stroke ? 1.4 : isRoot ? 0 : isUnderline ? 1.8 : 1.4);
  if (!isRoot && !node.node.style?.fill && strokeWidth <= 0) {
    fill = "transparent";
  }
  const fontSize = node.node.style?.fontSize ?? (isRoot ? 16 : 14);
  const lineHeight = Math.max(18, fontSize * 1.25);
  const labelWidth = Math.max(0, ...labelLines.map(line => estimateLabelWidth(line, 11)));
  const titleWidth = Math.max(0, ...lines.map(line => estimateLabelWidth(line, fontSize)));
  const textWidth = Math.max(titleWidth, labelWidth) * 1.16;
  const firstBaseline = getTextStartY(node, undefined, fontSize, lineHeight);
  const lastTitleBaseline = firstBaseline + Math.max(0, lines.length - 1) * lineHeight;
  const lastLabelBaseline = labelLines.length
    ? firstBaseline + lines.length * lineHeight + Math.max(0, labelLines.length - 1) * 14
    : lastTitleBaseline;
  const minY = firstBaseline - fontSize * 0.9;
  const maxY = lastLabelBaseline + fontSize * 0.35;

  if (isBranchTextNode(node, fill, strokeWidth, undefined)) {
    const markerWidth = getLeadingMarkers(node).length * 21;
    const textPad = 18;
    const markerMinX = markerWidth ? node.x - node.width / 2 + 12 : Infinity;
    const markerMaxX = markerWidth ? markerMinX + markerWidth : -Infinity;

    if (node.side === "left") {
      const maxX = node.x + node.width / 2 - textPad;
      return {
        minX: Math.min(maxX - textWidth, markerMinX),
        maxX: Math.max(maxX, markerMaxX),
        minY,
        maxY
      };
    }

    const minX = node.x - node.width / 2 + textPad + markerWidth;
    return {
      minX: Math.min(minX, markerMinX),
      maxX: Math.max(minX + textWidth, markerMaxX),
      minY,
      maxY
    };
  }

  return {
    minX: node.x - textWidth / 2,
    maxX: node.x + textWidth / 2,
    minY,
    maxY
  };
}

function roughRectPath(x: number, y: number, width: number, height: number): string {
  const step = 14;
  const top: string[] = [];
  const right: string[] = [];
  const bottom: string[] = [];
  const left: string[] = [];

  for (let cursor = 0; cursor <= width; cursor += step) {
    top.push(`L ${round(x + cursor)} ${round(y + roughJitter(cursor, 0))}`);
    bottom.push(`L ${round(x + width - cursor)} ${round(y + height + roughJitter(cursor, 2))}`);
  }

  for (let cursor = 0; cursor <= height; cursor += step) {
    right.push(`L ${round(x + width + roughJitter(cursor, 1))} ${round(y + cursor)}`);
    left.push(`L ${round(x + roughJitter(cursor, 3))} ${round(y + height - cursor)}`);
  }

  return `M ${round(x)} ${round(y)} ${top.join(" ")} ${right.join(" ")} ${bottom.join(" ")} ${left.join(" ")} Z`;
}

function renderHatchLines(x: number, y: number, width: number, height: number): string {
  const lines: string[] = [];
  for (let offset = -height; offset < width + height; offset += 18) {
    lines.push(`<path d="M ${round(x + offset)} ${round(y + height)} L ${round(x + offset + height)} ${round(y)}" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>`);
  }
  return lines.join("");
}

function roughJitter(value: number, salt: number): number {
  return ((Math.sin(value * 0.71 + salt * 2.17) + Math.cos(value * 0.37 + salt)) * 2.2);
}

function renderConnectors(layout: MindLayout, theme: RenderTheme, settings: RenderSettings): string {
  const root = layout.nodes.find(node => node.side === "root" && !node.parentId);

  if (root && isFishboneRightHeaded(root.node)) {
    return renderFishboneConnectors(layout, root, theme, settings);
  }

  if (root && isOrgChartDown(root.node)) {
    return renderOrgChartConnectors(layout, root, theme, settings);
  }

  if (root && isTimelineThroughVertical(root.node)) {
    return renderTimelineConnectors(layout, root, theme, settings);
  }

  return layout.nodes
    .filter(node => node.parentId)
    .map(node => renderDefaultConnector(layout, node, theme, settings))
    .join("\n  ");
}

function renderDefaultConnector(layout: MindLayout, node: PositionedMindNode, theme: RenderTheme, settings: RenderSettings): string {
  const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;
  if (!parent) {
    return "";
  }

  const side = node.side === "left" ? -1 : 1;
  const startX = parent.x + (parent.side === "left" ? -parent.width / 2 : parent.side === "right" ? parent.width / 2 : side * parent.width / 2);
  const endX = node.x - side * node.width / 2;
  const c1 = startX + side * 42;
  const c2 = endX - side * 42;
  const stroke = node.node.style?.stroke ?? parent.node.style?.stroke ?? theme.connector;
  const strokeWidth = connectorStrokeWidth(parent, node, settings);

  return `<path d="M ${round(startX)} ${round(parent.y)} C ${round(c1)} ${round(parent.y)}, ${round(c2)} ${round(node.y)}, ${round(endX)} ${round(node.y)}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}" stroke-linecap="round"/>`;
}

function renderFishboneConnectors(layout: MindLayout, root: PositionedMindNode, theme: RenderTheme, settings: RenderSettings): string {
  const rootChildren = layout.nodes
    .filter(node => node.parentId === root.node.id)
    .sort((a, b) => b.x - a.x);
  const leafNodes = layout.nodes.filter(node => {
    const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;
    return parent?.parentId === root.node.id;
  });
  const spineStart = Math.min(
    ...rootChildren.map(node => node.x - node.width / 2 - 120),
    ...leafNodes.map(node => node.x - node.width / 2 - 70),
    root.x - root.width / 2 - 120
  );
  const spineEnd = root.x - root.width / 2;
  const parts: string[] = [
    `<path d="M ${round(spineStart)} ${round(root.y)} L ${round(spineEnd)} ${round(root.y)}" fill="none" stroke="${escapeAttr(theme.connector)}" stroke-width="${round(2.4 * settings.connectorScale)}" stroke-linecap="round"/>`
  ];

  for (const node of layout.nodes.filter(node => node.parentId)) {
    const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;

    if (!parent) {
      continue;
    }

    if (parent.node.id === root.node.id) {
      const rib = fishboneRibGeometry(node, root);
      parts.push(`<path d="M ${round(rib.startX)} ${round(rib.startY)} L ${round(rib.jointX)} ${round(rib.jointY)}" fill="none" stroke="${escapeAttr(node.node.style?.stroke ?? theme.connector)}" stroke-width="${round(2.4 * settings.connectorScale)}" stroke-linecap="round"/>`);
      continue;
    }

    if (parent.parentId === root.node.id) {
      const stroke = node.node.style?.stroke ?? parent.node.style?.stroke ?? theme.connector;
      const rib = fishboneRibGeometry(parent, root);
      const startX = node.x + node.width / 2;
      const endX = Math.max(startX + 12, fishboneRibXAtY(rib, node.y));
      parts.push(`<path d="M ${round(startX)} ${round(node.y)} L ${round(endX)} ${round(node.y)}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(2 * settings.connectorScale)}" stroke-linecap="round"/>`);
      continue;
    }

    parts.push(renderDefaultConnector(layout, node, theme, settings));
  }

  return parts.join("\n  ");
}

function renderOrgChartConnectors(layout: MindLayout, root: PositionedMindNode, theme: RenderTheme, settings: RenderSettings): string {
  return layout.nodes
    .filter(node => node.parentId)
    .map(node => {
      const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;
      if (!parent) {
        return "";
      }

      const startX = parent.x;
      const startY = parent.y + parent.height / 2;
      const endX = node.x;
      const endY = node.y - node.height / 2;
      const midY = startY + Math.max(18, (endY - startY) * 0.48);
      const stroke = node.node.style?.stroke ?? parent.node.style?.stroke ?? theme.connector;
      const strokeWidth = connectorStrokeWidth(parent, node, settings);

      return `<path d="M ${round(startX)} ${round(startY)} L ${round(startX)} ${round(midY)} L ${round(endX)} ${round(midY)} L ${round(endX)} ${round(endY)}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .filter(Boolean)
    .join("\n  ");
}

function renderTimelineConnectors(layout: MindLayout, root: PositionedMindNode, theme: RenderTheme, settings: RenderSettings): string {
  const mainTopics = layout.nodes
    .filter(node => node.parentId === root.node.id)
    .sort((a, b) => a.y - b.y);
  const lastMain = mainTopics[mainTopics.length - 1];
  const spineStartY = root.y + root.height / 2;
  const spineEndY = lastMain ? lastMain.y + lastMain.height / 2 + 18 : spineStartY;
  const parts: string[] = mainTopics.length
    ? [`<path d="M ${round(root.x)} ${round(spineStartY)} L ${round(root.x)} ${round(spineEndY)}" fill="none" stroke="${escapeAttr(theme.connector)}" stroke-width="${round(2.2 * settings.connectorScale)}" stroke-linecap="round"/>`]
    : [];

  for (const node of layout.nodes.filter(node => node.parentId)) {
    const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;
    if (!parent) {
      continue;
    }

    if (parent.node.id === root.node.id) {
      const side = node.x >= root.x ? 1 : -1;
      const endX = node.x - side * node.width / 2;
      const stroke = node.node.style?.stroke ?? theme.connector;
      parts.push(`<path d="M ${round(root.x)} ${round(node.y)} L ${round(endX)} ${round(node.y)}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(2 * settings.connectorScale)}" stroke-linecap="round"/>`);
      parts.push(`<circle cx="${round(root.x)}" cy="${round(node.y)}" r="${round(4 * settings.connectorScale)}" fill="${escapeAttr(stroke)}"/>`);
      continue;
    }

    parts.push(renderDefaultConnector(layout, node, theme, settings));
  }

  return parts.join("\n  ");
}

type FishboneRibGeometry = {
  startX: number;
  startY: number;
  jointX: number;
  jointY: number;
};

function fishboneRibGeometry(node: PositionedMindNode, root: PositionedMindNode): FishboneRibGeometry {
  const isTop = node.y < root.y;
  return {
    startX: node.x,
    startY: node.y + (isTop ? node.height / 2 : -node.height / 2),
    jointX: node.x + node.width / 2 + FISHBONE_RIB_JOINT_GAP,
    jointY: root.y
  };
}

function fishboneRibXAtY(rib: FishboneRibGeometry, y: number): number {
  if (Math.abs(rib.jointY - rib.startY) < 0.001) {
    return rib.jointX;
  }

  const t = clamp((y - rib.startY) / (rib.jointY - rib.startY), 0, 1);
  return rib.startX + (rib.jointX - rib.startX) * t;
}

function renderRelationships(layout: MindLayout, relationships: MindRelationship[], theme: RenderTheme, settings: RenderSettings, rootId: string): string {
  return relationships
    .map(relationship => {
      const from = layout.byId.get(relationship.from);
      const to = layout.byId.get(relationship.to);

      if (!from || !to) {
        return "";
      }

      const properties = getStyleProperties(relationship.raw);
      const isCallout = isFloatingCalloutRelationship(relationship, from, to, rootId, properties);
      if (settings.relationshipStyle === "hidden" && !isCallout) {
        return "";
      }

      const start = edgePoint(from, to);
      const end = edgePoint(to, from);
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const isXMindStyle = settings.relationshipStyle === "xmind" || isCallout;
      const linePattern = String(properties["line-pattern"] ?? "");
      const shapeClass = String(properties["shape-class"] ?? "");
      const dashed = linePattern.includes("dash");
      const stroke = getStyleString(properties["line-color"]) ?? theme.relationship;
      const strokeWidth = parseSvgSize(properties["line-width"]) ?? (isXMindStyle ? 2 : 2.2);
      const dashAttr = dashed ? ` stroke-dasharray="${isXMindStyle ? "8 7" : "7 5"}"` : "";
      const label = relationship.title
        ? `<text x="${round(midX)}" y="${round(midY - 8)}" text-anchor="middle" fill="${stroke}" font-size="12">${escapeText(relationship.title)}</text>`
        : "";
      const curveOffset = Math.max(42, Math.min(160, Math.abs(end.x - start.x) * 0.18));
      const shouldCurve = isXMindStyle && !shapeClass.includes("straight") && (dashed || Math.abs(end.x - start.x) > 80);
      const path = shouldCurve
        ? `M ${round(start.x)} ${round(start.y)} C ${round(midX)} ${round(start.y - curveOffset)}, ${round(midX)} ${round(end.y + curveOffset)}, ${round(end.x)} ${round(end.y)}`
        : `M ${round(start.x)} ${round(start.y)} L ${round(end.x)} ${round(end.y)}`;
      const marker = relationshipMarker(properties);
      const opacity = isXMindStyle ? "0.86" : "1";

      return `<path d="${path}" fill="none" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}" stroke-linecap="round"${dashAttr}${marker} opacity="${opacity}"/>${label}`;
    })
    .filter(Boolean)
    .join("\n  ");
}

function relationshipMarker(properties: Record<string, unknown>): string {
  const arrowEnd = String(properties["arrow-end-class"] ?? "");
  if (arrowEnd.includes("none")) {
    return "";
  }

  if (arrowEnd.includes("dot")) {
    return ` marker-end="url(#mind-port-dot)"`;
  }

  return ` marker-end="url(#mind-port-arrow)"`;
}

function isFloatingCalloutRelationship(
  relationship: MindRelationship,
  from: PositionedMindNode,
  to: PositionedMindNode,
  rootId: string,
  properties: Record<string, unknown>
): boolean {
  const linePattern = String(properties["line-pattern"] ?? "");
  const shapeClass = String(properties["shape-class"] ?? "");
  const touchesCentralTopic = relationship.from === rootId || relationship.to === rootId;
  const touchesFloatingRoot = (from.depth === 0 && from.node.id !== rootId) || (to.depth === 0 && to.node.id !== rootId);

  return touchesCentralTopic &&
    touchesFloatingRoot &&
    shapeClass.includes("relationshipShape.straight") &&
    !linePattern.includes("dash");
}

function renderNode(node: PositionedMindNode, theme: RenderTheme, fontFamily: string, assets?: Record<string, MindAsset>): string {
  const isRoot = node.side === "root";
  const isBranchLine = node.node.style?.shape === "xmind.branchLine";
  const isUnderline = node.node.style?.shape?.endsWith("underline") ?? false;
  const noFill = hasNoFillPattern(node.node);
  let fill = isBranchLine || isUnderline ? "transparent" : node.node.style?.fill ?? (noFill ? "transparent" : isRoot ? theme.rootFill : theme.nodeFill);
  const stroke = node.node.style?.stroke ?? (isRoot ? theme.rootStroke : theme.nodeStroke);
  const strokeWidth = node.node.style?.strokeWidth ?? (noFill ? 0 : node.node.style?.stroke ? 1.4 : isRoot ? 0 : isUnderline ? 1.8 : 1.4);
  if (!isRoot && !node.node.style?.fill && strokeWidth <= 0) {
    fill = "transparent";
  }
  const textFill = node.node.style?.color ?? (fill !== "transparent" && isDarkColor(fill) ? "#ffffff" : theme.text);
  const fontSize = node.node.style?.fontSize ?? (isRoot ? 16 : 14);
  const lineHeight = Math.max(18, fontSize * 1.25);
  const fontWeight = node.node.style?.fontWeight ?? (isRoot ? 700 : 600);
  const nodeFontFamily = resolveNodeFontFamily(node.node.style?.fontFamily, fontFamily);
  const image = getNodeImage(node, assets);
  const isStackedImage = image?.align === "top" || image?.align === "bottom";
  const inlineImageOffset = image && !isStackedImage && image.align !== "right" ? (image.width + 12) / 2 : 0;
  const markers = getLeadingMarkers(node);
  const markerOffset = markers.length ? markers.length * 9 : 0;
  const branchText = isBranchTextNode(node, fill, strokeWidth, image);
  const branchTextPad = 18;
  const textAnchor = branchText
    ? node.side === "left" ? "end" : "start"
    : "middle";
  const textX = branchText
    ? node.side === "left"
      ? node.x + node.width / 2 - branchTextPad
      : node.x - node.width / 2 + branchTextPad + markers.length * 21
    : node.x + inlineImageOffset + markerOffset;
  const textStartY = getTextStartY(node, image, fontSize, lineHeight);
  const lineSvg = node.lines.map((line, index) => {
    const y = textStartY + index * lineHeight;
    return `<text x="${round(textX)}" y="${round(y)}" text-anchor="${textAnchor}" fill="${escapeAttr(textFill)}" font-family="${escapeAttr(nodeFontFamily)}" font-size="${round(fontSize)}" font-weight="${escapeAttr(String(fontWeight))}">${escapeText(line)}</text>`;
  }).join("\n    ");
  const labelSvg = node.labelLines.map((line, index) => {
    const y = textStartY + node.lines.length * lineHeight + index * 14;
    return `<text x="${round(textX)}" y="${round(y)}" text-anchor="${textAnchor}" fill="${isDarkColor(fill) ? "#dbeafe" : theme.mutedText}" font-family="${escapeAttr(nodeFontFamily)}" font-size="11">${escapeText(line)}</text>`;
  }).join("\n    ");
  const noteIndicator = node.node.notes
    ? `<circle cx="${round(node.x + node.width / 2 - 14)}" cy="${round(node.y - node.height / 2 + 14)}" r="4" fill="${fill !== "transparent" && isDarkColor(fill) ? "#bfdbfe" : theme.mutedText}"/>`
    : "";
  const shape = renderNodeShape(node, fill, stroke, strokeWidth);
  const imageSvg = image ? renderNodeImage(node, image) : "";
  const markerSvg = markers.map((marker, index) => renderMarker(node, marker, index, image, theme)).join("\n    ");

  return `<g data-node-id="${escapeAttr(node.node.id)}">
    ${shape}
    ${imageSvg}
    ${markerSvg}
    ${noteIndicator}
    ${lineSvg}
    ${labelSvg}
  </g>`;
}

function isBranchTextNode(
  node: PositionedMindNode,
  fill: string,
  strokeWidth: number,
  image: RenderedNodeImage | undefined
): boolean {
  return node.depth >= 2 &&
    node.side !== "root" &&
    !image &&
    fill === "transparent" &&
    strokeWidth <= 0;
}

function renderSummaries(layout: MindLayout, root: MindNode, theme: RenderTheme, fontFamily: string, canvasWidth: number): string {
  const output: string[] = [];
  visitSummaryNode(root);
  return output.join("\n  ");

  function visitSummaryNode(node: MindNode): void {
    const parent = layout.byId.get(node.id);
    if (parent && node.summaries?.length && node.children.length) {
      for (const summary of node.summaries) {
        const range = summary.range ?? { start: 0, end: node.children.length - 1 };
        const children = node.children
          .slice(range.start, range.end + 1)
          .map(child => layout.byId.get(child.id))
          .filter(Boolean) as PositionedMindNode[];

        if (children.length) {
          output.push(renderSummary(parent, children, summary, theme, fontFamily, canvasWidth));
        }
      }
    }

    for (const child of node.children) {
      visitSummaryNode(child);
    }
  }
}

function renderSummary(parent: PositionedMindNode, children: PositionedMindNode[], summary: MindSummary, theme: RenderTheme, fontFamily: string, canvasWidth: number): string {
  const side = children.reduce((sum, child) => sum + child.x, 0) / children.length >= parent.x ? 1 : -1;
  const naturalMinY = Math.min(...children.map(child => child.y - child.height / 2));
  const naturalMaxY = Math.max(...children.map(child => child.y + child.height / 2));
  const edgeX = side > 0
    ? Math.max(...children.map(child => child.x + child.width / 2)) + 18
    : Math.min(...children.map(child => child.x - child.width / 2)) - 18;
  const midY = (naturalMinY + naturalMaxY) / 2;
  const title = summary.title;
  const customWidth = getSummaryCustomWidth(summary);
  const fontSize = summary.style?.fontSize ?? 14;
  const fontWeight = summary.style?.fontWeight ?? 500;
  const textWidth = customWidth ?? Math.max(90, estimateLabelWidth(title, fontSize));
  const titleLines = customWidth ? wrapSummaryTitle(title, textWidth, fontSize) : [title];
  const lineHeight = Math.max(18, fontSize * 1.22);
  const labelWidth = customWidth
    ? Math.max(124, customWidth + 44)
    : Math.max(120, estimateLabelWidth(title, fontSize) + 34);
  const labelHeight = Math.max(34, titleLines.length * lineHeight + 14);
  const braceHeight = Math.max(naturalMaxY - naturalMinY, labelHeight * 1.36, 74);
  const minY = midY - braceHeight / 2;
  const maxY = midY + braceHeight / 2;
  const braceWidth = Math.max(24, Math.min(34, braceHeight * 0.38)) * side;
  const braceTipX = edgeX + braceWidth;
  const path = `M ${round(edgeX)} ${round(minY)} C ${round(braceTipX)} ${round(minY)}, ${round(braceTipX)} ${round(midY)}, ${round(braceTipX)} ${round(midY)} C ${round(braceTipX)} ${round(midY)}, ${round(braceTipX)} ${round(maxY)}, ${round(edgeX)} ${round(maxY)}`;
  const tickLength = customWidth ? 22 : 18;
  const labelGap = customWidth ? 26 : 20;
  const rawLabelX = braceTipX + side * (tickLength + labelGap + labelWidth / 2);
  const labelX = clamp(rawLabelX, labelWidth / 2 + 10, canvasWidth - labelWidth / 2 - 10);
  const labelEdgeX = labelX - side * labelWidth / 2;
  const nominalConnectorEndX = braceTipX + side * tickLength;
  const guardedConnectorEndX = labelEdgeX - side * 8;
  const connectorEndX = side > 0
    ? Math.max(braceTipX, Math.min(nominalConnectorEndX, guardedConnectorEndX))
    : Math.min(braceTipX, Math.max(nominalConnectorEndX, guardedConnectorEndX));
  const fill = summary.style?.fill ?? "#D9D9D9CC";
  const summaryStroke = summary.lineStyle?.stroke ?? theme.text;
  const summaryStrokeWidth = Math.max(summary.lineStyle?.strokeWidth ?? 2, customWidth ? 3.8 : 2.8);
  const textFill = fill !== "transparent" && isDarkColor(fill) ? "#ffffff" : theme.text;
  const summaryFontFamily = resolveNodeFontFamily(summary.style?.fontFamily, fontFamily);
  const labelShape = renderSummaryLabelShape(labelX, midY, labelWidth, labelHeight, fill);
  const firstTextY = midY - ((titleLines.length - 1) * lineHeight) / 2 + fontSize * 0.36;
  const textSvg = titleLines.map((line, index) => {
    const y = firstTextY + index * lineHeight;
    return `<text x="${round(labelX)}" y="${round(y)}" text-anchor="middle" fill="${escapeAttr(textFill)}" font-family="${escapeAttr(summaryFontFamily)}" font-size="${round(fontSize)}" font-weight="${escapeAttr(String(fontWeight))}">${escapeText(line)}</text>`;
  }).join("\n    ");

  return `<g data-summary>
    <path d="${path}" fill="none" stroke="${escapeAttr(summaryStroke)}" stroke-width="${round(summaryStrokeWidth)}" stroke-linecap="round"/>
    <path d="M ${round(braceTipX)} ${round(midY)} L ${round(connectorEndX)} ${round(midY)}" fill="none" stroke="${escapeAttr(summaryStroke)}" stroke-width="${round(summaryStrokeWidth)}" stroke-linecap="round"/>
    ${labelShape}
    ${textSvg}
  </g>`;
}

function getSummaryCanvasPadding(root: MindNode): number {
  return hasSummaries(root) ? 260 : 0;
}

function hasSummaries(node: MindNode): boolean {
  if (node.summaries?.length) {
    return true;
  }

  return node.children.some(child => hasSummaries(child));
}

function wrapSummaryTitle(title: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const char of title) {
    const next = `${current}${char}`;
    if (current && estimateLabelWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = char;
      continue;
    }

    current = next;
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 3);
}

function getSummaryCustomWidth(summary: MindSummary): number | undefined {
  const raw = summary.raw;
  const topic = raw && typeof raw === "object" && "topic" in raw
    ? (raw as { topic?: unknown }).topic
    : raw;

  if (!topic || typeof topic !== "object" || !("customWidth" in topic)) {
    return undefined;
  }

  const customWidth = Number((topic as { customWidth?: unknown }).customWidth);
  return Number.isFinite(customWidth) && customWidth > 0 ? customWidth : undefined;
}

function renderSummaryLabelShape(cx: number, cy: number, width: number, height: number, fill: string): string {
  const x = cx - width / 2;
  const y = cy - height / 2;
  const inset = Math.min(16, width * 0.08);
  const pointPairs: Array<[number, number]> = [
    [x + inset, y],
    [x + width - inset, y],
    [x + width, y + height / 2],
    [x + width - inset, y + height],
    [x + inset, y + height],
    [x, y + height / 2]
  ];
  const points = pointPairs.map(([pointX, pointY]) => `${round(pointX)},${round(pointY)}`).join(" ");

  return `<polygon points="${points}" fill="${escapeAttr(fill)}" stroke="none"/>`;
}

function getTextStartY(node: PositionedMindNode, image: RenderedNodeImage | undefined, fontSize: number, lineHeight: number): number {
  if (image?.align === "top" && node.lines.length) {
    return node.y - node.height / 2 + image.height + 43 + fontSize * 0.82;
  }

  const textBlockHeight = Math.max(0, node.lines.length - 1) * lineHeight + node.labelLines.length * 14;
  return node.y - textBlockHeight / 2 + fontSize * 0.35;
}

function renderMarker(node: PositionedMindNode, marker: string, index: number, image: RenderedNodeImage | undefined, theme: RenderTheme): string {
  const imageSpace = image && image.align !== "right" ? image.width + 12 : 0;
  const x = node.x - node.width / 2 + 12 + imageSpace + index * 18;
  const y = node.y - 8;

  if (marker.startsWith("task-")) {
    return `<rect x="${round(x)}" y="${round(y)}" width="16" height="16" rx="3" fill="none" stroke="${escapeAttr(theme.text)}" stroke-width="2"/>`;
  }

  if (marker.startsWith("priority-")) {
    const value = marker.replace("priority-", "").slice(0, 2);
    return `<circle cx="${round(x + 8)}" cy="${round(y + 8)}" r="7" fill="#ff4d4f"/>
    <text x="${round(x + 8)}" y="${round(y + 12)}" text-anchor="middle" fill="#ffffff" font-size="10" font-weight="700">${escapeText(value)}</text>`;
  }

  if (marker.startsWith("flag-")) {
    return `<path d="M ${round(x + 3)} ${round(y + 3)} L ${round(x + 3)} ${round(y + 15)}" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round"/>
    <path d="M ${round(x + 4)} ${round(y + 3)} L ${round(x + 14)} ${round(y + 5)} L ${round(x + 4)} ${round(y + 8)} Z" fill="#ff4d4f"/>`;
  }

  if (marker.startsWith("star-")) {
    const points = starPoints(x + 8, y + 8, 7, 3).map(([pointX, pointY]) => `${round(pointX)},${round(pointY)}`).join(" ");
    return `<polygon points="${points}" fill="#ff4d4f"/>`;
  }

  if (marker === "symbol-pin") {
    return `<circle cx="${round(x + 8)}" cy="${round(y + 6)}" r="4" fill="#ff4d4f"/>
    <path d="M ${round(x + 8)} ${round(y + 10)} L ${round(x + 8)} ${round(y + 16)}" stroke="#ff4d4f" stroke-width="2" stroke-linecap="round"/>`;
  }

  return "";
}

function getLeadingMarkers(node: PositionedMindNode): string[] {
  return node.node.markers?.filter(isVisibleMarker).slice(0, 3) ?? [];
}

function isVisibleMarker(marker: string): boolean {
  return marker.startsWith("task-") ||
    marker.startsWith("priority-") ||
    marker.startsWith("flag-") ||
    marker.startsWith("star-") ||
    marker === "symbol-pin";
}

function starPoints(cx: number, cy: number, outer: number, inner: number): Array<[number, number]> {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function estimateLabelWidth(text: string, fontSize: number): number {
  let width = 0;

  for (const char of text) {
    width += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(char)
      ? fontSize
      : fontSize * 0.56;
  }

  return width;
}

type RenderedNodeImage = {
  dataUri: string;
  width: number;
  height: number;
  align?: string;
};

function renderNodeImage(node: PositionedMindNode, image: RenderedNodeImage): string {
  if (!node.lines.length && !node.labelLines.length) {
    const x = node.x - image.width / 2;
    const y = node.y - image.height / 2;
    return `<image href="${escapeAttr(image.dataUri)}" x="${round(x)}" y="${round(y)}" width="${round(image.width)}" height="${round(image.height)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  if (image.align === "top") {
    const x = node.x - image.width / 2;
    const y = node.y - node.height / 2 + 11;
    return `<image href="${escapeAttr(image.dataUri)}" x="${round(x)}" y="${round(y)}" width="${round(image.width)}" height="${round(image.height)}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const x = image.align === "right"
    ? node.x + node.width / 2 - image.width - 12
    : node.x - node.width / 2 + 12;
  const y = node.y - image.height / 2;

  return `<image href="${escapeAttr(image.dataUri)}" x="${round(x)}" y="${round(y)}" width="${round(image.width)}" height="${round(image.height)}" preserveAspectRatio="xMidYMid meet"/>`;
}

function getNodeImage(node: PositionedMindNode, assets?: Record<string, MindAsset>): RenderedNodeImage | undefined {
  if (!node.node.image || !assets) {
    return undefined;
  }

  const asset = assets[node.node.image] ?? assets[`resources/${node.node.image.split("/").pop() ?? ""}`];
  if (!asset) {
    return undefined;
  }

  const rawImage = getRawImage(node);
  const rawWidth = Number(rawImage?.width);
  const rawHeight = Number(rawImage?.height);
  const align = typeof rawImage?.align === "string" ? rawImage.align : undefined;
  const { width, height } = constrainImageSize(node.node, rawWidth, rawHeight, align);

  return {
    dataUri: toDataUri(asset),
    width,
    height,
    align
  };
}

function findEmbeddedThumbnail(assets?: Record<string, MindAsset>): MindAsset | undefined {
  if (!assets) {
    return undefined;
  }

  return Object.values(assets).find(asset => {
    const id = asset.id.replace(/\\/g, "/").toLowerCase();
    return id === "thumbnails/thumbnail.png" || id.endsWith("/thumbnail.png");
  });
}

function getImageSize(asset: MindAsset): { width: number; height: number } | undefined {
  const data = asset.data;

  if (asset.mimeType === "image/png" && data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
    return {
      width: readUInt32BE(data, 16),
      height: readUInt32BE(data, 20)
    };
  }

  const svgSize = asset.mimeType === "image/svg+xml" ? getSvgImageSize(data) : undefined;
  return svgSize;
}

function getSvgImageSize(data: Uint8Array): { width: number; height: number } | undefined {
  const text = new TextDecoder().decode(data.slice(0, 512));
  const width = Number(text.match(/\bwidth="([0-9.]+)/)?.[1]);
  const height = Number(text.match(/\bheight="([0-9.]+)/)?.[1]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  return { width, height };
}

function readUInt32BE(data: Uint8Array, offset: number): number {
  return ((data[offset] ?? 0) * 0x1000000) +
    ((data[offset + 1] ?? 0) << 16) +
    ((data[offset + 2] ?? 0) << 8) +
    (data[offset + 3] ?? 0);
}

function getRawImage(node: PositionedMindNode): { width?: unknown; height?: unknown; align?: unknown } | undefined {
  const raw = node.node.raw;
  if (!raw || typeof raw !== "object" || !("image" in raw)) {
    return undefined;
  }

  const image = (raw as { image?: unknown }).image;
  return image && typeof image === "object" ? image as { width?: unknown; height?: unknown; align?: unknown } : undefined;
}

function constrainImageSize(node: MindNode, rawWidth: number, rawHeight: number, align?: string): { width: number; height: number } {
  const width = Number.isFinite(rawWidth) ? Math.max(16, rawWidth) : 32;
  const height = Number.isFinite(rawHeight) ? Math.max(16, rawHeight) : 32;
  const hasText = Boolean(node.title.trim());
  const isStacked = align === "top" || align === "bottom";
  const maxWidth = isStacked && (node.style?.fontSize ?? 0) >= 48
    ? 640
    : isStacked
      ? 140
      : hasText
        ? 140
        : 220;
  const maxHeight = isStacked && (node.style?.fontSize ?? 0) >= 48
    ? 340
    : isStacked
      ? 140
      : hasText
        ? 140
        : 220;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  return {
    width: width * scale,
    height: height * scale
  };
}

function toDataUri(asset: MindAsset): string {
  const mimeType = asset.mimeType ?? "application/octet-stream";
  return `data:${mimeType};base64,${bytesToBase64(asset.data)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function renderNodeShape(node: PositionedMindNode, fill: string, stroke: string, strokeWidth: number): string {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const shape = node.node.style?.shape ?? "";
  const common = `fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${round(strokeWidth)}"`;

  if (fill === "transparent" && strokeWidth <= 0) {
    return "";
  }

  if (shape === "xmind.branchLine" || shape.endsWith("underline")) {
    const lineY = node.y + node.height / 2 - 5;
    return `<line x1="${round(x + 4)}" y1="${round(lineY)}" x2="${round(x + node.width - 4)}" y2="${round(lineY)}" stroke="${escapeAttr(stroke)}" stroke-width="1.5" stroke-linecap="round"/>`;
  }

  if (shape.endsWith("hexagon")) {
    const inset = Math.min(18, node.width * 0.16);
    const pointPairs: Array<[number, number]> = [
      [x + inset, y],
      [x + node.width - inset, y],
      [x + node.width, y + node.height / 2],
      [x + node.width - inset, y + node.height],
      [x + inset, y + node.height],
      [x, y + node.height / 2]
    ];
    const points = pointPairs.map(([pointX, pointY]) => `${round(pointX)},${round(pointY)}`).join(" ");

    return `<polygon points="${points}" ${common}/>`;
  }

  const rx = shape.endsWith("ellipserect") ? node.height / 2 : Math.min(10, node.height / 4);
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(node.width)}" height="${round(node.height)}" rx="${round(rx)}" ${common}/>`;
}

function connectorStrokeWidth(parent: PositionedMindNode, node: PositionedMindNode, settings: RenderSettings): number {
  const rawWidth = parseSvgSize(getStyleProperties(node.node.raw)["line-width"]) ??
    parseSvgSize(getStyleProperties(parent.node.raw)["line-width"]) ??
    2;
  const depthFactor = node.depth <= 1 ? 1.08 : node.depth === 2 ? 0.9 : 0.66;
  const maxWidth = settings.connectorScale > 1 ? 6.4 : 7.2;
  return clamp(rawWidth * settings.connectorScale * depthFactor, 1.4, maxWidth);
}

function getStyleProperties(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || !("style" in raw)) {
    return {};
  }

  const style = (raw as { style?: unknown }).style;
  if (!style || typeof style !== "object" || !("properties" in style)) {
    return {};
  }

  const properties = (style as { properties?: unknown }).properties;
  return properties && typeof properties === "object" ? properties as Record<string, unknown> : {};
}

function parseSvgSize(value: unknown): number | undefined {
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

function getStyleString(value: unknown): string | undefined {
  return typeof value === "string" && value && value !== "none" && value !== "inherited"
    ? value
    : undefined;
}

function edgePoint(from: PositionedMindNode, to: PositionedMindNode): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: from.x + Math.sign(dx || 1) * from.width / 2,
      y: from.y
    };
  }

  return {
    x: from.x,
    y: from.y + Math.sign(dy || 1) * from.height / 2
  };
}

function isDarkColor(color: string): boolean {
  const normalized = color.trim();
  const match = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);

  if (!match) {
    return false;
  }

  const hex = match[1]?.length === 3
    ? match[1].split("").map(char => `${char}${char}`).join("")
    : match[1]?.slice(0, 6);

  if (!hex) {
    return false;
  }

  const red = parseInt(hex.slice(0, 2), 16);
  const green = parseInt(hex.slice(2, 4), 16);
  const blue = parseInt(hex.slice(4, 6), 16);
  return (red * 0.299 + green * 0.587 + blue * 0.114) < 145;
}

function adaptThemeToBackground(theme: RenderTheme, background: string): RenderTheme {
  if (!isDarkColor(background)) {
    return theme;
  }

  return {
    ...theme,
    background,
    rootFill: "transparent",
    rootStroke: "#F5FAFF",
    nodeFill: "transparent",
    nodeStroke: "#6f8fd7",
    text: "#F5FAFF",
    mutedText: "#A8B3C7",
    connector: "#6f8fd7",
    relationship: "#F5FAFF"
  };
}

function hasNoFillPattern(node: MindNode): boolean {
  const rawStyle = node.style?.raw;
  if (!rawStyle || typeof rawStyle !== "object" || !("properties" in rawStyle)) {
    return false;
  }

  const properties = (rawStyle as { properties?: unknown }).properties;
  if (!properties || typeof properties !== "object" || !("fill-pattern" in properties)) {
    return false;
  }

  return String((properties as { "fill-pattern"?: unknown })["fill-pattern"]) === "none";
}

function isFishboneRightHeaded(node: MindNode): boolean {
  const raw = node.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes("fishbone.rightHeaded");
}

function isOrgChartDown(node: MindNode): boolean {
  const raw = node.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes("org-chart.down");
}

function isTimelineThroughVertical(node: MindNode): boolean {
  const raw = node.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes("timeline.through.vertical");
}

function resolveNodeFontFamily(styleFontFamily: string | undefined, fallback: string): string {
  if (!styleFontFamily) {
    return fallback;
  }

  const families = styleFontFamily
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(quoteFontFamily);

  if (/NeverMind|Slackside/i.test(styleFontFamily)) {
    return [
      ...families,
      ...[
        "KaiTi",
        "STKaiti",
        "FangSong",
        "Microsoft YaHei",
        "Comic Sans MS"
      ].map(quoteFontFamily),
      fallback
    ].join(", ");
  }

  return [...families, fallback].join(", ");
}

function quoteFontFamily(fontFamily: string): string {
  const normalized = fontFamily.trim().replace(/^["']|["']$/g, "");

  if (!normalized) {
    return fontFamily;
  }

  return /\s/.test(normalized) ? `"${normalized.replace(/"/g, "\\\"")}"` : normalized;
}

function resolveTheme(theme: RenderSvgOptions["theme"]): RenderTheme {
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

function resolveRenderSettings(options: RenderSvgOptions, sheet?: MindDocument["sheets"][number]): RenderSettings {
  const preset = options.stylePreset === "xmind" ? XMIND_RENDER_SETTINGS : CLEAN_RENDER_SETTINGS;
  const settings = {
    ...preset,
    ...options.renderSettings
  };

  if (
    options.stylePreset === "xmind" &&
    !options.renderSettings?.relationshipStyle &&
    settings.relationshipStyle === "hidden" &&
    isRelationshipDrivenSheet(sheet)
  ) {
    return {
      ...settings,
      relationshipStyle: "xmind"
    };
  }

  return settings;
}

function isRelationshipDrivenSheet(sheet: MindDocument["sheets"][number] | undefined): boolean {
  if (!sheet) {
    return false;
  }

  const relationshipCount = sheet.relationships?.length ?? 0;
  const positionedFloatingTopics = (sheet.floatingTopics ?? []).filter(topic => topic.position).length;
  return relationshipCount >= 6 && positionedFloatingTopics >= 4;
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
