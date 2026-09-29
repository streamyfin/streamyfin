import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "useSyncPlayWebSocket.ts"), "utf8");
const provider = readFileSync(
  join(__dirname, "../SyncPlayProvider.tsx"),
  "utf8",
);

describe("SyncPlay reuses app services", () => {
  test("uses both lossless WebSocket subscriptions and removes them on cleanup", () => {
    expect(source).toContain('subscribe("SyncPlayCommand"');
    expect(source).toContain('subscribe("SyncPlayGroupUpdate"');
    expect(source).toContain("manager.processCommand(command)");
    expect(source).toContain("manager.processGroupUpdate(update)");
    expect(source).toContain("offCommand();");
    expect(source).toContain("offGroup();");
    expect(source).not.toContain("JSON.parse");
    expect(source).not.toContain("lastMessage");
    expect(source).not.toContain("addEventListener");
  });

  test("passes the latest authenticated SDK user without rebuilding the manager", () => {
    expect(provider).toContain("userRef.current = user");
    expect(provider).toContain(
      "new SyncPlayManager(api, () => userRef.current)",
    );
    expect(provider).toContain("target?.ItemId");
    expect(provider).not.toContain("target?.Id");
  });
});
