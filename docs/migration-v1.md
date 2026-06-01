# v1 Migration

MindPort is preparing a v1 API surface. The current package version is not bumped in this change, but new code should prefer the canonical names below.

MindPort 正在准备 v1 风格接口。本次不提升 package 版本，但新集成建议优先使用下面的 canonical API。

## Replacements

| Legacy | Preferred |
| --- | --- |
| `parseFile(input, options)` | `parse(input, options)` |
| `renderDocumentToSvg(document, options)` | `renderSvg(document, options)` |
| `renderFileToSvg(input, options)` | `render(input, { output: "svg" })` |
| custom HTML wrappers | `renderHtml(document, options)` or `render(input, { output: "html" })` |
| ad-hoc metadata counting | `inspect(input, options)` or `inspectDocument(document)` |

## Before

```ts
import { parseFile, renderDocumentToSvg } from "mind-port";

const parsed = await parseFile(file, { fileName: file.name });
const svg = renderDocumentToSvg(parsed, { compatibilityMode: "semantic" });
```

## After

```ts
import { parse, renderSvg, inspectDocument } from "mind-port";

const parsed = await parse(file, { fileName: file.name });
const svg = renderSvg(parsed, { compatibilityMode: "semantic" });
const info = inspectDocument(parsed);
```

## One-Call Rendering

```ts
import { render } from "mind-port";

const result = await render(file, {
  fileName: file.name,
  output: "html",
  compatibilityMode: "semantic"
});
```

## Compatibility

Legacy exports remain available. They are not removed by this change, but they are no longer the preferred examples in documentation.
