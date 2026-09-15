import type { ReactNode } from "react";
import type { RichTextNode } from "../../../api/types";

/**
 * Renders the rich-text JSON returned by the chat API as React elements.
 * No HTML parsing: text is always escaped by React, links are restricted to safe protocols.
 */
const BLOCK_TAGS: Record<string, keyof HTMLElementTagNameMap> = {
  p: "p",
  h1: "h3",
  h2: "h4",
  h3: "h5",
  ul: "ul",
  ol: "ol",
  li: "li",
  blockquote: "blockquote",
};

const isSafeUrl = (url: string | undefined): url is string => !!url && /^(https?:|mailto:|tel:)/i.test(url);

const renderNode = (node: RichTextNode, key: number): ReactNode => {
  if (node.text !== undefined) {
    let content: ReactNode = node.text;
    if (node.bold) content = <strong>{content}</strong>;
    if (node.italic) content = <em>{content}</em>;
    if (node.underline) content = <u>{content}</u>;
    return <span key={key}>{content}</span>;
  }

  const children = node.children?.map(renderNode);
  if (node.type === "a")
    return isSafeUrl(node.url) ? (
      <a key={key} href={node.url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <span key={key}>{children}</span>
    );

  const Tag = (node.type && BLOCK_TAGS[node.type]) || "span";
  return <Tag key={key}>{children}</Tag>;
};

export const RichText = ({ nodes }: { nodes: RichTextNode[] }) => <>{nodes.map(renderNode)}</>;
