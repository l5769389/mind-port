import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import {
  parseDiagramFile,
  parseFile,
  parseMindFile,
  parseProcessOn,
  renderDiagramToSvg,
  renderDocumentToSvg,
  renderFileToSvg,
  renderToSvg
} from "../dist/index.js";
import { createMindPortViewer } from "../dist/viewer.js";

const require = createRequire(import.meta.url);
const cjsCore = require("../dist/index.cjs");
const cjsViewer = require("../dist/viewer.cjs");
assert(typeof cjsCore.parseFile === "function", "CJS core export is missing parseFile.");
assert(typeof cjsViewer.createMindPortViewer === "function", "CJS viewer export is missing createMindPortViewer.");

const processOnDoc = await parseProcessOn({
  title: "Smoke POS",
  root: {
    id: "root",
    text: "Root",
    children: [
      { id: "a", text: "A" },
      { id: "b", text: "B", children: [{ id: "b1", text: "B1" }] }
    ]
  }
});

assert(processOnDoc.sheets[0]?.root.children.length === 2, "ProcessOn tree children were not parsed.");

const autoMindDoc = await parseFile({
  title: "Auto POS Mind",
  root: {
    id: "root",
    text: "Root",
    children: [{ id: "a", text: "A" }]
  }
}, { fileName: "auto-mind.pos" });
assert(autoMindDoc.kind === "mind", "parseFile did not auto-detect a ProcessOn mind map.");
assert(renderDocumentToSvg(autoMindDoc, { compatibilityMode: "semantic" }).includes("Root"), "renderDocumentToSvg did not render an auto mind document.");
assert((await renderFileToSvg({ title: "Inline POS", root: { id: "r", text: "Inline", children: [{ id: "c", text: "Child" }] } }, { fileName: "inline.pos" })).includes("Inline"), "renderFileToSvg did not render inline POS input.");

const processOnDiagram = await parseDiagramFile({
  title: "Flow POS",
  nodes: [
    { id: "start", text: "Start", x: 20, y: 40, width: 100, height: 44, style: "shape=roundRect;rounded=1;fillColor=#E8F7FF;strokeColor=#2878D7" },
    { id: "decision", text: "OK?", x: 190, y: 28, width: 92, height: 68, shape: "diamond", style: "fillColor=#FFF7E6;strokeColor=#D9822B" },
    { id: "done", text: "Done", x: 360, y: 40, width: 100, height: 44, style: "fillColor=#EAF8EF;strokeColor=#2F9E44" },
    { id: "edge-1", edge: true, source: "start", target: "decision", text: "review", style: "strokeColor=#667085;endArrow=block" },
    { id: "edge-2", edge: true, source: "decision", target: "done", style: "strokeColor=#2F9E44;dashed=1;endArrow=block" }
  ]
});
assert(processOnDiagram.pages[0]?.shapes.length === 3, "ProcessOn diagram shapes were not parsed.");
assert(processOnDiagram.pages[0]?.connectors.length === 2, "ProcessOn diagram connectors were not parsed.");
const processOnDiagramSvg = renderDiagramToSvg(processOnDiagram);
assert(processOnDiagramSvg.includes("data-diagram-shape-id=\"decision\""), "ProcessOn diagram SVG is missing the diamond node.");
assert(processOnDiagramSvg.includes("stroke-dasharray"), "ProcessOn dashed connector style was not rendered.");

const autoDiagramDoc = await parseFile({
  title: "Auto Flow POS",
  nodes: [
    { id: "start", text: "Start", x: 20, y: 20, width: 100, height: 44 },
    { id: "end", text: "End", x: 180, y: 20, width: 100, height: 44 },
    { id: "edge", edge: true, source: "start", target: "end", style: "endArrow=block" }
  ]
}, { fileName: "auto-flow.pos" });
assert(autoDiagramDoc.kind === "diagram", "parseFile did not auto-detect a ProcessOn diagram.");
assert(renderDocumentToSvg(autoDiagramDoc).includes("data-diagram-connector-id=\"edge\""), "renderDocumentToSvg did not dispatch diagram rendering.");

