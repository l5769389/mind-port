# MindPort

MindPort parses mind map files into a small unified AST and renders that AST to SVG.

MVP support:

- XMind `.xmind` archives with `content.json`
- XMind floating / detached topics with saved positions
- Basic XMind topic colors, font sizes, and rounded / hex / pill-like shapes
- XMind dark map backgrounds, branch colors, underline topics, and embedded image resources
- XMind boundary / hachure blocks from original boundary ranges
- XMind embedded thumbnail rendering for high-fidelity preview fallbacks
- XMind fishbone right-headed layout as a dedicated semantic layout
- XMind organization-chart-down and vertical-timeline semantic layouts
- Basic legacy XMind `content.xml`
- ProcessOn `.pos` JSON with tree or flat node structures
- ProcessOn flow/diagram `.pos` JSON through a separate geometry-preserving diagram API
- SVG rendering for a first visible result

The package intentionally starts with a pragmatic compatibility layer. It does not aim for pixel-perfect XMind or ProcessOn rendering in the first version.

## Install

```bash
npm install mind-port
```

## Quick Start

One call parses XMind, ProcessOn mind maps, or ProcessOn diagrams and then dispatches to the right SVG renderer:

```ts
import { parseFile, renderDocumentToSvg } from "mind-port";

const parsed = await parseFile(file, { fileName: file.name });
const svg = renderDocumentToSvg(parsed, {
  compatibilityMode: "semantic",
  stylePreset: "xmind"
});
```

The compatibility modes are intentionally explicit:

- `preview`: prefer official-looking previews such as XMind embedded thumbnails when available.
- `semantic`: render a structured SVG from parsed AST data.
- `editable`: preserve structured data for editor use; rendering currently behaves like semantic mode.

## Node.js

```ts
import { readFile, writeFile } from "node:fs/promises";
import { renderFileToSvg } from "mind-port";

const input = await readFile("map.xmind");
const svg = await renderFileToSvg(input, {
  fileName: "map.xmind",
  compatibilityMode: "preview"
});

await writeFile("map.svg", svg);
```

## Browser File Input

```ts
import { parseFile, renderDocumentToSvg } from "mind-port";

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const parsed = await parseFile(file, { fileName: file.name });
  preview.innerHTML = renderDocumentToSvg(parsed, {
    compatibilityMode: "semantic",
    stylePreset: "xmind"
  });
});
```

## Viewer Helper

```ts
import { parseFile } from "mind-port";
import { createMindPortViewer } from "mind-port/viewer";

const parsed = await parseFile(file, { fileName: file.name });
const viewer = createMindPortViewer(document.querySelector("#viewer")!, parsed, {
  compatibilityMode: "semantic",
  controls: true
});

viewer.zoomIn();
viewer.reset();
viewer.destroy();
```

The viewer is frameworkless. It mounts SVG, exposes zoom/reset/destroy helpers, and leaves parsing/rendering in the core package.

## CLI

```bash
mind-port render input.xmind --out out.html
mind-port render input.pos --out out.svg --kind auto --mode semantic
mind-port inspect input.xmind --json
mind-port bench fixtures/**/*.xmind --out artifacts/visual-benchmarks.html
```

## Lower-Level APIs

The original mind-map API remains available:

```ts
import { parseMindFile, renderToSvg } from "mind-port";

const doc = await parseMindFile(file, { fileName: file.name });
const svg = renderToSvg(doc, {
  theme: "default",
  renderMode: "semantic",
  stylePreset: "clean"
});
```

Use the XMind-like visual preset when you want heavier branches, parsed XMind boundaries, and XMind-style summaries:

```ts
const svg = renderToSvg(doc, {
  renderMode: "semantic",
  stylePreset: "xmind",
  renderSettings: {
    showBoundaries: true,
    relationshipStyle: "hidden"
  }
});
```

`stylePreset: "xmind"` shows parsed XMind boundaries and hides relationship lines by default. You can show relationship lines with `relationshipStyle: "xmind"`, hide boundaries with `showBoundaries: false`, or enable `showGroupBackgrounds` as an extra inferred grey-background fallback for files that do not expose boundary ranges.

For XMind files that include `Thumbnails/thumbnail.png`, you can request the embedded preview instead:

```ts
const previewSvg = renderToSvg(doc, { renderMode: "thumbnail" });
```

Use `renderMode: "auto"` when a viewer should prefer the embedded XMind preview when it exists and fall back to semantic SVG for files without a thumbnail.

ProcessOn flowcharts and other non-mind-map POS files can be rendered through the diagram API:

```ts
import { parseDiagramFile, renderDiagramToSvg } from "mind-port";

const diagram = await parseDiagramFile(file, { fileName: file.name });
const svg = renderDiagramToSvg(diagram);
```

This API keeps shape geometry, basic fills/strokes/fonts, arrows, dashed connectors, containers, swimlanes, and common rectangle/ellipse/diamond-like shapes separate from the mind-map tree model.

See [docs/api.md](docs/api.md), [docs/compatibility.md](docs/compatibility.md), and [docs/limitations.md](docs/limitations.md) for the npm API, compatibility matrix, and renderer caveats.

## Local Demo

```bash
npm install
npm run dev
```

Open the Vite URL, upload `.xmind` or `.pos`, or use the built-in samples. The demo canvas supports drag panning, mouse-wheel zoom, zoom buttons, and reset-to-fit.

## Render A Local File

The helper below builds the package, reads the newest `.xmind` file in `C:/Users/Administrator/Downloads`, and writes HTML/SVG previews into `artifacts/`. The generated HTML now defaults to semantic rendering; files that mainly use XMind relationships default to the semantic relationship variant. Embedded XMind thumbnails remain available in the settings dropdown as a high-fidelity reference. The preview canvas supports drag panning, mouse-wheel zoom, zoom buttons, and reset-to-fit.

```bash
npm run render:file
```

Real-world XMind fixtures are stored in `fixtures/xmind/` and are covered by `npm test` so renderer changes keep exercising the same sample files.

You can also pass an explicit file path:

```bash
node scripts/render-file.mjs "C:/path/to/file.xmind"
```

To generate a visual benchmark page that compares semantic XMind SVG with embedded official thumbnails and lists public ProcessOn preview references:

```bash
npm run bench:visual
```

## Preview The Packed npm Package

This simulates how another project consumes the packed tarball:

```bash
npm run preview:packed
```

The command builds `mind-port`, creates `mind-port-0.1.0.tgz`, installs that tarball into `preview-consumer`, and starts a Vite app that imports `mind-port` from the packed package.
