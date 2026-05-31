# MindPort API

MindPort exposes a small core API, a frameworkless browser viewer helper, and a CLI.

## Core Import

```ts
import {
  parseFile,
  renderFileToSvg,
  renderDocumentToSvg,
  parseMindFile,
  renderToSvg,
  parseDiagramFile,
  renderDiagramToSvg
} from "mind-port";
```

### `parseFile(input, options)`

Auto-detects XMind archives, ProcessOn mind-map POS JSON, and ProcessOn diagram POS JSON.

```ts
const parsed = await parseFile(file, {
  fileName: file.name,
  kind: "auto"
});
```

Returns:

```ts
type MindPortDocument =
  | { kind: "mind"; document: MindDocument; warnings?: MindPortWarning[] }
  | { kind: "diagram"; document: DiagramDocument; warnings?: MindPortWarning[] };
```

Use `kind: "mind"` or `kind: "diagram"` when the file extension is ambiguous.

### `renderDocumentToSvg(document, options)`

Dispatches by `document.kind` and returns SVG.

```ts
const svg = renderDocumentToSvg(parsed, {
  compatibilityMode: "semantic",
  stylePreset: "xmind"
});
```

### `renderFileToSvg(input, options)`

Combines `parseFile` and `renderDocumentToSvg`.

```ts
const svg = await renderFileToSvg(bytes, {
  fileName: "map.xmind",
  compatibilityMode: "preview"
});
```

### Lower-Level APIs

`parseMindFile` / `renderToSvg` are for XMind and ProcessOn mind-map trees.

`parseDiagramFile` / `renderDiagramToSvg` are for ProcessOn flowchart and diagram POS files. The diagram renderer keeps original geometry instead of running a mind-map layout.

## Viewer Import

```ts
import { createMindPortViewer } from "mind-port/viewer";
```

```ts
const viewer = createMindPortViewer(container, parsedDocument, {
  controls: true,
  initialScale: 1,
  compatibilityMode: "semantic"
});

viewer.setDocument(parsedDocument);
viewer.setSvg(svg);
viewer.zoomIn();
viewer.zoomOut();
viewer.reset();
viewer.destroy();
```

The viewer accepts either a `MindPortDocument` or an SVG string.

## CLI

```bash
mind-port render input.xmind --out out.html
mind-port render input.pos --out out.svg --kind auto --mode semantic
mind-port inspect input.xmind --json
mind-port bench fixtures/**/*.xmind --out artifacts/visual-benchmarks.html
```

`render` writes SVG by default. If `--out` ends with `.html`, it wraps the SVG in a minimal scrollable HTML page.

`inspect --json` prints kind, source format, sheet/page counts, node/shape counts, connector counts, and warnings.
