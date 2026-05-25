import type { MindLayout, MindLayoutDirection, MindNode, MindSheet, PositionedMindNode, RenderSvgOptions } from "../types";

type MeasuredNode = {
  node: MindNode;
  width: number;
  height: number;
  lines: string[];
  labelLines: string[];
};

type LayoutConfig = Required<Pick<RenderSvgOptions, "padding" | "horizontalGap" | "verticalGap" | "nodeMinWidth" | "nodeMaxWidth">> & {
  direction: MindLayoutDirection;
  rootArrangement: "alternating" | "clockwise";
};

const FISHBONE_RIB_JOINT_GAP = 132;
const FISHBONE_LEAF_STUB = 68;

const DEFAULT_CONFIG: LayoutConfig = {
  direction: "balanced",
  rootArrangement: "alternating",
  padding: 48,
  horizontalGap: 96,
  verticalGap: 22,
  nodeMinWidth: 112,
  nodeMaxWidth: 300
};

export function layoutMindMap(root: MindNode, options: RenderSvgOptions = {}): MindLayout {
  const config: LayoutConfig = {
    ...DEFAULT_CONFIG,
    ...pickLayoutOptions(options)
  };

  if (isFishboneRightHeaded(root)) {
    return layoutFishboneRight(root, config);
  }

  const nodes: PositionedMindNode[] = [];
  const byId = new Map<string, PositionedMindNode>();
  const rootMeasured = measureNode(root, config);
  const rootPositioned = placeNode(rootMeasured, undefined, 0, "root", 0, 0);
  nodes.push(rootPositioned);
  byId.set(root.id, rootPositioned);

  const rootChildren = root.children ?? [];
  const rootArrangement = inferRootArrangement(root);
  const sideConfig = rootArrangement === "clockwise"
    ? {
        ...config,
        horizontalGap: Math.max(config.horizontalGap, 160),
        verticalGap: Math.max(config.verticalGap, 42)
      }
    : config;
  const leftChildren = selectChildrenForSide(rootChildren, config.direction, "left", rootArrangement);
  const rightChildren = selectChildrenForSide(rootChildren, config.direction, "right", rootArrangement);

  placeRootSide(leftChildren, "left", rootMeasured, sideConfig, nodes, byId);
  placeRootSide(rightChildren, "right", rootMeasured, sideConfig, nodes, byId);

  return normalizeLayout(nodes, config.padding);
}

export function layoutMindSheet(sheet: MindSheet, options: RenderSvgOptions = {}): MindLayout {
  const config: LayoutConfig = {
    ...DEFAULT_CONFIG,
    ...pickLayoutOptions({
      ...options,
      direction: options.direction ?? inferDirection(sheet)
    })
  };
  const effectiveOptions: RenderSvgOptions = {
    ...options,
    direction: config.direction
  };
  const baseLayout = layoutMindMap(sheet.root, effectiveOptions);
  const nodes = baseLayout.nodes.map(node => ({ ...node }));
  const byId = new Map(nodes.map(node => [node.node.id, node]));
  const root = byId.get(sheet.root.id);

  if (!root) {
    return baseLayout;
  }

  if (options.preserveAttachedPositions && options.preserveAttachedPositions !== "none") {
    applyExplicitTopicPositions(sheet.root, nodes, byId, root, options.preserveAttachedPositions);
  }
  const rootPosition = sheet.root.position ?? { x: 0, y: 0 };
  const preserveFloatingPositions = shouldPreserveFloatingPositions(sheet);

  for (const floatingTopic of sheet.floatingTopics ?? []) {
    const floatingLayout = layoutMindMap(floatingTopic, {
      ...effectiveOptions,
      direction: "right",
      padding: 0
    });
    const floatingRoot = floatingLayout.byId.get(floatingTopic.id);

    if (!floatingRoot) {
      continue;
    }

    const targetX = root.x + (floatingTopic.position?.x ?? 0) - rootPosition.x;
    const targetY = root.y + (floatingTopic.position?.y ?? 0) - rootPosition.y;
    const deltaX = targetX - floatingRoot.x;
    const deltaY = targetY - floatingRoot.y;

    const positionedFloatingNodes = floatingLayout.nodes.map(positioned => ({
      ...positioned,
      x: positioned.x + deltaX,
      y: positioned.y + deltaY,
      side: positioned.depth === 0 ? "right" as const : positioned.side
    }));
    const floatingShiftY = preserveFloatingPositions
      ? 0
      : chooseDescendantShiftY(
          positionedFloatingNodes,
          nodes,
          48,
          360,
          targetY >= root.y ? "down" : "up"
        );
    const shiftedNodes = positionedFloatingNodes.map(positioned => ({
      ...positioned,
      y: positioned.y + floatingShiftY
    }));
    const floatingRootNode = shiftedNodes.find(positioned => positioned.node.id === floatingTopic.id);
    const descendantNodes = shiftedNodes.filter(positioned => positioned.node.id !== floatingTopic.id);
    const descendantShiftY = chooseDescendantShiftY(
      descendantNodes,
      [
        ...nodes,
        ...(floatingRootNode ? [floatingRootNode] : [])
      ],
      preserveFloatingPositions ? 28 : 8,
      preserveFloatingPositions ? 360 : 240,
      preserveFloatingPositions
        ? targetY >= root.y ? "down" : "up"
        : "any"
    );

    for (const positioned of shiftedNodes) {
      if (byId.has(positioned.node.id)) {
        continue;
      }

      const shifted = positioned.node.id === floatingTopic.id
        ? positioned
        : { ...positioned, y: positioned.y + descendantShiftY };
      nodes.push(shifted);
      byId.set(shifted.node.id, shifted);
    }
  }

  return normalizeLayout(nodes, config.padding);
}

