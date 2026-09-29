import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Evaluate these hooks with synchronous hook doubles, without global mock.module
// registrations that would leak into unrelated Bun tests.
function loadHook(name: string, imports: Record<string, unknown>) {
  const source = ts.transpileModule(
    readFileSync(join(__dirname, `${name}.ts`), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: Record<string, unknown> = {};
  new Function("require", "exports", source)((id: string) => {
    if (!(id in imports)) throw new Error(`Unexpected hook import: ${id}`);
    return Object.assign({ __esModule: true }, imports[id]);
  }, exports);
  return exports;
}

function fixture({
  disabled = false,
  offline = false,
  grouped = true,
  count = 0,
  max = 3,
} = {}) {
  const router = {
    push: mock(() => {}),
    replace: mock(() => {}),
    setParams: mock(() => {}),
  };
  const controller = {
    play: mock(async () => {}),
    nextItem: mock(() => {}),
    previousItem: mock(() => {}),
    goToItem: mock(() => {}),
  };
  const settings = {
    maxAutoPlayEpisodeCount: { value: max },
    autoPlayEpisodeCount: count,
  };
  const updateSettings = mock(() => {});
  const present = mock(async () => true);
  const imports = {
    react: { useCallback: (callback: unknown) => callback },
    jotai: { useSetAtom: () => mock(() => {}) },
    "react-i18next": { useTranslation: () => ({ t: (key: string) => key }) },
    "react-native": {
      Platform: { isTV: false },
      Alert: { alert: mock(() => {}) },
    },
    "@/hooks/useAppRouter": { default: () => router },
    "@/hooks/useHaptic": { useHaptic: () => () => {} },
    "@/modules/mpv-player": { isNativePlayerPresented: () => false },
    "@/providers/NativePlayerProvider": {
      useNativePlayer: () => ({ presentFromRequest: present }),
    },
    "@/providers/SyncPlay": {
      useSyncPlay: () => ({ isEnabled: grouped, controller }),
    },
    "@/providers/Downloads": { getDownloadedItemById: () => ({}) },
    "@/providers/OfflineModeProvider": { useOfflineMode: () => offline },
    "@/utils/atoms/settings": {
      useSettings: () => ({ settings, updateSettings }),
      isNativeChromeActive: () => true,
    },
    "@/utils/atoms/shuffleQueue": { shuffleQueueAtom: {} },
    "@/utils/log": {
      logAndCaptureError: mock(() => {}),
      writeErrorLog: mock(() => {}),
    },
    "@/utils/nativePlayer/playRequest": {
      toDirectPlayerQuery: () => "itemId=live",
    },
    "@/utils/jellyfin/getDefaultPlaySettings": {
      getDefaultPlaySettings: () => ({}),
    },
  };
  const media = loadHook(
    "usePlayMedia",
    imports,
  ) as typeof import("./usePlayMedia");
  const navigation = loadHook("usePlayerItemNavigation", {
    ...imports,
    "@/hooks/usePlayMedia": { usePlayMedia: media.usePlayMedia },
  }) as typeof import("./usePlayerItemNavigation");
  // biome-ignore lint/correctness/useHookAtTopLevel: Hooks are synchronous doubles in this isolated evaluator.
  const hook = navigation.usePlayerItemNavigation({
    isDisabled: disabled,
    nextItem: { Id: "next" },
    previousItem: { Id: "previous" },
  });
  return {
    hook,
    // biome-ignore lint/correctness/useHookAtTopLevel: Hooks are synchronous doubles in this isolated evaluator.
    playMedia: media.usePlayMedia(),
    controller,
    router,
    present,
    updateSettings,
  };
}

describe("shared SyncPlay playback eligibility", () => {
  test("disabled navigation cannot dispatch any in-player action", () => {
    const f = fixture({ disabled: true });
    f.hook.goToNextItem();
    f.hook.goToPreviousItem();
    f.hook.goToItem({ Id: "picked" });
    f.hook.handleAutoPlayNext();
    f.hook.handleContinueWatching();
    expect(f.controller.nextItem).not.toHaveBeenCalled();
    expect(f.controller.previousItem).not.toHaveBeenCalled();
    expect(f.controller.goToItem).not.toHaveBeenCalled();
    expect(f.router.setParams).not.toHaveBeenCalled();
  });

  test("resolved offline playback stays local and Live TV bypasses the group", async () => {
    const f = fixture({ offline: true });
    await f.hook.playItem({ Id: "download", Type: "Movie" });
    expect(f.controller.play).not.toHaveBeenCalled();
    expect(f.present).toHaveBeenCalledWith(
      expect.objectContaining({ offline: true }),
    );
    const live = fixture();
    await live.hook.playItem({ Id: "program", Type: "Program" });
    await live.hook.playItem({ Id: "channel", Type: "TvChannel" });
    expect(live.controller.play).not.toHaveBeenCalled();
    expect(live.router.push).toHaveBeenCalledTimes(2);
  });

  test("ordinary online playback dispatches exactly once and shuffle keeps the full order", async () => {
    const f = fixture();
    await f.hook.playItem({ Id: "movie", Type: "Movie" });
    expect(f.controller.play).toHaveBeenCalledTimes(1);
    const queue = [{ Id: "c" }, { Id: "a" }, { Id: "b" }];
    await f.playMedia(
      { itemId: "c", offline: false },
      { item: queue[0], queueItems: queue },
    );
    expect(f.controller.play).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ids: ["c", "a", "b"],
        items: queue,
      }),
    );
    await f.playMedia(
      { itemId: "b", offline: false },
      { queueItems: [{}, ...queue] },
    );
    expect(f.controller.play).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ids: ["c", "a", "b"],
        startIndex: 2,
      }),
    );
  });

  test("autoplay takes the final allowed transition but not an exhausted budget", () => {
    for (const [count, max] of [
      [0, 1],
      [2, 3],
    ]) {
      const f = fixture({ grouped: false, count, max });
      f.hook.handleAutoPlayNext();
      expect(f.router.setParams).toHaveBeenCalledTimes(1);
      expect(f.updateSettings).toHaveBeenCalledWith({
        autoPlayEpisodeCount: count + 1,
      });
    }
    const exhausted = fixture({ grouped: false, count: 3, max: 3 });
    exhausted.hook.handleAutoPlayNext();
    expect(exhausted.router.setParams).not.toHaveBeenCalled();
  });
});
