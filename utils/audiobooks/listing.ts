import type { Audiobook } from "@/utils/audiobooks/books";
import { naturalCompare } from "@/utils/audiobooks/books";
import { isInProgress, type ResumePoint } from "@/utils/audiobooks/progress";

export type AudiobookSort = "title" | "author" | "added" | "listened";
export type AudiobookFilter = "all" | "unstarted" | "started" | "finished";

type ProgressMap = ReadonlyMap<string, { point: ResumePoint }>;

const UNKNOWN_AUTHOR_SORT = "￿";

// "The Hobbit" files under H, as shelves do.
const sortTitle = (title: string) =>
  title.replace(/^(the|a|an)\s+/i, "").trim();

const matches = (book: Audiobook, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [book.title, ...book.authors, ...book.narrators].some((value) =>
    value.toLowerCase().includes(needle),
  );
};

const passesFilter = (
  filter: AudiobookFilter,
  point: ResumePoint | undefined,
) => {
  if (filter === "all") return true;
  if (!point) return filter === "unstarted";
  if (filter === "finished") return point.finished;
  if (filter === "started") return isInProgress(point);
  return !point.finished && !isInProgress(point);
};

/** The books a library grid shows, for its search, filter and sort. */
export const filterAndSortBooks = (
  books: Audiobook[],
  progress: ProgressMap,
  options: { search: string; sort: AudiobookSort; filter: AudiobookFilter },
): Audiobook[] => {
  const byTitle = (a: Audiobook, b: Audiobook) =>
    naturalCompare(sortTitle(a.title), sortTitle(b.title));
  const comparators: Record<
    AudiobookSort,
    (a: Audiobook, b: Audiobook) => number
  > = {
    title: byTitle,
    author: (a, b) =>
      naturalCompare(
        a.authors[0] ?? UNKNOWN_AUTHOR_SORT,
        b.authors[0] ?? UNKNOWN_AUTHOR_SORT,
      ) || byTitle(a, b),
    added: (a, b) =>
      (b.dateCreated ?? "").localeCompare(a.dateCreated ?? "") || byTitle(a, b),
    listened: (a, b) =>
      (progress.get(b.id)?.point.at ?? 0) -
        (progress.get(a.id)?.point.at ?? 0) || byTitle(a, b),
  };
  return books
    .filter(
      (book) =>
        matches(book, options.search) &&
        passesFilter(options.filter, progress.get(book.id)?.point),
    )
    .sort(comparators[options.sort]);
};

export interface AuthorEntry {
  name: string;
  books: Audiobook[];
}

/**
 * The library's authors, each with their books, by name. A book with several
 * authors is under each; one with none is left out, its tags name nobody.
 */
export const groupByAuthor = (books: Audiobook[]): AuthorEntry[] => {
  const byKey = new Map<string, AuthorEntry>();
  for (const book of books) {
    for (const author of book.authors) {
      const key = author.toLowerCase();
      const entry = byKey.get(key);
      if (entry) entry.books.push(book);
      else byKey.set(key, { name: author, books: [book] });
    }
  }
  return [...byKey.values()].sort((a, b) => naturalCompare(a.name, b.name));
};

/** The books of one author, matched without regard to case. */
export const booksByAuthor = (books: Audiobook[], author: string) => {
  const key = author.toLowerCase();
  return books.filter((book) =>
    book.authors.some((name) => name.toLowerCase() === key),
  );
};
