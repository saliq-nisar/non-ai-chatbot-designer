import type { Block, RichTextNode } from "../../../../api/types";

/** Props every block editor receives. Editors return a new block through onChange. */
export type BlockEditorProps = { block: Block; onChange: (block: Block) => void };

/** Empty strings are stored as "not set" so the backend applies its defaults. */
const clean = (value: unknown) => (value === "" ? undefined : value);

export const option = <T>(block: Block, key: string) => block.options?.[key] as T | undefined;

export const withOptions = (block: Block, patch: Record<string, unknown>): Block => ({
  ...block,
  options: { ...block.options, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, clean(v)])) },
});

export const labels = (block: Block) => (block.options?.labels ?? {}) as Record<string, string | undefined>;

export const withLabels = (block: Block, patch: Record<string, string | undefined>): Block =>
  withOptions(block, { labels: { ...labels(block), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, clean(v)])) } });

export const withContent = (block: Block, patch: Record<string, unknown>): Block => ({
  ...block,
  content: { ...block.content, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, clean(v)])) },
});

// ---- text bubble rich text <-> plain text ----

const inlineText = (node: RichTextNode): string => node.text ?? (node.children ?? []).map(inlineText).join("");

/** One line per top-level paragraph. */
export const richTextToLines = (nodes: RichTextNode[] | undefined): string => (nodes ?? []).map(inlineText).join("\n");

export const linesToRichText = (text: string): RichTextNode[] =>
  text.split("\n").map((line) => ({ type: "p", children: [{ text: line }] }));

/** True when the rich text uses formatting the plain-text editor can't keep (bold, links, lists…). */
export const hasFormatting = (nodes: RichTextNode[] | undefined): boolean =>
  (nodes ?? []).some(
    (node) =>
      node.bold || node.italic || node.underline || (node.type !== undefined && node.type !== "p") || hasFormatting(node.children),
  );
