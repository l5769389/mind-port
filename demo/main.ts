import JSZip from "jszip";
import { parseMindFile, renderToSvg, type MindDocument, type MindLayoutDirection, type MindNode, type RenderSvgOptions } from "../src";

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

let currentDocument: MindDocument | undefined;
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
  await loadDocument(JSON.stringify(createSampleProcessOn(), null, 2), "sample.pos");
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

void loadDocument(JSON.stringify(createSampleProcessOn(), null, 2), "sample.pos");

async function loadDocument(inputData: Blob | ArrayBuffer | string, fileName: string): Promise<void> {
  try {
    meta.textContent = "Parsing...";
    currentDocument = await parseMindFile(inputData, { fileName });
    renderCurrent();
  } catch (error) {
    svgHost.innerHTML = `<div class="empty">解析失败</div>`;
    meta.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderCurrent(): void {
  if (!currentDocument) {
    return;
  }

  const direction = directionSelect.value as MindLayoutDirection;
  const renderMode = renderModeSelect.value as NonNullable<RenderSvgOptions["renderMode"]>;
  const svg = renderToSvg(currentDocument, {
    direction,
    padding: renderMode === "thumbnail" ? 0 : 56,
    renderMode,
    stylePreset: "xmind"
  });
  svgHost.innerHTML = `<div class="canvas-content">${svg}</div>`;
  requestAnimationFrame(fitView);

  const sheet = currentDocument.sheets[0];
  meta.textContent = JSON.stringify({
    sourceFormat: currentDocument.sourceFormat,
    renderMode,
    sheets: currentDocument.sheets.length,
    activeSheet: sheet?.title,
    root: sheet?.root.title,
    nodes: sheet ? countNodes(sheet.root) : 0,
    floatingTopics: sheet?.floatingTopics?.length ?? 0,
    relationships: sheet?.relationships?.length ?? 0
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

function activeSvg(): SVGSVGElement | undefined {
  return svgHost.querySelector<SVGSVGElement>("svg") ?? undefined;
}

function svgSize(svg: SVGSVGElement | undefined): { width: number; height: number } {
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

function fitView(): void {
  const svg = activeSvg();
  const content = canvasContent();
  if (!svg || !content) {
    return;
  }

  const rect = svgHost.getBoundingClientRect();
  const size = svgSize(svg);
  scale = clampScale(Math.min(1, (rect.width - 48) / size.width, (rect.height - 48) / size.height));
  translateX = (rect.width - size.width * scale) / 2;
  translateY = (rect.height - size.height * scale) / 2;
  applyTransform();
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

function createSampleProcessOn(): object {
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
