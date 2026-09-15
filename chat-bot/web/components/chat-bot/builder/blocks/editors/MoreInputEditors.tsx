import { CredentialsSelect } from "../../inspector/CredentialsSelect";
import { CheckboxField, TextField, VariableSelect } from "../../inspector/fields";
import { VariableMappingList } from "../../inspector/listFields";
import { createId } from "../../state/createId";
import { type BlockEditorProps, labels, option, withLabels, withOptions } from "../blockHelpers";

export const FileInputEditor = ({ block, onChange }: BlockEditorProps) => {
  const allowed = option<{ isEnabled?: boolean; types?: string[] }>(block, "allowedFileTypes") ?? {};
  return (
    <>
      <CheckboxField label="Required" value={option<boolean>(block, "isRequired") ?? true} onChange={(isRequired) => onChange(withOptions(block, { isRequired }))} />
      <CheckboxField label="Allow multiple files" value={option<boolean>(block, "isMultipleAllowed")} onChange={(isMultipleAllowed) => onChange(withOptions(block, { isMultipleAllowed }))} />
      <CheckboxField label="Restrict file types" value={allowed.isEnabled} onChange={(isEnabled) => onChange(withOptions(block, { allowedFileTypes: { ...allowed, isEnabled } }))} />
      {allowed.isEnabled && (
        <TextField
          label="Allowed types"
          placeholder="pdf, png, jpg"
          value={(allowed.types ?? []).join(", ")}
          onChange={(value) => onChange(withOptions(block, { allowedFileTypes: { ...allowed, types: value.split(",").map((type) => type.trim()).filter(Boolean) } }))}
        />
      )}
      <TextField label="Placeholder" value={labels(block).placeholder} onChange={(placeholder) => onChange(withLabels(block, { placeholder }))} />
      <TextField label="Upload button" placeholder="Upload" value={labels(block).button} onChange={(button) => onChange(withLabels(block, { button }))} />
      <TextField label="Skip button" placeholder="Skip" value={labels(block).skip} onChange={(skip) => onChange(withLabels(block, { skip }))} />
      <VariableSelect label="Save the file URL(s) in" value={option<string>(block, "variableId")} onChange={(variableId) => onChange(withOptions(block, { variableId }))} />
      <p className="field__hint">Files are stored on this server (UPLOADS_DIR).</p>
    </>
  );
};

export const PaymentInputEditor = ({ block, onChange }: BlockEditorProps) => {
  const info = option<Record<string, unknown>>(block, "additionalInformation") ?? {};
  const setInfo = (patch: Record<string, unknown>) => onChange(withOptions(block, { additionalInformation: { ...info, ...patch } }));
  return (
    <>
      <CredentialsSelect type="stripe" blockId={block.id} value={option<string>(block, "credentialsId")} onChange={(credentialsId) => onChange(withOptions(block, { credentialsId, provider: "Stripe" }))} />
      <div className="field-row">
        <TextField label="Amount" placeholder="30 or {{Price}}" value={option<string>(block, "amount")} onChange={(amount) => onChange(withOptions(block, { amount }))} />
        <TextField label="Currency" placeholder="USD" value={option<string>(block, "currency")} onChange={(currency) => onChange(withOptions(block, { currency: currency.toUpperCase() }))} />
      </div>
      <TextField label="Description" value={info.description as string} onChange={(description) => setInfo({ description: description || undefined })} />
      <TextField label="Customer name" value={info.name as string} onChange={(name) => setInfo({ name: name || undefined })} />
      <TextField label="Customer email (receipt)" value={info.email as string} onChange={(email) => setInfo({ email: email || undefined })} />
      <TextField label="Customer phone" value={info.phoneNumber as string} onChange={(phoneNumber) => setInfo({ phoneNumber: phoneNumber || undefined })} />
      <TextField label="Pay button label" placeholder="Pay" value={labels(block).button} onChange={(button) => onChange(withLabels(block, { button }))} />
      <TextField label="Success message" placeholder="Success" value={labels(block).success} onChange={(success) => onChange(withLabels(block, { success }))} />
      <TextField label="Message when payment fails" value={option<string>(block, "retryMessageContent")} onChange={(retryMessageContent) => onChange(withOptions(block, { retryMessageContent }))} />
    </>
  );
};

type Card = { id: string; title?: string; description?: string; imageUrl?: string; outgoingEdgeId?: string; options?: { internalValue?: string }; paths?: { id: string; text?: string; outgoingEdgeId?: string }[] };

/** Cards: each card has an image, title, description and buttons; each button has its own connection. */
export const CardsEditor = ({ block, onChange }: BlockEditorProps) => {
  const cards = (block.items ?? []) as Card[];
  const setCards = (next: Card[]) => onChange({ ...block, items: next });
  const updateCard = (cardId: string, patch: Partial<Card>) => setCards(cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)));

  return (
    <>
      {cards.map((card, index) => (
        <fieldset key={card.id} className="item-editor">
          <legend>
            Card #{index + 1}
            <button type="button" className="btn btn--ghost btn--sm" disabled={cards.length <= 1} onClick={() => setCards(cards.filter((c) => c.id !== card.id))}>
              Remove
            </button>
          </legend>
          <input className="input" placeholder="Image URL" value={card.imageUrl ?? ""} onChange={(e) => updateCard(card.id, { imageUrl: e.target.value || undefined })} />
          <input className="input" placeholder="Title" value={card.title ?? ""} onChange={(e) => updateCard(card.id, { title: e.target.value || undefined })} />
          <textarea className="textarea" placeholder="Description" value={card.description ?? ""} onChange={(e) => updateCard(card.id, { description: e.target.value || undefined })} />
          <input
            className="input"
            placeholder="Internal value (optional)"
            value={card.options?.internalValue ?? ""}
            onChange={(e) => updateCard(card.id, { options: { ...card.options, internalValue: e.target.value || undefined } })}
          />
          <span className="field__label">Buttons</span>
          {(card.paths ?? []).map((path) => (
            <div key={path.id} className="list-field__row">
              <input
                className="input"
                placeholder="Button label"
                value={path.text ?? ""}
                onChange={(e) => updateCard(card.id, { paths: (card.paths ?? []).map((p) => (p.id === path.id ? { ...p, text: e.target.value } : p)) })}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={(card.paths ?? []).length <= 1}
                onClick={() => updateCard(card.id, { paths: (card.paths ?? []).filter((p) => p.id !== path.id) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--sm" onClick={() => updateCard(card.id, { paths: [...(card.paths ?? []), { id: createId(), text: "Button" }] })}>
            Add button
          </button>
        </fieldset>
      ))}
      <button type="button" className="btn btn--sm" onClick={() => setCards([...cards, newCard()])}>
        Add card
      </button>
      <VariableMappingList
        label="Save the selection"
        field="field"
        fieldOptions={["Title", "Description", "Image URL", "Button", "Internal Value"]}
        rows={option(block, "saveResponseMapping")}
        onChange={(saveResponseMapping) => onChange(withOptions(block, { saveResponseMapping }))}
      />
    </>
  );
};

export const newCard = (): Card => ({ id: createId(), title: "Card title", paths: [{ id: createId(), text: "Select" }] });
