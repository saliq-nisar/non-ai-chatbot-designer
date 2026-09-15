/** Default public ID: "<kebab-case name>-<last 7 characters of the chat bot id>". */
export const defaultPublicId = (name: string, chatBotId: string) => {
  const words = name.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g) ?? [];
  const prefix = words.map((word) => word.toLowerCase()).join("-");
  return `${prefix ? `${prefix}-` : ""}${chatBotId.slice(-7)}`;
};

/** Public IDs the API accepts: lowercase letters, digits and dashes. */
export const isValidPublicId = (value: string) => /^([a-z0-9]+-[a-z0-9]*)*$/.test(value) || /^[a-z0-9]*$/.test(value);