function shouldPreserveFloatingPositions(sheet: MindSheet): boolean {
  const floatingTopics = sheet.floatingTopics ?? [];
  const positionedFloatingTopics = floatingTopics.filter(topic => topic.position).length;
  const relationshipCount = sheet.relationships?.length ?? 0;

  return positionedFloatingTopics >= 4 || relationshipCount >= 6;
}

function inferDirection(sheet: MindSheet): MindLayoutDirection {
  const rootRaw = sheet.root.raw;
  const structure = typeof rootRaw === "object" && rootRaw !== null && "structureClass" in rootRaw
    ? String((rootRaw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  if (structure.includes(".right")) {
    return "right";
  }

  if (structure.includes(".left")) {
    return "left";
  }

  return "balanced";
}

function isFishboneRightHeaded(root: MindNode): boolean {
  const raw = root.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes("fishbone.rightHeaded");
}

function inferRootArrangement(root: MindNode): LayoutConfig["rootArrangement"] {
  const raw = root.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes(".clockwise") ? "clockwise" : "alternating";
}

function layoutFishboneRight(root: MindNode, config: LayoutConfig): MindLayout {
  const nodes: PositionedMindNode[] = [];
  const byId = new Map<string, PositionedMindNode>();
  const rootMeasured = measureFishboneNode(root, config, 0);
  const rootPositioned = placeNode(rootMeasured, undefined, 0, "root", 0, 0);
  nodes.push(rootPositioned);
  byId.set(root.id, rootPositioned);

  const mainTopics = root.children ?? [];
  const pairGap = Math.max(410, config.horizontalGap * 4.25);
  const ribHeight = Math.max(320, config.verticalGap * 13.8);
  const rootLeft = -rootMeasured.width / 2;

  mainTopics.forEach((topic, index) => {
    const pairIndex = Math.floor(index / 2);
    const isTop = index % 2 === 0;
    const measured = measureFishboneNode(topic, config, 1);
    const jointX = rootLeft - 110 - pairIndex * pairGap;
    const x = jointX - 74;
    const y = isTop ? -ribHeight : ribHeight;
    const positioned = placeNode(measured, root.id, 1, "left", x, y);
    nodes.push(positioned);
    byId.set(topic.id, positioned);

    placeFishboneLeaves(topic, positioned, isTop, config, nodes, byId);
  });

  return normalizeLayout(nodes, config.padding);
}

function placeFishboneLeaves(
  topic: MindNode,
  parent: PositionedMindNode,
  isTop: boolean,
  config: LayoutConfig,
  nodes: PositionedMindNode[],
  byId: Map<string, PositionedMindNode>
): void {
  const children = topic.children ?? [];
  const childGap = Math.max(62, config.verticalGap * 2.7);
  const firstOffset = Math.max(84, parent.height * 1.08);
  const rib = fishboneLayoutRibGeometry(parent, isTop);

  children.forEach((child, index) => {
    const measured = measureFishboneNode(child, {
      ...config,
      nodeMaxWidth: Math.max(config.nodeMaxWidth, 360)
    }, 2);
    const y = isTop
      ? parent.y + firstOffset + index * childGap
      : parent.y - firstOffset - index * childGap;
    const leafRightX = fishboneLayoutRibXAtY(rib, y) - FISHBONE_LEAF_STUB;
    const positioned = placeNode(measured, topic.id, 2, "left", leafRightX - measured.width / 2, y);
    nodes.push(positioned);
    byId.set(child.id, positioned);

    if (child.children.length && !child.collapsed) {
      placeSubtree(
        child,
        topic.id,
        2,
        "left",
        leafRightX - measured.width - config.horizontalGap,
        y,
        config,
        nodes,
        byId
      );
    }
  });
}

type FishboneLayoutRib = {
  startX: number;
  startY: number;
  jointX: number;
  jointY: number;
};

function fishboneLayoutRibGeometry(node: PositionedMindNode, isTop: boolean): FishboneLayoutRib {
  return {
    startX: node.x,
    startY: node.y + (isTop ? node.height / 2 : -node.height / 2),
    jointX: node.x + node.width / 2 + FISHBONE_RIB_JOINT_GAP,
    jointY: 0
  };
}

function fishboneLayoutRibXAtY(rib: FishboneLayoutRib, y: number): number {
  if (Math.abs(rib.jointY - rib.startY) < 0.001) {
    return rib.jointX;
  }

  const t = clamp((y - rib.startY) / (rib.jointY - rib.startY), 0, 1);
  return rib.startX + (rib.jointX - rib.startX) * t;
}

function placeRootSide(
  children: MindNode[],
  side: "left" | "right",
  root: MeasuredNode,
  config: LayoutConfig,
  nodes: PositionedMindNode[],
  byId: Map<string, PositionedMindNode>
): void {
  if (!children.length) {
    return;
  }

  const subtreeHeights = children.map(child => measureSubtreeHeight(child, config));
  const totalHeight = subtreeHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, children.length - 1) * config.verticalGap;
  let cursorY = -totalHeight / 2;

  children.forEach((child, index) => {
    const childHeight = subtreeHeights[index] ?? 0;
    const centerY = cursorY + childHeight / 2;
    const x = side === "right"
      ? root.width / 2 + config.horizontalGap
      : -(root.width / 2 + config.horizontalGap);

    placeSubtree(child, root.node.id, 1, side, x, centerY, config, nodes, byId);
    cursorY += childHeight + config.verticalGap;
  });
}

function placeSubtree(
  node: MindNode,
  parentId: string,
  depth: number,
  side: "left" | "right",
  xAnchor: number,
  yCenter: number,
  config: LayoutConfig,
  nodes: PositionedMindNode[],
  byId: Map<string, PositionedMindNode>
): PositionedMindNode {
  const measured = measureNode(node, config);
  const x = side === "right" ? xAnchor + measured.width / 2 : xAnchor - measured.width / 2;
  const positioned = placeNode(measured, parentId, depth, side, x, yCenter);
  nodes.push(positioned);
  byId.set(node.id, positioned);

  const childNodes = node.children ?? [];
  if (!childNodes.length || node.collapsed) {
    return positioned;
  }

  const subtreeHeights = childNodes.map(child => measureSubtreeHeight(child, config));
  const totalHeight = subtreeHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, childNodes.length - 1) * config.verticalGap;
  let cursorY = yCenter - totalHeight / 2;
  const childXAnchor = side === "right"
    ? x + measured.width / 2 + config.horizontalGap
    : x - measured.width / 2 - config.horizontalGap;

  childNodes.forEach((child, index) => {
    const childHeight = subtreeHeights[index] ?? 0;
    const childCenterY = cursorY + childHeight / 2;
    placeSubtree(child, node.id, depth + 1, side, childXAnchor, childCenterY, config, nodes, byId);
    cursorY += childHeight + config.verticalGap;
  });

  return positioned;
}

