import { rootFolderLabel } from "./rootFolder";
import type { RootFolder } from "./types";

const readableFolder: RootFolder = {
  id: 1,
  path: "/movies",
  freeSpace: 1_234_567_890,
  totalSpace: 2_000_000_000_000,
};

const unreadableFolder: RootFolder = {
  id: 2,
  path: "/movies",
  totalSpace: 2_000_000_000_000,
};

const fullFolder: RootFolder = {
  id: 3,
  path: "/movies",
  freeSpace: 0,
  totalSpace: 2_000_000_000_000,
};

describe("rootFolderLabel", () => {
  test("includes readable free space when present", () => {
    expect(rootFolderLabel(readableFolder)).toBe("/movies (1.23 GB)");
  });

  test("falls back to the path when freeSpace is missing", () => {
    expect(rootFolderLabel(unreadableFolder)).toBe("/movies");
  });

  test("shows 0 Bytes when the disk is full", () => {
    expect(rootFolderLabel(fullFolder)).toBe("/movies (0 Bytes)");
  });
});
