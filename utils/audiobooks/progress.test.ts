import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { bookFromParts } from "./books";
import {
  bookProgress,
  isInProgress,
  resolveResumePoint,
  serverResumePoint,
} from "./progress";

const HOUR = 3600;
const ticks = (seconds: number) => seconds * 10_000_000;

const part = (
  id: string,
  userData: Partial<NonNullable<BaseItemDto["UserData"]>> = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: "AudioBook",
  ParentId: "folder",
  RunTimeTicks: ticks(HOUR),
  UserData: { Key: id, ...userData },
});

const threeParts = (
  a: Partial<NonNullable<BaseItemDto["UserData"]>> = {},
  b: Partial<NonNullable<BaseItemDto["UserData"]>> = {},
  c: Partial<NonNullable<BaseItemDto["UserData"]>> = {},
) => bookFromParts([part("p1", a), part("p2", b), part("p3", c)]);

describe("where the server has a book", () => {
  test("a book never played starts at the start", () => {
    expect(serverResumePoint(threeParts())).toEqual({
      partIndex: 0,
      partPosition: 0,
      finished: false,
      at: null,
    });
  });

  test("the part played last holds the position", () => {
    const point = serverResumePoint(
      threeParts(
        { Played: true, LastPlayedDate: "2026-11-01T10:00:00Z" },
        {
          PlaybackPositionTicks: ticks(600),
          LastPlayedDate: "2026-11-02T10:00:00Z",
        },
      ),
    );
    expect(point).toMatchObject({ partIndex: 1, partPosition: 600 });
    expect(point.at).toBe(Date.parse("2026-11-02T10:00:00Z"));
  });

  // Jellyfin marks a file played near its end and clears its position.
  test("a part the server marked played goes on at the next one", () => {
    const point = serverResumePoint(
      threeParts({}, { Played: true, LastPlayedDate: "2026-11-02T10:00:00Z" }),
    );
    expect(point).toMatchObject({ partIndex: 2, partPosition: 0 });
  });

  test("the last part played to the end finishes the book", () => {
    const point = serverResumePoint(
      threeParts(
        { Played: true, LastPlayedDate: "2026-11-01T10:00:00Z" },
        { Played: true, LastPlayedDate: "2026-11-02T10:00:00Z" },
        { Played: true, LastPlayedDate: "2026-11-03T10:00:00Z" },
      ),
    );
    expect(point.finished).toBe(true);
  });

  test("without dates, the first part with a position", () => {
    const point = serverResumePoint(
      threeParts({ Played: true }, { PlaybackPositionTicks: ticks(90) }),
    );
    expect(point).toMatchObject({ partIndex: 1, partPosition: 90 });
  });

  test("without dates or positions, the first part not played", () => {
    const point = serverResumePoint(threeParts({ Played: true }));
    expect(point).toMatchObject({ partIndex: 1, partPosition: 0 });
  });

  test("a single file marked played is finished", () => {
    const book = bookFromParts([part("only", { Played: true })]);
    expect(serverResumePoint(book).finished).toBe(true);
  });
});

describe("the newer of the device and the server", () => {
  const book = threeParts(
    {},
    {
      PlaybackPositionTicks: ticks(600),
      LastPlayedDate: "2026-11-02T10:00:00Z",
    },
  );

  test("the device wins when it listened later, offline say", () => {
    const point = resolveResumePoint(book, {
      bookId: book.id,
      partIndex: 2,
      partPosition: 30,
      updatedAt: Date.parse("2026-11-03T10:00:00Z"),
    });
    expect(point).toMatchObject({ partIndex: 2, partPosition: 30 });
  });

  test("the server wins when another device listened later", () => {
    const point = resolveResumePoint(book, {
      bookId: book.id,
      partIndex: 0,
      partPosition: 30,
      updatedAt: Date.parse("2026-11-01T10:00:00Z"),
    });
    expect(point).toMatchObject({ partIndex: 1, partPosition: 600 });
  });

  test("a device position for a part the book no longer has is clamped", () => {
    const point = resolveResumePoint(threeParts(), {
      bookId: "p1",
      partIndex: 9,
      partPosition: 10,
      updatedAt: 1,
    });
    expect(point.partIndex).toBe(2);
  });

  test("another book's device position is ignored", () => {
    const point = resolveResumePoint(threeParts(), {
      bookId: "other",
      partIndex: 2,
      partPosition: 10,
      updatedAt: Date.now(),
    });
    expect(point.partIndex).toBe(0);
  });
});

describe("how far into a book", () => {
  test("counts the parts before the one playing", () => {
    const book = threeParts();
    expect(
      bookProgress(book, {
        partIndex: 1,
        partPosition: HOUR / 2,
        finished: false,
        at: null,
      }),
    ).toEqual({ listened: 1.5 * HOUR, duration: 3 * HOUR, fraction: 0.5 });
  });

  test("a finished book is all listened", () => {
    expect(
      bookProgress(threeParts(), {
        partIndex: 0,
        partPosition: 0,
        finished: true,
        at: null,
      }).fraction,
    ).toBe(1);
  });

  test("in progress is started and not finished", () => {
    const at = null;
    expect(
      isInProgress({ partIndex: 0, partPosition: 0, finished: false, at }),
    ).toBe(false);
    expect(
      isInProgress({ partIndex: 0, partPosition: 5, finished: false, at }),
    ).toBe(true);
    expect(
      isInProgress({ partIndex: 1, partPosition: 0, finished: false, at }),
    ).toBe(true);
    expect(
      isInProgress({ partIndex: 1, partPosition: 5, finished: true, at }),
    ).toBe(false);
  });
});