function measureSubtreeHeight(node: MindNode, config: LayoutConfig): number {
  const measured = measureNode(node, config);

  if (!node.children.length || node.collapsed) {
    return measured.height;
  }

  const childrenHeight = node.children
    .map(child => measureSubtreeHeight(child, config))
    .reduce((sum, height) => sum + height, 0) + Math.max(0, node.children.length - 1) * config.verticalGap;

  return Math.max(measured.height, childrenHeight);
}

function measureFishboneNode(node: MindNode, config: LayoutConfig, depth: number): MeasuredNode {
  const fontScale = depth === 0 ? 1.12 : depth === 1 ? 1.22 : 1.08;
  const styledNode = withScaledFont(node, fontScale);
  const measured = measureNode(styledNode, config);

  if (depth === 0) {
    return {
      ...measured,
      width: Math.max(measured.width, 280),
      height: Math.max(measured.height, 76)
    };
  }

  if (depth === 1) {
    return {
      ...measured,
      width: Math.max(measured.width, 152),
      height: Math.max(measured.height, 58)
    };
  }

  return {
    ...measured,
    height: Math.max(measured.height, 42)
  };
}

function withScaledFont(node: MindNode, scale: number): MindNode {
  const currentFontSize = node.style?.fontSize;
  if (!currentFontSize || Math.abs(scale - 1) < 0.001) {
    return node;
  }

  return {
    ...node,
    style: {
      ...node.style,
      fontSize: currentFontSize * scale
    }
  };
}

