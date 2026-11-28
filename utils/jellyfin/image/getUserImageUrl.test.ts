import { makeApi } from "@/test-utils/jellyfinApi";
import { getUserImageUrl } from "./getUserImageUrl";

const api = makeApi();
const base = api.basePath;

describe("getUserImageUrl", () => {
  const serverAddress = "https://jellyfin.example.com";

  test("returns null without a tag", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: null,
      }),
    ).toBe(null);
    expect(getUserImageUrl({ serverAddress, userId: "user-1" })).toBe(null);
    expect(
      getUserImageUrl({ serverAddress, userId: "user-1", primaryImageTag: "" }),
    ).toBe(null);
  });

  test("uses the default width of 280", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=280&tag=user-tag`,
    );
  });

  test("passes the width through", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
        width: 96,
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=96&tag=user-tag`,
    );
  });

  test("keeps a width of 0", () => {
    expect(
      getUserImageUrl({
        serverAddress,
        userId: "user-1",
        primaryImageTag: "user-tag",
        width: 0,
      }),
    ).toBe(
      `${base}/Users/user-1/Images/Primary?quality=90&width=0&tag=user-tag`,
    );
  });

  test("keeps a path of the server address", () => {
    expect(
      getUserImageUrl({
        serverAddress: "https://example.com/jellyfin/",
        userId: "user-1",
        primaryImageTag: "user-tag",
      }),
    ).toBe(
      "https://example.com/jellyfin/Users/user-1/Images/Primary?quality=90&width=280&tag=user-tag",
    );
  });
});
