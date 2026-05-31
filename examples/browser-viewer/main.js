import { parseFile } from "mind-port";
import { createMindPortViewer } from "mind-port/viewer";

const fileInput = document.querySelector("#file");
const viewerContainer = document.querySelector("#viewer");
let viewer = createMindPortViewer(viewerContainer, emptySvg(), { controls: true });

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }

  const parsed = await parseFile(file, { fileName: file.name });
  viewer.destroy();
  viewer = createMindPortViewer(viewerContainer, parsed, {
    compatibilityMode: "semantic",
    stylePreset: "xmind",
    controls: true
  });
});

function emptySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#f6f8fb"/>
    <text x="320" y="184" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" fill="#475569">Open an XMind or ProcessOn file</text>
  </svg>`;
}
