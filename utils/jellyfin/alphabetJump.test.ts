import {
  ALPHABET,
  type AlphabetJumpParams,
  alphabetJumpParams,
  letterAtOffset,
  railMarginToClear,
} from "./alphabetJump";

const PAGE_SIZE = 36;
const LEADS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 2000 titles spread over digits and letters, every fifth behind an article. */
const LIBRARY = Array.from({ length: 2000 }, (_, i) => {
  const name = `${i % 5 === 0 ? "The " : ""}${LEADS[i % LEADS.length]} title ${i}`;
  // What the server stores: lower case, leading article dropped.
  return { name, sortName: name.toLowerCase().replace(/^the /, "") };
});

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** `GET /Items` as the server answers it: bounds on the sort name, then paging. */
const getItems = (
  params: AlphabetJumpParams,
  { descending = false, startIndex = 0 } = {},
) => {
  const from = params.nameStartsWithOrGreater?.toLowerCase();
  const below = params.nameLessThan?.toLowerCase();
  return LIBRARY.filter(
    ({ sortName }) =>
      (from === undefined || sortName >= from) &&
      (below === undefined || sortName < below),
  )
    .sort((a, b) => compare(a.sortName, b.sortName) * (descending ? -1 : 1))
    .slice(startIndex, startIndex + PAGE_SIZE);
};

const leads = (items: { sortName: string }[]) => [
  ...new Set(items.map((item) => item.sortName[0])),
];

describe("alphabetJumpParams", () => {
  test("jumping to M in a 2000 item library lands on the M titles", () => {
    const page = getItems(alphabetJumpParams("M", false));

    expect(page).toHaveLength(PAGE_SIZE);
    expect(leads(page)).toEqual(["m"]);
    // The article is not what a title is filed under.
    expect(page.some((item) => item.name.startsWith("The M"))).toBe(true);
  });

  test("paging past the last M title carries on into N", () => {
    const params = alphabetJumpParams("M", false);
    const seen: string[] = [];
    for (
      let startIndex = 0;
      !seen.includes("n") && startIndex < LIBRARY.length;
      startIndex += PAGE_SIZE
    ) {
      seen.push(...leads(getItems(params, { startIndex })));
    }

    expect([...new Set(seen)]).toEqual(["m", "n"]);
  });

  test("# is the top of an A to Z list, where the non-letters already are", () => {
    expect(alphabetJumpParams("#", false)).toEqual({});
    expect(getItems({})[0].sortName).toMatch(/^\d/);
  });

  test("Z to A, a letter still leads the list it was picked from", () => {
    const page = getItems(alphabetJumpParams("M", true), { descending: true });

    expect(leads(page)).toEqual(["m"]);
  });

  test("Z to A, # leaves only the titles that start with no letter", () => {
    const params = alphabetJumpParams("#", true);

    expect(params).toEqual({ nameLessThan: "A" });
    expect(
      getItems(params, { descending: true }).every((item) =>
        /^\d/.test(item.sortName),
      ),
    ).toBe(true);
  });

  test("Z to A, Z is already the top of the list", () => {
    expect(alphabetJumpParams("Z", true)).toEqual({});
  });

  test("no letter, or one the picker does not have, leaves the list alone", () => {
    expect(alphabetJumpParams(null, false)).toEqual({});
    expect(alphabetJumpParams("Ö", true)).toEqual({});
  });
});

describe("letterAtOffset", () => {
  const railHeight = ALPHABET.length * 10;

  test("maps a touch to the letter drawn there", () => {
    expect(letterAtOffset(0, railHeight)).toBe("#");
    expect(letterAtOffset(15, railHeight)).toBe("A");
    expect(letterAtOffset(railHeight - 1, railHeight)).toBe("Z");
  });

  test("a finger dragged off either end stays on the last letter there", () => {
    expect(letterAtOffset(-40, railHeight)).toBe("#");
    expect(letterAtOffset(railHeight + 40, railHeight)).toBe("Z");
  });

  // The first touch can arrive before the rail has been measured.
  test("a rail with no height yet answers with its first entry", () => {
    expect(letterAtOffset(120, 0)).toBe("#");
    expect(letterAtOffset(0, 0)).toBe("#");
  });

  test("a touch with no position answers with the first entry too", () => {
    expect(letterAtOffset(Number.NaN, railHeight)).toBe("#");
  });
});

describe("railMarginToClear", () => {
  const MAX = 486;

  /** Where the rail ends up: centred in what the margin leaves of its area. */
  const place = (areaHeight: number, clearTop: number) => {
    const margin = railMarginToClear(areaHeight, clearTop, MAX);
    const height = Math.min(MAX, areaHeight - margin);
    return { top: margin + (areaHeight - margin - height) / 2, height };
  };

  test("leaves a rail alone that is centred below the header anyway", () => {
    expect(railMarginToClear(800, 100, MAX)).toBe(0);
    expect(place(800, 100)).toEqual({ top: 157, height: MAX });
  });

  // An Android phone: centred, the first letters stood on the filter chips.
  test("pushes a centred rail down to just below the header", () => {
    expect(place(600, 100)).toEqual({ top: 100, height: MAX });
  });

  test("a rail with no room for its full height starts below the header", () => {
    expect(place(500, 100)).toEqual({ top: 100, height: 400 });
  });

  test("nothing to clear leaves the rail centred", () => {
    expect(railMarginToClear(600, 0, MAX)).toBe(0);
  });

  // Before the first layout the rail must not flash on top of the header.
  test("an area not measured yet keeps the rail below the header", () => {
    expect(railMarginToClear(0, 100, MAX)).toBe(100);
  });
});
