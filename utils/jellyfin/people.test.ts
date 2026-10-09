import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { getCreditLines, mergePeopleById } from "./people";

/** Stands for the translated kind, so a role and a kind cannot be confused. */
const kindLabel = (kind: string) => `kind:${kind}`;

describe("mergePeopleById", () => {
  test("falls back to the kind of credit when there is no role", () => {
    const merged = mergePeopleById(
      [
        { Id: "a", Type: "Director" },
        { Id: "a", Type: "Writer" },
      ],
      kindLabel,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].Role).toBe("kind:Director, kind:Writer");
  });

  // An empty role is what some metadata providers send instead of none.
  test("treats a blank role as no role", () => {
    const merged = mergePeopleById(
      [
        { Id: "a", Type: "Director", Role: "" },
        { Id: "a", Type: "Actor", Role: "  " },
      ],
      kindLabel,
    );

    expect(merged[0].Role).toBe("kind:Director, kind:Actor");
  });

  test("lists a repeated credit once", () => {
    const merged = mergePeopleById(
      [
        { Id: "a", Type: "Actor", Role: "Hero" },
        { Id: "a", Type: "Actor", Role: "Hero" },
        { Id: "a", Type: "Writer" },
        { Id: "a", Type: "Writer" },
      ],
      kindLabel,
    );

    expect(merged[0].Role).toBe("Hero, kind:Writer");
  });

  test("a credit of unknown kind without a role adds nothing", () => {
    const merged = mergePeopleById(
      [
        { Id: "a", Type: "Unknown" },
        { Id: "a" },
        { Id: "a", Type: "Actor", Role: "Hero" },
        { Id: "b", Type: "Unknown" },
      ],
      kindLabel,
    );

    expect(merged.map((person) => person.Role)).toEqual(["Hero", null]);
  });

  test("skips an entry without an id, and answers empty for no people", () => {
    expect(mergePeopleById([{ Name: "Nobody" }], kindLabel)).toEqual([]);
    expect(mergePeopleById(undefined, kindLabel)).toEqual([]);
  });

  // The input is React Query's cached array: writing the joined roles back
  // onto it made the list grow on every render.
  test("does not write to the people it was given", () => {
    const people: BaseItemPerson[] = [
      { Id: "a", Type: "Director" },
      { Id: "a", Type: "Writer" },
    ];

    mergePeopleById(people, kindLabel);
    const again = mergePeopleById(people, kindLabel);

    expect(people[0].Role).toBeUndefined();
    expect(again[0].Role).toBe("kind:Director, kind:Writer");
  });
});

describe("getCreditLines", () => {
  test("draws one line per credited kind, in a fixed order", () => {
    const lines = getCreditLines([
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

  test("lists someone credited twice for the same kind once", () => {
    const lines = getCreditLines([
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

  test("covers the book and audiobook kinds", () => {
    // Narrator is new in Jellyfin 12 and not in the SDK's PersonKind yet.
    const narrator = {
      Id: "n",
      Name: "Narrator",
      Type: "Narrator",
    } as unknown as BaseItemPerson;

    const lines = getCreditLines([
      narrator,
      { Id: "a", Name: "Author", Type: "Author" },
    ]);

    expect(lines.map((line) => line.kind)).toEqual(["Author", "Narrator"]);
  });

  test("keeps a name the server sent without an id, unlinked", () => {
    const lines = getCreditLines([{ Name: "Anonymous", Type: "Director" }]);

    expect(lines[0].people).toEqual([{ id: undefined, name: "Anonymous" }]);
  });

  test("an empty id does not fold different people into one", () => {
    const lines = getCreditLines([
      { Id: "", Name: "First", Type: "Director" },
      { Id: "", Name: "Second", Type: "Director" },
    ]);

    expect(lines[0].people).toEqual([
      { id: undefined, name: "First" },
      { id: undefined, name: "Second" },
    ]);
  });

  test("drops a credit without a name", () => {
    expect(
      getCreditLines([
        { Id: "d", Type: "Director" },
        { Id: "e", Name: " ", Type: "Director" },
      ]),
    ).toEqual([]);
  });

  test("answers no lines when nobody is credited", () => {
    expect(getCreditLines(undefined)).toEqual([]);
    expect(getCreditLines(null)).toEqual([]);
    expect(getCreditLines([{ Id: "x", Name: "Actor", Type: "Actor" }])).toEqual(
      [],
    );
  });
});
