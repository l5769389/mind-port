export type MindSourceFormat = "xmind" | "processon" | "auto";

export type DiagramSourceFormat = "processon" | "auto";

export type MindPortCompatibilityMode = "preview" | "semantic" | "editable";

export type MindPortWarning = {
  code: string;
  message: string;
  path?: string;
  severity?: "info" | "warning";
};

export type MindLayoutDirection = "balanced" | "right" | "left";

export type MindAsset = {
  id: string;
  name: string;
  mimeType?: string;
  data: Uint8Array;
};

export type MindStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  shape?: string;
  raw?: unknown;
};

export type MindPosition = {
  x: number;
  y: number;
};

export type MindNode = {
  id: string;
  title: string;
  children: MindNode[];
  notes?: string;
  labels?: string[];
  markers?: string[];
  summaries?: MindSummary[];
  boundaries?: MindBoundary[];
  image?: string;
  style?: MindStyle;
  position?: MindPosition;
  collapsed?: boolean;
  raw?: unknown;
};

export type MindRelationship = {
  id: string;
  from: string;
  to: string;
  title?: string;
  raw?: unknown;
};

export type MindSummary = {
  id: string;
  title: string;
  range?: {
    start: number;
    end: number;
  };
  style?: MindStyle;
  lineStyle?: MindStyle;
  position?: MindPosition;
  raw?: unknown;
};

export type MindBoundary = {
  id: string;
  title?: string;
  range?: {
    start: number;
    end: number;
  };
  style?: MindStyle;
  raw?: unknown;
};

export type MindSheet = {
  id: string;
  title: string;
  root: MindNode;
  style?: MindStyle;
  summaries?: MindSummary[];
  floatingTopics?: MindNode[];
  relationships?: MindRelationship[];
  raw?: unknown;
};

export type MindDocument = {
  sourceFormat: Exclude<MindSourceFormat, "auto">;
  sheets: MindSheet[];
  assets?: Record<string, MindAsset>;
  raw?: unknown;
};

export type ParseMindOptions = {
  format?: MindSourceFormat;
  fileName?: string;
};

export type MindFileInput = ArrayBuffer | Uint8Array | Blob | string | object;

export type RenderTheme = {
  background: string;
  rootFill: string;
  rootStroke: string;
  nodeFill: string;
  nodeStroke: string;
  text: string;
  mutedText: string;
  connector: string;
  relationship: string;
};

export type RenderSvgOptions = {
  sheetIndex?: number;
  renderMode?: "semantic" | "thumbnail" | "auto";
  stylePreset?: "clean" | "xmind";
  renderSettings?: Partial<RenderSettings>;
  preserveAttachedPositions?: "none" | "top-level" | "all";
  direction?: MindLayoutDirection;
  padding?: number;
  horizontalGap?: number;
  verticalGap?: number;
  nodeMinWidth?: number;
  nodeMaxWidth?: number;
  fontFamily?: string;
  theme?: "default" | "ink" | Partial<RenderTheme>;
  includeXmlDeclaration?: boolean;
};

export type RenderSettings = {
  connectorScale: number;
  showBoundaries: boolean;
  showGroupBackgrounds: boolean;
  boundaryOpacity: number;
  groupBackgroundOpacity: number;
  relationshipStyle: "clean" | "xmind" | "hidden";
};

export type DiagramPoint = {
  x: number;
  y: number;
};

export type DiagramStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  dashed?: boolean;
  opacity?: number;
  arrowStart?: string;
  arrowEnd?: string;
  raw?: unknown;
};

export type DiagramShapeKind =
  | "rectangle"
  | "roundRectangle"
  | "ellipse"
  | "diamond"
  | "parallelogram"
  | "hexagon"
  | "swimlane"
  | "container"
  | "image"
  | "text"
  | "unknown";

export type DiagramShape = {
  id: string;
  title: string;
  kind: DiagramShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  image?: string;
  style?: DiagramStyle;
  raw?: unknown;
};

export type DiagramConnector = {
  id: string;
  from?: string;
  to?: string;
  title?: string;
  points: DiagramPoint[];
  style?: DiagramStyle;
  raw?: unknown;
};

export type DiagramPage = {
  id: string;
  title: string;
  width?: number;
  height?: number;
  background?: string;
  shapes: DiagramShape[];
  connectors: DiagramConnector[];
  raw?: unknown;
};

export type DiagramDocument = {
  sourceFormat: Exclude<DiagramSourceFormat, "auto">;
  pages: DiagramPage[];
  assets?: Record<string, MindAsset>;
  raw?: unknown;
};

export type ParseDiagramOptions = {
  format?: DiagramSourceFormat;
  fileName?: string;
};

export type RenderDiagramOptions = {
  pageIndex?: number;
  padding?: number;
  fontFamily?: string;
  includeXmlDeclaration?: boolean;
  theme?: "default" | "ink" | Partial<RenderTheme>;
};

export type MindPortDocument =
  | {
      kind: "mind";
      document: MindDocument;
      warnings?: MindPortWarning[];
    }
  | {
      kind: "diagram";
      document: DiagramDocument;
      warnings?: MindPortWarning[];
    };

export type ParseFileOptions = {
  format?: MindSourceFormat;
  fileName?: string;
  kind?: "auto" | "mind" | "diagram";
};

export type RenderDocumentOptions = RenderSvgOptions & RenderDiagramOptions & {
  compatibilityMode?: MindPortCompatibilityMode;
};

export type RenderFileOptions = ParseFileOptions & RenderDocumentOptions;

export type PositionedMindNode = {
  node: MindNode;
  parentId?: string;
  depth: number;
  side: "left" | "right" | "root";
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  labelLines: string[];
};

export type MindLayout = {
  width: number;
  height: number;
  nodes: PositionedMindNode[];
  byId: Map<string, PositionedMindNode>;
};
