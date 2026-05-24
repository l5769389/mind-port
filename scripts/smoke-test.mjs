import JSZip from "jszip";
import { parseMindFile, parseProcessOn, renderToSvg } from "../dist/index.js";

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

console.log("smoke-test ok");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