const zip = new JSZip();
zip.file("content.json", JSON.stringify([
  {
    id: "sheet-1",
    title: "Smoke XMind",
    theme: {
      summaryTopic: {
        properties: {
          "svg:fill": "#6C6695",
          "fill-pattern": "hachure-thin",
          "fo:font-size": "13pt",
          "fo:font-family": "NeverMind Hand"
        }
      },
      summary: {
        properties: {
          "line-color": "#121212",
          "line-width": "2"
        }
      }
    },
    rootTopic: {
      id: "root",
      title: "Root",
      boundaries: [
        {
          id: "boundary-1",
          range: "(0,1)",
          style: {
            properties: {
              "fill-pattern": "hachure",
              "line-width": "0pt"
            }
          }
        }
      ],
      summaries: [
        {
          id: "summary-range",
          range: "(0,0)",
          topicId: "summary-topic"
        }
      ],
      children: {
        attached: [
          { id: "a", title: "A" },
          { id: "b", title: "B" }
        ],
        summary: [
          {
            id: "summary-topic",
            title: "Summary",
            style: {
              properties: {
                "fill-pattern": "solid-hand-drawn"
              }
            }
          }
        ],
        detached: [
          {
            id: "floating",
            title: "Floating",
            position: { x: 260, y: -120 },
            children: {
              attached: [
                { id: "floating-child", title: "Floating child" }
              ]
            }
          }
        ]
      }
    }
  }
]));

const xmindDoc = await parseMindFile(await zip.generateAsync({ type: "uint8array" }), { fileName: "smoke.xmind" });
assert(xmindDoc.sheets[0]?.root.children.length === 2, "XMind content.json children were not parsed.");
assert(xmindDoc.sheets[0]?.floatingTopics?.length === 1, "XMind detached topics were not preserved as floating topics.");
assert(xmindDoc.sheets[0]?.root.boundaries?.length === 1, "XMind boundaries were not parsed.");
assert(xmindDoc.sheets[0]?.root.summaries?.[0]?.range?.start === 0, "XMind summary ranges were not parsed.");

const svg = renderToSvg(xmindDoc);
assert(svg.includes("<svg"), "SVG output is missing the svg root.");
assert(svg.includes("Root"), "SVG output is missing node text.");
assert(svg.includes("Floating"), "SVG output is missing floating topic text.");
const xmindSvg = renderToSvg(xmindDoc, { stylePreset: "xmind" });
assert(xmindSvg.includes("data-boundary-id=\"boundary-1\""), "XMind boundary was not rendered.");
assert(xmindSvg.includes("data-summary") && xmindSvg.includes("#6C6695"), "XMind summary style was not rendered.");

const orgChartDoc = await parseMindFile(await makeXMindArchive("org.xmind", "org-chart", "org.xmind.ui.org-chart.down").generateAsync({ type: "uint8array" }), { fileName: "org.xmind" });
const orgChartSvg = renderToSvg(orgChartDoc, { stylePreset: "xmind" });
assert(orgChartSvg.includes("CEO") && orgChartSvg.includes("Team A"), "XMind org chart layout did not render expected topics.");

const timelineDoc = await parseMindFile(await makeXMindArchive("timeline.xmind", "timeline", "org.xmind.ui.timeline.through.vertical").generateAsync({ type: "uint8array" }), { fileName: "timeline.xmind" });
const timelineSvg = renderToSvg(timelineDoc, { stylePreset: "xmind" });
assert(timelineSvg.includes("Milestone 1") && timelineSvg.includes("data-node-id=\"m2\""), "XMind vertical timeline layout did not render expected topics.");

const fixtureDir = resolve("fixtures/xmind");
const fixtureNames = (await readdir(fixtureDir)).filter(name => name.toLowerCase().endsWith(".xmind"));
assert(fixtureNames.length > 0, "No XMind fixtures were found.");

