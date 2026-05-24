import { ParseMindError } from "../errors";
import type { MindDocument, MindFileInput, MindNode, MindRelationship, MindSheet } from "../types";
import { asArray, firstString, inputToText, isRecord, stableId, stripHtml, tryParseJson } from "../utils";

export async function parseProcessOn(input: MindFileInput): Promise<MindDocument> {
  try {
    const raw = typeof input === "object" && !(input instanceof Uint8Array) && !(input instanceof ArrayBuffer) && !(typeof Blob !== "undefined" && input instanceof Blob)
      ? input
      : tryParseJson(await inputToText(input));

    if (!raw) {
      throw new ParseMindError("ProcessOn input is not valid JSON.");
    }

    const normalized = unwrapProcessOnPayload(raw);
    const sheets = parseProcessOnSheets(normalized);

    if (!sheets.length) {
      throw new ParseMindError("No mind map tree or node list found in ProcessOn JSON.");
    }

    return {
      sourceFormat: "processon",
      sheets,
      raw
    };
  } catch (error) {
    if (error instanceof ParseMindError) {
      throw error;
    }

    throw new ParseMindError("Failed to parse ProcessOn file.", error);
  }
}

function parseProcessOnSheets(raw: unknown): MindSheet[] {
  if (Array.isArray(raw)) {
    const flatSheet = parseFlatNodeSheet(raw, "ProcessOn");
    return flatSheet ? [flatSheet] : [];
  }

  if (!isRecord(raw)) {
    return [];
  }

  const explicitSheets = firstArray(raw.sheets, raw.pages, raw.diagrams);

  if (explicitSheets) {
    return explicitSheets
      .flatMap((sheetRaw, index) => {
        const sheetPayload = unwrapProcessOnPayload(sheetRaw);
        const root = findTreeRoot(sheetPayload);
        const flatNodes = findNodeArray(sheetPayload);

        if (root) {
          return [makeSheetFromRoot(root, index, sheetPayload)];
        }

        if (flatNodes) {
          const sheet = parseFlatNodeSheet(flatNodes, firstString(getRecord(sheetPayload)?.title, getRecord(sheetPayload)?.name) ?? `Sheet ${index + 1}`);
          return sheet ? [{ ...sheet, id: stableId("sheet", index), raw: sheetPayload }] : [];
        }

        return [];
      });
  }

  const root = findTreeRoot(raw);
  if (root) {
    return [makeSheetFromRoot(root, 0, raw)];
  }

  const flatNodes = findNodeArray(raw);
  if (flatNodes) {
    const sheet = parseFlatNodeSheet(flatNodes, firstString(raw.title, raw.name) ?? "ProcessOn");
    return sheet ? [{ ...sheet, raw }] : [];
  }

  return [];
}

function makeSheetFromRoot(root: Record<string, unknown>, index: number, raw: unknown): MindSheet {
  const rootNode = parseTreeNode(root, stableId(`processon-sheet-${index + 1}-node`, 0));

  return {
    id: firstString(getRecord(raw)?.id) ?? stableId("sheet", index),
    title: firstString(getRecord(raw)?.title, getRecord(raw)?.name, rootNode.title) ?? `Sheet ${index + 1}`,
    root: rootNode,
    relationships: parseRelationships(raw),
    raw
  };
}

function parseTreeNode(raw: Record<string, unknown>, fallbackId: string): MindNode {
  const id = firstString(raw.id, raw.uuid, raw.key) ?? fallbackId;
  const data = isRecord(raw.data) ? raw.data : undefined;
  const children = childCandidates(raw)
    .filter(isRecord)
    .map((child, index) => parseTreeNode(child, `${id}-${index + 1}`));
  const labels = asArray(raw.labels ?? data?.labels).map(String).filter(Boolean);
  const notes = firstString(raw.notes, raw.note, raw.remark, raw.comment, data?.notes, data?.note);
  const image = firstString(raw.image, raw.imageUrl, raw.img, data?.image, data?.imageUrl);

  return {
    id,
    title: firstString(raw.title, raw.text, raw.name, raw.label, raw.value, data?.title, data?.text, data?.label) ?? "Untitled",
    children,
    ...(notes ? { notes } : {}),
    ...(labels.length ? { labels } : {}),
    ...(image ? { image } : {}),
    ...(isRecord(raw.style) ? { style: { raw: raw.style } } : {}),
    ...(typeof raw.collapsed === "boolean" ? { collapsed: raw.collapsed } : {}),
    raw
  };
}

function parseFlatNodeSheet(nodes: unknown[], title: string): MindSheet | undefined {
  const records = nodes.filter(isRecord);
  const nodeRecords = records.filter(record => !isEdgeRecord(record) && getNodeTitle(record));

  if (!nodeRecords.length) {
    return undefined;
  }

  const byId = new Map<string, Record<string, unknown>>();
  const parentById = new Map<string, string | undefined>();

  nodeRecords.forEach((node, index) => {
    const id = getNodeId(node, index);
    byId.set(id, node);
    parentById.set(id, getParentId(node));
  });

  const childrenById = new Map<string, string[]>();

  for (const [id, parentId] of parentById) {
    if (!parentId || !byId.has(parentId)) {
      continue;
    }

    const children = childrenById.get(parentId) ?? [];
    children.push(id);
    childrenById.set(parentId, children);
  }

  const rootId = [...byId.keys()].find(id => {
    const parentId = parentById.get(id);
    return !parentId || !byId.has(parentId);
  }) ?? [...byId.keys()][0];

  if (!rootId) {
    return undefined;
  }

  const visited = new Set<string>();
  const root = buildFlatNode(rootId, byId, childrenById, visited);

  return {
    id: "sheet-1",
    title,
    root,
    relationships: parseFlatRelationships(records),
    raw: nodes
  };
}

