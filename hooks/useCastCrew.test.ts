import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { useCastCrew, useCreditLines } from "./useCastCrew";

const mockT = jest.fn(
  (key: string, _options?: { defaultValue?: string }) => key,
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// A voice actor with two roles arrives as two actors with the same `Id`.
const PEOPLE: BaseItemPerson[] = [
  { Id: "a", Name: "Ana", Type: "Actor", Role: "Rex" },
  { Id: "d", Name: "Dee", Type: "Director" },
  { Id: "a", Name: "Ana", Type: "Actor", Role: "Mother" },
  { Id: "b", Name: "Ben", Type: "Actor" },
  { Name: "No Id", Type: "Actor" },
];

/** Stable, as the app's callers pass it: a new array each render is a new answer. */
const ACTORS = ["Actor"] as const;

describe("useCastCrew", () => {
  test("a person credited twice is one entry with both roles", async () => {
    const { result } = await renderHook(() =>
      useCastCrew(PEOPLE, { kinds: ["Actor"] }),
    );

    expect(result.current.map((p) => p.Id)).toEqual(["a", "b"]);
    expect(result.current[0].Role).toBe("Rex, Mother");
    expect(result.current[1].Role).toBeNull();
  });

  test("without a kind everyone is kept", async () => {
    const { result } = await renderHook(() => useCastCrew(PEOPLE));

    expect(result.current.map((p) => p.Id)).toEqual(["a", "d", "b"]);
  });

  test("labelRoles names the credit of a person with no role", async () => {
    const { result } = await renderHook(() =>
      useCastCrew(PEOPLE, { labelRoles: true }),
    );

    expect(result.current.map((p) => p.Role)).toEqual([
      "Rex, Mother",
      "item_card.person_kind.Director",
      "item_card.person_kind.Actor",
    ]);
  });

  test("no people is no one", async () => {
    const { result } = await renderHook(() => useCastCrew(undefined));

    expect(result.current).toEqual([]);
  });

  test("kind and labelRoles apply together", async () => {
    const { result } = await renderHook(() =>
      useCastCrew(PEOPLE, { kinds: ["Director"], labelRoles: true }),
    );

    expect(result.current.map((p) => p.Role)).toEqual([
      "item_card.person_kind.Director",
    ]);
  });

  // `useCreditLines` keeps a person with an empty id as a bare name: here
  // there is nothing to open, so the person is dropped.
  test("an empty id is no id", async () => {
    const { result } = await renderHook(() =>
      useCastCrew([{ Id: "", Name: "Nobody", Type: "Actor" }]),
    );

    expect(result.current).toEqual([]);
  });

  test("limit counts people, not credits", async () => {
    const { result } = await renderHook(() =>
      useCastCrew(PEOPLE, { kinds: ["Actor"], limit: 1 }),
    );

    expect(result.current.map((p) => p.Id)).toEqual(["a"]);
    expect(result.current[0].Role).toBe("Rex, Mother");
  });

  // Callers hand the result to memoized children: a new array every render,
  // the limited cut included, would defeat them.
  test("the result keeps its identity while the people do", async () => {
    const { result, rerender } = await renderHook(() =>
      useCastCrew(PEOPLE, { kinds: ACTORS, limit: 2 }),
    );
    const first = result.current;

    await rerender({});

    expect(result.current).toBe(first);
  });

  // An episode's guest stars are its cast: with only Actor kept, an episode
  // whose cast is all guests had no "More with" row at all.
  test("keeps every kind it is given, in the server's order", async () => {
    const { result } = await renderHook(() =>
      useCastCrew(
        [
          { Id: "g", Name: "Guest", Type: "GuestStar" },
          { Id: "d", Name: "Director", Type: "Director" },
          { Id: "a", Name: "Actor", Type: "Actor" },
        ],
        { kinds: ["Actor", "GuestStar"] },
      ),
    );

    expect(result.current.map((person) => person.Id)).toEqual(["g", "a"]);
  });

  // A kind newer than the translation catalogue shows as the server's word.
  test("a kind without a translation falls back to the server's word", async () => {
    mockT.mockImplementation((key, options) => options?.defaultValue ?? key);
    try {
      const { result } = await renderHook(() =>
        useCastCrew([{ Id: "a", Type: "Narrator" }], { labelRoles: true }),
      );

      expect(result.current[0].Role).toBe("Narrator");
    } finally {
      mockT.mockImplementation((key) => key);
    }
  });

  // The cases below drive the merge through `labelRoles`: the mocked `t`
  // answers with the key, which stands for the translated kind.
  describe("roles", () => {
    const rolesOf = async (people: BaseItemPerson[]) => {
      const { result } = await renderHook(() =>
        useCastCrew(people, { labelRoles: true }),
      );
      return result.current.map((p) => p.Role);
    };
    const label = (kind: string) => `item_card.person_kind.${kind}`;

    test("falls back to the kind of credit when there is no role", async () => {
      expect(
        await rolesOf([
          { Id: "a", Type: "Director" },
          { Id: "a", Type: "Writer" },
        ]),
      ).toEqual([`${label("Director")}, ${label("Writer")}`]);
    });

    // An empty role is what some metadata providers send instead of none.
    test("treats a blank role as no role", async () => {
      expect(
        await rolesOf([
          { Id: "a", Type: "Director", Role: "" },
          { Id: "a", Type: "Actor", Role: "  " },
        ]),
      ).toEqual([`${label("Director")}, ${label("Actor")}`]);
    });

    test("lists a repeated credit once", async () => {
      expect(
        await rolesOf([
          { Id: "a", Type: "Actor", Role: "Hero" },
          { Id: "a", Type: "Actor", Role: "Hero" },
          { Id: "a", Type: "Writer" },
          { Id: "a", Type: "Writer" },
        ]),
      ).toEqual([`Hero, ${label("Writer")}`]);
    });

    test("a credit of unknown kind without a role adds nothing", async () => {
      expect(
        await rolesOf([
          { Id: "a", Type: "Unknown" },
          { Id: "a" },
          { Id: "a", Type: "Actor", Role: "Hero" },
          { Id: "b", Type: "Unknown" },
        ]),
      ).toEqual(["Hero", null]);
    });

    // The input is React Query's cached array: writing the joined roles back
    // onto it made the list grow on every render.
    test("does not write to the people it was given", async () => {
      const people: BaseItemPerson[] = [
        { Id: "a", Type: "Director" },
        { Id: "a", Type: "Writer" },
      ];

      await rolesOf(people);
      const again = await rolesOf(people);

      expect(people[0].Role).toBeUndefined();
      expect(again).toEqual([`${label("Director")}, ${label("Writer")}`]);
    });
  });
});

describe("useCreditLines", () => {
  const linesOf = async (people: BaseItemPerson[] | null | undefined) => {
    const { result } = await renderHook(() => useCreditLines(people));
    return result.current;
  };

  test("draws one line per credited kind, in a fixed order", async () => {
    const lines = await linesOf([
      { Id: "w", Name: "Writer", Type: "Writer" },
      { Id: "c", Name: "Creator", Type: "Creator" },
      { Id: "d", Name: "Director", Type: "Director" },
      { Id: "x", Name: "Actor", Type: "Actor", Role: "Hero" },
    ]);

    expect(lines.map((line) => line.kind)).toEqual([
      "Director",
      "Writer",
      "Creator",
    ]);
  });

  test("lists someone credited twice for the same kind once", async () => {
    const lines = await linesOf([
      { Id: "w", Name: "Writer", Type: "Writer", Role: "Story" },
      { Id: "w", Name: "Writer", Type: "Writer", Role: "Screenplay" },
      { Id: "v", Name: "Other", Type: "Writer" },
    ]);

    expect(lines).toEqual([
      {
        kind: "Writer",
        people: [
          { id: "w", name: "Writer" },
          { id: "v", name: "Other" },
        ],
      },
    ]);
  });

  test("covers the book and audiobook kinds", async () => {
    const narrator: BaseItemPerson = {
      Id: "n",
      Name: "Narrator",
      Type: "Narrator",
    };

    const lines = await linesOf([
      narrator,
      { Id: "a", Name: "Author", Type: "Author" },
    ]);

    expect(lines.map((line) => line.kind)).toEqual(["Author", "Narrator"]);
  });

  test("keeps a name the server sent without an id, unlinked", async () => {
    const lines = await linesOf([{ Name: "Anonymous", Type: "Director" }]);

    expect(lines[0].people).toEqual([{ id: undefined, name: "Anonymous" }]);
  });

  test("an empty id does not fold different people into one", async () => {
    const lines = await linesOf([
      { Id: "", Name: "First", Type: "Director" },
      { Id: "", Name: "Second", Type: "Director" },
    ]);

    expect(lines[0].people).toEqual([
      { id: undefined, name: "First" },
      { id: undefined, name: "Second" },
    ]);
  });

  test("drops a credit without a name", async () => {
    expect(
      await linesOf([
        { Id: "d", Type: "Director" },
        { Id: "e", Name: " ", Type: "Director" },
      ]),
    ).toEqual([]);
  });

  test("answers no lines when nobody is credited", async () => {
    expect(await linesOf(undefined)).toEqual([]);
    expect(await linesOf(null)).toEqual([]);
    expect(await linesOf([{ Id: "x", Name: "Actor", Type: "Actor" }])).toEqual(
      [],
    );
  });
});
