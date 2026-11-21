import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  bookContainingItem,
  bookDuration,
  bookFromParts,
  buildChapters,
  chapterDisplayTitle,
  chapterIndexAt,
  groupAudiobooks,
  libraryRootIds,
  locateBookPosition,
  naturalCompare,
  slimPart,
  sortParts,
  toBookPosition,
} from "./books";

const HOUR = 3600;
const ticks = (seconds: number) => seconds * 10_000_000;

const part = (overrides: Partial<BaseItemDto>): BaseItemDto => ({
  Type: "AudioBook",
  RunTimeTicks: ticks(HOUR),
  ...overrides,
});

// The shape of a real books library (Jellyfin 10.11/12): the m4b books sit
// straight in the root folder, tagged; the mp3 book is a folder of untagged
// parts. Read from a server with exactly these items.
const ROOT = "root-folder";
const LIBRARY = "library";
const folders: BaseItemDto[] = [
  { Id: ROOT, Type: "Folder", Name: "Audio Books", ParentId: "aggregate" },
  {
    Id: "fellowship-folder",
    Type: "Folder",
    Name: "Lord of the Rings - The Fellowship of the Ring",
    ParentId: ROOT,
  },
];
const twoTowers = part({
  Id: "two-towers",
  Name: "The Two Towers: Lord of the Rings, Book 2",
  Album: "The Two Towers: Lord of the Rings, Book 2",
  AlbumArtist: "J. R. R. Tolkien",
  Artists: ["J. R. R. Tolkien"],
  ParentId: ROOT,
  ImageTags: { Primary: "tag" },
  RunTimeTicks: ticks(20 * HOUR),
  Chapters: [
    { Name: "001", StartPositionTicks: 0 },
    { Name: "002", StartPositionTicks: ticks(800) },
  ],
});
const kingTagged = part({
  Id: "return-of-the-king",
  Name: "The Return of the King: Lord of the Rings, Book 3",
  Album: "The Return of the King: Lord of the Rings, Book 3",
  AlbumArtist: "J. R. R. Tolkien",
  ParentId: ROOT,
});
const fellowship1 = part({
  Id: "fellowship-1",
  Name: "The Lord of the Rings - The Fellowship of the Ring - Part 1",
  ParentId: "fellowship-folder",
  RunTimeTicks: ticks(8 * HOUR),
});
const fellowship2 = part({
  Id: "fellowship-2",
  Name: "The Lord of the Rings - The Fellowship of the Ring - Part 2",
  ParentId: "fellowship-folder",
  RunTimeTicks: ticks(10 * HOUR),
});

describe("grouping a books library", () => {
  const roots = libraryRootIds(LIBRARY, folders);

  test("the library and the folders whose parent is outside it are roots", () => {
    expect([...roots].sort()).toEqual([LIBRARY, ROOT].sort());
  });

  test("tagged single files are a book each, a folder of parts is one book", () => {
    const books = groupAudiobooks(
      [twoTowers, fellowship2, kingTagged, fellowship1],
      folders,
      roots,
    );
    const titles = books.map((book) => book.title).sort();
    expect(titles).toEqual([
      "Lord of the Rings - The Fellowship of the Ring",
      "The Return of the King: Lord of the Rings, Book 3",
      "The Two Towers: Lord of the Rings, Book 2",
    ]);
    const fellowship = books.find((book) => book.parts.length === 2)!;
    expect(fellowship.parts.map((p) => p.Id)).toEqual([
      "fellowship-1",
      "fellowship-2",
    ]);
    // The book is known by its first part.
    expect(fellowship.id).toBe("fellowship-1");
    expect(fellowship.folderId).toBe("fellowship-folder");
  });

  test("untagged files straight in a root folder stay books of their own", () => {
    const books = groupAudiobooks(
      [
        part({ Id: "a", Name: "Dune", ParentId: ROOT }),
        part({ Id: "b", Name: "Emma", ParentId: ROOT }),
      ],
      folders,
      roots,
    );
    expect(books).toHaveLength(2);
  });

  test("files in one folder with different album tags are different books", () => {
    const books = groupAudiobooks(
      [
        part({ Id: "a", Album: "Book One", ParentId: "author" }),
        part({ Id: "b", Album: "Book Two", ParentId: "author" }),
        part({ Id: "c", Album: "Book One", ParentId: "author" }),
      ],
      [{ Id: "author", Type: "Folder", ParentId: ROOT }, ...folders],
      roots,
    );
    expect(books.map((book) => book.parts.length).sort()).toEqual([1, 2]);
  });

  test("ignores items that are not audiobooks, an ebook among them", () => {
    const books = groupAudiobooks(
      [twoTowers, { Id: "ebook", Type: "Book", ParentId: ROOT }],
      folders,
      roots,
    );
    expect(books.map((book) => book.id)).toEqual(["two-towers"]);
  });

  test("finds the book of one part from the parts in its folder", () => {
    const book = bookContainingItem(
      fellowship2,
      [fellowship1, fellowship2],
      folders[1],
      false,
    );
    expect(book.parts.map((p) => p.Id)).toEqual([
      "fellowship-1",
      "fellowship-2",
    ]);
    expect(book.title).toBe("Lord of the Rings - The Fellowship of the Ring");
  });

  test("a file in a root folder is its own book even beside others", () => {
    const loose = part({ Id: "loose", Name: "Loose", ParentId: ROOT });
    const book = bookContainingItem(
      loose,
      [loose, part({ Id: "other", ParentId: ROOT })],
      null,
      true,
    );
    expect(book.parts.map((p) => p.Id)).toEqual(["loose"]);
  });
});

