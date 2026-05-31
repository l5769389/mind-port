import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMindFile, renderToSvg } from "../dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2] ? resolve(process.argv[2]) : await latestDownloadsXMind();
const inputName = basename(inputPath);
const bytes = await readFile(inputPath);
const document = await parseMindFile(bytes, { fileName: inputName });
const outputDir = resolve(root, "artifacts");
const safeBaseName = inputName.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
const semanticBaseOptions = {
  padding: 80,
  renderMode: "semantic",
  preserveAttachedPositions: "top-level"
};

const variants = [
  {
    id: "xmind",
    label: "语义渲染：XMind 风格（默认隐藏关系线）",
    svg: renderToSvg(document, {
      ...semanticBaseOptions,
      stylePreset: "xmind"
    })
  },
  {
    id: "xmind-relationship",
    label: "语义渲染：XMind 风格（显示关系线）",
    svg: renderToSvg(document, {
      ...semanticBaseOptions,
      stylePreset: "xmind",
      renderSettings: {
        relationshipStyle: "xmind"
      }
    })
  },
  {
    id: "xmind-no-boundary",
    label: "语义渲染：XMind 风格（无边界背景）",
    svg: renderToSvg(document, {
      ...semanticBaseOptions,
      stylePreset: "xmind",
      renderSettings: {
        showBoundaries: false
      }
    })
  },
  {
    id: "xmind-bg",
    label: "语义渲染：XMind 风格（补全灰底）",
    svg: renderToSvg(document, {
      ...semanticBaseOptions,
      stylePreset: "xmind",
      renderSettings: {
        showGroupBackgrounds: true,
        groupBackgroundOpacity: 0.42
      }
    })
  },
  {
    id: "clean",
    label: "语义渲染：清晰结构",
    svg: renderToSvg(document, {
      ...semanticBaseOptions,
      stylePreset: "clean"
    })
  }
];

const hasEmbeddedThumbnail = Boolean(Object.keys(document.assets ?? {}).find(key => key.replace(/\\/g, "/").toLowerCase() === "thumbnails/thumbnail.png"));
if (hasEmbeddedThumbnail) {
  variants.push({
    id: "thumbnail",
    label: "官方内嵌预览",
    svg: renderToSvg(document, {
      padding: 0,
      renderMode: "thumbnail"
    })
  });
}

await mkdir(outputDir, { recursive: true });
const outputs = {};
for (const variant of variants) {
  const suffix = variant.id === "xmind" ? "" : `.${variant.id}`;
  const svgPath = join(outputDir, `${safeBaseName}${suffix}.svg`);
  await writeFile(svgPath, variant.svg);
  outputs[`${variant.id}Svg`] = svgPath;
}

const htmlPath = join(outputDir, `${safeBaseName}.html`);
await writeFile(htmlPath, makeHtml(inputName, variants, defaultVariantFor(document)));

