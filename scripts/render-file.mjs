import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMindFile, renderToSvg } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2] ? resolve(process.argv[2]) : await latestDownloadsXMind();
const inputName = basename(inputPath);
const bytes = await readFile(inputPath);
const document = await parseMindFile(bytes, { fileName: inputName });
const semanticBaseOptions = {
  padding: 80,
  renderMode: "semantic",
  preserveAttachedPositions: "none"
};
const cleanSvg = renderToSvg(document, {
  ...semanticBaseOptions,
  stylePreset: "clean"
});
const xmindSvg = renderToSvg(document, {
  ...semanticBaseOptions,
  stylePreset: "xmind"
});
const xmindRelationshipSvg = renderToSvg(document, {
  ...semanticBaseOptions,
  stylePreset: "xmind",
  renderSettings: {
    relationshipStyle: "xmind"
  }
});
const xmindNoBoundarySvg = renderToSvg(document, {
  ...semanticBaseOptions,
  stylePreset: "xmind",
  renderSettings: {
    showBoundaries: false
  }
});
const xmindBackgroundSvg = renderToSvg(document, {
  ...semanticBaseOptions,
  stylePreset: "xmind",
  renderSettings: {
    showGroupBackgrounds: true,
    groupBackgroundOpacity: 0.42
  }
});
const outputDir = resolve(root, "artifacts");
const safeBaseName = inputName.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
const svgPath = join(outputDir, `${safeBaseName}.svg`);
const xmindRelationshipSvgPath = join(outputDir, `${safeBaseName}.xmind-relationship.svg`);
const xmindNoBoundarySvgPath = join(outputDir, `${safeBaseName}.xmind-no-boundary.svg`);
const xmindBackgroundSvgPath = join(outputDir, `${safeBaseName}.xmind-bg.svg`);
const cleanSvgPath = join(outputDir, `${safeBaseName}.clean.svg`);
const htmlPath = join(outputDir, `${safeBaseName}.html`);
const thumbnailSvgPath = join(outputDir, `${safeBaseName}.thumbnail.svg`);
const thumbnailHtmlPath = join(outputDir, `${safeBaseName}.thumbnail.html`);
const hasEmbeddedThumbnail = Boolean(Object.keys(document.assets ?? {}).find(key => key.replace(/\\/g, "/").toLowerCase() === "thumbnails/thumbnail.png"));
let thumbnailSvg;

await mkdir(outputDir, { recursive: true });
await writeFile(svgPath, xmindSvg);
await writeFile(xmindRelationshipSvgPath, xmindRelationshipSvg);
await writeFile(xmindNoBoundarySvgPath, xmindNoBoundarySvg);
await writeFile(xmindBackgroundSvgPath, xmindBackgroundSvg);
await writeFile(cleanSvgPath, cleanSvg);

if (hasEmbeddedThumbnail) {
  thumbnailSvg = renderToSvg(document, {
    padding: 0,
    renderMode: "thumbnail"
  });
  await writeFile(thumbnailSvgPath, thumbnailSvg);
  await writeFile(thumbnailHtmlPath, makeHtml(`${inputName} embedded thumbnail`, [
    { id: "thumbnail", label: "内嵌缩略图", svg: thumbnailSvg }
  ], "thumbnail"));
}

const htmlVariants = [
  ...(thumbnailSvg ? [{ id: "thumbnail", label: "官方内嵌预览", svg: thumbnailSvg }] : []),
  { id: "xmind", label: "语义渲染：XMind 风格（默认隐藏关系线）", svg: xmindSvg },
  { id: "xmind-relationship", label: "XMind 风格（显示关系线）", svg: xmindRelationshipSvg },
  { id: "xmind-no-boundary", label: "XMind 风格（无边界灰底）", svg: xmindNoBoundarySvg },
  { id: "xmind-bg", label: "XMind 风格（补全灰底）", svg: xmindBackgroundSvg },
  { id: "clean", label: "语义渲染：清晰结构", svg: cleanSvg }
];

await writeFile(htmlPath, makeHtml(inputName, htmlVariants, thumbnailSvg ? "thumbnail" : "xmind"));

