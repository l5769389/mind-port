import { renderDocumentToSvg } from "./core";
import type { MindPortDocument, RenderDocumentOptions } from "./types";

export type MindPortViewerInput = MindPortDocument | string;

export type MindPortViewerOptions = RenderDocumentOptions & {
  className?: string;
  controls?: boolean;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
};

export type MindPortViewer = {
  element: HTMLDivElement;
  setDocument: (document: MindPortDocument, options?: RenderDocumentOptions) => void;
  setSvg: (svg: string) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  destroy: () => void;
};

export function createMindPortViewer(
  container: HTMLElement,
  input: MindPortViewerInput,
  options: MindPortViewerOptions = {}
): MindPortViewer {
  const ownerDocument = container.ownerDocument;
  const element = ownerDocument.createElement("div");
  const viewport = ownerDocument.createElement("div");
  const content = ownerDocument.createElement("div");
  const controls = ownerDocument.createElement("div");
  const minScale = finiteOrDefault(options.minScale, 0.2);
  const maxScale = finiteOrDefault(options.maxScale, 4);
  const zoomStep = finiteOrDefault(options.zoomStep, 0.2);
  let scale = clamp(finiteOrDefault(options.initialScale, 1), minScale, maxScale);
  let destroyed = false;

  element.className = ["mind-port-viewer", options.className].filter(Boolean).join(" ");
  element.style.cssText = [
    "position:relative",
    "width:100%",
    "height:100%",
    "min-height:240px",
    "overflow:hidden",
    "background:#f6f8fb",
    "color:#172033",
    "font-family:Inter,ui-sans-serif,system-ui,sans-serif"
  ].join(";");

  viewport.className = "mind-port-viewer__viewport";
  viewport.style.cssText = [
    "position:absolute",
    "inset:0",
    "overflow:auto",
    "padding:16px",
    "box-sizing:border-box"
  ].join(";");

  content.className = "mind-port-viewer__content";
  content.style.cssText = [
    "display:inline-block",
    "transform-origin:0 0",
    "will-change:transform"
  ].join(";");

  controls.className = "mind-port-viewer__controls";
  controls.style.cssText = [
    "position:absolute",
    "right:12px",
    "top:12px",
    "display:flex",
    "gap:6px",
    "z-index:1"
  ].join(";");

  viewport.append(content);
  element.append(viewport);

  if (options.controls !== false) {
    controls.append(
      button(ownerDocument, "-", "Zoom out", () => viewer.zoomOut()),
      button(ownerDocument, "+", "Zoom in", () => viewer.zoomIn()),
      button(ownerDocument, "1:1", "Reset zoom", () => viewer.reset())
    );
    element.append(controls);
  }

  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    setScale(scale + (event.deltaY < 0 ? zoomStep : -zoomStep));
  };

  element.addEventListener("wheel", onWheel, { passive: false });
  container.replaceChildren(element);

  const viewer: MindPortViewer = {
    element,
    setDocument(document, renderOptions) {
      setSvg(renderDocumentToSvg(document, { ...options, ...renderOptions }));
    },
    setSvg,
    setScale,
    zoomIn() {
      setScale(scale + zoomStep);
    },
    zoomOut() {
      setScale(scale - zoomStep);
    },
    reset() {
      setScale(finiteOrDefault(options.initialScale, 1));
      viewport.scrollTo({ left: 0, top: 0 });
    },
    destroy() {
      if (destroyed) {
        return;
      }

      destroyed = true;
      element.removeEventListener("wheel", onWheel);
      element.remove();
    }
  };

  if (typeof input === "string") {
    setSvg(input);
  } else {
    viewer.setDocument(input);
  }

  return viewer;

  function setSvg(svg: string): void {
    content.innerHTML = svg;
    applyScale();
  }

  function setScale(nextScale: number): void {
    scale = clamp(nextScale, minScale, maxScale);
    applyScale();
  }

  function applyScale(): void {
    content.style.transform = `scale(${scale})`;
  }
}

function button(document: Document, text: string, label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  element.setAttribute("aria-label", label);
  element.title = label;
  element.style.cssText = [
    "min-width:36px",
    "height:32px",
    "border:1px solid #cbd5e1",
    "border-radius:6px",
    "background:#fff",
    "color:#172033",
    "font:600 12px/1 Inter,ui-sans-serif,system-ui,sans-serif",
    "cursor:pointer",
    "box-shadow:0 1px 2px rgba(15,23,42,.08)"
  ].join(";");
  element.addEventListener("click", onClick);
  return element;
}

function finiteOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
