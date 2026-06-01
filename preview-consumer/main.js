import { parse } from "mind-port";
import { createMindPortViewer } from "mind-port/viewer";

bootstrap().catch(error => {
  document.querySelector("#app").textContent = error instanceof Error ? error.message : String(error);
});

async function bootstrap() {
  const parsed = await parse({
    title: "Packed package preview",
    root: {
      id: "root",
      text: "mind-port npm tarball",
      children: [
        { id: "parse", text: "parse()" },
        { id: "render", text: "render()" },
        { id: "viewer", text: "mind-port/viewer" }
      ]
    }
  }, { fileName: "packed-preview.pos" });

  createMindPortViewer(document.querySelector("#app"), parsed, {
    compatibilityMode: "semantic",
    controls: true,
    padding: 64
  });
}
