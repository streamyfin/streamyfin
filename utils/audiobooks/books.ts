import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Jellyfin has no item for an audiobook made of several files. A single file
 * (an m4b with chapters, say) is one `AudioBook` item, but a book split into
 * parts is a plain `Folder` holding one `AudioBook` item per file: its
 * resolver skips multi-file books ("until we sort out naming for multi-part
 * books", AudioResolver.cs). The app groups those files back into books here.
 *
 * Grouping rules, in order:
 * - Files in the same folder whose album tag matches are one book. Ripped
 *   books tag every file with the book's title as album.
 * - Untagged files in the same folder are one book, named after the folder.
 * - A file straight in the library's root folder with no album tag is a book
 *   of its own: the root is a shelf, not a book.
 *
 * A book split over disc subfolders (CD1, CD2) stays one book per folder.
 */

const TICKS_PER_SECOND = 10_000_000;

export interface AudiobookChapter {
  title: string;
  /** Where the chapter starts in the book, in seconds. */
  start: number;
  /** Where it ends in the book, in seconds. */
  end: number;
  /** The file it is in. */
  partIndex: number;
}

export interface Audiobook {
  /** The id of the book's first part: stable, and enough to load it again. */
  id: string;
  title: string;
  authors: string[];
  narrators: string[];
  /** The item whose Primary image is the cover, null when nothing has one. */
  imageItemId: string | null;
  /** The folder a multi-part book is in, null for a book of one file. */
  folderId: string | null;
  /** The files in reading order. One for most books. */
  parts: BaseItemDto[];
  overview?: string | null;
  year?: number | null;
  genres?: string[] | null;
  dateCreated?: string | null;
  serverId?: string | null;
}

export const ticksToSecondsExact = (ticks?: number | null) =>
  ticks ? ticks / TICKS_PER_SECOND : 0;

export const secondsToTicksExact = (seconds: number) =>
  Math.max(0, Math.round(seconds * TICKS_PER_SECOND));

/**
 * Compares names the way people number files: "Part 2" before "Part 10".
 * Written out instead of `localeCompare`'s numeric option so the order is the
 * same on every engine.
 */
export const naturalCompare = (a: string, b: string): number => {
  const chunk = /(\d+|\D+)/g;
  const left = a.toLowerCase().match(chunk) ?? [];
  const right = b.toLowerCase().match(chunk) ?? [];
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const x = left[i];
    const y = right[i];
    if (x === y) continue;
    const xNumber = /^\d/.test(x);
    const yNumber = /^\d/.test(y);
    if (xNumber && yNumber) {
      const difference = Number(x) - Number(y);
      if (difference !== 0) return difference;
      // "01" and "1": the shorter spelling first, so the order stays total.
      return x.length - y.length;
    }
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
};

const partName = (part: BaseItemDto) => part.SortName || part.Name || "";

/** Disc, then track number when every part has one, then the name. */
export const sortParts = (parts: BaseItemDto[]): BaseItemDto[] => {
  const numbered = parts.every((part) => part.IndexNumber != null);
  return [...parts].sort((a, b) => {
    const disc = (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0);
    if (disc !== 0) return disc;
    if (numbered) {
      const track = (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);
      if (track !== 0) return track;
    }
    return naturalCompare(partName(a), partName(b));
  });
};

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const unique = (values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }
  return result;
};

const authorsOf = (parts: BaseItemDto[]) => {
  for (const part of parts) {
    const fromPeople = unique(
      (part.People ?? [])
        .filter((person) => person.Type === "Author")
        .map((person) => person.Name),
    );
    if (fromPeople.length > 0) return fromPeople;
    const fromTags = unique([
      ...(part.AlbumArtists ?? []).map((artist) => artist.Name),
      part.AlbumArtist,
      ...(part.Artists ?? []),
    ]);
    if (fromTags.length > 0) return fromTags;
  }
  return [];
};

// Tagging tools put the narrator in the composer field, Audible's convention,
// which Jellyfin keeps as a Composer; its own metadata calls it Narrator.
const narratorsOf = (parts: BaseItemDto[]) => {
  const people = parts.flatMap((part) => part.People ?? []);
  const narrators = unique(
    people.filter((p) => p.Type === "Narrator").map((p) => p.Name),
  );
  if (narrators.length > 0) return narrators;
  return unique(people.filter((p) => p.Type === "Composer").map((p) => p.Name));
};

const hasPrimaryImage = (item?: BaseItemDto | null) =>
  !!item?.ImageTags?.Primary;

/**
 * Builds one book from its files. `folder` is the folder a multi-part book is
 * in, for its name and cover.
 */
