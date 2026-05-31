import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { renderFileToSvg } from "mind-port";

if (!process.argv[2]) {
  console.error("Usage: npm run render -- <input.xmind|input.pos> [out.svg]");
  process.exit(1);
}

const inputPath = resolve(process.argv[2]);
const outputPath = resolve(process.argv[3] ?? "out.svg");
const input = await readFile(inputPath);

const svg = await renderFileToSvg(input, {
  fileName: basename(inputPath),
  compatibilityMode: "preview",
  stylePreset: "xmind"
});

await writeFile(outputPath, svg);
console.log(`Wrote ${outputPath}`);
