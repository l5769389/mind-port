# MindPort

XMind / ProcessOn 文件解析与 SVG 渲染 SDK。
An SDK for parsing XMind / ProcessOn files and rendering semantic SVG or HTML previews.

MindPort is designed for apps that need to preview, inspect, index, or embed mind-map and diagram files without depending on the official editors.

## Install

```bash
npm install mind-port
```

## Quick Start

```ts
import { render } from "mind-port";

const result = await render(file, {
  fileName: file.name,
  output: "html",
  compatibilityMode: "semantic"
});

document.body.innerHTML = result.content;
console.log(result.inspection);
```

## Current Capabilities / 当前能力

- XMind `.xmind` archives with `content.json`, legacy `content.xml`, embedded thumbnails, assets, floating topics, boundaries, summaries, relationships, markers, images, and common layouts.
- ProcessOn mind-map `.pos` JSON with tree, flat node, wrapped, and multi-page payloads.
- ProcessOn mind-map structure/theme rendering, including file-driven fishbone, tree, logic, org-chart, timeline, background, topic, and connector styles.
- ProcessOn diagram `.pos` JSON with geometry-preserving shapes, containers/swimlanes, text/images, connectors, arrows, dashed lines, and labels.
- Semantic SVG rendering for structured interaction and indexing.
- Preview fallback through embedded XMind thumbnails when available.
- Frameworkless browser viewer helper and Node/CLI usage.

## API Shape

Use the v1-ready canonical API for new integrations:

```ts
import {
  parse,
  inspect,
  inspectDocument,
  render,
  renderSvg,
  renderHtml
} from "mind-port";
```

Legacy aliases remain available: `parseFile`, `renderDocumentToSvg`, `renderFileToSvg`, `parseMindFile`, `renderToSvg`, `parseDiagramFile`, and `renderDiagramToSvg`.

### Render SVG

```ts
const parsed = await parse(file, { fileName: file.name });
const svg = renderSvg(parsed, {
  compatibilityMode: "semantic",
  stylePreset: "processon",
  structureStyle: "auto",
  processOnStyle: "file"
});
```

### Render HTML

```ts
const parsed = await parse(file, { fileName: file.name });
const html = renderHtml(parsed, {
  title: file.name,
  includeMetadataPanel: true
});
```

### Inspect

```ts
const info = await inspect(file, { fileName: file.name });
console.log(info.kind, info.nodes, info.shapes, info.warnings);
```

## Viewer

```ts
import { parse } from "mind-port";
import { createMindPortViewer } from "mind-port/viewer";

const parsed = await parse(file, { fileName: file.name });
const viewer = createMindPortViewer(document.querySelector("#viewer")!, parsed, {
  compatibilityMode: "semantic",
  controls: true
});

viewer.fit();
viewer.zoomIn();
viewer.reset();
viewer.destroy();
```

## CLI

```bash
mind-port render input.xmind --out out.html
mind-port render input.pos --out out.svg --kind auto --mode semantic
mind-port render fishbone.pos --out fishbone.html --style processon --layout fishbone-left --processon-style file
mind-port inspect input.xmind --json
mind-port bench "fixtures/xmind/*.xmind" --out artifacts/visual-benchmarks.html
```

## Compatibility Modes / 兼容模式

- `preview`: prefer official-looking previews such as embedded XMind thumbnails when available.
- `semantic`: parse into a structured AST and render readable SVG.
- `editable`: preserve structured data and raw fields for editor workflows; rendering currently follows semantic mode.

MindPort is not a pixel-perfect clone of XMind or ProcessOn. It prioritizes stable SDK integration, structured output, and useful preview quality.

## Docs

- [API](docs/api.md)
- [Rendering](docs/rendering.md)
- [Compatibility](docs/compatibility.md)
- [v1 Migration](docs/migration-v1.md)
- [Limitations](docs/limitations.md)

## Development

```bash
npm install
npm test
npm run dev
```

`npm test` builds the package and runs smoke tests against XMind fixtures, synthetic ProcessOn mind/diagram samples, CLI paths, and package exports.
