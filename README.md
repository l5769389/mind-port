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
- Basic legacy XMind `content.xml`
- ProcessOn `.pos` JSON with tree or flat node structures
- SVG rendering for a first visible result

The package intentionally starts with a pragmatic compatibility layer. It does not aim for pixel-perfect XMind or ProcessOn rendering in the first version.

## Install

```bash
npm install mind-port
```

## Usage

```ts
import { parseMindFile, renderToSvg } from "mind-port";

const doc = await parseMindFile(file, { fileName: file.name });
const svg = renderToSvg(doc, {
  theme: "default",
  renderMode: "semantic",
  stylePreset: "clean"
});
```

`renderMode: "semantic"` is the default API mode and renders a structured SVG from parsed topic data. It is intended for readable, inspectable output and future interactivity.

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

## Local Demo

```bash
npm install
npm run dev
```

Open the Vite URL, upload `.xmind` or `.pos`, or use the built-in samples. The demo canvas supports drag panning, mouse-wheel zoom, zoom buttons, and reset-to-fit.

## Render A Local File

The helper below builds the package, reads the newest `.xmind` file in `C:/Users/Administrator/Downloads`, and writes HTML/SVG previews into `artifacts/`. When an XMind embedded thumbnail exists, the generated HTML defaults to that high-fidelity preview and keeps semantic SVG variants in the settings dropdown. The preview canvas supports drag panning, mouse-wheel zoom, zoom buttons, and reset-to-fit.

```bash
npm run render:file
```

You can also pass an explicit file path:

```bash
node scripts/render-file.mjs "C:/path/to/file.xmind"
```

## Preview The Packed npm Package

This simulates how another project consumes the packed tarball:

```bash
npm run preview:packed
```

The command builds `mind-port`, creates `mind-port-0.1.0.tgz`, installs that tarball into `preview-consumer`, and starts a Vite app that imports `mind-port` from the packed package.
