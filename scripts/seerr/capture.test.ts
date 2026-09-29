import { describe, expect, test } from "bun:test";
import { SIGNED_IN_USER } from "../../utils/seerr/routes";
import { urlFor } from "./capture";

describe("urlFor", () => {
  const base = "http://seerr.example";

  test("fills the path parameters and the query", () => {
    expect(
      urlFor(
        {
          template: "GET /tv/{tvId}/season/{seasonNumber}",
          params: { tvId: 1399, seasonNumber: 1 },
        },
        base,
      ),
    ).toBe("http://seerr.example/api/v1/tv/1399/season/1");
    expect(urlFor({ template: "GET /user", query: { take: 3 } }, base)).toBe(
      "http://seerr.example/api/v1/user?take=3",
    );
  });

  // Another user's quota needs an administrator's rights.
  test("puts the account signed in where a route asks for it", () => {
    expect(
      urlFor(
        {
          template: "GET /user/{userId}/quota",
          params: { userId: SIGNED_IN_USER },
        },
        base,
        111,
      ),
    ).toBe("http://seerr.example/api/v1/user/111/quota");
  });

  test("refuses a route that needs the account signed in without one", () => {
    expect(() =>
      urlFor(
        {
          template: "GET /user/{userId}/quota",
          params: { userId: SIGNED_IN_USER },
        },
        base,
      ),
    ).toThrow();
  });
});
