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
  type RenderSvgOptions
} from "../src";

const input = requiredElement<HTMLInputElement>("#file-input");
const xmindButton = requiredElement<HTMLButtonElement>("#sample-xmind");
const processOnButton = requiredElement<HTMLButtonElement>("#sample-processon");
const renderModeSelect = requiredElement<HTMLSelectElement>("#render-mode");
const directionSelect = requiredElement<HTMLSelectElement>("#direction");
const svgHost = requiredElement<HTMLDivElement>("#svg-host");
const zoomOut = requiredElement<HTMLButtonElement>("#zoom-out");
const zoomIn = requiredElement<HTMLButtonElement>("#zoom-in");
const zoomReset = requiredElement<HTMLButtonElement>("#zoom-reset");
const zoomValue = requiredElement<HTMLOutputElement>("#zoom-value");
const meta = requiredElement<HTMLPreElement>("#meta");

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

function renderCurrent(): void {
  if (currentDiagramDocument) {
    renderDiagramCurrent();
    return;
  }

  if (!currentMindDocument) {
    return;
  }

  const direction = directionSelect.value as MindLayoutDirection;
  const renderMode = renderModeSelect.value as NonNullable<RenderSvgOptions["renderMode"]> | "compare";
  const baseOptions = {
    direction,
    stylePreset: "xmind" as const,
    preserveAttachedPositions: "top-level" as const
  };

  if (renderMode === "compare") {
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
      direction,
      padding: renderMode === "thumbnail" ? 0 : 56,
      renderMode
    });
    svgHost.innerHTML = `<div class="canvas-content">${svg}</div>`;
  }

  requestAnimationFrame(fitView);

  const sheet = currentMindDocument.sheets[0];
  meta.textContent = JSON.stringify({
    fileName: currentFileName,
    kind: "mind",
    sourceFormat: currentMindDocument.sourceFormat,
    renderMode,
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
    title: "ProcessOn MVP",
    root: {
      id: "root",
      text: "MindPort",
      children: [
        {
          id: "processon",
          text: "解析 ProcessOn POS",
          labels: ["JSON"],
          children: [
            { id: "tree", text: "识别树结构" },
            { id: "flat", text: "兼容扁平节点列表" }
          ]
        },
        {
          id: "npm",
          text: "作为 npm 包消费",
          children: [
            { id: "api", text: "parseMindFile" },
            { id: "svg", text: "renderToSvg" }
          ]
        },
        {
          id: "next",
          text: "下一步",
          children: [
            { id: "fixtures", text: "补充真实样例" },
            { id: "compat", text: "扩展兼容矩阵" }
          ]
        }
      ]
    },
    relationships: [
      { id: "rel-1", from: "processon", to: "npm", title: "统一 AST" }
    ]
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
