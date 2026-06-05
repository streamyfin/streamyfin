export const normalize = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export interface Searchable {
  title: string;
  keywords?: string[];
}

export const matchesQuery = (item: Searchable, query: string): boolean => {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize([item.title, ...(item.keywords ?? [])].join(" "));
  return hay.includes(q);
};
