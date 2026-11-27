import fs from "node:fs";
import path from "node:path";
import { pluginLines } from "./lintProbes";

const ROOT = path.resolve(__dirname, "..");
const PLUGIN = "./biome-plugins/no-hand-built-image-url.grit";

const CASES = `export const template = \`\${base}/Items/\${id}/Images/Primary\`;
export const plain = "/Images/Primary";
export const single = '/Items/1/Images/Backdrop';
export const sdk = getImageApi(api);
export const urls = new ImageUrlsApi(configuration);
export const viaKind = getItemImageUrl(api, item, "primary");
export const unrelated = \`\${base}/Items/\${id}\`;
export const word = "Images";
import { Image, View } from "react-native";
import { Image as NativeImage } from "react-native";
import { ImageBackground } from "react-native";
import { Image as ServerImage } from "@/components/common/ServerImage";
`;

const FLAGGED = [1, 2, 3, 4, 5, 9];
const ALLOWED = [6, 7, 8, 10, 11, 12];

const lines = pluginLines([
  { dir: "components", name: "ImageProbe.tsx", content: CASES },
  { dir: "hooks", name: "useImageProbe.ts", content: CASES },
  { dir: "providers", name: "ImageProbeProvider.tsx", content: CASES },
  { dir: "services", name: "serviceImageProbe.ts", content: CASES },
  { dir: "utils", name: "utilImageProbe.ts", content: CASES },
  { dir: "components", name: "ImageProbe.test.tsx", content: CASES },
  { dir: "utils", name: "imageProbe.test.ts", content: CASES },
  { dir: "test-utils", name: "doubleImageProbe.ts", content: CASES },
  { dir: "utils/jellyfin/image", name: "builderImageProbe.ts", content: CASES },
]);

describe("no-hand-built-image-url", () => {
  it.each(FLAGGED)("flags line %i in a component", (line) => {
    expect(lines["ImageProbe.tsx"]).toContain(line);
  });

  it.each(ALLOWED)("allows line %i in a component", (line) => {
    expect(lines["ImageProbe.tsx"]).not.toContain(line);
  });

  it.each([
    ["a hook", "useImageProbe.ts"],
    ["a provider", "ImageProbeProvider.tsx"],
    ["a service", "serviceImageProbe.ts"],
    ["a util", "utilImageProbe.ts"],
  ])("flags the same lines in %s", (_, name) => {
    expect(lines[name]).toEqual(FLAGGED);
  });

  it("leaves specs alone", () => {
    expect(lines["ImageProbe.test.tsx"]).toEqual([]);
    expect(lines["imageProbe.test.ts"]).toEqual([]);
  });

  it("leaves the builders' own folder and test-utils alone", () => {
    expect(lines["builderImageProbe.ts"]).toEqual([]);
    expect(lines["doubleImageProbe.ts"]).toEqual([]);
  });

  // Read from the config, since a probe cannot go in app/.
  it("covers every listed folder and excludes the builders", () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, "biome.json"), "utf8"),
    );
    const override = config.overrides.find((entry: { plugins?: string[] }) =>
      entry.plugins?.includes(PLUGIN),
    );
    expect(override.includes).toContain("!utils/jellyfin/image/**");
    expect(override.includes).toEqual(
      expect.arrayContaining(["utils/**/*.ts", "services/**/*.ts"]),
    );
    expect(override.includes).toEqual(
      expect.arrayContaining(["app/**/*.ts", "app/**/*.tsx"]),
    );
  });
});
