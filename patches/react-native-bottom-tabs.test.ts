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
  const newTabView = tabViewSource("TabView/NewTabView.swift");
  expect(newTabView).toContain("ForEach(props.renderedChildren)");
  expect(newTabView).not.toContain("ForEach(props.children)");

  const props = tabViewSource("TabViewProps.swift");
  expect(props).toContain("var renderedChildren: [IdentifiablePlatformView]");
  expect(props).toContain("!tabData.hidden || tabData.key == selectedPage");
});
