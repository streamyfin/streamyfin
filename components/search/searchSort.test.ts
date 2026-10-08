import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  SeerrSearchSort,
  sortLibraryResults,
  sortSeerrResults,
} from "@/components/search/searchSort";

const item = (
  name: string,
  fields: Partial<BaseItemDto> = {},
): BaseItemDto => ({
  Name: name,
  ...fields,
});
const names = (items?: BaseItemDto[]) => items?.map((i) => i.Name);

describe("sortLibraryResults", () => {
  const items = [
    item("Big Buck Bunny", {
      CommunityRating: 6.5,
      ProductionYear: 2008,
      DateCreated: "2026-10-06T10:00:00Z",
    }),
    item("sintel", {
      CommunityRating: 7.2,
      ProductionYear: 2010,
      DateCreated: "2026-10-01T10:00:00Z",
    }),
    item("Elephants Dream", { ProductionYear: 2006 }),
  ];

  // Relevance is the order the server answered with.
  test("keeps the server's order for relevance", () => {
    expect(names(sortLibraryResults(items, "Relevance", "asc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
  });

  test("sorts by name, whatever the case", () => {
    expect(names(sortLibraryResults(items, "Name", "asc"))).toEqual([
      "Big Buck Bunny",
      "Elephants Dream",
      "sintel",
    ]);
    expect(names(sortLibraryResults(items, "Name", "desc"))).toEqual([
      "sintel",
      "Elephants Dream",
      "Big Buck Bunny",
    ]);
  });

  test("sorts by year", () => {
    expect(names(sortLibraryResults(items, "ProductionYear", "desc"))).toEqual([
      "sintel",
      "Big Buck Bunny",
      "Elephants Dream",
    ]);
  });

  test("sorts by date added", () => {
    expect(names(sortLibraryResults(items, "DateCreated", "desc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
  });

  // A title without a rating says nothing about where it ranks: it goes
  // after the rated ones in either order.
  test("puts what has no value last, in both orders", () => {
    expect(names(sortLibraryResults(items, "CommunityRating", "asc"))).toEqual([
      "Big Buck Bunny",
      "sintel",
      "Elephants Dream",
    ]);
    expect(names(sortLibraryResults(items, "CommunityRating", "desc"))).toEqual(
      ["sintel", "Big Buck Bunny", "Elephants Dream"],
    );
  });

  test("leaves the results it was given alone", () => {
    const before = names(items);
    sortLibraryResults(items, "Name", "desc");
    expect(names(items)).toEqual(before);
  });
});

describe("sortSeerrResults", () => {
  const results = [
    { title: "Barbie Mysteries", voteCount: 10, voteAverage: 7, popularity: 5 },
    { title: "Barbie", voteCount: 900, voteAverage: 6, popularity: 80 },
    { title: "Barbie 2", voteCount: 900, voteAverage: 8, popularity: 20 },
  ];
  const titles = (sorted?: { title: string }[]) => sorted?.map((r) => r.title);
  const title = (r: { title: string }) => r.title;

  // The default puts the exact title first.
  test("puts the exact title first by default", () => {
    expect(
      titles(sortSeerrResults(results, "DEFAULT", "desc", title, "barbie")),
    ).toEqual(["Barbie", "Barbie Mysteries", "Barbie 2"]);
  });

  // lodash applies the one order to the first field only: the second one
  // breaks ties ascending. That is how the phone has sorted so far, and the
  // TV now sorts the same way.
  test("sorts by vote count, then average", () => {
    expect(
      titles(
        sortSeerrResults(
          results,
          SeerrSearchSort[
            SeerrSearchSort.VOTE_COUNT_AND_AVERAGE
          ] as unknown as SeerrSearchSort,
          "desc",
          title,
          "barbie",
        ),
      ),
    ).toEqual(["Barbie", "Barbie 2", "Barbie Mysteries"]);
  });

  // As the phone has sorted it so far: vote count first (#2249).
  test("sorts by vote count, then popularity, for popularity", () => {
    expect(
      titles(sortSeerrResults(results, "POPULARITY", "desc", title, "barbie")),
    ).toEqual(["Barbie 2", "Barbie", "Barbie Mysteries"]);
  });
});
