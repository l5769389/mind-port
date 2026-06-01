import JSZip from "jszip";
import {
  parseDiagramFile,
  parseMindFile,
  renderDiagramToSvg,
  renderToSvg,
  type DiagramDocument,
  type MindDocument,
  type MindLayoutDirection,
  type MindNode,
  type MindStructureStyle,
  type ProcessOnStylePreset,
  type RenderSvgOptions
} from "../src";

const input = requiredElement<HTMLInputElement>("#file-input");
const xmindButton = requiredElement<HTMLButtonElement>("#sample-xmind");
const processOnButton = requiredElement<HTMLButtonElement>("#sample-processon");
const renderModeSelect = requiredElement<HTMLSelectElement>("#render-mode");
const directionSelect = requiredElement<HTMLSelectElement>("#direction");
const selectedStructureLabel = requiredElement<HTMLElement>("#selected-structure-label");
const selectedStructureIcon = requiredElement<HTMLElement>(".selected-skeleton .mini-skeleton");
const sameLevelAlign = requiredElement<HTMLInputElement>("#same-level-align");
const hideCentralTopic = requiredElement<HTMLInputElement>("#hide-central-topic");
const freeBranchLayout = requiredElement<HTMLInputElement>("#free-branch-layout");
const topicSpacingSelect = requiredElement<HTMLSelectElement>("#topic-spacing");
const watermarkModeSelect = requiredElement<HTMLSelectElement>("#watermark-mode");
const backgroundModeSelect = requiredElement<HTMLSelectElement>("#background-mode");
const canvasBackgroundInput = requiredElement<HTMLInputElement>("#canvas-background");
const styleTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-style-tab]"));
const styleTabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-style-panel]"));
const structureStyleInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="structure-style"]'));
const processOnStyleInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="processon-style"]'));
const svgHost = requiredElement<HTMLDivElement>("#svg-host");
const zoomOut = requiredElement<HTMLButtonElement>("#zoom-out");
const zoomIn = requiredElement<HTMLButtonElement>("#zoom-in");
const zoomReset = requiredElement<HTMLButtonElement>("#zoom-reset");
const zoomValue = requiredElement<HTMLOutputElement>("#zoom-value");
const meta = requiredElement<HTMLPreElement>("#meta");

type RenderModeOption = NonNullable<RenderSvgOptions["renderMode"]> | "compare";
type BackgroundMode = "file" | "white" | "transparent" | "custom";
type TopicSpacing = "compact" | "normal" | "loose";
type DemoSettings = {
  renderMode: RenderModeOption;
  direction: MindLayoutDirection;
  selectedStructureStyle: MindStructureStyle;
  structureStyle: MindStructureStyle;
  processOnStyle: ProcessOnStylePreset;
  backgroundMode: BackgroundMode;
  canvasBackground?: string;
  hideCentralTopic: boolean;
  sameLevelAlign: boolean;
  freeBranchLayout: boolean;
  topicSpacing: TopicSpacing;
  watermark: NonNullable<RenderSvgOptions["watermark"]>;
  preserveAttachedPositions: NonNullable<RenderSvgOptions["preserveAttachedPositions"]>;
  horizontalGap: number;
  verticalGap: number;
};

const STRUCTURE_LABELS: Record<string, string> = {
  "auto": "按文件样式",
  "mindmap-balanced": "基础思维导图 · 两侧",
  "mindmap-left": "基础思维导图 · 向左",
  "mindmap-right": "基础思维导图 · 向右",
  "logic-left": "逻辑图 · 向左",
  "logic-right": "逻辑图 · 向右",
  "tree-left": "树形图 · 向左",
  "tree-right": "树形图 · 向右",
  "org-down": "组织结构图 · 向下",
  "org-up": "组织结构图 · 向上",
  "fishbone-left": "鱼骨图 · 向左",
  "fishbone-right": "鱼骨图 · 向右",
  "timeline-horizontal": "水平时间轴",
  "timeline-vertical": "纵向时间轴"
};