const sheet = document.sheets[0];
console.log(JSON.stringify({
  input: inputPath,
  html: htmlPath,
  svg: svgPath,
  xmindRelationshipSvg: xmindRelationshipSvgPath,
  xmindNoBoundarySvg: xmindNoBoundarySvgPath,
  xmindBackgroundSvg: xmindBackgroundSvgPath,
  cleanSvg: cleanSvgPath,
  ...(hasEmbeddedThumbnail ? { thumbnailHtml: thumbnailHtmlPath, thumbnailSvg: thumbnailSvgPath } : {}),
  sourceFormat: document.sourceFormat,
  sheets: document.sheets.length,
  activeSheet: sheet?.title,
  root: sheet?.root.title,
  rootNodes: sheet ? countNodes(sheet.root) : 0,
  floatingTopics: sheet?.floatingTopics?.length ?? 0,
  relationships: sheet?.relationships?.length ?? 0
}, null, 2));

async function latestDownloadsXMind() {
  const downloads = "C:/Users/Administrator/Downloads";
  const candidates = await Promise.all(
    (await readdir(downloads))
      .filter(name => name.toLowerCase().endsWith(".xmind"))
      .map(async name => {
        const path = join(downloads, name);
        const stats = await stat(path);
        return { path, mtimeMs: stats.mtimeMs };
      })
  );

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates[0]) {
    throw new Error("No .xmind file found in C:/Users/Administrator/Downloads.");
  }

  return candidates[0].path;
}

function countNodes(node) {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
}

