import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const menu = readFileSync(join(__dirname, "GroupSelectionMenu.tsx"), "utf8");
const button = readFileSync(join(__dirname, "SyncPlayButton.tsx"), "utf8");
const provider = readFileSync(
  join(__dirname, "../../providers/SyncPlay/SyncPlayProvider.tsx"),
  "utf8",
);

describe("native SyncPlay sheet presentation ordering", () => {
  test("join, create and resume wait for sheet dismissal before triggering playback", () => {
    expect(menu).toMatch(/await onClose\(\);\s*await joinGroup\(groupId\)/);
    expect(menu).toMatch(/await onClose\(\);\s*await createGroup\(\)/);
    expect(menu).toMatch(/await onClose\(\);\s*await resumeGroupPlayback\(\)/);
  });

  test("the native onDismiss event releases the presentation guard", () => {
    expect(button).toContain("onDismiss={handleDidDismiss}");
    expect(button).toMatch(
      /const handleDidDismiss = useCallback\([\s\S]*?dismissalRef.current\?\.resolve\(\)/,
    );
    const dismiss = button
      .split("const handleDismiss = useCallback", 2)[1]
      ?.split("const handleDidDismiss", 1)[0];
    expect(dismiss).toContain("return dismissalRef.current.promise");
    expect(dismiss).toContain("dismiss()");
    expect(dismiss).not.toContain("dismissalRef.current?.resolve()");
  });

  test("server-started playback also waits for any open group sheet to dismiss", () => {
    expect(
      provider.indexOf("await presentationGuardRef.current?.()"),
    ).toBeLessThan(
      provider.indexOf("await playbackNavigatorRef.current?.(request)"),
    );
    expect(button).toContain(
      "registerPlaybackPresentationGuard(handleDismiss)",
    );
  });

  test("superseded presentation errors cannot reject a newer queue startup", () => {
    const catchBody = provider
      .split("} catch (error) {", 2)[1]
      ?.split("[router]", 1)[0];
    expect(catchBody).toBeDefined();
    expect(catchBody).toMatch(
      /requestId !== navigationRequestRef.current[\s\S]*?return;/,
    );
    expect(
      catchBody!.indexOf("requestId !== navigationRequestRef.current"),
    ).toBeLessThan(catchBody!.indexOf("throw error"));
  });
});
