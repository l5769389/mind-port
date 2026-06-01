#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { inspect, render, renderFileToHtml } from "./core";
import type { MindPortInspection, MindStructureStyle, ProcessOnStylePreset, RenderFileOptions } from "./types";

type ParsedArgs = {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
};

const args = parseArgs(process.argv.slice(2));

void main();

async function main(): Promise<void> {
  try {
    if (args.command === "render") {
      await renderCommand(args);
    } else if (args.command === "inspect") {
      await inspectCommand(args);
    } else if (args.command === "bench") {
      await benchCommand(args);
    } else {
      printHelp(args.command ? `Unknown command: ${args.command}` : undefined);
      process.exitCode = args.command ? 1 : 0;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function renderCommand(args: ParsedArgs): Promise<void> {
  const input = args.positional[0];
  if (!input) {
    throw new Error("render requires an input file.");
  }

  const inputPath = resolve(input);
  const out = stringFlag(args, "out");
  const mode = stringFlag(args, "mode");
  const bytes = await readFile(inputPath);
  const options = renderOptionsFor(args, inputPath);
  const renderOptions: RenderFileOptions = {
    ...options,
    fileName: basename(inputPath),
    ...(mode === "preview" || mode === "semantic" || mode === "editable" ? { compatibilityMode: mode } : {}),
    kind: kindFlag(args)
  };
  const output = out && out.toLowerCase().endsWith(".html")
    ? await renderFileToHtml(bytes, { ...renderOptions, title: basename(inputPath), lang: "zh-CN" })
    : (await render(bytes, renderOptions)).content;

  if (out) {
    await mkdir(dirname(resolve(out)), { recursive: true });
    await writeFile(resolve(out), output);
  } else {
    process.stdout.write(output);
  }
}

async function inspectCommand(args: ParsedArgs): Promise<void> {
  const input = args.positional[0];
  if (!input) {
    throw new Error("inspect requires an input file.");
  }

  const inputPath = resolve(input);
  const summary = await inspect(await readFile(inputPath), {
    fileName: basename(inputPath),
    kind: kindFlag(args)
  });

  if (args.flags.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`${summary.fileName}`);
  console.log(`kind: ${summary.kind}`);
  console.log(`source: ${summary.sourceFormat}`);
  if (summary.kind === "mind") {
    console.log(`sheets: ${summary.sheets}`);
    console.log(`nodes: ${summary.nodes}`);
    console.log(`floatingTopics: ${summary.floatingTopics}`);
    console.log(`relationships: ${summary.relationships}`);
  } else {
    console.log(`pages: ${summary.pages}`);
    console.log(`shapes: ${summary.shapes}`);
    console.log(`connectors: ${summary.connectors}`);
  }
}

async function benchCommand(args: ParsedArgs): Promise<void> {
  const patterns = args.positional.length ? args.positional : ["fixtures/xmind/**/*.xmind"];
  const out = stringFlag(args, "out") ?? "artifacts/visual-benchmarks.html";
  const files = unique((await Promise.all(patterns.map(expandPattern))).flat());
  const sections: string[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  for (const file of files) {
    try {
      const bytes = await readFile(file);
      const result = await render(bytes, renderOptionsFor(args, file));
      sections.push(`<section class="case"><h2>${escapeHtml(file)}</h2><p>${formatInspection(result.inspection)}</p><div class="preview">${result.content}</div></section>`);
    } catch (error) {
      errors.push({ file, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MindPort Bench</title>
    <style>
      body { margin: 0; background: #eef2f6; color: #172033; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      header { position: sticky; top: 0; padding: 14px 18px; border-bottom: 1px solid #d4dce7; background: #fff; }
      main { display: grid; gap: 14px; padding: 14px; }
      h1, h2, p { margin: 0; }
      h2 { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
      .case { border: 1px solid #d4dce7; border-radius: 8px; background: #fff; overflow: hidden; }
      .preview { height: 420px; overflow: auto; padding: 12px; }
      svg { display: block; max-width: none; }
    </style>
  </head>
  <body>
    <header><h1>MindPort Bench</h1><p>${files.length} files / ${errors.length} errors</p></header>
    <main>${sections.join("\n")}</main>
  </body>
</html>`;

  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), html);

  if (errors.length) {
    console.error(JSON.stringify({ out: resolve(out), errors }, null, 2));
  } else {
    console.log(JSON.stringify({ out: resolve(out), files: files.length }, null, 2));
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command = "", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value) {
      continue;
    }

    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, positional, flags };
}

function renderOptionsFor(args: ParsedArgs, filePath: string): RenderFileOptions {
  const mode = stringFlag(args, "mode");
  const renderMode = mode === "preview" ? "auto" : mode === "semantic" ? "semantic" : undefined;
  const kind = kindFlag(args);

  return {
    fileName: basename(filePath),
    kind,
    padding: numberFlag(args, "padding") ?? 64,
    stylePreset: stylePresetFlag(args),
    ...(structureStyleFlag(args) ? { structureStyle: structureStyleFlag(args) } : {}),
    ...(processOnStyleFlag(args) ? { processOnStyle: processOnStyleFlag(args) } : {}),
    ...(renderMode ? { renderMode } : {}),
    ...(mode === "preview" || mode === "semantic" || mode === "editable" ? { compatibilityMode: mode } : {})
  };
}

function stylePresetFlag(args: ParsedArgs): "clean" | "xmind" | "processon" {
  const style = stringFlag(args, "style");
  return style === "clean" || style === "processon" ? style : "xmind";
}

function structureStyleFlag(args: ParsedArgs): MindStructureStyle | undefined {
  const value = stringFlag(args, "layout");
  const allowed: MindStructureStyle[] = [
    "auto",
    "mindmap-balanced",
    "mindmap-left",
    "mindmap-right",
    "logic-left",
    "logic-right",
    "tree-left",
    "tree-right",
    "org-down",
    "org-up",
    "fishbone-left",
    "fishbone-right",
    "timeline-vertical",
    "timeline-horizontal"
  ];
  return allowed.find(item => item === value);
}

function processOnStyleFlag(args: ParsedArgs): ProcessOnStylePreset | undefined {
  const value = stringFlag(args, "processon-style");
  const allowed: ProcessOnStylePreset[] = ["file", "classic", "warm", "fresh", "blue", "green", "purple", "dark", "gray"];
  return allowed.find(item => item === value);
}

function kindFlag(args: ParsedArgs): "auto" | "mind" | "diagram" {
  const kind = stringFlag(args, "kind");
  return kind === "mind" || kind === "diagram" ? kind : "auto";
}

function stringFlag(args: ParsedArgs, key: string): string | undefined {
  const value = args.flags[key];
  return typeof value === "string" ? value : undefined;
}

function numberFlag(args: ParsedArgs, key: string): number | undefined {
  const value = Number(stringFlag(args, key));
  return Number.isFinite(value) ? value : undefined;
}

function formatInspection(inspection: MindPortInspection): string {
  const stats = inspection.kind === "mind"
    ? `${inspection.nodes} topics / ${inspection.relationships} relationships`
    : `${inspection.shapes} shapes / ${inspection.connectors} connectors`;
  return `${inspection.kind} / ${inspection.sourceFormat} / ${stats} / ${inspection.warnings.length} warnings`;
}

async function expandPattern(pattern: string): Promise<string[]> {
  if (!pattern.includes("*")) {
    return [resolve(pattern)];
  }

  const normalized = resolve(pattern).replace(/\\/g, "/");
  const recursive = normalized.includes("**");
  const wildcardIndex = normalized.indexOf("*");
  const prefix = normalized.slice(0, wildcardIndex);
  const base = prefix.endsWith("/")
    ? prefix.slice(0, -1)
    : prefix.slice(0, prefix.lastIndexOf("/"));
  const glob = globToRegExp(normalized);
  const files = await walk(base || ".", recursive);

  return files.filter(file => glob.test(file.replace(/\\/g, "/")));
}

async function walk(dir: string, recursive: boolean): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        output.push(...await walk(path, recursive));
      }
      continue;
    }

    if (entry.isFile()) {
      output.push(path);
    }
  }

  return output;
}

function unique(values: string[]): string[] {
  return [...new Map(values.map(value => [resolve(value).toLowerCase(), resolve(value)])).values()];
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length;) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 3;
      continue;
    }

    if (char === "*" && next === "*") {
      source += ".*";
      index += 2;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      index += 1;
      continue;
    }

    source += escapeRegExp(char ?? "");
    index += 1;
  }

  return new RegExp(`${source}$`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function printHelp(error?: string): void {
  if (error) {
    console.error(error);
  }

  console.log(`MindPort

Usage:
  mind-port render <input> --out <out.svg|out.html> [--kind auto|mind|diagram] [--mode preview|semantic|editable] [--style clean|xmind|processon] [--layout auto|fishbone-left|org-down|timeline-horizontal] [--processon-style file|blue|dark]
  mind-port inspect <input> [--json]
  mind-port bench <files...> --out artifacts/visual-benchmarks.html

Examples:
  mind-port render map.xmind --out map.html --mode preview
  mind-port render flow.pos --out flow.svg --kind diagram --mode semantic
  mind-port render fishbone.pos --out fishbone.html --style processon --layout fishbone-left --processon-style file
  mind-port inspect map.xmind --json
`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