describe("a book's metadata", () => {
  test("takes the author from the tags, the narrator from the people", () => {
    const book = bookFromParts([
      {
        ...twoTowers,
        People: [
          { Name: "J. R. R. Tolkien", Type: "Author" },
          { Name: "Andy Serkis", Type: "Narrator" },
        ],
      },
    ]);
    expect(book.authors).toEqual(["J. R. R. Tolkien"]);
    expect(book.narrators).toEqual(["Andy Serkis"]);
  });

  test("falls back to the composer for the narrator, Audible's tagging", () => {
    const book = bookFromParts([
      { ...kingTagged, People: [{ Name: "Rob Inglis", Type: "Composer" }] },
    ]);
    expect(book.narrators).toEqual(["Rob Inglis"]);
  });

  test("uses the folder's cover when no part has one", () => {
    const book = bookFromParts([fellowship1, fellowship2], {
      ...folders[1],
      ImageTags: { Primary: "cover" },
    });
    expect(book.imageItemId).toBe("fellowship-folder");
  });

  test("has no cover when nothing has one", () => {
    expect(
      bookFromParts([fellowship1, fellowship2], folders[1]).imageItemId,
    ).toBe(null);
  });
});

describe("a part kept on the device", () => {
  // The player shows the file's details for a downloaded part too.
  test("keeps the file's audio details and drops the rest", () => {
    const slim = slimPart({
      ...fellowship1,
      MediaSources: [
        {
          Id: "source",
          Container: "m4b",
          Size: 512_000_000,
          Bitrate: 64_000,
          Path: "/books/fellowship.m4b",
          MediaStreams: [
            {
              Type: "Audio",
              Codec: "aac",
              BitRate: 64_000,
              SampleRate: 44_100,
              Channels: 2,
              Language: "eng",
            },
            { Type: "EmbeddedImage", Codec: "mjpeg" },
          ],
        },
        { Id: "second" },
      ],
    });
    expect(slim.MediaSources).toEqual([
      {
        Id: "source",
        Container: "m4b",
        Size: 512_000_000,
        Bitrate: 64_000,
        MediaStreams: [
          {
            Type: "Audio",
            Codec: "aac",
            BitRate: 64_000,
            SampleRate: 44_100,
            Channels: 2,
          },
        ],
      },
    ]);
  });
});

