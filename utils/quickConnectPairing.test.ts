import {
  parsePairingCode,
  quickConnectPairingUrl,
  stripUrlCredentials,
} from "@/utils/quickConnectPairing";

// One rule for every place a server address is shown: no user:password@.
describe("stripUrlCredentials", () => {
  test.each([
    ["https://ada:s3cr@t@media.example.com/jf", "https://media.example.com/jf"],
    ["http://ada@jellyfin.local:8096", "http://jellyfin.local:8096"],
    ["https://media.example.com/a@b", "https://media.example.com/a@b"],
    ["https://media.example.com?next=@x", "https://media.example.com?next=@x"],
  ])("%s", (url, expected) => {
    expect(stripUrlCredentials(url)).toBe(expected);
  });
});

describe("quickConnectPairingUrl", () => {
  // jellyfin-web reads ?code= on its Quick Connect page and fills the code in,
  // so a phone camera alone can finish the pairing.
  test("points at the Quick Connect page of the server's web client", () => {
    expect(quickConnectPairingUrl("https://media.example.com", "123456")).toBe(
      "https://media.example.com/web/#/quickconnect?code=123456",
    );
  });

  test("keeps a base path and drops trailing slashes", () => {
    expect(
      quickConnectPairingUrl("http://jellyfin.local:8096/jellyfin//", "042117"),
    ).toBe(
      "http://jellyfin.local:8096/jellyfin/web/#/quickconnect?code=042117",
    );
  });

  // The QR code is on screen for anyone in the room to photograph, so a server
  // address saved as user:password@host must not carry the password into it.
  test("leaves out credentials written into the server address", () => {
    expect(
      quickConnectPairingUrl(
        "https://ada:s3cr@t@media.example.com/jf",
        "123456",
      ),
    ).toBe("https://media.example.com/jf/web/#/quickconnect?code=123456");
  });

  // The web client reads only the code, so the server id rides along for the
  // app without changing what a phone camera opens.
  test("adds the server id when the TV knows it", () => {
    expect(
      quickConnectPairingUrl("https://media.example.com", "123456", "f00d"),
    ).toBe(
      "https://media.example.com/web/#/quickconnect?code=123456&serverId=f00d",
    );
  });
});

describe("parsePairingCode", () => {
  test("reads the server and the code back from a TV's QR code", () => {
    const url = quickConnectPairingUrl(
      "http://jellyfin.local:8096/jf",
      "123456",
    );
    expect(parsePairingCode(url)).toEqual({
      kind: "quick-connect",
      serverUrl: "http://jellyfin.local:8096/jf",
      code: "123456",
    });
  });

  test("reads the server id back when the QR code carries one", () => {
    const url = quickConnectPairingUrl(
      "https://media.example.com",
      "123456",
      "f00d",
    );
    expect(parsePairingCode(url)).toEqual({
      kind: "quick-connect",
      serverUrl: "https://media.example.com",
      code: "123456",
      serverId: "f00d",
    });
  });

  test("accepts the web client's index.html path and other parameters", () => {
    expect(
      parsePairingCode(
        "https://media.example.com/web/index.html#/quickconnect?lang=fr&code=%20654321",
      ),
    ).toEqual({
      kind: "quick-connect",
      serverUrl: "https://media.example.com",
      code: "654321",
    });
  });

  // TVs on an older version show {"action":"streamyfin-pair","code":...} and
  // wait for a password over the network, which this app no longer sends.
  test("recognises the code an older TV shows", () => {
    expect(
      parsePairingCode('{"action":"streamyfin-pair","code":"123456"}'),
    ).toEqual({ kind: "legacy" });
  });

  test.each([
    ["an unrelated link", "https://example.com/some/page?code=123456"],
    [
      "a Quick Connect link without a code",
      "https://media.example.com/web/#/quickconnect",
    ],
    ["an empty code", "https://media.example.com/web/#/quickconnect?code=%20"],
    // A damaged or hostile QR code must not throw out of the scanner callback.
    [
      "a code with a broken escape",
      "https://media.example.com/web/#/quickconnect?code=%E0%A4%A",
    ],
    [
      "a link that is not http",
      "ftp://media.example.com/web/#/quickconnect?code=1",
    ],
    ["other JSON", '{"action":"something-else"}'],
    ["plain text", "hello"],
  ])("rejects %s", (_label, data) => {
    expect(parsePairingCode(data)).toBeNull();
  });
});