for (const fixtureName of fixtureNames) {
  const fixtureBytes = await readFile(join(fixtureDir, fixtureName));
  const fixtureDoc = await parseMindFile(fixtureBytes, { fileName: fixtureName });
  assert(fixtureDoc.sheets.length > 0, `${fixtureName}: no sheets parsed.`);

  const semanticFixtureSvg = renderToSvg(fixtureDoc, {
    renderMode: "semantic",
    stylePreset: "xmind",
    preserveAttachedPositions: "top-level"
  });
  assert(semanticFixtureSvg.includes("<svg"), `${fixtureName}: semantic SVG was not rendered.`);
  assert(semanticFixtureSvg.includes("data-node-id="), `${fixtureName}: semantic SVG has no rendered nodes.`);

  const thumbnailFixtureSvg = renderToSvg(fixtureDoc, { renderMode: "thumbnail" });
  assert(thumbnailFixtureSvg.includes("<svg"), `${fixtureName}: thumbnail fallback SVG was not rendered.`);
}

assert(typeof createMindPortViewer === "function", "Viewer subpath export is missing createMindPortViewer.");

await mkdir(resolve("artifacts"), { recursive: true });
const cliInputPath = resolve("artifacts/smoke-flow.pos");
const cliSvgPath = resolve("artifacts/smoke-flow.svg");
const cliHtmlPath = resolve("artifacts/smoke-flow.html");
await writeFile(cliInputPath, JSON.stringify({
  title: "CLI Flow",
  nodes: [
    { id: "a", text: "A", x: 10, y: 10, width: 80, height: 40 },
    { id: "b", text: "B", x: 140, y: 10, width: 80, height: 40 },
    { id: "ab", edge: true, source: "a", target: "b", style: "endArrow=block" }
  ]
}));

const inspectResult = spawnSync(process.execPath, [resolve("dist/cli.js"), "inspect", cliInputPath, "--json"], { encoding: "utf8" });
assert(inspectResult.status === 0, `CLI inspect failed: ${inspectResult.stderr}`);
assert(JSON.parse(inspectResult.stdout).kind === "diagram", "CLI inspect JSON did not report diagram kind.");

const renderSvgResult = spawnSync(process.execPath, [resolve("dist/cli.js"), "render", cliInputPath, "--out", cliSvgPath, "--kind", "diagram"], { encoding: "utf8" });
assert(renderSvgResult.status === 0, `CLI render SVG failed: ${renderSvgResult.stderr}`);
assert((await readFile(cliSvgPath, "utf8")).includes("<svg"), "CLI render did not write SVG output.");

const renderHtmlResult = spawnSync(process.execPath, [resolve("dist/cli.js"), "render", cliInputPath, "--out", cliHtmlPath, "--kind", "diagram"], { encoding: "utf8" });
assert(renderHtmlResult.status === 0, `CLI render HTML failed: ${renderHtmlResult.stderr}`);
assert((await readFile(cliHtmlPath, "utf8")).includes("<!doctype html>"), "CLI render did not write HTML output.");

console.log("smoke-test ok");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeXMindArchive(title, rootId, structureClass) {
  const archive = new JSZip();
  archive.file("content.json", JSON.stringify([
    {
      id: `${rootId}-sheet`,
      title,
      rootTopic: {
        id: rootId,
        title: structureClass.includes("org-chart") ? "CEO" : "Roadmap",
        structureClass,
        children: {
          attached: [
            {
              id: "m1",
              title: structureClass.includes("org-chart") ? "Team A" : "Milestone 1",
              children: {
                attached: [
                  { id: "m1-a", title: "Detail A" },
                  { id: "m1-b", title: "Detail B" }
                ]
              }
            },
            {
              id: "m2",
              title: structureClass.includes("org-chart") ? "Team B" : "Milestone 2",
              children: {
                attached: [
                  { id: "m2-a", title: "Detail C" }
                ]
              }
            }
          ]
        }
      }
    }
  ]));
  return archive;
}