export const bookFromParts = (
  unsortedParts: BaseItemDto[],
  folder?: BaseItemDto | null,
): Audiobook => {
  const parts = sortParts(unsortedParts);
  const first = parts[0];
  const album = parts.find((part) => part.Album)?.Album;
  const multiPart = parts.length > 1;
  const title =
    album ||
    (multiPart ? folder?.Name : null) ||
    first?.Name ||
    folder?.Name ||
    "";
  const imageItem =
    parts.find(hasPrimaryImage) ?? (hasPrimaryImage(folder) ? folder : null);
  const withOverview = parts.find((part) => part.Overview);
  const withGenres = parts.find((part) => part.Genres?.length);
  const dates = parts
    .map((part) => part.DateCreated)
    .filter((date): date is string => !!date)
    .sort();

  return {
    id: first?.Id ?? "",
    title,
    authors: authorsOf(parts),
    narrators: narratorsOf(parts),
    imageItemId: imageItem?.Id ?? null,
    folderId: multiPart ? (folder?.Id ?? first?.ParentId ?? null) : null,
    parts,
    overview: withOverview?.Overview ?? folder?.Overview ?? null,
    year:
      parts.find((part) => part.ProductionYear)?.ProductionYear ??
      folder?.ProductionYear ??
      null,
    genres: withGenres?.Genres ?? null,
    // The newest file: a book counts as added when its last part arrived.
    dateCreated: dates.at(-1) ?? null,
    serverId: first?.ServerId ?? null,
  };
};

const groupKey = (item: BaseItemDto, rootIds: ReadonlySet<string>) => {
  const album = normalize(item.Album);
  const parentId = item.ParentId ?? "";
  const atRoot = !parentId || rootIds.has(parentId);
  if (atRoot && !album) return `item:${item.Id}`;
  return `folder:${parentId}|${album}`;
};

/**
 * The folders that are a library's shelves rather than books: the library
 * itself, and each folder whose parent is not a folder of the library (the
 * root of each of the library's paths).
 */
export const libraryRootIds = (
  libraryId: string | null | undefined,
  folders: BaseItemDto[],
): Set<string> => {
  const folderIds = new Set(folders.map((folder) => folder.Id).filter(Boolean));
  const roots = new Set<string>();
  if (libraryId) roots.add(libraryId);
  for (const folder of folders) {
    if (folder.Id && (!folder.ParentId || !folderIds.has(folder.ParentId))) {
      roots.add(folder.Id);
    }
  }
  return roots;
};

/**
 * Groups a library's audiobook files into books, in no particular order.
 * `folders` are the library's folders, for the root shelves and for the names
 * and covers of multi-part books.
 */
export const groupAudiobooks = (
  items: BaseItemDto[],
  folders: BaseItemDto[],
  rootIds: ReadonlySet<string>,
): Audiobook[] => {
  const folderById = new Map(
    folders.filter((f) => f.Id).map((folder) => [folder.Id!, folder]),
  );
  const groups = new Map<string, BaseItemDto[]>();
  for (const item of items) {
    if (item.Type !== "AudioBook" || !item.Id) continue;
    const key = groupKey(item, rootIds);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()].map((parts) =>
    bookFromParts(
      parts,
      parts.length > 1 && parts[0].ParentId
        ? folderById.get(parts[0].ParentId)
        : null,
    ),
  );
};

/**
 * The book one file belongs to, from that file's folder: `siblings` are the
 * audiobook files in it, `parentIsRoot` whether the folder is a library root.
 */
export const bookContainingItem = (
  item: BaseItemDto,
  siblings: BaseItemDto[],
  folder: BaseItemDto | null,
  parentIsRoot: boolean,
): Audiobook => {
  const roots = new Set<string>();
  if (parentIsRoot && item.ParentId) roots.add(item.ParentId);
  const candidates = siblings.some((sibling) => sibling.Id === item.Id)
    ? siblings
    : [item, ...siblings];
  const books = groupAudiobooks(candidates, folder ? [folder] : [], roots);
  return (
    books.find((book) => book.parts.some((part) => part.Id === item.Id)) ??
    bookFromParts([item])
  );
};

/** Each part's length in seconds, from the server's run time. */
export const partDurations = (book: Audiobook): number[] =>
  book.parts.map((part) => ticksToSecondsExact(part.RunTimeTicks));

/** Where each part starts in the book, in seconds. */
export const partOffsets = (book: Audiobook): number[] => {
  const offsets: number[] = [];
  let total = 0;
  for (const duration of partDurations(book)) {
    offsets.push(total);
    total += duration;
  }
  return offsets;
};

export const bookDuration = (book: Audiobook): number =>
  partDurations(book).reduce((sum, duration) => sum + duration, 0);

/** The position in the book of a position in one of its parts. */
export const toBookPosition = (
  book: Audiobook,
  partIndex: number,
  partPosition: number,
): number => {
  const offsets = partOffsets(book);
  const index = Math.min(Math.max(partIndex, 0), offsets.length - 1);
  return (offsets[index] ?? 0) + Math.max(partPosition, 0);
};

