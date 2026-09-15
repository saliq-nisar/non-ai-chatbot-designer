const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Collision-resistant id in the format stored in the database (24 lowercase alphanumerics, starts with a letter). */
export const createId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(24));
  let id = ALPHABET[bytes[0]! % 26]!;
  for (let i = 1; i < bytes.length; i++) id += ALPHABET[bytes[i]! % ALPHABET.length];
  return id;
};