function measureNode(node: MindNode, config: LayoutConfig): MeasuredNode {
  const text = node.title;
  const fontSize = node.style?.fontSize ?? 15;
  const lineHeight = Math.max(18, fontSize * 1.25);
  const charWidth = Math.max(7.5, fontSize * 0.82);
  const image = getRawImageInfo(node);
  const isStackedImage = image?.align === "top" || image?.align === "bottom";
  const inlineImageWidth = image && !isStackedImage && image.align !== "right" ? image.width + 12 : 0;
  const markerInlineWidth = hasLeadingMarker(node) ? 24 : 0;
  const nodeMaxWidth = Math.max(config.nodeMaxWidth, fontSize >= 72 ? 1120 : fontSize >= 32 ? 720 : config.nodeMaxWidth);
  const maxChars = Math.max(8, Math.floor((nodeMaxWidth - inlineImageWidth - markerInlineWidth) / charWidth));
  const lines = wrapText(text, maxChars, fontSize >= 48 ? 4 : 3);
  const labelLines = node.labels?.length ? [node.labels.slice(0, 3).join(" / ")] : [];
  const longestLineWidth = [...lines, ...labelLines].reduce((max, line) => Math.max(max, estimateTextWidth(line, fontSize)), 0);
  const isBranchLine = node.style?.shape === "xmind.branchLine";
  const imageOnly = Boolean(image && !lines.length && !labelLines.length);
  const textHeight = lines.length * lineHeight + labelLines.length * 16;
  const contentWidth = Math.max(
    longestLineWidth + inlineImageWidth + markerInlineWidth,
    isStackedImage ? image?.width ?? 0 : 0,
    imageOnly ? image?.width ?? 0 : 0
  );
  const minWidth = imageOnly ? image?.width ?? config.nodeMinWidth : isBranchLine ? 64 : config.nodeMinWidth;
  const width = clamp(contentWidth + (imageOnly ? 0 : isBranchLine ? 16 : 34), minWidth, Math.max(nodeMaxWidth, image?.width ?? 0));
  const height = imageOnly
    ? image?.height ?? 0
    : isStackedImage && image
      ? image.height + 14 + textHeight + (isBranchLine ? 8 : 22)
      : isBranchLine
        ? Math.max(image?.height ?? 0, 8 + textHeight)
        : Math.max(image?.height ?? 0, 22 + textHeight);

  return {
    node,
    width,
    height,
    lines,
    labelLines
  };
}

