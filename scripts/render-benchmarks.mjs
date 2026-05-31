import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { parseDiagramFile, parseMindFile, renderDiagramToSvg, renderToSvg } from "../dist/index.js";

const outputDir = resolve("artifacts");
const downloadsDir = "C:/Users/Administrator/Downloads";
const processOnReferences = [
  {
    title: "ProcessOn POS payment business process",
    pageUrl: "https://www.processon.io/view/pos-payment-business-process/670a114832f1d95f4bfce71c",
    imageUrl: "https://www.processon.io/chart_image/get/template/full/img/670a114832f1d95f4bfce71c/670a128832f1d95f4bfce940/670a128732f1d95f4bfce93f.png"
  },
  {
    title: "ProcessOn 2026 FIFA World Cup schedule",
    pageUrl: "https://www.processon.io/view/2026-fifa-world-cup-full-match-schedule-overview/691ec3a35c833003e2f92867",
    imageUrl: "https://www.processon.io/chart_image/get/template/full/img/691ec3a35c833003e2f92867/691ec5f85c833003e2f929cc/691ec3a35c833003e2f92868.png"
  }
];

await mkdir(outputDir, { recursive: true });

const xmindFiles = [
  ...(await filesIn(resolve("fixtures/xmind"), [".xmind"])),
  ...(await filesIn(downloadsDir, [".xmind"], 8))
];
const processOnFiles = await filesIn(downloadsDir, [".pos", ".json"], 8);
const sections = [];
const stats = {
  xmind: 0,
  processOnFiles: 0,
  processOnReferences: processOnReferences.length,
  errors: []
};

for (const filePath of uniquePaths(xmindFiles)) {
  try {
    const fileName = basename(filePath);
    const bytes = await readFile(filePath);
    const document = await parseMindFile(bytes, { fileName });
    const semanticSvg = renderToSvg(document, {
      renderMode: "semantic",
      stylePreset: "xmind",
      preserveAttachedPositions: "top-level",
      padding: 72
    });
    const thumbnailSvg = renderToSvg(document, {
      renderMode: "thumbnail",
      padding: 0
    });
    sections.push(renderComparisonSection(fileName, [
      { label: "语义渲染", body: semanticSvg },
      { label: "官方缩略图", body: thumbnailSvg }
    ]));
    stats.xmind += 1;
  } catch (error) {
    stats.errors.push({ file: filePath, message: errorMessage(error) });
  }
}

for (const filePath of uniquePaths(processOnFiles)) {
  try {
    const fileName = basename(filePath);
    const bytes = await readFile(filePath);
    const diagram = await parseDiagramFile(bytes, { fileName });
    const svg = renderDiagramToSvg(diagram, { padding: 72 });
    sections.push(renderComparisonSection(fileName, [
      { label: "ProcessOn 图表语义渲染", body: svg }
    ]));
    stats.processOnFiles += 1;
  } catch (error) {
    try {
      const fileName = basename(filePath);
      const bytes = await readFile(filePath);
      const mind = await parseMindFile(bytes, { fileName });
      const svg = renderToSvg(mind, {
        renderMode: "semantic",
        stylePreset: "xmind",
        preserveAttachedPositions: "top-level",
        padding: 72
      });
      sections.push(renderComparisonSection(fileName, [
        { label: "ProcessOn 脑图语义渲染", body: svg }
      ]));
      stats.processOnFiles += 1;
    } catch {
      stats.errors.push({ file: filePath, message: errorMessage(error) });
    }
  }
}

for (const reference of processOnReferences) {
  sections.push(renderComparisonSection(reference.title, [
    {
      label: "公开官方预览",
      body: `<a href="${escapeHtml(reference.pageUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(reference.imageUrl)}" alt="${escapeHtml(reference.title)}" loading="lazy"/></a>`
    }
  ]));
}

const htmlPath = join(outputDir, "visual-benchmarks.html");
await writeFile(htmlPath, makeHtml(sections.join("\n"), stats));
console.log(JSON.stringify({ html: htmlPath, ...stats }, null, 2));

async function filesIn(dir, extensions, limit = Infinity) {
  try {
    const entries = await Promise.all((await readdir(dir))
      .filter(name => extensions.includes(extname(name).toLowerCase()))
      .map(async name => {
        const path = join(dir, name);
        const itemStat = await stat(path);
        return { path, mtimeMs: itemStat.mtimeMs };
      }));

    return entries
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limit)
      .map(entry => entry.path);
  } catch {
    return [];
  }
}

function uniquePaths(paths) {
  return [...new Map(paths.map(path => [path.toLowerCase(), path])).values()];
}

function renderComparisonSection(title, panels) {
  return `<section class="case">
    <h2>${escapeHtml(title)}</h2>
    <div class="panels">
      ${panels.map(panel => `<figure>
        <figcaption>${escapeHtml(panel.label)}</figcaption>
        <div class="preview">${panel.body}</div>
      </figure>`).join("\n")}
    </div>
  </section>`;
}

function makeHtml(body, stats) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MindPort Visual Benchmarks</title>
    <style>
      body {
        margin: 0;
        background: #eef2f6;
        color: #172033;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      header {
        position: sticky;
        top: 0;
        z-index: 2;
        padding: 16px 24px;
        border-bottom: 1px solid #d4dce7;
        background: #ffffff;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: 18px; }
      p { margin-top: 6px; color: #65758b; font-size: 13px; }
      main { display: grid; gap: 18px; padding: 18px; }
      .case {
        border: 1px solid #d4dce7;
        border-radius: 8px;
        background: #ffffff;
        overflow: hidden;
      }
      .case h2 {
        padding: 12px 14px;
        border-bottom: 1px solid #e2e8f0;
        font-size: 14px;
      }
      .panels {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
        gap: 14px;
        padding: 14px;
      }
      figure { margin: 0; min-width: 0; }
      figcaption { margin-bottom: 8px; color: #475569; font-size: 12px; font-weight: 700; }
      .preview {
        height: 420px;
        overflow: auto;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: #f8fafc;
      }
      svg, img { display: block; max-width: none; }
      img { width: auto; height: auto; }
    </style>
  </head>
  <body>
    <header>
      <h1>MindPort Visual Benchmarks</h1>
      <p>XMind: ${stats.xmind} · ProcessOn files: ${stats.processOnFiles} · ProcessOn references: ${stats.processOnReferences} · Errors: ${stats.errors.length}</p>
    </header>
    <main>${body}</main>
  </body>
</html>`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
