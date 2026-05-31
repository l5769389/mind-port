import { parseFile } from "mind-port";
import { createMindPortViewer } from "mind-port/viewer";

bootstrap().catch(error => {
  document.querySelector("#app").textContent = error instanceof Error ? error.message : String(error);
});

async function bootstrap() {
  const parsed = await parseFile({
    title: "Packed package preview",
    root: {
      id: "root",
      text: "mind-port npm tarball",
      children: [
        { id: "parse", text: "parseFile()" },
        { id: "render", text: "renderDocumentToSvg()" },
        { id: "viewer", text: "mind-port/viewer" }
      ]
    }
  }, { fileName: "packed-preview.pos" });

  createMindPortViewer(document.querySelector("#app"), parsed, {
    compatibilityMode: "semantic",
    stylePreset: "xmind",
    controls: true,
    padding: 64
  });
}
