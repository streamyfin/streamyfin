import { episodeAfter, episodeBefore } from "./remoteEpisodes";

const episodes = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];

describe("the episode next to the one the TV plays", () => {
  test("after is the following one, none past the last", () => {
    expect(episodeAfter(episodes, "e1")).toEqual({ id: "e2" });
    expect(episodeAfter(episodes, "e3")).toBeNull();
  });

  test("before is the previous one, none ahead of the first", () => {
    expect(episodeBefore(episodes, "e3")).toEqual({ id: "e2" });
    expect(episodeBefore(episodes, "e1")).toBeNull();
  });

  test("an item the list does not hold has no neighbour", () => {
    expect(episodeAfter(episodes, "film")).toBeNull();
    expect(episodeBefore(episodes, null)).toBeNull();
  });
});
