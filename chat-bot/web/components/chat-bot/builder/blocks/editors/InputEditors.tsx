import { CheckboxField, NumberField, SelectField, TextField, VariableSelect } from "../../inspector/fields";
import { type BlockEditorProps, labels, option, withLabels, withOptions } from "../blockHelpers";

const SaveAnswer = ({ block, onChange }: BlockEditorProps) => (
  <VariableSelect
    label="Save the answer in"
    value={option<string>(block, "variableId")}
    onChange={(variableId) => onChange(withOptions(block, { variableId }))}
  />
);

const CommonLabels = ({ block, onChange }: BlockEditorProps) => (
  <>
    <TextField label="Placeholder" value={labels(block).placeholder} onChange={(placeholder) => onChange(withLabels(block, { placeholder }))} />
    <TextField label="Button label" value={labels(block).button} placeholder="Send" onChange={(button) => onChange(withLabels(block, { button }))} />
  </>
);

const RetryMessage = ({ block, onChange }: BlockEditorProps) => (
  <TextField
    label="Message when the answer is invalid"
    value={option<string>(block, "retryMessageContent")}
    onChange={(retryMessageContent) => onChange(withOptions(block, { retryMessageContent }))}
  />
);

/** text / email / url / phone number / time inputs */
export const TextInputEditor = (props: BlockEditorProps) => {
  const { block, onChange } = props;
  return (
    <>
      {block.type !== "time input" && <CommonLabels {...props} />}
      {block.type === "time input" && (
        <TextField label="Button label" value={labels(block).button} placeholder="Send" onChange={(button) => onChange(withLabels(block, { button }))} />
      )}
      {block.type === "text input" && (
        <CheckboxField label="Long text" value={option<boolean>(block, "isLong")} onChange={(isLong) => onChange(withOptions(block, { isLong }))} />
      )}
      {["email input", "url input", "phone number input"].includes(block.type) && <RetryMessage {...props} />}
      {block.type === "phone number input" && (
        <TextField
          label="Default country code"
          placeholder="e.g. US"
          value={option<string>(block, "defaultCountryCode")}
          onChange={(defaultCountryCode) => onChange(withOptions(block, { defaultCountryCode }))}
        />
      )}
      <SaveAnswer {...props} />
    </>
  );
};

export const NumberInputEditor = (props: BlockEditorProps) => {
  const { block, onChange } = props;
  return (
    <>
      <CommonLabels {...props} />
      <div className="field-row">
        <NumberField label="Min" value={option<number>(block, "min")} onChange={(min) => onChange(withOptions(block, { min }))} />
        <NumberField label="Max" value={option<number>(block, "max")} onChange={(max) => onChange(withOptions(block, { max }))} />
        <NumberField label="Step" value={option<number>(block, "step")} onChange={(step) => onChange(withOptions(block, { step }))} />
      </div>
      <SaveAnswer {...props} />
    </>
  );
};

export const DateInputEditor = (props: BlockEditorProps) => {
  const { block, onChange } = props;
  const isRange = option<boolean>(block, "isRange");
  return (
    <>
      <CheckboxField label="Is range" value={isRange} onChange={(value) => onChange(withOptions(block, { isRange: value }))} />
      <CheckboxField label="With time" value={option<boolean>(block, "hasTime")} onChange={(hasTime) => onChange(withOptions(block, { hasTime }))} />
      {isRange && (
        <div className="field-row">
          <TextField label="From label" value={labels(block).from} placeholder="From:" onChange={(from) => onChange(withLabels(block, { from }))} />
          <TextField label="To label" value={labels(block).to} placeholder="To:" onChange={(to) => onChange(withLabels(block, { to }))} />
        </div>
      )}
      <TextField label="Button label" value={labels(block).button} placeholder="Send" onChange={(button) => onChange(withLabels(block, { button }))} />
      <TextField
        label="Stored format"
        placeholder="dd/MM/yyyy"
        hint="How the answer is saved, e.g. dd/MM/yyyy or yyyy-MM-dd HH:mm"
        value={option<string>(block, "format")}
        onChange={(format) => onChange(withOptions(block, { format }))}
      />
      <SaveAnswer {...props} />
    </>
  );
};

export const RatingInputEditor = (props: BlockEditorProps) => {
  const { block, onChange } = props;
  return (
    <>
      <SelectField
        label="Style"
        value={option<"Numbers" | "Icons">(block, "buttonType") ?? "Numbers"}
        options={[
          { value: "Numbers", label: "Numbers" },
          { value: "Icons", label: "Stars" },
        ]}
        onChange={(buttonType) => onChange(withOptions(block, { buttonType }))}
      />
      <div className="field-row">
        <NumberField label="Maximum" min={1} max={20} value={option<number>(block, "length") ?? 10} onChange={(length) => onChange(withOptions(block, { length }))} />
        <NumberField label="Starts at" min={0} value={option<number>(block, "startsAt")} onChange={(startsAt) => onChange(withOptions(block, { startsAt }))} />
      </div>
      <div className="field-row">
        <TextField label="Left label" value={labels(block).left} onChange={(left) => onChange(withLabels(block, { left }))} />
        <TextField label="Right label" value={labels(block).right} onChange={(right) => onChange(withLabels(block, { right }))} />
      </div>
      <CheckboxField
        label="Submit on click"
        value={option<boolean>(block, "isOneClickSubmitEnabled")}
        onChange={(isOneClickSubmitEnabled) => onChange(withOptions(block, { isOneClickSubmitEnabled }))}
      />
      <TextField label="Button label" value={labels(block).button} placeholder="Send" onChange={(button) => onChange(withLabels(block, { button }))} />
      <SaveAnswer {...props} />
    </>
  );
};
