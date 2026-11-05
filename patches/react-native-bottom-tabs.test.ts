import { readFileSync } from "node:fs";
import { join } from "node:path";

// REACT-NATIVE-24, the top tvOS crash. SwiftUI evicts a ForEach element that no
// tab retains, which is what a hidden tab rendering nothing was. When the focus
// engine then selected a tab past it, SwiftUI rebuilt that element outside a
// view update and trapped in AGAttribute.syncMainIfReferences. Our patch to
// react-native-bottom-tabs keeps hidden tabs out of the ForEach; this fails if
// a regenerated patch or a version bump drops it. The crash itself only shows
// on a device or simulator, so this pins the installed source.
const tabViewSource = (file: string) =>
  readFileSync(
    join(
      __dirname,
      "..",
      "node_modules",
      "react-native-bottom-tabs",
      "ios",
      file,
    ),
    "utf8",
  );

test("keeps hidden tabs out of the SwiftUI ForEach that builds the tab bar", () => {
  // Both tab views: the new one from iOS and tvOS 18, the legacy one below.
  for (const view of ["NewTabView", "LegacyTabView"]) {
    const source = tabViewSource(`TabView/${view}.swift`);
    expect(source).toContain("ForEach(props.renderedChildren)");
    expect(source).not.toContain("ForEach(props.children)");
  }

  // The getter itself, so a version that keeps the rule's text but returns
  // every child, or keeps the hidden tabs and drops the others, fails too.
  const renderedChildren =
    tabViewSource("TabViewProps.swift").match(
      /var renderedChildren: \[IdentifiablePlatformView\] \{[\s\S]*?\n {2}\}/,
    )?.[0] ?? "";
  expect(renderedChildren).toContain(
    "guard let tabData = items[safe: index], !tabData.hidden || tabData.key == selectedPage else {",
  );
  expect(renderedChildren).toMatch(/else \{\s*return nil\s*\}\s*return child/);
});

// Android, half a screen of content on every tab until a rotation (upstream
// #1477): edge to edge, a keyboard pads the tab bar instead of shrinking the
// window, so the content holder changes size while the outer view does not.
// The tab view used to report the holder's size only when the outer size
// changed, so a size taken while a keyboard was up (the app opened from a
// keyboard search) stuck after it closed. Our patch reports the holder's own
// size changes; this fails if a regenerated patch or a version bump drops it.
test("reports the tab content size whenever the holder itself resizes", () => {
  const source = readFileSync(
    join(
      __dirname,
      "..",
      "node_modules",
      "react-native-bottom-tabs",
      "android",
      "src",
      "main",
      "java",
      "com",
      "rcttabview",
      "RCTTabView.kt",
    ),
    "utf8",
  );
  expect(source).toContain("layoutHolder.addOnLayoutChangeListener");
  const report =
    source.match(/private fun reportHolderSize\(\) \{[\s\S]*?\n {2}\}/)?.[0] ??
    "";
  // Compared and remembered by the holder's size, the one that is sent.
  expect(report).toContain(
    "holderWidth == lastReportedSize?.width && holderHeight == lastReportedSize?.height",
  );
  expect(report).toContain(
    "lastReportedSize = Size(holderWidth, holderHeight)",
  );
  expect(report).toContain("onNativeLayoutListener?.invoke(dpWidth, dpHeight)");
});
