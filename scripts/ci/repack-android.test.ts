import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  declareAttributes,
  missingAttributes,
  type SpawnAsync,
  withDeclaredAttributes,
} from "./repack-android";

// What aapt2 printed when apktool rebuilt an APK that AGP 9 had shrunk.
const AAPT2_ERRORS = [
  "W: /tmp/decoded-apk/res/animator/m3_card_state_list_anim.xml:7: error: attribute state_dragged (aka com.fredrikburmester.streamyfin:state_dragged) not found.",
  "W: /tmp/decoded-apk/res/color/m3_card_stroke_color.xml:9: error: attribute state_dragged (aka com.fredrikburmester.streamyfin:state_dragged) not found.",
  "W: /tmp/decoded-apk/res/xml/m3_button_group_child_size_change.xml:4: error: attribute widthChange (aka com.fredrikburmester.streamyfin:widthChange) not found.",
  "W: error: failed linking file resources.",
].join("\n");

const ATTRS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <attr name="yearTodayStyle" format="reference" />
</resources>
`;

describe("missingAttributes", () => {
  it("names each attribute aapt2 could not find, once", () => {
    expect(missingAttributes(AAPT2_ERRORS)).toEqual([
      "state_dragged",
      "widthChange",
    ]);
  });

  it("finds none in a failure of another kind", () => {
    expect(
      missingAttributes(
        "W: res/values/styles.xml:3: error: resource android:attr/foo is private.",
      ),
    ).toEqual([]);
  });
});

describe("declareAttributes", () => {
  // A format-less attr takes any value: the shrunk XML gives widthChange a
  // fraction and the state attributes booleans.
  it("declares each name with no format, at the end of the file", () => {
    expect(
      declareAttributes(ATTRS_XML, ["state_dragged", "widthChange"]),
    ).toBe(`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <attr name="yearTodayStyle" format="reference" />
    <attr name="state_dragged" />
    <attr name="widthChange" />
</resources>
`);
  });

  it("leaves a name already declared alone", () => {
    expect(declareAttributes(ATTRS_XML, ["yearTodayStyle"])).toBe(ATTRS_XML);
  });

  it("starts the file when the APK had no attributes", () => {
    expect(declareAttributes(undefined, ["state_dragged"])).toBe(
      `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <attr name="state_dragged" />
</resources>
`,
    );
  });
});

describe("withDeclaredAttributes", () => {
  const decodedApk = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "decoded-apk-"));
    mkdirSync(path.join(dir, "res", "values"), { recursive: true });
    writeFileSync(path.join(dir, "res", "values", "attrs.xml"), ATTRS_XML);
    return dir;
  };
  const apktoolBuild = (dir: string) => [
    "-jar",
    "/repack-app/dist/apktool.jar",
    "build",
    "-o",
    "/work/apktool-packed.apk",
    dir,
  ];
  const result = {
    output: [],
    stdout: "",
    stderr: "",
    status: 0,
    signal: null,
  };
  const failure = (stderr: string) =>
    Object.assign(new Error("java exited with non-zero code: 1"), {
      ...result,
      stderr,
      status: 1,
    });
  /** A spawn that answers each call with the next outcome. */
  const spawnWith = (...outcomes: (typeof result | Error)[]) =>
    jest.fn((() =>
      Object.assign(
        (() => {
          const outcome = outcomes.shift();
          return outcome instanceof Error
            ? Promise.reject(outcome)
            : Promise.resolve(outcome);
        })(),
        { child: {} },
      )) as unknown as SpawnAsync);

  it("declares the missing attributes and builds again", async () => {
    const dir = decodedApk();
    const spawn = spawnWith(failure(AAPT2_ERRORS), result);

    await withDeclaredAttributes(spawn)("java", apktoolBuild(dir));

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[1][1]).toEqual(apktoolBuild(dir));
    const attrs = readFileSync(
      path.join(dir, "res", "values", "attrs.xml"),
      "utf8",
    );
    expect(attrs).toContain('<attr name="state_dragged" />');
    expect(attrs).toContain('<attr name="widthChange" />');
  });

  // repack-app handles a private resource itself, and anything else is a
  // failed repack: the caller falls back to a full build.
  it("passes on a failure that names no missing attribute", async () => {
    const error = failure("W: error: resource android:attr/foo is private.");
    const spawn = spawnWith(error);

    await expect(
      withDeclaredAttributes(spawn)("java", apktoolBuild(decodedApk())),
    ).rejects.toBe(error);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("gives up when a build with the attributes declared fails the same way", async () => {
    const error = failure(AAPT2_ERRORS);
    const spawn = spawnWith(failure(AAPT2_ERRORS), error);

    await expect(
      withDeclaredAttributes(spawn)("java", apktoolBuild(decodedApk())),
    ).rejects.toBe(error);
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it("runs every other command once, as it is", async () => {
    const spawn = spawnWith(failure(AAPT2_ERRORS));
    const args = ["-jar", "/repack-app/dist/apktool.jar", "decode", "app.apk"];

    await expect(withDeclaredAttributes(spawn)("java", args)).rejects.toThrow();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("java", args, undefined);
  });
});
