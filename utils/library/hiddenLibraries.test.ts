import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { originKey, remapHiddenLibraries } from "./hiddenLibraries";

const A = "server-a";
const B = "server-b";
const USER = "user-1";

const key = (id: string, server = A, user = USER) =>
  originKey(server, user, id);

const view = (
  Id: string,
  CollectionType?: BaseItemDto["CollectionType"],
  ServerId = A,
) => ({ Id, CollectionType, ServerId });

// Jellyfin 12 gives the Live TV, Collections and Playlists views new ids once,
// when the server upgrades (jellyfin/jellyfin#17714), so a view hidden by id
// came back.
describe("remapHiddenLibraries", () => {
  test("hides a singleton view again under the id it has now", () => {
    const result = remapHiddenLibraries(
      ["old-livetv", "movies"],
      { [key("old-livetv")]: "livetv" },
      [view("new-livetv", "livetv"), view("movies", "movies")],
      USER,
    );

    expect(result.hidden).toEqual(["old-livetv", "movies", "new-livetv"]);
    expect(result.origins).toEqual({
      [key("new-livetv")]: "livetv",
    });
  });

  test("lets the user show the view again after carrying it over", () => {
    const first = remapHiddenLibraries(
      ["old-livetv"],
      { [key("old-livetv")]: "livetv" },
      [view("new-livetv", "livetv")],
      USER,
    );
    const shown = first.hidden.filter((id) => id !== "new-livetv");

    const second = remapHiddenLibraries(
      shown,
      first.origins,
      [view("new-livetv", "livetv")],
      USER,
    );

    expect(second.hidden).toEqual(["old-livetv"]);
  });

  test("records the type of a hidden singleton view while it is still listed", () => {
    // The type has to be known before the upgrade, or there is nothing to
    // match the vanished id on afterwards.
    const result = remapHiddenLibraries(
      ["collections", "playlists", "movies"],
      {},
      [
        view("collections", "boxsets"),
        view("playlists", "playlists"),
        view("movies", "movies"),
        view("livetv", "livetv"),
      ],
      USER,
    );

    expect(result.hidden).toEqual(["collections", "playlists", "movies"]);
    expect(result.origins).toEqual({
      [key("collections")]: "boxsets",
      [key("playlists")]: "playlists",
    });
  });

  test("keeps a shared id hidden for the server that has not upgraded", () => {
    // Before Jellyfin 12 the ids are derived from names, so two servers can
    // share one. After A upgrades, B still lists the old id.
    const origins = {
      [key("livetv")]: "livetv",
      [key("livetv", B)]: "livetv",
    };

    const onA = remapHiddenLibraries(
      ["livetv"],
      origins,
      [view("a-livetv", "livetv", A)],
      USER,
    );
    expect(onA.hidden).toEqual(["livetv", "a-livetv"]);

    const onB = remapHiddenLibraries(
      onA.hidden,
      onA.origins,
      [view("livetv", "livetv", B)],
      USER,
    );
    expect(onB.hidden).toEqual(["livetv", "a-livetv"]);
  });

  test("does not hide another server's view of the same type", () => {
    const result = remapHiddenLibraries(
      ["a-livetv"],
      { [key("a-livetv")]: "livetv" },
      [view("b-livetv", "livetv", B)],
      USER,
    );

    expect(result.hidden).toEqual(["a-livetv"]);
  });

  test("does not guess between two views of one type", () => {
    // An admin can create a library of type boxsets next to the built-in
    // Collections view.
    const both = [
      view("collections", "boxsets"),
      view("box-library", "boxsets"),
    ];

    const recorded = remapHiddenLibraries(["box-library"], {}, both, USER);
    expect(recorded.origins).toEqual({});

    const carried = remapHiddenLibraries(
      ["old-collections"],
      { [key("old-collections")]: "boxsets" },
      both,
      USER,
    );
    expect(carried.hidden).toEqual(["old-collections"]);
  });

  test("leaves a missing library alone when its type is unknown", () => {
    // A regular library can be missing for a while (a removed share, a
    // permission change); nothing says which other library it would be.
    const result = remapHiddenLibraries(
      ["gone"],
      {},
      [view("movies", "movies")],
      USER,
    );

    expect(result.hidden).toEqual(["gone"]);
  });

  test("changes nothing once the new id is hidden", () => {
    const origins = { [key("old-playlists")]: "playlists" };
    const first = remapHiddenLibraries(
      ["old-playlists"],
      origins,
      [view("new-playlists", "playlists")],
      USER,
    );

    const second = remapHiddenLibraries(
      first.hidden,
      first.origins,
      [view("new-playlists", "playlists")],
      USER,
    );

    expect(second).toEqual(first);
  });

  test("carries a view over once for every profile on the server", () => {
    // The hidden list is the device's, so a second profile still holding the
    // old id would hide the view again after the first showed it.
    const first = remapHiddenLibraries(
      ["livetv"],
      {
        [key("livetv", A, "user-x")]: "livetv",
        [key("livetv", A, "user-y")]: "livetv",
      },
      [view("new-livetv", "livetv")],
      "user-x",
    );
    const shown = first.hidden.filter((id) => id !== "new-livetv");

    const second = remapHiddenLibraries(
      shown,
      first.origins,
      [view("new-livetv", "livetv")],
      "user-y",
    );

    expect(second.hidden).toEqual(["livetv"]);
  });

  test("does not carry another user's Playlists view over", () => {
    // Each user's Playlists view has an id of its own, so another account on
    // the same server not listing it says nothing about an upgrade.
    const result = remapHiddenLibraries(
      ["x-playlists"],
      { [key("x-playlists", A, "user-x")]: "playlists" },
      [view("y-playlists", "playlists")],
      "user-y",
    );

    expect(result.hidden).toEqual(["x-playlists"]);
  });

  test("forgets the type of a view the user shows again", () => {
    // Otherwise a later hide of the same id on another server would carry
    // over here.
    const result = remapHiddenLibraries(
      [],
      { [key("livetv")]: "livetv" },
      [view("livetv", "livetv")],
      USER,
    );

    expect(result.origins).toEqual({});
  });
});
