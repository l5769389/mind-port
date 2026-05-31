# Compatibility

MindPort is a renderer and parser package, not a clone of the XMind or ProcessOn editors. Compatibility is described in three levels.

## Levels

| Level | Goal | Behavior |
| --- | --- | --- |
| `preview` | Official-looking display | Prefer embedded XMind thumbnails or user-provided exported previews when available. |
| `semantic` | Readable structured SVG | Parse file data into an AST and render SVG that exposes node, shape, and connector IDs. |
| `editable` | Preserve useful model data | Keep nodes, edges, geometry, styles, resources, raw fields, and warnings for downstream editors. |

## XMind

| Area | Status |
| --- | --- |
| Current `.xmind` ZIP with `content.json` | Supported |
| Legacy `content.xml` | Supported as a compatibility path |
| Embedded `Thumbnails/thumbnail.png` | Supported through preview/thumbnail render mode |
| Mind map layouts | Map, logic left/right, tree left/right, org-chart up/down, timeline horizontal/vertical, fishbone, and readable fallback layouts |
| Topics | Title, children, detached/floating topics, notes, labels, markers, images, collapsed flag |
| Styling | Fill, stroke, font family/size/weight, branch colors, line width, dashed/arrow-like relationship rendering where present |
| Semantic elements | Boundaries, summaries, relationship labels, images, markers, notes/labels metadata |

## ProcessOn Mind Maps

| Area | Status |
| --- | --- |
| POS JSON object/string payloads | Supported |
| Wrapped payloads | Searches `diagram`, `content`, `data`, `mind`, `mindmap`, and `json` wrappers |
| Multi-page/sheet structures | Supported where sheets/pages expose mind-map payloads |
| Tree and flat nodes | Supported |
| Mind-map variants | Rendered through readable semantic layouts; exact official layout is not guaranteed |

## ProcessOn Diagrams

| Area | Status |
| --- | --- |
| Flowchart-like POS JSON | Supported through `DiagramDocument` |
| Geometry | Original x/y/width/height retained |
| Shapes | Rectangle, rounded rectangle, ellipse, diamond, parallelogram, hexagon, swimlane, container, text, image, unknown fallback |
| Connectors | Straight/polyline points, inferred endpoints, arrow markers, labels, dashed lines |
| Styling | Fill, stroke, stroke width, opacity, font family/size/weight, text color |
| Page data | Page size, background, pages/sheets/canvases where present |

## Detection Rules

`parseFile` uses file name, ZIP magic bytes, and JSON structure:

- `.xmind` or ZIP input goes to the XMind parser.
- Geometry or edge-heavy JSON goes to the ProcessOn diagram parser first.
- Other `.pos`/JSON payloads go to the ProcessOn mind-map parser first.
- Fallbacks may attach `MindPortWarning` entries when a non-fatal downgrade happens.
