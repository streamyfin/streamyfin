import { enablePictureInPicture } from "./withAndroidPictureInPicture";

// expo/config-plugins pulls in the xcode package, which Jest cannot parse;
// only the pure helper is under test here, the mod runs at prebuild.
jest.mock("expo/config-plugins", () => ({
  withAndroidManifest: (config: unknown) => config,
}));

const manifestWith = (activities: { $: Record<string, string> }[]) => ({
  manifest: { application: [{ activity: activities }] },
});

test("flags the main activity for picture in picture", () => {
  const manifest = manifestWith([
    { $: { "android:name": ".MainActivity", "android:exported": "true" } },
    { $: { "android:name": ".OtherActivity" } },
  ]);

  enablePictureInPicture(manifest);

  expect(manifest.manifest.application[0].activity).toEqual([
    {
      $: {
        "android:name": ".MainActivity",
        "android:exported": "true",
        "android:supportsPictureInPicture": "true",
      },
    },
    { $: { "android:name": ".OtherActivity" } },
  ]);
});

test("leaves a manifest without an application or a main activity alone", () => {
  const empty = { manifest: {} };
  enablePictureInPicture(empty);
  expect(empty).toEqual({ manifest: {} });

  const other = manifestWith([{ $: { "android:name": ".OtherActivity" } }]);
  enablePictureInPicture(other);
  expect(other.manifest.application[0].activity).toEqual([
    { $: { "android:name": ".OtherActivity" } },
  ]);
});
