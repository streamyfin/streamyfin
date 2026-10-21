import { readFileSync } from "node:fs";
import { join } from "node:path";

// Our patch to react-native-bottom-tabs changes Swift that Jest cannot run, so
// these pin the installed source: they fail if a regenerated patch or a version
// bump drops one of its changes.
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

// REACT-NATIVE-24, the top tvOS crash. SwiftUI evicts a ForEach element that no
// tab retains, which is what a hidden tab rendering nothing was. When the focus
// engine then selected a tab past it, SwiftUI rebuilt that element outside a
// view update and trapped in AGAttribute.syncMainIfReferences. The crash itself
// only shows on a device or simulator.
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

// Linked against the iOS 27 SDK, a tab with the search role sits inline at the
// end of the bar with a label: the detached search button is the prominent role
// there. The library keeps search as .search, so the patch maps it, only for
// iOS 27 and only from Xcode 27 (Swift 6.4), the first SDK with that role.
test("gives the search tab the prominent role on iOS 27 in an Xcode 27 build", () => {
  const searchCase =
    tabViewSource("TabViewProps.swift").match(
      /case \.search:([\s\S]*?)case \.prominent:/,
    )?.[1] ?? "";
  expect(searchCase).toContain("#if compiler(>=6.4) && os(iOS)");
  expect(searchCase).toMatch(
    /if #available\(iOS 27, \*\) \{\s*return \.prominent\s*\}\s*#endif\s*return \.search/,
  );
});
