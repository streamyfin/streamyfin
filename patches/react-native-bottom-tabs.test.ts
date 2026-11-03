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
