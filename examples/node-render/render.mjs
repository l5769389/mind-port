import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { render } from "mind-port";

if (!process.argv[2]) {
  console.error("Usage: npm run render -- <input.xmind|input.pos> [out.html|out.svg]");
  process.exit(1);
}

const inputPath = resolve(process.argv[2]);
const outputPath = resolve(process.argv[3] ?? "out.html");
const input = await readFile(inputPath);

const result = await render(input, {
  fileName: basename(inputPath),
  compatibilityMode: "semantic",
  output: outputPath.toLowerCase().endsWith(".html") ? "html" : "svg",
  html: {
    title: basename(inputPath),
    lang: "en"
  }
});

await writeFile(outputPath, result.content);
console.log(`Wrote ${outputPath} (${result.inspection.kind}, ${result.inspection.warnings.length} warnings)`);
