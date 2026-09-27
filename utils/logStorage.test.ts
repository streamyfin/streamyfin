import { beforeEach, describe, expect, test } from "bun:test";
import { LOGS_STORAGE_KEY } from "@/constants/Logs";
import { clearMmkv, stubMmkv } from "@/test-utils/mmkv";

// utils/log is mocked process-wide by several specs, so the storage half of
// the app log lives here, where the real module can be exercised.
stubMmkv();

const { readFromLog, redactStoredLog, storeLogEntry } = await import(
  "./logStorage"
);
const { storage } = await import("./mmkv");

const TOKEN = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  clearMmkv();
});

describe("storeLogEntry", () => {
  test("keeps the access token of a native subtitle line out of the stored log", () => {
    storeLogEntry(
      "INFO",
      `[native player] getSubtitleTracks: found sub track id=2, title=Stream.subrip?ApiKey=${TOKEN}, lang=none, external=true`,
    );

    expect(storage.getString(LOGS_STORAGE_KEY)).not.toContain(TOKEN);
    expect(readFromLog()[0].message).toContain(
      "title=Stream.subrip?ApiKey=[redacted]",
    );
  });

  test("redacts URLs nested in data without touching the caller's object", () => {
    const data = {
      stream: {
        url: `https://jf.example/Videos/1/stream?static=true&api_key=${TOKEN}`,
      },
      codec: "av1",
    };

    storeLogEntry("ERROR", "stream failed", data);

    expect(readFromLog()[0].data).toEqual({
      stream: {
        url: "https://jf.example/Videos/1/stream?static=true&api_key=[redacted]",
      },
      codec: "av1",
    });
    expect(data.stream.url).toContain(TOKEN);
  });

  test("stores data it cannot serialize as its redacted string form", () => {
    const data: Record<string, unknown> = {
      toString: () => `download of /Items/1/Download?api_key=${TOKEN} failed`,
    };
    data.self = data;

    storeLogEntry("WARN", "download failed", data);

    expect(readFromLog()[0].data).toBe(
      "download of /Items/1/Download?api_key=[redacted] failed",
    );
  });

  test("takes a caught error passed as the message without throwing", () => {
    // downloads/index.tsx logs `writeToLog("ERROR", reason)` from a catch.
    const reason = new Error(`fetch /Items/1/Download?api_key=${TOKEN}`);

    storeLogEntry("ERROR", reason as unknown as string);

    expect(readFromLog()).toHaveLength(1);
    expect(storage.getString(LOGS_STORAGE_KEY)).not.toContain(TOKEN);
  });

  test("stores a label for data that even String() cannot render", () => {
    const data = Object.create(null);
    data.self = data;

    storeLogEntry("WARN", "odd payload", data);

    expect(readFromLog()[0].data).toBe("[unrenderable]");
  });

  test("starts over when the stored log is not a list", () => {
    storage.set(LOGS_STORAGE_KEY, "{}");

    storeLogEntry("INFO", "first entry");

    expect(readFromLog().map((entry) => entry.message)).toEqual([
      "first entry",
    ]);
  });

  test("keeps the 250 most recent entries", () => {
    for (let i = 0; i < 260; i++) {
      storeLogEntry("INFO", `entry ${i}`);
    }

    const logs = readFromLog();
    expect(logs).toHaveLength(250);
    expect(logs[0].message).toBe("entry 10");
  });
});

describe("redactStoredLog", () => {
  test("redacts every string of a log stored before redaction existed", () => {
    const stored = JSON.stringify([
      {
        timestamp: "2026-09-27T15:04:07.000Z",
        level: "INFO",
        message: `title=Stream.subrip?ApiKey=${TOKEN}, lang=none`,
      },
      {
        timestamp: "2026-09-27T15:04:08.000Z",
        level: "ERROR",
        message: "stream failed",
        data: { url: `/Videos/1/stream?api_key=${TOKEN}` },
      },
    ]);

    const redacted = redactStoredLog(stored);

    expect(redacted).not.toContain(TOKEN);
    expect(JSON.parse(redacted as string)).toEqual([
      {
        timestamp: "2026-09-27T15:04:07.000Z",
        level: "INFO",
        message: "title=Stream.subrip?ApiKey=[redacted] lang=none",
      },
      {
        timestamp: "2026-09-27T15:04:08.000Z",
        level: "ERROR",
        message: "stream failed",
        data: { url: "/Videos/1/stream?api_key=[redacted]" },
      },
    ]);
  });

  test("gives up on a blob that is not a readable log", () => {
    expect(redactStoredLog('[{"message":"?api_key=0123')).toBeUndefined();
    expect(redactStoredLog("{}")).toBeUndefined();
  });
});