function placeNode(
  measured: MeasuredNode,
  parentId: string | undefined,
  depth: number,
  side: "left" | "right" | "root",
  x: number,
  y: number
): PositionedMindNode {
  return {
    node: measured.node,
    parentId,
    depth,
    side,
    x,
    y,
    width: measured.width,
    height: measured.height,
    lines: measured.lines,
    labelLines: measured.labelLines
  };
}

function selectChildrenForSide(
  children: MindNode[],
  direction: MindLayoutDirection,
  side: "left" | "right",
  arrangement: LayoutConfig["rootArrangement"]
): MindNode[] {
  if (direction === "right") {
    return side === "right" ? children : [];
  }

  if (direction === "left") {
    return side === "left" ? children : [];
  }

  if (arrangement === "clockwise") {
    const splitIndex = Math.ceil(children.length / 2);
    return side === "right"
      ? children.slice(0, splitIndex)
      : children.slice(splitIndex).reverse();
  }

  return children.filter((_, index) => side === "right" ? index % 2 === 0 : index % 2 === 1);
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const paragraphs = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!paragraphs.length) {
    return [];
  }

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let cursor = paragraph;

    while (cursor.length > maxChars && lines.length < maxLines - 1) {
      let breakAt = cursor.lastIndexOf(" ", maxChars);
      if (breakAt < Math.floor(maxChars * 0.5)) {
        breakAt = maxChars;
      }

      lines.push(cursor.slice(0, breakAt).trim());
      cursor = cursor.slice(breakAt).trim();
    }

    if (cursor) {
      lines.push(cursor);
    }

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const last = lines[lines.length - 1];
  if (last && last.length > maxChars) {
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trim()}...`;
  }

  return lines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function getRawImageInfo(node: MindNode): { width: number; height: number; align?: string } | undefined {
  const raw = node.raw;
  if (!raw || typeof raw !== "object" || !("image" in raw)) {
    return undefined;
  }

  const image = (raw as { image?: unknown }).image;
  if (!image || typeof image !== "object") {
    return undefined;
  }

  const width = Number((image as { width?: unknown }).width);
  const height = Number((image as { height?: unknown }).height);
  const align = typeof (image as { align?: unknown }).align === "string" ? (image as { align: string }).align : undefined;
  const size = constrainImageSize(node, width, height, align);

  return {
    ...size,
    align
  };
}

function hasLeadingMarker(node: MindNode): boolean {
  return Boolean(node.markers?.some(isVisibleMarker));
}

function isVisibleMarker(marker: string): boolean {
  return marker.startsWith("task-") ||
    marker.startsWith("priority-") ||
    marker.startsWith("flag-") ||
    marker.startsWith("star-") ||
    marker.startsWith("symbol-pin");
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

function pickLayoutOptions(options: RenderSvgOptions): Partial<LayoutConfig> {
  return {
    ...(options.direction !== undefined ? { direction: options.direction } : {}),
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.horizontalGap !== undefined ? { horizontalGap: options.horizontalGap } : {}),
    ...(options.verticalGap !== undefined ? { verticalGap: options.verticalGap } : {}),
    ...(options.nodeMinWidth !== undefined ? { nodeMinWidth: options.nodeMinWidth } : {}),
    ...(options.nodeMaxWidth !== undefined ? { nodeMaxWidth: options.nodeMaxWidth } : {})
  };
}

function applyExplicitTopicPositions(
  rootNode: MindNode,
  nodes: PositionedMindNode[],
  byId: Map<string, PositionedMindNode>,
  root: PositionedMindNode,
  policy: NonNullable<RenderSvgOptions["preserveAttachedPositions"]>
): void {
  const rootPosition = rootNode.position ?? { x: 0, y: 0 };
  const positionScale = inferExplicitPositionScale(rootNode);
  const positionedTopics = collectPositionedTopics(rootNode)
    .filter(item => item.node.id !== rootNode.id && item.node.position)
    .filter(item => policy === "all" || item.depth === 1)
    .sort((a, b) => a.depth - b.depth);

  for (const item of positionedTopics) {
    const positioned = byId.get(item.node.id);

    if (!positioned || !item.node.position) {
      continue;
    }

    const scale = item.depth >= 2 ? positionScale : Math.min(positionScale, 1.08);
    const targetX = root.x + (item.node.position.x - rootPosition.x) * scale;
    const targetY = root.y + (item.node.position.y - rootPosition.y) * scale;
    const deltaX = targetX - positioned.x;
    const deltaY = targetY - positioned.y;

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      continue;
    }

    const descendantIds = collectDescendantIds(item.node);
    const nextSide = targetX < root.x ? "left" : "right";

    for (const node of nodes) {
      if (!descendantIds.has(node.node.id)) {
        continue;
      }

      node.x += deltaX;
      node.y += deltaY;

      if (node.side !== "root") {
        node.side = nextSide;
      }
    }
  }
}

function inferExplicitPositionScale(root: MindNode): number {
  const raw = root.raw;
  const structure = typeof raw === "object" && raw !== null && "structureClass" in raw
    ? String((raw as { structureClass?: unknown }).structureClass ?? "")
    : "";

  return structure.includes(".clockwise") ? 1.14 : 1;
}

function collectPositionedTopics(node: MindNode, depth = 0): Array<{ node: MindNode; depth: number }> {
  return [
    { node, depth },
    ...node.children.flatMap(child => collectPositionedTopics(child, depth + 1))
  ];
}

function collectDescendantIds(node: MindNode, ids = new Set<string>()): Set<string> {
  ids.add(node.id);

  for (const child of node.children) {
    collectDescendantIds(child, ids);
  }

  return ids;
}

function normalizeLayout(nodes: PositionedMindNode[], padding: number): MindLayout {
  const bounds = calculateBounds(nodes);
  const shiftX = padding - bounds.minX;
  const shiftY = padding - bounds.minY;

  for (const positioned of nodes) {
    positioned.x += shiftX;
    positioned.y += shiftY;
  }

  return {
    width: Math.ceil(bounds.maxX - bounds.minX + padding * 2),
    height: Math.ceil(bounds.maxY - bounds.minY + padding * 2),
    nodes,
    byId: new Map(nodes.map(node => [node.node.id, node]))
  };
}

function calculateBounds(nodes: PositionedMindNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return nodes.reduce(
    (acc, positioned) => ({
      minX: Math.min(acc.minX, positioned.x - positioned.width / 2),
      maxX: Math.max(acc.maxX, positioned.x + positioned.width / 2),
      minY: Math.min(acc.minY, positioned.y - positioned.height / 2),
      maxY: Math.max(acc.maxY, positioned.y + positioned.height / 2)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
}

function chooseDescendantShiftY(
  descendants: PositionedMindNode[],
  blockers: PositionedMindNode[],
  gap = 8,
  maxShift = 240,
  preferredDirection: "any" | "down" | "up" = "any"
): number {
  if (!descendants.length || !blockers.length) {
    return 0;
  }

  const candidates = [0];
  const amounts = Array.from({ length: Math.floor(maxShift / 16) }, (_, index) => (index + 1) * 16);
  if (preferredDirection === "down") {
    candidates.push(...amounts, ...amounts.map(amount => -amount));
  } else if (preferredDirection === "up") {
    candidates.push(...amounts.map(amount => -amount), ...amounts);
  } else {
    for (const amount of amounts) {
      candidates.push(amount, -amount);
    }
  }

  return candidates.find(deltaY => !hasOverlap(descendants, blockers, deltaY, gap)) ?? 0;
}

function hasOverlap(descendants: PositionedMindNode[], blockers: PositionedMindNode[], deltaY: number, gap: number): boolean {
  return descendants.some(descendant => blockers.some(blocker => overlaps(
    { ...descendant, y: descendant.y + deltaY },
    blocker,
    gap
  )));
}

function overlaps(a: PositionedMindNode, b: PositionedMindNode, gap: number): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap;
}
