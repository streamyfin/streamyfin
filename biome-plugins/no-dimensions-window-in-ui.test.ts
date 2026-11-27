import { pluginLines, pluginScope } from "./lintProbes";

const PLUGIN = "./biome-plugins/no-dimensions-window-in-ui.grit";

const DIMENSIONS_CASES = `const moduleSnapshot = Dimensions.get("window").width;
const singleQuoted = Dimensions.get('window').height;
const { width: destructured } = Dimensions.get("window");
const screen = Dimensions.get("screen").width;
const hooked = useWindowDimensions().width;
const Component = () => {
  const inside = Dimensions.get("window").width;
  return inside;
};
`;

const DIMENSIONS_FLAGGED = [1, 2, 3, 7];
const DIMENSIONS_ALLOWED = [4, 5];

// Every case in one Biome run. No probe goes under app/: Expo Router takes
// every file there for a route, for as long as it exists.
const lines = pluginLines(
  [
    { dir: "components", name: "WindowProbe.tsx", content: DIMENSIONS_CASES },
    { dir: "components", name: "windowProbe.ts", content: DIMENSIONS_CASES },
    {
      dir: "components",
      name: "WindowProbe.test.tsx",
      content: DIMENSIONS_CASES,
    },
    { dir: "hooks", name: "useWindowProbe.ts", content: DIMENSIONS_CASES },
    {
      dir: "providers",
      name: "WindowProbeProvider.tsx",
      content: DIMENSIONS_CASES,
    },
    {
      dir: "components/tv",
      name: "TVWindowProbe.tsx",
      content: DIMENSIONS_CASES,
    },
    {
      dir: "components/tv",
      name: "TVFontProbe.tsx",
      content: "const styles = {\n  fontSize: 20,\n};\n",
    },
    {
      dir: "components/tv",
      name: "tvLayout.ts",
      content:
        'const windowWidth = Dimensions.get("window").width;\nconst layout = { fontSize: 20 };\n',
    },
  ],
  ["hooks/useOrientation.ts"],
);

describe("no-dimensions-window-in-ui", () => {
  it.each(DIMENSIONS_FLAGGED)("flags line %i in a component", (line) => {
    expect(lines["WindowProbe.tsx"]).toContain(line);
  });

  it.each(DIMENSIONS_ALLOWED)("allows line %i in a component", (line) => {
    expect(lines["WindowProbe.tsx"]).not.toContain(line);
  });

  it.each([
    ["a .ts file beside the components", "windowProbe.ts"],
    ["a hook", "useWindowProbe.ts"],
    ["a provider", "WindowProbeProvider.tsx"],
    ["a TV component", "TVWindowProbe.tsx"],
  ])("flags the same reads in %s", (_, name) => {
    expect(lines[name]).toEqual(DIMENSIONS_FLAGGED);
  });

  // A spec may read the window it mocks to work out what it expects.
  it("leaves specs alone", () => {
    expect(lines["WindowProbe.test.tsx"]).toEqual([]);
  });

  it("still flags hardcoded TV font sizes alongside it", () => {
    expect(lines["TVFontProbe.tsx"]).toEqual([2]);
  });

  it("flags a TV .ts helper for both rules", () => {
    expect(lines["tvLayout.ts"]).toEqual([1, 2]);
  });

  it("lets hooks/useOrientation.ts read the window once, with its reason", () => {
    expect(lines["useOrientation.ts"]).toEqual([]);
  });

  // Read from the config, since a probe cannot go there.
  it("covers app/ too", () => {
    const { files, entry } = pluginScope(PLUGIN);
    expect(files).toContain(
      "{app,components,hooks,providers,utils,services}/**/*.{ts,tsx}",
    );
    expect(entry.includes).toEqual(["{app,components,hooks,providers}/**"]);
  });
});
