import { CheckboxField, NumberField, SelectField, TextField } from "../../inspector/fields";
import { KeyValueList, VariableMappingList } from "../../inspector/listFields";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Request = { url?: string; method?: string; headers?: { id: string }[]; queryParams?: { id: string }[]; body?: string };

/** HTTP request block — also used for Zapier, Make.com and Pabbly (paste their webhook URL). */
export const HttpRequestEditor = ({ block, onChange }: BlockEditorProps) => {
  const request = option<Request>(block, "webhook") ?? {};
  const setRequest = (patch: Partial<Request>) => onChange(withOptions(block, { webhook: { method: "POST", ...request, ...patch } }));
  const isCustomBody = option<boolean>(block, "isCustomBody");

  return (
    <>
      {block.type !== "Webhook" && <p className="field__hint">Paste the webhook URL from your {block.type} scenario.</p>}
      <TextField label="URL" placeholder="https://api.example.com/items/{{Id}}" value={request.url} onChange={(url) => setRequest({ url: url || undefined })} />
      <SelectField label="Method" value={(request.method as (typeof METHODS)[number]) ?? "POST"} options={METHODS.map((value) => ({ value, label: value }))} onChange={(method) => setRequest({ method })} />
      <KeyValueList label="Query parameters" rows={request.queryParams} onChange={(queryParams) => setRequest({ queryParams })} />
      <KeyValueList label="Headers" rows={request.headers} keyPlaceholder="Authorization" valuePlaceholder="Bearer {{Token}}" onChange={(headers) => setRequest({ headers })} />
      {request.method !== "GET" && (
        <>
          <CheckboxField label="Custom body" value={isCustomBody} onChange={(value) => onChange(withOptions(block, { isCustomBody: value }))} />
          {isCustomBody ? (
            <TextField label="Body (JSON)" multiline placeholder={'{ "email": "{{Email}}" }'} value={request.body} onChange={(body) => setRequest({ body: body || undefined })} />
          ) : (
            <p className="field__hint">Without a custom body, all answers and variables are sent as JSON.</p>
          )}
        </>
      )}
      <NumberField label="Timeout (seconds)" min={1} max={120} value={option<number>(block, "timeout")} onChange={(timeout) => onChange(withOptions(block, { timeout }))} />
      <VariableMappingList
        label="Save response"
        field="bodyPath"
        fieldPlaceholder="data.user.name"
        rows={option(block, "responseVariableMapping")}
        onChange={(responseVariableMapping) => onChange(withOptions(block, { responseVariableMapping }))}
      />
      <p className="field__hint">
        Paths start with <code>data</code> (response body) or <code>statusCode</code>, e.g. <code>data.items[0].id</code>.
      </p>
    </>
  );
};
