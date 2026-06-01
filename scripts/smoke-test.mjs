import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import JSZip from "jszip";
import {
  inspect,
  inspectDocument,
  parse,
  parseDiagramFile,
  parseFile,
  parseMindFile,
  parseProcessOn,
  render,
  renderDiagramToSvg,
  renderDocumentToSvg,
  renderFileToSvg,
  renderFileToHtml,
  renderHtml,
  renderSvg,
  renderToSvg
} from "../dist/index.js";
import { createMindPortViewer } from "../dist/viewer.js";

const require = createRequire(import.meta.url);
const cjsCore = require("../dist/index.cjs");
const cjsViewer = require("../dist/viewer.cjs");
assert(typeof cjsCore.parseFile === "function", "CJS core export is missing parseFile.");
assert(typeof cjsCore.parse === "function", "CJS core export is missing parse.");
assert(typeof cjsCore.render === "function", "CJS core export is missing render.");
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

const singleRootProcessOnDoc = await parseProcessOn({
  title: "Single Root POS",
  root: {
    id: "root-only",
    text: "Root only"
  }
});
assert(singleRootProcessOnDoc.sheets[0]?.root.title === "Root only", "ProcessOn single-root mind map was not parsed.");
assert(renderToSvg(singleRootProcessOnDoc).includes("Root only"), "ProcessOn single-root mind map was not rendered.");

const processOnElementsWrapperDoc = await parseProcessOn({
  diagram: {
    elements: {
      id: "root",
      root: true,
      title: "ProcessOn Elements",
      structure: "mind_ishikawa_left",
      theme: {
        background: "#F7E9DF",
        common: { family: "Georgia" },
        connectionStyle: { lineColor: "#68524C", lineWidth: 2, lineType: "dashed" },
        centerTopic: { backgroundColor: "#3B634E", color: "#ffffff", "font-size": "25px", "border-color": "#50C28B", "border-width": "2px", "border-radius": "5px" },
        secTopic: { backgroundColor: "#AA0C23", color: "#ffffff", "font-size": "15px", "border-radius": "6px" },
        childTopic: { color: "#68524C", "font-size": "13px" },
        floatingTopic: { backgroundColor: "#AA0C23", color: "#ffffff", "font-size": "15px", "border-radius": "5px" }
      },
      children: [
        { id: "e1", parent: "root", title: "Branch", children: [{ id: "e1a", parent: "e1", title: "Leaf", children: [] }] }
      ],
      freeChildren: [
        { id: "free-1", title: "Floating", children: [] }
      ]
    }
  },
  meta: {
    type: "ProcessOn Schema File",
    version: "5.0"
  }
});
assert(processOnElementsWrapperDoc.sheets[0]?.root.title === "ProcessOn Elements", "ProcessOn diagram.elements wrapper root was not parsed.");
assert(processOnElementsWrapperDoc.sheets[0]?.root.children[0]?.children[0]?.title === "Leaf", "ProcessOn diagram.elements wrapper children were not parsed.");
assert(processOnElementsWrapperDoc.sheets[0]?.floatingTopics?.[0]?.title === "Floating", "ProcessOn freeChildren were not preserved as floating topics.");
assert(processOnElementsWrapperDoc.sheets[0]?.style?.fill === "#F7E9DF", "ProcessOn theme background was not parsed.");
assert(processOnElementsWrapperDoc.sheets[0]?.root.style?.fill === "#3B634E", "ProcessOn center topic style was not parsed.");
assert(processOnElementsWrapperDoc.sheets[0]?.root.children[0]?.style?.fill === "#AA0C23", "ProcessOn secondary topic style was not parsed.");
assert(processOnElementsWrapperDoc.sheets[0]?.root.children[0]?.children[0]?.style?.color === "#68524C", "ProcessOn child topic style was not parsed.");
const processOnFishboneSvg = renderToSvg(processOnElementsWrapperDoc, { stylePreset: "processon" });
assert(processOnFishboneSvg.includes("#F7E9DF") && processOnFishboneSvg.includes("stroke-dasharray") && !processOnFishboneSvg.includes("NaN"), "ProcessOn file theme fishbone SVG was not rendered.");
const processOnOverrideSvg = renderToSvg(processOnElementsWrapperDoc, { stylePreset: "processon", structureStyle: "fishbone-right", processOnStyle: "blue" });
assert(processOnOverrideSvg.includes("#eff6ff") && processOnOverrideSvg.includes("#3b82f6"), "ProcessOn blue style override was not rendered.");
const processOnDarkSvg = renderToSvg(processOnElementsWrapperDoc, { stylePreset: "processon", processOnStyle: "dark" });
assert(processOnDarkSvg.includes("#30284b") && processOnDarkSvg.includes("#f97316"), "ProcessOn dark style override was not rendered.");
const processOnCanvasSvg = renderToSvg(processOnElementsWrapperDoc, {
  stylePreset: "processon",
  structureStyle: "fishbone-right",
  processOnStyle: "dark",
  canvasBackground: "#101828",
  hideCentralTopic: true,
  watermark: "mindport"
});
assert(
  processOnCanvasSvg.includes("#101828") &&
  processOnCanvasSvg.includes("MindPort") &&
  !processOnCanvasSvg.includes("data-node-id=\"root\"") &&
  !processOnCanvasSvg.includes("NaN"),
  "ProcessOn canvas style controls were not applied."
);
assert(inspectDocument({ kind: "mind", document: processOnElementsWrapperDoc }, "processon-elements.pos").structureStyle === "fishbone-left", "ProcessOn structure style was not inspected.");

