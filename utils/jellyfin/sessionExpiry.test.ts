import { AxiosError, type AxiosResponse } from "axios";
import { endsSession } from "@/utils/jellyfin/sessionExpiry";

const failure = (status: number | undefined, url: string) =>
  new AxiosError(
    "request failed",
    "ERR_BAD_REQUEST",
    { url } as never,
    undefined,
    status ? ({ status } as AxiosResponse) : undefined,
  );

describe("endsSession", () => {
  test("ends the session on a 401 from an ordinary request", () => {
    expect(
      endsSession(failure(401, "https://media.example.com/Users/Me")),
    ).toBe(true);
  });

  // Jellyfin answers an approval with a 401 while Quick Connect is turned off.
  // That says nothing about the token, which still works everywhere else.
  test("keeps the session on a 401 from Quick Connect", () => {
    expect(
      endsSession(
        failure(
          401,
          "https://media.example.com/QuickConnect/Authorize?code=123456",
        ),
      ),
    ).toBe(false);
    expect(
      endsSession(
        failure(401, "https://media.example.com/jf/quickconnect/Connect"),
      ),
    ).toBe(false);
  });

  test("keeps the session on anything but a 401", () => {
    expect(endsSession(failure(403, "https://media.example.com/Items"))).toBe(
      false,
    );
    expect(
      endsSession(failure(undefined, "https://media.example.com/Items")),
    ).toBe(false);
    expect(endsSession(new Error("boom"))).toBe(false);
  });
});