describe("part order", () => {
  test("numbers in names count as numbers", () => {
    expect(["Part 10", "Part 2", "Part 1"].sort(naturalCompare)).toEqual([
      "Part 1",
      "Part 2",
      "Part 10",
    ]);
  });

  test("disc, then track number, when every part has one", () => {
    const sorted = sortParts([
      part({ Id: "d2t1", ParentIndexNumber: 2, IndexNumber: 1, Name: "a" }),
      part({ Id: "d1t2", ParentIndexNumber: 1, IndexNumber: 2, Name: "b" }),
      part({ Id: "d1t1", ParentIndexNumber: 1, IndexNumber: 1, Name: "z" }),
    ]);
    expect(sorted.map((p) => p.Id)).toEqual(["d1t1", "d1t2", "d2t1"]);
  });

  test("by name when a part has no track number", () => {
    const sorted = sortParts([
      part({ Id: "b", IndexNumber: 1, Name: "Chapter 2" }),
      part({ Id: "a", Name: "Chapter 1" }),
    ]);
    expect(sorted.map((p) => p.Id)).toEqual(["a", "b"]);
  });
});

describe("positions in a book of several parts", () => {
  const book = bookFromParts([fellowship1, fellowship2], folders[1]);

  test("the length is the sum of the parts", () => {
    expect(bookDuration(book)).toBe(18 * HOUR);
  });

  test("a position in the second part counts the first", () => {
    expect(toBookPosition(book, 1, 60)).toBe(8 * HOUR + 60);
  });

  test("the end of a part is the start of the next", () => {
    expect(locateBookPosition(book, 8 * HOUR)).toEqual({
      partIndex: 1,
      partPosition: 0,
    });
  });

  test("past the end is the end of the last part", () => {
    expect(locateBookPosition(book, 99 * HOUR)).toEqual({
      partIndex: 1,
      partPosition: 10 * HOUR,
    });
  });

  test("before the start is the start", () => {
    expect(locateBookPosition(book, -5)).toEqual({
      partIndex: 0,
      partPosition: 0,
    });
  });
});

describe("chapters", () => {
  test("a part without markers is one chapter, named after the part", () => {
    const chapters = buildChapters(
      bookFromParts([fellowship1, fellowship2], folders[1]),
    );
    expect(chapters).toEqual([
      expect.objectContaining({ start: 0, end: 8 * HOUR, partIndex: 0 }),
      expect.objectContaining({
        start: 8 * HOUR,
        end: 18 * HOUR,
        partIndex: 1,
      }),
    ]);
    expect(chapters[1].title).toBe(fellowship2.Name);
  });

  test("an m4b's markers become the chapters, the last one to the end", () => {
    const chapters = buildChapters(bookFromParts([twoTowers]));
    expect(chapters).toEqual([
      { title: "001", start: 0, end: 800, partIndex: 0 },
      { title: "002", start: 800, end: 20 * HOUR, partIndex: 0 },
    ]);
  });

  test("audio before the first marker is a chapter of its own", () => {
    const chapters = buildChapters(
      bookFromParts([
        part({
          Id: "x",
          Name: "Intro",
          Chapters: [{ Name: "One", StartPositionTicks: ticks(30) }],
        }),
      ]),
    );
    expect(chapters.map((chapter) => [chapter.title, chapter.start])).toEqual([
      ["Intro", 0],
      ["One", 30],
    ]);
  });

  test("two markers at one spot leave no empty chapter", () => {
    const chapters = buildChapters(
      bookFromParts([
        part({
          Id: "x",
          Chapters: [
            { Name: "A", StartPositionTicks: 0 },
            { Name: "B", StartPositionTicks: ticks(100) },
            { Name: "C", StartPositionTicks: ticks(100) },
          ],
        }),
      ]),
    );
    expect(chapters.map((chapter) => chapter.title)).toEqual(["A", "C"]);
  });

  test("finds the chapter at a position, a seek just short of a start included", () => {
    const chapters = buildChapters(bookFromParts([twoTowers]));
    expect(chapterIndexAt(chapters, 0)).toBe(0);
    expect(chapterIndexAt(chapters, 799.9)).toBe(1);
    expect(chapterIndexAt(chapters, 799)).toBe(0);
    expect(chapterIndexAt([], 10)).toBe(-1);
  });

  test("numbered chapter names read as Chapter N", () => {
    const numbered = (n: number) => `Chapter ${n}`;
    expect(chapterDisplayTitle({ title: "001" }, 0, numbered)).toBe(
      "Chapter 1",
    );
    expect(chapterDisplayTitle({ title: "" }, 4, numbered)).toBe("Chapter 5");
    expect(chapterDisplayTitle({ title: "Prologue" }, 0, numbered)).toBe(
      "Prologue",
    );
  });
});