function buildFlatNode(
  id: string,
  byId: Map<string, Record<string, unknown>>,
  childrenById: Map<string, string[]>,
  visited: Set<string>
): MindNode {
  if (visited.has(id)) {
    return {
      id,
      title: "Circular reference",
      children: []
    };
  }

  visited.add(id);
  const raw = byId.get(id) ?? {};
  const children = (childrenById.get(id) ?? []).map(childId => buildFlatNode(childId, byId, childrenById, visited));

  return {
    id,
    title: getNodeTitle(raw) ?? "Untitled",
    children,
    ...(firstString(raw.note, raw.notes, raw.remark) ? { notes: firstString(raw.note, raw.notes, raw.remark) } : {}),
    ...(isRecord(raw.style) ? { style: { raw: raw.style } } : {}),
    raw
  };
}

function unwrapProcessOnPayload(raw: unknown): unknown {
  let current = raw;

  for (let depth = 0; depth < 5; depth += 1) {
    if (!isRecord(current)) {
      return current;
    }

    const nested = firstNestedPayload(current);
    if (!nested || nested === current) {
      return current;
    }

    current = nested;
  }

  return current;
}

function firstNestedPayload(raw: Record<string, unknown>): unknown | undefined {
  for (const key of ["diagram", "content", "data", "mind", "mindmap", "json"]) {
    const value = raw[key];

    if (typeof value === "string") {
      const parsed = tryParseJson(value);
      if (parsed) {
        return parsed;
      }
    }

    if (isRecord(value) || Array.isArray(value)) {
      if (findTreeRoot(value) || findNodeArray(value)) {
        return value;
      }
    }
  }

  return undefined;
}

function findTreeRoot(raw: unknown): Record<string, unknown> | undefined {
  const record = getRecord(raw);
  if (!record) {
    return undefined;
  }

  for (const key of ["root", "rootNode", "rootTopic", "topic", "center", "centralTopic"]) {
    const value = record[key];
    if (isRecord(value) && looksLikeTreeNode(value)) {
      return value;
    }
  }

  if (looksLikeTreeNode(record)) {
    return record;
  }

  return undefined;
}

function findNodeArray(raw: unknown): unknown[] | undefined {
  if (Array.isArray(raw)) {
    return raw;
  }

  const record = getRecord(raw);
  if (!record) {
    return undefined;
  }

  for (const key of ["nodes", "cells", "elements", "mxCell", "items", "shapes"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }

    if (isRecord(value)) {
      const nestedArray = findNodeArray(value);
      if (nestedArray) {
        return nestedArray;
      }
    }
  }

  const modelRoot = isRecord(record.mxGraphModel) ? record.mxGraphModel.root : undefined;
  return findNodeArray(modelRoot);
}

function looksLikeTreeNode(raw: Record<string, unknown>): boolean {
  return Boolean(getNodeTitle(raw)) && childCandidates(raw).length > 0;
}

function childCandidates(raw: Record<string, unknown>): unknown[] {
  const children = raw.children ?? raw.childNodes ?? raw.topics ?? raw.branches ?? raw.nodes;

  if (Array.isArray(children)) {
    return children;
  }

  if (isRecord(children)) {
    return [
      ...asArray(children.attached),
      ...asArray(children.detached),
      ...asArray(children.children),
      ...asArray(children.list)
    ];
  }

  return [];
}

function parseRelationships(raw: unknown): MindRelationship[] {
  const record = getRecord(raw);
  if (!record) {
    return [];
  }

  const relationships = firstArray(record.relationships, record.edges, record.links, record.lines) ?? [];
  return parseFlatRelationships(relationships);
}

function parseFlatRelationships(records: unknown[]): MindRelationship[] {
  return records
    .filter(isRecord)
    .filter(isEdgeRecord)
    .map((record, index) => ({
      id: firstString(record.id) ?? stableId("relationship", index),
      from: firstString(record.from, record.source, record.sourceId, record.start, record.parent) ?? "",
      to: firstString(record.to, record.target, record.targetId, record.end) ?? "",
      ...(firstString(record.title, record.text, record.label, record.value) ? { title: firstString(record.title, record.text, record.label, record.value) } : {}),
      raw: record
    }))
    .filter(edge => edge.from && edge.to);
}

function isEdgeRecord(raw: Record<string, unknown>): boolean {
  return raw.edge === true ||
    raw.edge === "1" ||
    raw.type === "edge" ||
    Boolean((raw.source || raw.sourceId || raw.from) && (raw.target || raw.targetId || raw.to));
}

function getNodeId(raw: Record<string, unknown>, index: number): string {
  return firstString(raw.id, raw.uuid, raw.key, raw.cellId) ?? stableId("processon-node", index);
}

function getParentId(raw: Record<string, unknown>): string | undefined {
  return firstString(raw.parentId, raw.parent, raw.pid, raw.pId, raw.group);
}

function getNodeTitle(raw: Record<string, unknown>): string | undefined {
  const data = isRecord(raw.data) ? raw.data : undefined;
  const value = firstString(raw.title, raw.text, raw.name, raw.label, raw.value, data?.title, data?.text, data?.label);
  return value ? stripHtml(value) : undefined;
}

function firstArray(...values: unknown[]): unknown[] | undefined {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