/**
 * The part and the position in it for a position in the book. A position at
 * a part's very end is the next part's start; past the book's end is the last
 * part's end.
 */
export const locateBookPosition = (
  book: Audiobook,
  bookPosition: number,
): { partIndex: number; partPosition: number } => {
  const durations = partDurations(book);
  if (durations.length === 0) return { partIndex: 0, partPosition: 0 };
  let remaining = Math.max(bookPosition, 0);
  for (let i = 0; i < durations.length; i++) {
    if (remaining < durations[i] || i === durations.length - 1) {
      return {
        partIndex: i,
        partPosition: Math.min(remaining, durations[i]),
      };
    }
    remaining -= durations[i];
  }
  return { partIndex: 0, partPosition: 0 };
};

/**
 * The book's chapters, start to end. A part with chapter markers (an m4b)
 * gives its own; a part without is one chapter, named after the part when the
 * book has several and after the book when it has one.
 */
export const buildChapters = (book: Audiobook): AudiobookChapter[] => {
  const durations = partDurations(book);
  const offsets = partOffsets(book);
  const chapters: AudiobookChapter[] = [];
  book.parts.forEach((part, partIndex) => {
    const offset = offsets[partIndex];
    const partEnd = offset + durations[partIndex];
    const markers = (part.Chapters ?? [])
      .map((chapter) => ({
        title: chapter.Name ?? "",
        start: offset + ticksToSecondsExact(chapter.StartPositionTicks),
      }))
      .filter((marker) => marker.start < partEnd)
      .sort((a, b) => a.start - b.start);

    if (markers.length === 0) {
      chapters.push({
        title:
          book.parts.length > 1
            ? part.Name || `${partIndex + 1}`
            : book.title || part.Name || "",
        start: offset,
        end: partEnd,
        partIndex,
      });
      return;
    }

    // Audio before the first marker is a chapter of its own, not lost.
    if (markers[0].start > offset + 1) {
      markers.unshift({ title: part.Name || book.title, start: offset });
    } else {
      markers[0].start = offset;
    }
    markers.forEach((marker, i) => {
      const end = i + 1 < markers.length ? markers[i + 1].start : partEnd;
      // Two markers at one spot leave a chapter of no length to skip to.
      if (end - marker.start <= 0) return;
      chapters.push({
        title: marker.title,
        start: marker.start,
        end,
        partIndex,
      });
    });
  });
  return chapters;
};

/** The chapter playing at a position in the book, -1 for an empty list. */
export const chapterIndexAt = (
  chapters: AudiobookChapter[],
  bookPosition: number,
): number => {
  if (chapters.length === 0) return -1;
  // A seek lands a hair before a chapter start once the player rounds it.
  const position = bookPosition + 0.25;
  let low = 0;
  let high = chapters.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (chapters[middle].start <= position) low = middle;
    else high = middle - 1;
  }
  return low;
};

/**
 * The part fields the app keeps on the device for a book: enough to show it
 * and play it without the server.
 */
export const slimPart = (part: BaseItemDto): BaseItemDto => ({
  Id: part.Id,
  Name: part.Name,
  SortName: part.SortName,
  Type: part.Type,
  MediaType: part.MediaType,
  ServerId: part.ServerId,
  ParentId: part.ParentId,
  Album: part.Album,
  AlbumArtist: part.AlbumArtist,
  Artists: part.Artists,
  RunTimeTicks: part.RunTimeTicks,
  IndexNumber: part.IndexNumber,
  ParentIndexNumber: part.ParentIndexNumber,
  ImageTags: part.ImageTags,
  DateCreated: part.DateCreated,
  Chapters: part.Chapters?.map((chapter) => ({
    Name: chapter.Name,
    StartPositionTicks: chapter.StartPositionTicks,
  })),
  UserData: part.UserData
    ? {
        Key: part.UserData.Key,
        ItemId: part.UserData.ItemId,
        PlaybackPositionTicks: part.UserData.PlaybackPositionTicks,
        Played: part.UserData.Played,
        LastPlayedDate: part.UserData.LastPlayedDate,
        IsFavorite: part.UserData.IsFavorite,
      }
    : undefined,
});

/** A book with its parts slimmed, for storage. */
export const slimBook = (book: Audiobook): Audiobook => ({
  ...book,
  parts: book.parts.map(slimPart),
});

/** The authors as one line, or null when the tags name none. */
export const authorLine = (book: Audiobook): string | null =>
  book.authors.length > 0 ? book.authors.join(", ") : null;

/**
 * A chapter's name to show. Rippers often number chapters ("001") rather than
 * name them: those read as "Chapter 1", through `numbered`.
 */
export const chapterDisplayTitle = (
  chapter: Pick<AudiobookChapter, "title">,
  index: number,
  numbered: (number: number) => string,
): string => {
  const title = chapter.title.trim();
  if (!title || /^\d+$/.test(title)) return numbered(index + 1);
  return title;
};
