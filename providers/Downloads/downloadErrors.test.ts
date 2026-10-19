import { classifyDownloadError } from "./downloadErrors";

const environment = { kind: "environment" };
const reportedAs = (detail: string) => ({ kind: "report", detail });

// The ways the native downloaders word a download the server refused:
// - Android (OkHttpDownloadManager.kt): "HTTP error: <code> <reason phrase>",
//   the phrase being the server's own and empty over HTTP/2
// - iOS (BackgroundDownloaderModule.swift): "HTTP error: <code>" from the
//   session delegate, "Server responded with HTTP <code>" when a transfer
//   completes with the server's error page as its file
const refusals = (status: number, reason: string): [string][] => [
  [`HTTP error: ${status} ${reason}`],
  [`HTTP error: ${status} `],
  [`HTTP error: ${status}`],
  [`Server responded with HTTP ${status}`],
];

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

  // A connection cut under the transfer, in the words that carry none of the
  // usual ones.
  test.each([
    // REACT-NATIVE-A1, Android: the peer, or a proxy, reset the HTTP/2 stream.
    ["stream was reset: INTERNAL_ERROR"],
    ["stream was reset: CANCEL"],
    ["stream was reset: REFUSED_STREAM"],
    // REACT-NATIVE-83, Android: the connection closed before the body ended.
    ["unexpected end of stream"],
    ["unexpected end of stream on https://jellyfin.example.com/..."],
    // REACT-NATIVE-4S, iOS: NSURLErrorCannotParseResponse, an answer cut
    // short or mangled on the way.
    ["cannot parse response"],
  ])("a transfer the network cut: %j", (error) => {
    expect(classifyDownloadError(error)).toEqual(environment);
  });

  // REACT-NATIVE-GM: iOS words its errors in the user's language, and no list
  // of words covers that. Pinned so that it is not taken for covered: it
  // needs the NSURLError code from the native side.
  test("the same iOS error in another language is still reported", () => {
    expect(classifyDownloadError("impossibile analizzare la risposta")).toEqual(
      reportedAs("impossibile analizzare la risposta"),
    );
  });
});

// A download refused with a status is a request like any other, and sorted
// like one. Which statuses count as a gateway's is utils/errors' rule and
// tested there; what is tested here is that the status is read out of every
// wording and handed to it.
describe("classifyDownloadError — HTTP statuses", () => {
  // REACT-NATIVE-7Q: a session that ended, once per queued episode.
  test.each(refusals(401, "Unauthorized"))(
    "a 401 is a session that ended, as it is everywhere else: %j",
    (error) => {
      expect(classifyDownloadError(error)).toEqual(environment);
    },
  );

  test.each(refusals(502, "Bad Gateway"))(
    "a gateway status is the server being unreachable: %j",
    (error) => {
      expect(classifyDownloadError(error)).toEqual(environment);
    },
  );

  test.each([
    ...refusals(403, "Forbidden"),
    ...refusals(404, "Not Found"),
    ...refusals(500, "Internal Server Error"),
  ])("any other status is reported: %j", (error) => {
    expect(classifyDownloadError(error).kind).toBe("report");
  });

  // The reason phrase differs from one server and one HTTP version to the
  // next, and each wording would otherwise be an issue of its own.
  test("every wording of one status is reported as the status alone", () => {
    for (const [error] of refusals(500, "Internal Server Error")) {
      expect(classifyDownloadError(error)).toEqual(
        reportedAs("HTTP error: 500"),
      );
    }
    for (const [error] of refusals(403, "Forbidden")) {
      expect(classifyDownloadError(error)).toEqual(
        reportedAs("HTTP error: 403"),
      );
    }
  });

  // Android appends the server's reason phrase, which is free text and can
  // hold a word the environment filter looks for.
  test("a status takes precedence over an environment keyword", () => {
    expect(classifyDownloadError("HTTP error: 500 connect failed")).toEqual(
      reportedAs("HTTP error: 500"),
    );
    expect(
      classifyDownloadError("HTTP error: 403 Blocked by network policy"),
    ).toEqual(reportedAs("HTTP error: 403"));
  });

  // The other way round: a phrase that sounds like a defect does not make
  // one of a status that is the environment's.
  test("a status takes precedence over whatever else the phrase says", () => {
    expect(classifyDownloadError("HTTP error: 401 Invalid token")).toEqual(
      environment,
    );
    expect(classifyDownloadError("HTTP error: 503 Internal error")).toEqual(
      environment,
    );
  });
});

// What the natives report that is neither a status nor the environment.
describe("classifyDownloadError — everything else", () => {
  test.each([
    // Android, OkHttpDownloadManager.kt
    ["Failed to get response body"],
    ["Failed to move completed file into place"],
    // Android's fallback for an exception that carries no message
    ["Download failed"],
    // iOS, BackgroundDownloaderModule.swift
    ["Download task info not found"],
    ["File operation failed: The operation couldn’t be completed."],
  ])("is reported as it came: %j", (error) => {
    expect(classifyDownloadError(error)).toEqual(reportedAs(error));
  });

  test("an error with no text at all is still reported", () => {
    expect(classifyDownloadError("")).toEqual(reportedAs(""));
  });
});