for (const [structure, expected] of [
  ["mind_org_down", "org-down"],
  ["mind_tree_right", "tree-right"],
  ["mind_timeline_horizontal", "timeline-horizontal"],
  ["mind_logic_left", "logic-left"]
]) {
  const doc = await parseProcessOn(makeProcessOnStructureSample(structure));
  const info = inspectDocument({ kind: "mind", document: doc }, `${structure}.pos`);
  const rendered = renderToSvg(doc, { stylePreset: "processon" });
  assert(info.structureStyle === expected, `ProcessOn ${structure} did not inspect as ${expected}.`);
  assert(rendered.includes("Main") && rendered.includes("<svg") && !rendered.includes("NaN"), `ProcessOn ${structure} did not render.`);
}

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

const canonicalMindDoc = await parse({
  title: "Canonical POS",
  root: { id: "canonical", text: "Canonical", children: [{ id: "child", text: "Child" }] }
}, { fileName: "canonical.pos" });
const canonicalInspection = inspectDocument(canonicalMindDoc, "canonical.pos");
assert(canonicalInspection.kind === "mind" && canonicalInspection.nodes === 2, "inspectDocument did not summarize canonical mind input.");
const canonicalSvg = renderSvg(canonicalMindDoc, { compatibilityMode: "semantic" });
assert(canonicalSvg.includes("<filter id=\"mind-port-node-shadow\""), "renderSvg did not apply the mindport SVG theme.");
const canonicalHtml = renderHtml(canonicalMindDoc, { title: "Canonical", includeMetadataPanel: true });
assert(canonicalHtml.includes("<!doctype html>") && canonicalHtml.includes("mind-port-html-meta"), "renderHtml did not include HTML preview metadata.");
const canonicalRender = await render({
  title: "Canonical Render",
  root: { id: "render-root", text: "Render", children: [{ id: "render-child", text: "Child" }] }
}, { fileName: "render.pos", output: "html" });
assert(canonicalRender.output === "html" && canonicalRender.content.includes("<svg"), "render() did not return an HTML render result.");
assert((await inspect({ title: "Inline Inspect", root: { id: "inspect", text: "Inspect", children: [] } }, { fileName: "inspect.pos" })).kind === "mind", "inspect() did not parse and summarize input.");
assert((await renderFileToHtml({ title: "Inline HTML", root: { id: "html", text: "HTML", children: [] } }, { fileName: "html.pos" })).includes("<!doctype html>"), "renderFileToHtml did not render HTML output.");

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
assert(processOnDiagram.pages[0]?.shapes[0]?.kind === "roundRectangle", "ProcessOn roundRect style string did not infer a round rectangle.");
const processOnDiagramSvg = renderDiagramToSvg(processOnDiagram);
assert(processOnDiagramSvg.includes("data-diagram-shape-id=\"decision\""), "ProcessOn diagram SVG is missing the diamond node.");
assert(processOnDiagramSvg.includes("stroke-dasharray"), "ProcessOn dashed connector style was not rendered.");

const styledDiagram = await parseDiagramFile({
  title: "Styled POS",
  nodes: [
    { id: "round", text: "Round", x: 0, y: 0, width: 100, height: 44, style: "shape=roundRect;rounded=1" },
    { id: "rhombus", text: "Diamond", x: 140, y: 0, width: 100, height: 70, style: "shape=rhombus" }
  ]
});
assert(styledDiagram.pages[0]?.shapes[0]?.kind === "roundRectangle", "Diagram style shape=roundRect was not preserved.");
assert(styledDiagram.pages[0]?.shapes[1]?.kind === "diamond", "Diagram style shape=rhombus was not preserved.");

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

const benchWildcardPath = resolve("artifacts/smoke-bench-wildcard.html");
const benchWildcardResult = spawnSync(process.execPath, [resolve("dist/cli.js"), "bench", "fixtures/xmind/*.xmind", "--out", benchWildcardPath], { encoding: "utf8" });
assert(benchWildcardResult.status === 0, `CLI bench wildcard failed: ${benchWildcardResult.stderr}`);
assert(JSON.parse(benchWildcardResult.stdout).files === fixtureNames.length, "CLI bench did not match non-recursive wildcard fixtures.");
assert((await readFile(benchWildcardPath, "utf8")).includes("MindPort Bench"), "CLI bench did not write benchmark HTML.");

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

function makeProcessOnStructureSample(structure) {
  return {
    diagram: {
      elements: {
        id: "root",
        title: "Main",
        structure,
        children: [
          {
            id: "branch-a",
            title: "Branch A",
            children: [
              { id: "branch-a-1", title: "Task A1", children: [] },
              { id: "branch-a-2", title: "Task A2", children: [] }
            ]
          },
          {
            id: "branch-b",
            title: "Branch B",
            children: [
              { id: "branch-b-1", title: "Task B1", children: [] }
            ]
          }
        ]
      }
    },
    meta: {
      type: "ProcessOn Schema File"
    }
  };
}
