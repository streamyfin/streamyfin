import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const source = readFileSync(join(__dirname, "useSyncPlayWebSocket.ts"), "utf8");
const provider = readFileSync(
  join(__dirname, "../SyncPlayProvider.tsx"),
  "utf8",
);

describe("SyncPlay reuses app services", () => {
  test("burst frames reach the manager once and cleanup removes both subscriptions", () => {
    const handlers = new Map<string, (value: unknown) => void>();
    let cleanup: (() => void) | undefined;
    const subscribe = (name: string, handler: (value: unknown) => void) => {
      handlers.set(name, handler);
      return () => {
        handlers.delete(name);
      };
    };
    const exports: Record<string, (manager: unknown) => void> = {};
    const imports: Record<string, unknown> = {
      react: {
        useEffect: (effect: () => () => void) => {
          cleanup = effect();
        },
      },
      "@/providers/WebSocketProvider": {
        useWebSocketContext: () => ({ subscribe }),
      },
    };
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    new Function("require", "exports", compiled)(
      (id: string) => imports[id],
      exports,
    );
    const manager = {
      processCommand: mock((_command: unknown) => {}),
      processGroupUpdate: mock((_update: unknown) => {}),
    };
    exports.useSyncPlayWebSocket(manager);
    const commands = [{ Command: "Pause" }, { Command: "Unpause" }];
    for (const command of commands) handlers.get("SyncPlayCommand")?.(command);
    const update = { Type: "GroupJoined" };
    handlers.get("SyncPlayGroupUpdate")?.(update);
    expect(manager.processCommand.mock.calls).toEqual(
      commands.map((command) => [command]),
    );
    expect(manager.processGroupUpdate).toHaveBeenCalledWith(update);
    cleanup?.();
    expect(handlers.size).toBe(0);
  });

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

  test("manager cleanup clears membership UI and no uncancelled delayed rejoin remains", () => {
    const cleanup = provider
      .split("mgr.destroy();", 2)[1]
      ?.split("}, [api", 1)[0];
    expect(cleanup).toContain("setIsEnabled(false)");
    expect(cleanup).toContain("setGroupInfo(null)");
    expect(cleanup).toContain("setPendingPlaybackCommand(null)");
    expect(provider).not.toContain("wsClosedWhileBackgroundedRef");
    expect(provider).toContain("tracker.dispose()");
  });
});
