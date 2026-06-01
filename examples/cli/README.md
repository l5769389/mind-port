# MindPort CLI Example

Build the package first:

```bash
npm install
npm run build
```

Render a file:

```bash
npx mind-port render <input.xmind> --out out.html --mode preview
npx mind-port render <input.pos> --out out.svg --kind auto --mode semantic
npx mind-port render <input.pos> --out processon.html --style processon --layout fishbone-left --processon-style file
```

Inspect a file:

```bash
npx mind-port inspect <input.xmind> --json
```

Generate a local visual benchmark:

```bash
npx mind-port bench "../../fixtures/xmind/**/*.xmind" --out ../../artifacts/visual-benchmarks.html
```

HTML output uses MindPort's built-in static preview wrapper. SVG output writes the raw SVG string.
