# MindPort API

MindPort exposes a v1-ready SDK surface while keeping the original MVP APIs as aliases.

MindPort 提供面向 v1 的 SDK 接口，同时保留早期 API 作为兼容别名。

## Canonical Import

```ts
import {
  parse,
  inspect,
  inspectDocument,
  render,
  renderSvg,
  renderHtml,
  renderFileToHtml
} from "mind-port";
```

## `parse(input, options)`

Parses XMind archives, ProcessOn mind maps, or ProcessOn diagrams into a discriminated document.

```ts
const parsed = await parse(file, {
  fileName: file.name,
  kind: "auto"
});
```

```ts
type MindPortDocument =
  | { kind: "mind"; document: MindDocument; warnings?: MindPortWarning[] }
  | { kind: "diagram"; document: DiagramDocument; warnings?: MindPortWarning[] };
```

## `inspect(input, options)` / `inspectDocument(document)`

Returns a stable summary for indexing, logging, validation, and UI metadata.

```ts
const info = await inspect(file, { fileName: file.name });
```

`MindPortInspection` includes:

- `kind`, `sourceFormat`, `title`, `fileName`
- `sheets`, `pages`, `nodes`, `floatingTopics`, `relationships`
- `shapes`, `connectors`, `assets`
- `warnings`

## `render(input, options)`

One-call parse + inspect + render. Use this for most app integrations.

```ts
const result = await render(file, {
  fileName: file.name,
  output: "html",
  compatibilityMode: "semantic"
});

result.content;
result.inspection;
```

```ts
type MindPortRenderResult = {
  document: MindPortDocument;
  inspection: MindPortInspection;
  output: "svg" | "html";
  content: string;
  warnings: MindPortWarning[];
};
```

## `renderSvg(document, options)`

Renders a parsed document to SVG. The v1-ready default theme is `mindport`.

```ts
const svg = renderSvg(parsed, {
  compatibilityMode: "semantic",
  stylePreset: "processon",
  structureStyle: "auto",
  processOnStyle: "file",
  canvasBackground: "#ffffff"
});
```

ProcessOn mind-map options:

- `stylePreset: "processon"` enables ProcessOn-oriented connector scale and boundary defaults.
- `structureStyle` can force layouts such as `fishbone-left`, `fishbone-right`, `org-down`, `tree-right`, or `timeline-horizontal`; `auto` reads the POS file structure.
- `processOnStyle` can be `file`, `classic`, `warm`, `fresh`, `blue`, `green`, `purple`, `dark`, or `gray`; `file` keeps POS theme fields when present.
- `canvasBackground`, `hideCentralTopic`, `watermark`, `horizontalGap`, `verticalGap`, and `preserveAttachedPositions` expose the same canvas-style knobs used by the demo for visual compatibility checks.

## `renderHtml(document, options)` / `renderFileToHtml(input, options)`

Wraps SVG in a responsive HTML preview with an optional metadata panel.

```ts
const html = renderHtml(parsed, {
  title: "Preview",
  lang: "zh-CN",
  includeMetadataPanel: true,
  minHeight: "100vh"
});
```

## Viewer

```ts
import { createMindPortViewer } from "mind-port/viewer";

const viewer = createMindPortViewer(container, parsed, { controls: true });
viewer.fit();
viewer.getScale();
viewer.setScale(1.2);
viewer.reset();
viewer.destroy();
```

## Legacy Aliases

These remain exported for compatibility:

- `parseFile` -> `parse`
- `renderDocumentToSvg` -> legacy SVG dispatcher
- `renderFileToSvg` -> parse + legacy SVG dispatcher
- `parseMindFile`, `renderToSvg`
- `parseDiagramFile`, `renderDiagramToSvg`

New integrations should prefer `parse`, `inspect`, `render`, `renderSvg`, and `renderHtml`.
