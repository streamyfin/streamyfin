import { classifyDownloadError } from "./downloadErrors";

const environment = { kind: "environment" };

describe("classifyDownloadError — the user's environment", () => {
  test("walking out of Wi-Fi range", () => {
    expect(
      classifyDownloadError("Failed to connect to /192.168.1.5:8096"),
    ).toEqual(environment);
    expect(classifyDownloadError("The request timed out.")).toEqual(
      environment,
    );
    expect(
      classifyDownloadError("The Internet connection appears to be offline."),
    ).toEqual(environment);
  });

  test("a full disk", () => {
    expect(
      classifyDownloadError("write failed: ENOSPC (No space left)"),
    ).toEqual(environment);
  });

  // REACT-NATIVE-7N / 7G: Android's wording for a TLS connection cut under
  // the transfer.
  test("a TLS connection that broke mid-read", () => {
    expect(
      classifyDownloadError(
        "Read error: ssl=0xb400007329635958: Failure in SSL library, usually a protocol error",
      ),
    ).toEqual(environment);
    expect(
      classifyDownloadError(
        "An SSL error has occurred and a secure connection to the server cannot be made.",
      ),
    ).toEqual(environment);
    expect(classifyDownloadError("TLS handshake failed")).toEqual(environment);
  });
});

// A download refused with a status is a request like any other, and sorted
// like one.
describe("classifyDownloadError — HTTP statuses", () => {
  // REACT-NATIVE-7Q: a session that ended, once per queued episode.
  test("a 401 is a session that ended, as it is everywhere else", () => {
    expect(classifyDownloadError("HTTP error: 401")).toEqual(environment);
    expect(classifyDownloadError("HTTP error: 401 Unauthorized")).toEqual(
      environment,
    );
  });

  test("a gateway status is the server being unreachable", () => {
    expect(classifyDownloadError("HTTP error: 502 Bad Gateway")).toEqual(
      environment,
    );
    expect(classifyDownloadError("HTTP error: 530")).toEqual(environment);
    expect(classifyDownloadError("Server responded with HTTP 503")).toEqual(
      environment,
    );
  });

  test("any other status is reported, as the status alone", () => {
    expect(classifyDownloadError("HTTP error: 403")).toEqual({
      kind: "report",
      detail: "HTTP error: 403",
    });
    expect(
      classifyDownloadError("HTTP error: 500 Internal Server Error"),
    ).toEqual({ kind: "report", detail: "HTTP error: 500" });
  });

  test("Android's and iOS's wordings of one status are one failure", () => {
    const wordings = [
      "HTTP error: 500 Internal Server Error",
      "HTTP error: 500 ",
      "HTTP error: 500",
      "Server responded with HTTP 500",
    ];
    expect(
      new Set(wordings.map((w) => JSON.stringify(classifyDownloadError(w))))
        .size,
    ).toBe(1);
  });
});

describe("classifyDownloadError — everything else", () => {
  test("is reported as it came", () => {
    expect(classifyDownloadError("Download task info not found")).toEqual({
      kind: "report",
      detail: "Download task info not found",
    });
    expect(classifyDownloadError("")).toEqual({ kind: "report", detail: "" });
  });
});