function makeHtml(title, variants, defaultVariant) {
  const options = variants.map(variant => `<option value="${escapeHtml(variant.id)}"${variant.id === defaultVariant ? " selected" : ""}>${escapeHtml(variant.label)}</option>`).join("");
  const panels = variants.map(variant => `<section class="render-panel${variant.id === defaultVariant ? " active" : ""}" data-render-panel="${escapeHtml(variant.id)}">${variant.svg}</section>`).join("\n        ");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)} - MindPort Render</title>
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #edf1f5;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow: hidden;
      }

      header {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 12px 18px;
        border-bottom: 1px solid #d4dce7;
        background: #ffffff;
      }

      h1 {
        margin: 0;
        font-size: 16px;
      }

      .settings {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #475569;
        font-size: 13px;
      }

      .zoom-controls {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-left: 4px;
      }

      .zoom-button {
        display: grid;
        place-items: center;
        min-width: 32px;
        height: 32px;
        padding: 0 9px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #ffffff;
        color: #172033;
        cursor: pointer;
      }

      .zoom-button:hover {
        border-color: #64748b;
      }

      .zoom-value {
        min-width: 52px;
        text-align: center;
        color: #172033;
        font-variant-numeric: tabular-nums;
      }

      select {
        height: 32px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #fff;
        color: #172033;
        padding: 0 9px;
      }

      main {
        height: calc(100vh - 57px);
        padding: 18px;
        overflow: hidden;
      }

      .canvas {
        position: relative;
        width: 100%;
        height: 100%;
        min-width: 0;
        border: 1px solid #d4dce7;
        border-radius: 8px;
        overflow: hidden;
        background: #ffffff;
        cursor: grab;
        touch-action: none;
        user-select: none;
      }

      .canvas.dragging {
        cursor: grabbing;
      }

      .viewport-content {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        will-change: transform;
      }

      svg {
        display: block;
        width: auto;
        height: auto;
        max-width: none;
      }

      .render-panel {
        display: none;
      }

      .render-panel.active {
        display: block;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="settings">
        <label for="render-style">渲染设置</label>
        <select id="render-style">${options}</select>
        <div class="zoom-controls" aria-label="Zoom controls">
          <button class="zoom-button" id="zoom-out" type="button" aria-label="Zoom out">-</button>
          <span class="zoom-value" id="zoom-value">100%</span>
          <button class="zoom-button" id="zoom-in" type="button" aria-label="Zoom in">+</button>
          <button class="zoom-button" id="zoom-reset" type="button" aria-label="Reset view">Reset</button>
        </div>
      </div>
    </header>
    <main>
      <div class="canvas" id="canvas">
        <div class="viewport-content" id="viewport-content">
          ${panels}
        </div>
      </div>
    </main>
    <script>
      const select = document.getElementById("render-style");
      const panels = [...document.querySelectorAll("[data-render-panel]")];
      const canvas = document.getElementById("canvas");
      const viewportContent = document.getElementById("viewport-content");
      const zoomOut = document.getElementById("zoom-out");
      const zoomIn = document.getElementById("zoom-in");
      const zoomReset = document.getElementById("zoom-reset");
      const zoomValue = document.getElementById("zoom-value");
      const minScale = 0.08;
      const maxScale = 4;
      let scale = 1;
      let translateX = 0;
      let translateY = 0;
      let dragStart;

      function activeSvg() {
        return document.querySelector("[data-render-panel].active svg");
      }

      function svgSize(svg) {
        if (!svg) {
          return { width: 1, height: 1 };
        }

        const viewBox = svg.getAttribute("viewBox")?.split(/\\s+/).map(Number);
        const viewBoxWidth = viewBox && Number.isFinite(viewBox[2]) ? viewBox[2] : 0;
        const viewBoxHeight = viewBox && Number.isFinite(viewBox[3]) ? viewBox[3] : 0;

        return {
          width: Number(svg.getAttribute("width")) || viewBoxWidth || svg.getBoundingClientRect().width || 1,
          height: Number(svg.getAttribute("height")) || viewBoxHeight || svg.getBoundingClientRect().height || 1
        };
      }

      function clampScale(value) {
        return Math.min(maxScale, Math.max(minScale, value));
      }

      function applyTransform() {
        viewportContent.style.transform = \`translate(\${translateX}px, \${translateY}px) scale(\${scale})\`;
        zoomValue.textContent = \`\${Math.round(scale * 100)}%\`;
      }

      function fitView() {
        const svg = activeSvg();
        const rect = canvas.getBoundingClientRect();
        const size = svgSize(svg);
        scale = clampScale(Math.min(1, (rect.width - 48) / size.width, (rect.height - 48) / size.height));
        translateX = (rect.width - size.width * scale) / 2;
        translateY = (rect.height - size.height * scale) / 2;
        applyTransform();
      }

      function zoomAt(nextScale, clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const pointX = clientX - rect.left;
        const pointY = clientY - rect.top;
        const contentX = (pointX - translateX) / scale;
        const contentY = (pointY - translateY) / scale;
        scale = clampScale(nextScale);
        translateX = pointX - contentX * scale;
        translateY = pointY - contentY * scale;
        applyTransform();
      }

      select?.addEventListener("change", () => {
        for (const panel of panels) {
          panel.classList.toggle("active", panel.dataset.renderPanel === select.value);
        }
        requestAnimationFrame(fitView);
      });

      canvas.addEventListener("pointerdown", event => {
        if (event.button !== 0) {
          return;
        }

        canvas.setPointerCapture(event.pointerId);
        canvas.classList.add("dragging");
        dragStart = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          translateX,
          translateY
        };
      });

      canvas.addEventListener("pointermove", event => {
        if (!dragStart || dragStart.pointerId !== event.pointerId) {
          return;
        }

        translateX = dragStart.translateX + event.clientX - dragStart.x;
        translateY = dragStart.translateY + event.clientY - dragStart.y;
        applyTransform();
      });

      function stopDrag(event) {
        if (dragStart?.pointerId === event.pointerId) {
          dragStart = undefined;
          canvas.classList.remove("dragging");
        }
      }

      canvas.addEventListener("pointerup", stopDrag);
      canvas.addEventListener("pointercancel", stopDrag);
      canvas.addEventListener("wheel", event => {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0014);
        zoomAt(scale * factor, event.clientX, event.clientY);
      }, { passive: false });

      zoomOut?.addEventListener("click", () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(scale / 1.18, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });

      zoomIn?.addEventListener("click", () => {
        const rect = canvas.getBoundingClientRect();
        zoomAt(scale * 1.18, rect.left + rect.width / 2, rect.top + rect.height / 2);
      });

      zoomReset?.addEventListener("click", fitView);
      window.addEventListener("resize", fitView);

      if ("ResizeObserver" in window) {
        new ResizeObserver(fitView).observe(canvas);
      }

      requestAnimationFrame(fitView);
    </script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
