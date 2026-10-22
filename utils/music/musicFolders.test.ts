import { musicFolderName, sortMusicFolders } from "./musicFolders";

describe("musicFolderName", () => {
  // The server renamed the folder "3" after the album of its first song.
  it("takes the name from the path, not the album tag", () => {
    expect(musicFolderName({ Name: "#willpower", Path: "/music/3" })).toBe("3");
  });

  it("reads Windows paths and trailing separators", () => {
    expect(musicFolderName({ Path: "D:\\Music\\Roadtrip\\" })).toBe("Roadtrip");
  });

  it("falls back to the item name without a path", () => {
    expect(musicFolderName({ Name: "Roadtrip" })).toBe("Roadtrip");
    expect(musicFolderName({})).toBe("");
  });
});

describe("sortMusicFolders", () => {
  it("sorts by the name on disk with numbers in order", () => {
    const folders = ["/m/10", "/m/2", "/m/b", "/m/1", "/m/A"].map((Path) => ({
      Name: "album tag",
      Path,
    }));
    expect(sortMusicFolders(folders).map(musicFolderName)).toEqual([
      "1",
      "2",
      "10",
      "A",
      "b",
    ]);
  });
});
