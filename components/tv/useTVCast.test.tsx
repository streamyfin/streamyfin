import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { useTVCast } from "./useTVCast";

const movie = (People: BaseItemDto["People"]): BaseItemDto => ({
  Id: "m",
  Type: "Movie",
  People,
});

describe("useTVCast", () => {
  // The server lists an actor once per role. Cut and keyed without a merge,
  // the same actor gave two cards with one key: React's duplicate key error
  // on the TV item page (seen on Android TV, before #2443).
  test("gives an actor credited twice one card", async () => {
    const { result } = await renderHook(() =>
      useTVCast(
        movie([
          { Id: "a", Name: "Ana", Type: "Actor", Role: "Hero" },
          { Id: "a", Name: "Ana", Type: "Actor", Role: "Mother" },
          { Id: "b", Name: "Ben", Type: "Actor" },
        ]),
      ),
    );

    expect(result.current.cards.map((person) => person.Id)).toEqual(["a", "b"]);
    expect(result.current.cards[0].Role).toBe("Hero, Mother");
  });

  // The cards and the text line are one cast: inverted, the line named the
  // cast beside the cards and nowhere when there were none.
  test("names the cast in the text line only when there are no cards", async () => {
    const withCast = await renderHook(() =>
      useTVCast(movie([{ Id: "a", Name: "Ana", Type: "Actor" }])),
    );
    expect(withCast.result.current.castInText).toBe(false);

    const noCast = await renderHook(() =>
      useTVCast(movie([{ Id: "d", Name: "Dee", Type: "Director" }])),
    );
    expect(noCast.result.current.cards).toEqual([]);
    expect(noCast.result.current.castInText).toBe(true);
  });

  test("draws no cards on an item type without them", async () => {
    const { result } = await renderHook(() =>
      useTVCast({
        Id: "p",
        Type: "Program",
        People: [{ Id: "a", Name: "Ana", Type: "Actor" }],
      }),
    );

    expect(result.current.cards).toEqual([]);
    expect(result.current.castInText).toBe(true);
  });
});
