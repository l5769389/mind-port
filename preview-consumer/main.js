import { parseProcessOn, renderToSvg } from "mind-port";

const doc = await parseProcessOn({
  title: "Packed package preview",
  root: {
    id: "root",
    text: "mind-port npm tarball",
    children: [
      { id: "parse", text: "parseProcessOn()" },
      { id: "render", text: "renderToSvg()" },
      { id: "consumer", text: "外部项目可直接导入" }
    ]
  }
});

document.querySelector("#app").innerHTML = renderToSvg(doc, {
  direction: "right",
  padding: 64
});
