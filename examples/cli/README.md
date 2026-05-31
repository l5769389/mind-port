# MindPort CLI Example

Build the package first:

```bash
npm install
npm run build
```

Render a file:

```bash
npx mind-port render <input.xmind> --out out.html --mode preview
```

Inspect a file:

```bash
npx mind-port inspect <input.xmind> --json
```

Generate a local visual benchmark:

```bash
npx mind-port bench "../../fixtures/xmind/**/*.xmind" --out ../../artifacts/visual-benchmarks.html
```
