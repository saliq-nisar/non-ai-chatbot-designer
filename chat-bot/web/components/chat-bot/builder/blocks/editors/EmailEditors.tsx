import { CredentialsSelect } from "../../inspector/CredentialsSelect";
import { CheckboxField, TextField, VariableSelect } from "../../inspector/fields";
import { TextList, VariableMappingList } from "../../inspector/listFields";
import { type BlockEditorProps, option, withOptions } from "../blockHelpers";

/** Email block: sends with the default SMTP server (environment) or a saved SMTP account. */
export const EmailEditor = ({ block, onChange }: BlockEditorProps) => {
  const isCustomBody = option<boolean>(block, "isCustomBody");
  return (
    <>
      <CredentialsSelect
        type="smtp"
        blockId={block.id}
        value={option<string>(block, "credentialsId") ?? "default"}
        defaultOption={{ value: "default", label: "Default (server SMTP settings)" }}
        onChange={(credentialsId) => onChange(withOptions(block, { credentialsId }))}
      />
      <TextList label="To" placeholder="name@example.com or {{Email}}" values={option(block, "recipients")} onChange={(recipients) => onChange(withOptions(block, { recipients }))} />
      <TextField label="Subject" value={option<string>(block, "subject")} onChange={(subject) => onChange(withOptions(block, { subject }))} />
      <CheckboxField label="Custom content" value={isCustomBody} onChange={(value) => onChange(withOptions(block, { isCustomBody: value }))} />
      {isCustomBody ? (
        <>
          <TextField label="Content" multiline value={option<string>(block, "body")} onChange={(body) => onChange(withOptions(block, { body }))} />
          <CheckboxField label="Content is HTML" value={option<boolean>(block, "isBodyCode")} onChange={(isBodyCode) => onChange(withOptions(block, { isBodyCode }))} />
        </>
      ) : (
        <p className="field__hint">Without custom content, the email lists all answers and variables.</p>
      )}
      <TextField label="Reply to" value={option<string>(block, "replyTo")} onChange={(replyTo) => onChange(withOptions(block, { replyTo }))} />
      <TextList label="Cc" values={option(block, "cc")} onChange={(cc) => onChange(withOptions(block, { cc }))} />
      <TextList label="Bcc" values={option(block, "bcc")} onChange={(bcc) => onChange(withOptions(block, { bcc }))} />
      <VariableSelect label="Attachments (file URLs variable)" value={option<string>(block, "attachmentsVariableId")} onChange={(attachmentsVariableId) => onChange(withOptions(block, { attachmentsVariableId }))} />
      <p className="field__hint">Emails are not sent from the Test panel.</p>
    </>
  );
};

/** Gmail block: sends from a connected Gmail account. */
export const GmailEditor = ({ block, onChange }: BlockEditorProps) => (
  <>
    <CredentialsSelect type="gmail" blockId={block.id} value={option<string>(block, "credentialsId")} onChange={(credentialsId) => onChange(withOptions(block, { credentialsId, action: "Send email" }))} />
    <TextField label="To" placeholder="name@example.com" value={option<string>(block, "to")} onChange={(to) => onChange(withOptions(block, { to, action: "Send email" }))} />
    <TextField label="Subject" value={option<string>(block, "subject")} onChange={(subject) => onChange(withOptions(block, { subject }))} />
    <TextField label="Body" multiline value={option<string>(block, "body")} onChange={(body) => onChange(withOptions(block, { body }))} />
    <TextField label="From (optional)" placeholder="John Doe <john@gmail.com>" value={option<string>(block, "from")} onChange={(from) => onChange(withOptions(block, { from }))} />
    <TextField label="Reply to (optional)" value={option<string>(block, "replyTo")} onChange={(replyTo) => onChange(withOptions(block, { replyTo }))} />
    <TextField label="Thread ID (optional)" hint="Sends the email as a reply in that thread." value={option<string>(block, "threadId")} onChange={(threadId) => onChange(withOptions(block, { threadId }))} />
    <VariableMappingList
      label="Save response"
      field="item"
      fieldOptions={["Message ID", "Thread ID"]}
      rows={option(block, "responseMapping")}
      onChange={(responseMapping) => onChange(withOptions(block, { responseMapping }))}
    />
    <p className="field__hint">Emails are not sent from the Test panel.</p>
  </>
);
