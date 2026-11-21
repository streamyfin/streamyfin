import { AUDIOBOOK_PROGRESS_KEY } from "@/constants/Audiobooks";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { bookFromParts } from "./books";
import {
  accountKeyFor,
  addBookmark,
  getBookmarks,
  getDownloadedBooks,
  getLocalProgress,
  loadSession,
  registerDownloadedBook,
  removeBookmark,
  saveSession,
  setLocalProgress,
  unregisterDownloadedBook,
} from "./storage";

const book = (id: string, serverId = "server") =>
  bookFromParts([
    {
      Id: id,
      Name: id,
      Type: "AudioBook",
      ServerId: serverId,
      RunTimeTicks: 36_000_000_000,
      Overview: "A long story that the device does not need to keep.",
    },
  ]);

beforeEach(() => {
  clearMmkv();
});

test("an account is a user on a server", () => {
  expect(accountKeyFor({ Id: "u", ServerId: "s" })).toBe("s:u");
  expect(accountKeyFor(null)).toBe(null);
});

describe("progress on the device", () => {
  test("two users of one server each have their own place in a book", () => {
    setLocalProgress("s:alice", {
      bookId: "b",
      partIndex: 0,
      partPosition: 100,
      updatedAt: 1,
    });
    setLocalProgress("s:bob", {
      bookId: "b",
      partIndex: 0,
      partPosition: 900,
      updatedAt: 2,
    });
    expect(getLocalProgress("s:alice", "b")?.partPosition).toBe(100);
    expect(getLocalProgress("s:bob", "b")?.partPosition).toBe(900);
  });

  test("nothing is kept signed out", () => {
    setLocalProgress(null, {
      bookId: "b",
      partIndex: 0,
      partPosition: 1,
      updatedAt: 1,
    });
    expect(getLocalProgress(null, "b")).toBe(null);
  });

  test("a damaged store reads as empty instead of throwing", () => {
    storage.set(AUDIOBOOK_PROGRESS_KEY, "{not json");
    expect(getLocalProgress("s:u", "b")).toBe(null);
    storage.set(
      AUDIOBOOK_PROGRESS_KEY,
      JSON.stringify({ "s:u": { b: { bookId: "b" } } }),
    );
    expect(getLocalProgress("s:u", "b")).toBe(null);
  });
});

describe("the session", () => {
  test("comes back as it was saved, the queue included", () => {
    saveSession({
      account: "s:u",
      book: book("current"),
      partIndex: 0,
      partPosition: 42,
      queue: [book("next")],
    });
    const session = loadSession();
    expect(session?.book.id).toBe("current");
    expect(session?.partPosition).toBe(42);
    expect(session?.queue.map((b) => b.id)).toEqual(["next"]);
  });

  test("keeps only the part fields playback needs", () => {
    saveSession({
      account: "s:u",
      book: book("current"),
      partIndex: 0,
      partPosition: 0,
      queue: [],
    });
    expect(loadSession()?.book.parts[0].Overview).toBeUndefined();
  });
});

describe("downloaded books", () => {
  test("are listed for their own server, newest first", () => {
    registerDownloadedBook(book("old"));
    registerDownloadedBook(book("elsewhere", "other-server"));
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    registerDownloadedBook(book("new"));
    expect(getDownloadedBooks("server").map((entry) => entry.book.id)).toEqual([
      "new",
      "old",
    ]);
    jest.restoreAllMocks();
  });

  test("are gone once unregistered", () => {
    registerDownloadedBook(book("b"));
    unregisterDownloadedBook("b");
    expect(getDownloadedBooks("server")).toEqual([]);
  });
});

describe("bookmarks", () => {
  test("list in the order they come in the book", () => {
    addBookmark("s:u", "b", 500, "Two");
    addBookmark("s:u", "b", 100, "One");
    expect(getBookmarks("s:u", "b").map((mark) => mark.position)).toEqual([
      100, 500,
    ]);
  });

  test("can be removed one at a time", () => {
    const first = addBookmark("s:u", "b", 100);
    addBookmark("s:u", "b", 200);
    removeBookmark("s:u", "b", first!.id);
    expect(getBookmarks("s:u", "b").map((mark) => mark.position)).toEqual([
      200,
    ]);
  });
});
