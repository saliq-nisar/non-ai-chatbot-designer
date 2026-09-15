import type { RichTextNode } from "../../../../../api/types";
import { CheckboxField, NumberField, TextField } from "../../inspector/fields";
import { type BlockEditorProps, hasFormatting, linesToRichText, richTextToLines, withContent } from "../blockHelpers";

export const TextBubbleEditor = ({ block, onChange }: BlockEditorProps) => {
  const richText = block.content?.richText as RichTextNode[] | undefined;
  return (
    <>
      <TextField
        label="Message"
        multiline
        value={richTextToLines(richText)}
        placeholder="Type the bot's message. Use {{Variable name}} to insert a variable."
        onChange={(text) => onChange({ ...block, content: { richText: linesToRichText(text) } })}
      />
      {hasFormatting(richText) && (
        <p className="alert alert--info">This message has formatting (bold, links…) that is removed if you edit it here.</p>
      )}
    </>
  );
};

export const ImageBubbleEditor = ({ block, onChange }: BlockEditorProps) => {
  const clickLink = (block.content?.clickLink ?? {}) as { url?: string; alt?: string };
  return (
    <>
      <TextField label="Image URL" value={block.content?.url as string} onChange={(url) => onChange(withContent(block, { url }))} />
      <TextField
        label="Link on click (optional)"
        value={clickLink.url}
        onChange={(url) => onChange(withContent(block, { clickLink: { ...clickLink, url: url || undefined } }))}
      />
      <TextField
        label="Alternative text"
        value={clickLink.alt}
        onChange={(alt) => onChange(withContent(block, { clickLink: { ...clickLink, alt: alt || undefined } }))}
      />
    </>
  );
};

// Same URL recognition as the existing builder.
const YOUTUBE = /youtube\.com\/(watch\?v=|shorts\/)([\w-]+)|youtu\.be\/([\w-]+)/;
const VIMEO = /vimeo\.com\/(\d+)/;

const parseVideoUrl = (url: string) => {
  const youtube = url.match(YOUTUBE);
  if (youtube) return { type: "youtube", id: youtube[2] ?? youtube[3] };
  const vimeo = url.match(VIMEO);
  if (vimeo) return { type: "vimeo", id: vimeo[1] };
  return { type: "url", id: undefined };
};

export const VideoBubbleEditor = ({ block, onChange }: BlockEditorProps) => (
  <TextField
    label="Video URL"
    hint="A direct video file URL, or a YouTube / Vimeo link."
    value={block.content?.url as string}
    onChange={(url) => onChange(withContent(block, { url, ...parseVideoUrl(url) }))}
  />
);

export const AudioBubbleEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <TextField label="Audio URL" value={block.content?.url as string} onChange={(url) => onChange(withContent(block, { url }))} />
    <CheckboxField
      label="Autoplay"
      value={block.content?.isAutoplayEnabled as boolean}
      onChange={(isAutoplayEnabled) => onChange(withContent(block, { isAutoplayEnabled }))}
    />
  </>
);

export const EmbedBubbleEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <TextField label="Page URL" value={block.content?.url as string} onChange={(url) => onChange(withContent(block, { url }))} />
    <NumberField
      label="Height (px)"
      value={block.content?.height as number}
      min={50}
      onChange={(height) => onChange(withContent(block, { height }))}
    />
  </>
);
