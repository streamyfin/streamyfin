/*
 * Truncate a text longer than a certain length
 */
export const tc = (text: string | null | undefined, length = 20) => {
  if (!text) return "";
  return text.length > length ? text.substr(0, length) + "..." : text;
};