const sheet = document.sheets[0];
console.log(JSON.stringify({
  input: inputPath,
  html: htmlPath,
  ...outputs,
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

function defaultVariantFor(document) {
  const relationshipCount = document.sheets[0]?.relationships?.length ?? 0;
  return relationshipCount >= 6 ? "xmind-relationship" : "xmind";
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
      * { box-sizing: border-box; }
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
      h1 { margin: 0; font-size: 16px; }
      .settings { display: flex; align-items: center; gap: 12px; color: #475569; font-size: 13px; }
      button, select {
        min-height: 34px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        background: #ffffff;
        color: #172033;
        font: inherit;
      }
      button { min-width: 34px; cursor: pointer; }
      #viewport {
        position: relative;
        height: calc(100vh - 59px);
        overflow: hidden;
        cursor: grab;
      }
      #viewport.dragging { cursor: grabbing; }
      #content {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: 0 0;
        will-change: transform;
      }
      .render-panel { display: none; }
      .render-panel.active { display: block; }
      svg { display: block; max-width: none; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="settings">
        <label for="render-style">渲染设置</label>
        <select id="render-style">${options}</select>
        <button id="zoom-out" type="button" title="缩小">-</button>
        <output id="zoom-value">100%</output>
        <button id="zoom-in" type="button" title="放大">+</button>
        <button id="zoom-reset" type="button" title="适配画布">Reset</button>
      </div>
    </header>
    <main id="viewport">
      <div id="content">
        ${panels}
      </div>
    </main>
    <script>
      const viewport = document.getElementById("viewport");
      const content = document.getElementById("content");
      const select = document.getElementById("render-style");
      const panels = [...document.querySelectorAll("[data-render-panel]")];
      const zoomOut = document.getElementById("zoom-out");
      const zoomIn = document.getElementById("zoom-in");
      const zoomReset = document.getElementById("zoom-reset");
      const zoomValue = document.getElementById("zoom-value");
      let scale = 1;
      let translateX = 0;
      let translateY = 0;
      let dragStart;

      select.addEventListener("change", () => {
        panels.forEach(panel => panel.classList.toggle("active", panel.dataset.renderPanel === select.value));
        fitView();
      });
      zoomOut.addEventListener("click", () => zoomFromCenter(scale / 1.18));
      zoomIn.addEventListener("click", () => zoomFromCenter(scale * 1.18));
      zoomReset.addEventListener("click", fitView);
      window.addEventListener("resize", fitView);
      viewport.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add("dragging");
        dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, translateX, translateY };
      });
      viewport.addEventListener("pointermove", event => {
        if (!dragStart || dragStart.pointerId !== event.pointerId) return;
        translateX = dragStart.translateX + event.clientX - dragStart.x;
        translateY = dragStart.translateY + event.clientY - dragStart.y;
        applyTransform();
      });
      viewport.addEventListener("pointerup", stopDrag);
      viewport.addEventListener("pointercancel", stopDrag);
      viewport.addEventListener("wheel", event => {
        event.preventDefault();
        zoomAt(scale * Math.exp(-event.deltaY * 0.0014), event.clientX, event.clientY);
      }, { passive: false });

      requestAnimationFrame(fitView);

      function activeSvg() {
        return document.querySelector("[data-render-panel].active svg");
      }
      function svgSize() {
        const svg = activeSvg();
        if (!svg) return { width: 1, height: 1 };
        const viewBox = svg.getAttribute("viewBox")?.split(/\\s+/).map(Number);
        return {
          width: Number(svg.getAttribute("width")) || viewBox?.[2] || 1,
          height: Number(svg.getAttribute("height")) || viewBox?.[3] || 1
        };
      }
      function fitView() {
        const rect = viewport.getBoundingClientRect();
        const size = svgSize();
        scale = clampScale(Math.min(1, (rect.width - 48) / size.width, (rect.height - 48) / size.height));
        translateX = (rect.width - size.width * scale) / 2;
        translateY = (rect.height - size.height * scale) / 2;
        applyTransform();
      }
      function applyTransform() {
        content.style.transform = "translate(" + translateX + "px, " + translateY + "px) scale(" + scale + ")";
        zoomValue.textContent = Math.round(scale * 100) + "%";
      }
      function zoomFromCenter(nextScale) {
        const rect = viewport.getBoundingClientRect();
        zoomAt(nextScale, rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      function zoomAt(nextScale, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        const pointX = clientX - rect.left;
        const pointY = clientY - rect.top;
        const contentX = (pointX - translateX) / scale;
        const contentY = (pointY - translateY) / scale;
        scale = clampScale(nextScale);
        translateX = pointX - contentX * scale;
        translateY = pointY - contentY * scale;
        applyTransform();
      }
      function stopDrag(event) {
        if (dragStart?.pointerId === event.pointerId) {
          dragStart = undefined;
          viewport.classList.remove("dragging");
        }
      }
      function clampScale(value) {
        return Math.min(4, Math.max(0.08, value));
      }
    </script>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
