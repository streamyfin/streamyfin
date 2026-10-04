const existing = new Set<string>();
const deleted: string[] = [];
const undeletable = new Set<string>();

const withoutTrailingSlash = (uri: string) => uri.replace(/\/+$/, "");

class FakeEntry {
  /** The entry's location with no trailing slash, which is how the store keys it. */
  protected readonly location: string;

  constructor(...parts: (string | FakeEntry)[]) {
    this.location = parts
      .map((part) =>
        withoutTrailingSlash(typeof part === "string" ? part : part.uri),
      )
      .join("/");
  }

  get uri() {
    return this.location;
  }

  get exists() {
    return existing.has(this.location);
  }

  delete() {
    if (undeletable.has(this.location)) throw new Error("EPERM");
    existing.delete(this.location);
    deleted.push(this.location);
  }
}

class FakeFile extends FakeEntry {}

class FakeDirectory extends FakeEntry {
  // Like the real one, a directory's uri ends in a slash.
  get uri() {
    return `${this.location}/`;
  }

  delete() {
    super.delete();
    for (const path of existing) {
      if (path.startsWith(`${this.location}/`)) existing.delete(path);
    }
  }
}

/** Where `Paths.document` points in a spec. */
export const DOCUMENTS = "file:///documents";

/**
 * An expo-file-system double for specs that delete files: a path exists once a spec adds it and
 * until something deletes it, and every delete is recorded. Wire it at the top of a spec, where
 * Jest hoists it above the imports:
 *
 *   jest.mock("expo-file-system", () =>
 *     jest.requireActual("@/test-utils/fileSystem").fileSystemModule,
 *   );
 *
 * Only what the app's delete paths call is implemented: the `File` and `Directory`
 * constructors, `uri`, `exists` and `delete()`.
 */
export const fileSystemModule = {
  File: FakeFile,
  Directory: FakeDirectory,
  Paths: {
    get document() {
      return new FakeDirectory(DOCUMENTS);
    },
  },
};

export const fakeFiles = {
  /** Puts files or directories on the fake disk. */
  add: (...paths: string[]) => {
    for (const path of paths) existing.add(withoutTrailingSlash(path));
  },
  /** Everything still on the fake disk. */
  remaining: () => [...existing],
  /** Every path deleted so far, in order. */
  deleted: () => [...deleted],
  /** Makes deleting `path` throw, as a locked or protected file would. */
  lock: (path: string) => void undeletable.add(withoutTrailingSlash(path)),
  /** Empties the fake disk. Call it from `beforeEach` so tests stay isolated. */
  clear: () => {
    existing.clear();
    deleted.length = 0;
    undeletable.clear();
  },
};