const STRUCTURE_ICON_CLASSES: Record<string, string> = {
  "auto": "skeleton-balanced",
  "mindmap-balanced": "skeleton-balanced",
  "mindmap-left": "skeleton-right",
  "mindmap-right": "skeleton-right",
  "logic-left": "skeleton-logic",
  "logic-right": "skeleton-logic",
  "tree-left": "skeleton-tree",
  "tree-right": "skeleton-tree",
  "org-down": "skeleton-org",
  "org-up": "skeleton-org-up",
  "fishbone-left": "skeleton-fishbone",
  "fishbone-right": "skeleton-fishbone",
  "timeline-horizontal": "skeleton-timeline",
  "timeline-vertical": "skeleton-time-vertical"
};

let currentMindDocument: MindDocument | undefined;
let currentDiagramDocument: DiagramDocument | undefined;
let currentFileName = "";
let scale = 1;
let translateX = 0;
let translateY = 0;
let dragStart: { pointerId: number; x: number; y: number; translateX: number; translateY: number } | undefined;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Demo DOM is missing ${selector}.`);
  }

  return element;
}

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  await loadDocument(file, file.name);
});

xmindButton.addEventListener("click", async () => {
  const archive = await createSampleXMind();
  await loadDocument(archive, "sample.xmind");
});

processOnButton.addEventListener("click", async () => {
  await loadDocument(JSON.stringify(createSampleProcessOnDiagram(), null, 2), "sample.pos", "diagram");
});

renderModeSelect.addEventListener("change", () => renderCurrent());
directionSelect.addEventListener("change", () => renderCurrent());
sameLevelAlign.addEventListener("change", () => renderCurrent());
hideCentralTopic.addEventListener("change", () => renderCurrent());
freeBranchLayout.addEventListener("change", () => renderCurrent());
topicSpacingSelect.addEventListener("change", () => renderCurrent());
watermarkModeSelect.addEventListener("change", () => renderCurrent());
backgroundModeSelect.addEventListener("change", () => renderCurrent());
canvasBackgroundInput.addEventListener("input", () => {
  backgroundModeSelect.value = "custom";
  renderCurrent();
});

for (const inputElement of structureStyleInputs) {
  inputElement.addEventListener("change", () => renderCurrent());
}

for (const inputElement of processOnStyleInputs) {
  inputElement.addEventListener("change", () => renderCurrent());
}

for (const button of styleTabButtons) {
  button.addEventListener("click", () => {
    const tab = button.dataset.styleTab;
    for (const tabButton of styleTabButtons) {
      const isActive = tabButton === button;
      tabButton.classList.toggle("is-active", isActive);
      tabButton.setAttribute("aria-selected", String(isActive));
    }
    for (const panel of styleTabPanels) {
      panel.classList.toggle("is-active", panel.dataset.stylePanel === tab);
    }
  });
}

svgHost.addEventListener("pointerdown", event => {
  if (event.button !== 0) {
    return;
  }

  svgHost.setPointerCapture(event.pointerId);
  svgHost.classList.add("dragging");
  dragStart = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    translateX,
    translateY
  };
});
svgHost.addEventListener("pointermove", event => {
  if (!dragStart || dragStart.pointerId !== event.pointerId) {
    return;
  }

  translateX = dragStart.translateX + event.clientX - dragStart.x;
  translateY = dragStart.translateY + event.clientY - dragStart.y;
  applyTransform();
});
svgHost.addEventListener("pointerup", stopDrag);
svgHost.addEventListener("pointercancel", stopDrag);
svgHost.addEventListener("wheel", event => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0014);
  zoomAt(scale * factor, event.clientX, event.clientY);
}, { passive: false });
zoomOut.addEventListener("click", () => zoomFromCenter(scale / 1.18));
zoomIn.addEventListener("click", () => zoomFromCenter(scale * 1.18));
zoomReset.addEventListener("click", fitView);
window.addEventListener("resize", fitView);

if ("ResizeObserver" in window) {
  new ResizeObserver(fitView).observe(svgHost);
}

void loadDocument(JSON.stringify(createSampleProcessOnMind(), null, 2), "sample.pos");

async function loadDocument(inputData: Blob | ArrayBuffer | string, fileName: string, preferred: "auto" | "diagram" = "auto"): Promise<void> {
  try {
    meta.textContent = "Parsing...";
    currentFileName = fileName;
    currentMindDocument = undefined;
    currentDiagramDocument = undefined;

    if (preferred === "diagram") {
      currentDiagramDocument = await parseDiagramFile(inputData, { fileName });
    } else {
      try {
        currentMindDocument = await parseMindFile(inputData, { fileName });
      } catch (mindError) {
        try {
          currentDiagramDocument = await parseDiagramFile(inputData, { fileName });
        } catch {
          throw mindError;
        }
      }
    }

    renderCurrent();
  } catch (error) {
    svgHost.innerHTML = `<div class="empty">解析失败</div>`;
    meta.textContent = error instanceof Error ? error.message : String(error);
  }
}

function readDemoSettings(): DemoSettings {
  const direction = directionSelect.value as MindLayoutDirection;
  const selectedStructureStyle = selectedRadioValue<MindStructureStyle>(structureStyleInputs, "mindmap-balanced");
  const structureStyle = resolvePanelStructureStyle(selectedStructureStyle, direction);
  const processOnStyle = selectedRadioValue<ProcessOnStylePreset>(processOnStyleInputs, "file");
  const topicSpacing = topicSpacingSelect.value as TopicSpacing;
  const gap = spacingFor(topicSpacing, sameLevelAlign.checked);
  const backgroundMode = backgroundModeSelect.value as BackgroundMode;

  updateStructurePreview(structureStyle);

  return {
    renderMode: renderModeSelect.value as RenderModeOption,
    direction,
    selectedStructureStyle,
    structureStyle,
    processOnStyle,
    backgroundMode,
    canvasBackground: resolveCanvasBackground(backgroundMode),
    hideCentralTopic: hideCentralTopic.checked,
    sameLevelAlign: sameLevelAlign.checked,
    freeBranchLayout: freeBranchLayout.checked,
    topicSpacing,
    watermark: watermarkModeSelect.value as NonNullable<RenderSvgOptions["watermark"]>,
    preserveAttachedPositions: freeBranchLayout.checked ? "all" : "top-level",
    ...gap
  };
}

function selectedRadioValue<T extends string>(inputs: HTMLInputElement[], fallback: T): T {
  return (inputs.find(inputElement => inputElement.checked)?.value ?? fallback) as T;
}

function resolvePanelStructureStyle(selected: MindStructureStyle, direction: MindLayoutDirection): MindStructureStyle {
  if (selected.startsWith("mindmap-")) {
    return direction === "left"
      ? "mindmap-left"
      : direction === "right"
        ? "mindmap-right"
        : "mindmap-balanced";
  }

  if (selected.startsWith("logic-")) {
    return direction === "left" ? "logic-left" : "logic-right";
  }

  if (selected.startsWith("tree-")) {
    return direction === "left" ? "tree-left" : "tree-right";
  }

  if (selected.startsWith("fishbone-")) {
    return direction === "right" ? "fishbone-right" : "fishbone-left";
  }

  return selected;
}

function resolveCanvasBackground(backgroundMode: BackgroundMode): string | undefined {
  if (backgroundMode === "white") {
    return "#ffffff";
  }

  if (backgroundMode === "transparent") {
    return "transparent";
  }

  if (backgroundMode === "custom") {
    return canvasBackgroundInput.value;
  }

  return undefined;
}

function spacingFor(spacing: TopicSpacing, alignSameLevel: boolean): Pick<DemoSettings, "horizontalGap" | "verticalGap"> {
  const preset = spacing === "compact"
    ? { horizontalGap: 72, verticalGap: 14 }
    : spacing === "loose"
      ? { horizontalGap: 138, verticalGap: 34 }
      : { horizontalGap: 96, verticalGap: 22 };

  return {
    horizontalGap: preset.horizontalGap,
    verticalGap: alignSameLevel ? Math.max(22, preset.verticalGap) : preset.verticalGap
  };
}

function updateStructurePreview(structureStyle: MindStructureStyle): void {
  selectedStructureLabel.textContent = STRUCTURE_LABELS[structureStyle] ?? structureStyle;
  const nextClass = STRUCTURE_ICON_CLASSES[structureStyle] ?? "skeleton-balanced";
  selectedStructureIcon.className = `mini-skeleton ${nextClass}`;
}

function renderCurrent(): void {
  if (currentDiagramDocument) {
    renderDiagramCurrent();
    return;
  }

  if (!currentMindDocument) {
    return;
  }

  const settings = readDemoSettings();
  const baseOptions: RenderSvgOptions = {
    direction: settings.direction,
    structureStyle: settings.structureStyle,
    processOnStyle: settings.processOnStyle,
    stylePreset: currentMindDocument.sourceFormat === "processon" ? "processon" as const : "xmind" as const,
    preserveAttachedPositions: settings.preserveAttachedPositions,
    canvasBackground: settings.canvasBackground,
    hideCentralTopic: settings.hideCentralTopic,
    watermark: settings.watermark,
    horizontalGap: settings.horizontalGap,
    verticalGap: settings.verticalGap
  };

  if (settings.renderMode === "compare") {
    const semanticSvg = renderToSvg(currentMindDocument, {
      ...baseOptions,
      padding: 56,
      renderMode: "semantic"
    });
    const thumbnailSvg = renderToSvg(currentMindDocument, {
      padding: 0,
      renderMode: "thumbnail"
    });
    svgHost.innerHTML = `<div class="canvas-content compare-content">
      <section class="compare-panel"><h2>语义渲染</h2>${semanticSvg}</section>
      <section class="compare-panel"><h2>官方缩略图</h2>${thumbnailSvg}</section>
    </div>`;
  } else {
    const svg = renderToSvg(currentMindDocument, {
      ...baseOptions,
      padding: settings.renderMode === "thumbnail" ? 0 : 56,
      renderMode: settings.renderMode
    });
    svgHost.innerHTML = `<div class="canvas-content">${svg}</div>`;
  }

  requestAnimationFrame(fitView);

  const sheet = currentMindDocument.sheets[0];
  meta.textContent = JSON.stringify({
    fileName: currentFileName,
    kind: "mind",
    sourceFormat: currentMindDocument.sourceFormat,
    renderMode: settings.renderMode,
    direction: settings.direction,
    selectedStructureStyle: settings.selectedStructureStyle,
    structureStyle: settings.structureStyle,
    processOnStyle: settings.processOnStyle,
    backgroundMode: settings.backgroundMode,
    canvasBackground: settings.canvasBackground ?? "file",
    hideCentralTopic: settings.hideCentralTopic,
    sameLevelAlign: settings.sameLevelAlign,
    freeBranchLayout: settings.freeBranchLayout,
    topicSpacing: settings.topicSpacing,
    watermark: settings.watermark,
    sheets: currentMindDocument.sheets.length,
    activeSheet: sheet?.title,
    root: sheet?.root.title,
    nodes: sheet ? countNodes(sheet.root) : 0,
    floatingTopics: sheet?.floatingTopics?.length ?? 0,
    relationships: sheet?.relationships?.length ?? 0
  }, null, 2);
}

function renderDiagramCurrent(): void {
  if (!currentDiagramDocument) {
    return;
  }

  const svg = renderDiagramToSvg(currentDiagramDocument, {
    padding: 56
  });
  svgHost.innerHTML = `<div class="canvas-content">${svg}</div>`;
  requestAnimationFrame(fitView);

  const page = currentDiagramDocument.pages[0];
  meta.textContent = JSON.stringify({
    fileName: currentFileName,
    kind: "diagram",
    sourceFormat: currentDiagramDocument.sourceFormat,
    pages: currentDiagramDocument.pages.length,
    activePage: page?.title,
    shapes: page?.shapes.length ?? 0,
    connectors: page?.connectors.length ?? 0
  }, null, 2);
}

function stopDrag(event: PointerEvent): void {
  if (dragStart?.pointerId === event.pointerId) {
    dragStart = undefined;
    svgHost.classList.remove("dragging");
  }
}

function canvasContent(): HTMLDivElement | undefined {
  return svgHost.querySelector<HTMLDivElement>(".canvas-content") ?? undefined;
}

function fitView(): void {
  const content = canvasContent();
  if (!content) {
    return;
  }

  const rect = svgHost.getBoundingClientRect();
  const size = contentSize(content);
  scale = clampScale(Math.min(1, (rect.width - 48) / size.width, (rect.height - 48) / size.height));
  translateX = (rect.width - size.width * scale) / 2;
  translateY = (rect.height - size.height * scale) / 2;
  applyTransform();
}

function contentSize(content: HTMLDivElement): { width: number; height: number } {
  const svgs = Array.from(content.querySelectorAll<SVGSVGElement>("svg"));
  if (!svgs.length) {
    return { width: 1, height: 1 };
  }

  if (content.classList.contains("compare-content")) {
    const sizes = svgs.map(svgIntrinsicSize);
    return {
      width: sizes.reduce((sum, size) => sum + size.width, 0) + Math.max(0, sizes.length - 1) * 24,
      height: Math.max(...sizes.map(size => size.height)) + 42
    };
  }

  return svgIntrinsicSize(svgs[0]);
}

function svgIntrinsicSize(svg: SVGSVGElement | undefined): { width: number; height: number } {
  if (!svg) {
    return { width: 1, height: 1 };
  }

  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number);
  const viewBoxWidth = viewBox && Number.isFinite(viewBox[2]) ? viewBox[2] ?? 0 : 0;
  const viewBoxHeight = viewBox && Number.isFinite(viewBox[3]) ? viewBox[3] ?? 0 : 0;

  return {
    width: Number(svg.getAttribute("width")) || viewBoxWidth || svg.getBoundingClientRect().width || 1,
    height: Number(svg.getAttribute("height")) || viewBoxHeight || svg.getBoundingClientRect().height || 1
  };
}

function applyTransform(): void {
  const content = canvasContent();
  if (!content) {
    return;
  }

  content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  zoomValue.textContent = `${Math.round(scale * 100)}%`;
}

function zoomFromCenter(nextScale: number): void {
  const rect = svgHost.getBoundingClientRect();
  zoomAt(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function zoomAt(nextScale: number, clientX: number, clientY: number): void {
  const rect = svgHost.getBoundingClientRect();
  const pointX = clientX - rect.left;
  const pointY = clientY - rect.top;
  const contentX = (pointX - translateX) / scale;
  const contentY = (pointY - translateY) / scale;
  scale = clampScale(nextScale);
  translateX = pointX - contentX * scale;
  translateY = pointY - contentY * scale;
  applyTransform();
}

function clampScale(value: number): number {
  return Math.min(4, Math.max(0.08, value));
}

function countNodes(node: MindNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

async function createSampleXMind(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("content.json", JSON.stringify([
    {
      id: "sheet-1",
      title: "XMind MVP",
      rootTopic: {
        id: "root",
        title: "MindPort",
        children: {
          attached: [
            {
              id: "parse",
              title: "解析 XMind",
              labels: ["content.json"],
              children: {
                attached: [
                  { id: "zip", title: "读取 zip 包" },
                  { id: "topic", title: "转换 topic 树" }
                ]
              }
            },
            {
              id: "render",
              title: "SVG 渲染",
              children: {
                attached: [
                  { id: "layout", title: "基础左右布局" },
                  { id: "export", title: "输出可嵌入 SVG" }
                ]
              }
            }
          ]
        }
      },
      relationships: [
        { id: "rel-1", end1Id: "parse", end2Id: "render", title: "AST" }
      ]
    }
  ]));

  return zip.generateAsync({ type: "arraybuffer" });
}

function createSampleProcessOnMind(): object {
  return {
    diagram: {
      elements: {
        title: "ProcessOn MVP",
        id: "root",
        root: true,
        structure: "mind_ishikawa_left",
        theme: {
          background: "#F7E9DF",
          common: { family: "Georgia" },
          connectionStyle: { lineColor: "#68524C", lineWidth: 2, lineType: "roundBroken" },
          centerTopic: { backgroundColor: "#3B634E", color: "#ffffff", "font-size": "25px", "border-color": "#50C28B", "border-width": "2px", "border-radius": "5px" },
          secTopic: { backgroundColor: "#AA0C23", color: "#ffffff", "font-size": "15px", "border-radius": "6px" },
          childTopic: { color: "#68524C", "font-size": "13px" },
          floatingTopic: { backgroundColor: "#AA0C23", color: "#ffffff", "font-size": "15px", "border-radius": "5px" }
        },
        children: [
          {
            id: "processon",
            title: "解析 ProcessOn POS",
            labels: ["JSON"],
            children: [
              { id: "tree", title: "识别树结构" },
              { id: "flat", title: "兼容扁平节点列表" }
            ]
          },
          {
            id: "npm",
            title: "作为 npm 包消费",
            children: [
              { id: "api", title: "parse / render" },
              { id: "svg", title: "SVG / HTML" }
            ]
          },
          {
            id: "next",
            title: "下一步",
            children: [
              { id: "fixtures", title: "补充真实样例" },
              { id: "compat", title: "扩展兼容矩阵" }
            ]
          }
        ]
      }
    }
  };
}

function createSampleProcessOnDiagram(): object {
  return {
    title: "ProcessOn 流程图样例",
    nodes: [
      {
        id: "start",
        text: "开始",
        x: 80,
        y: 80,
        width: 120,
        height: 48,
        style: "shape=roundRect;rounded=1;fillColor=#E8F7FF;strokeColor=#2878D7;fontSize=14"
      },
      {
        id: "review",
        text: "资料审核",
        x: 280,
        y: 72,
        width: 150,
        height: 64,
        style: "shape=rect;fillColor=#FFFFFF;strokeColor=#667085;fontSize=14"
      },
      {
        id: "decision",
        text: "是否通过",
        x: 520,
        y: 66,
        width: 110,
        height: 76,
        shape: "diamond",
        style: "fillColor=#FFF7E6;strokeColor=#D9822B;fontSize=14"
      },
      {
        id: "publish",
        text: "发布结果",
        x: 760,
        y: 72,
        width: 150,
        height: 64,
        style: "shape=roundRect;rounded=1;fillColor=#EAF8EF;strokeColor=#2F9E44;fontSize=14"
      },
      {
        id: "retry",
        text: "补充材料",
        x: 500,
        y: 220,
        width: 150,
        height: 58,
        style: "shape=rect;fillColor=#FFF0F0;strokeColor=#D64545;fontSize=14"
      },
      { id: "e1", edge: true, source: "start", target: "review", text: "提交", style: "strokeColor=#667085;endArrow=block" },
      { id: "e2", edge: true, source: "review", target: "decision", style: "strokeColor=#667085;endArrow=block" },
      { id: "e3", edge: true, source: "decision", target: "publish", text: "是", style: "strokeColor=#2F9E44;endArrow=block" },
      { id: "e4", edge: true, source: "decision", target: "retry", text: "否", style: "strokeColor=#D64545;dashed=1;endArrow=block" },
      { id: "e5", edge: true, source: "retry", target: "review", style: "strokeColor=#D64545;dashed=1;endArrow=block" }
    ]
  };
}
