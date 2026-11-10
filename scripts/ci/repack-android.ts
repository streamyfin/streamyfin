/**
 * Repacks an APK with this commit's JS, through repack-app's API.
 *
 * AGP 9 shrinks resources with R8, which drops attributes that no kept code
 * reads while the XML it keeps still names them: Material's state_dragged in
 * its card animators, widthChange in its button group. The APK runs, but the
 * resources apktool decodes from it no longer build: aapt2 stops at every
 * attribute it cannot find. The repack declares those attributes and builds
 * again. They get IDs of their own and nothing sets them, as in the source
 * APK; every resource the source has keeps its ID.
 */
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Options, repackAppAndroidAsync } from "@expo/repack-app";

export type SpawnAsync = NonNullable<Options["spawnAsync"]>;

const MISSING_ATTRIBUTE =
  /error: attribute ([\w.]+) \(aka [\w.]+:\1\) not found/g;

/** The attributes aapt2 could not find, in the order it named them. */
export const missingAttributes = (output: string) => [
  ...new Set(
    Array.from(output.matchAll(MISSING_ATTRIBUTE), (match) => match[1]),
  ),
];

const EMPTY_ATTRS_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
</resources>
`;

/**
 * `attrs.xml` with each of `names` declared. With no format an attr takes any
 * value, which the shrunk XML needs: widthChange holds a fraction.
 */
export const declareAttributes = (
  attrsXml: string | undefined,
  names: string[],
) => {
  const xml = attrsXml ?? EMPTY_ATTRS_XML;
  const declarations = names
    .filter((name) => !xml.includes(`<attr name="${name}"`))
    .map((name) => `    <attr name="${name}" />\n`)
    .join("");
  return xml.replace(/<\/resources>\s*$/, `${declarations}</resources>\n`);
};

/** The decoded APK an `apktool build` call rebuilds, if `args` is one. */
const apktoolBuildDir = (command: string, args: string[]) =>
  command === "java" && args[1]?.endsWith("apktool.jar") && args[2] === "build"
    ? args.at(-1)
    : undefined;

const stderrOf = (error: unknown) =>
  typeof error === "object" && error !== null && "stderr" in error
    ? String(error.stderr)
    : "";

/**
 * `spawnAsync` with an `apktool build` that fails on attributes aapt2 cannot
 * find run again once they are declared. Any other failure goes back to
 * repack-app as it was, which handles a private resource itself.
 */
export const withDeclaredAttributes =
  (spawnAsync: SpawnAsync): SpawnAsync =>
  (command, args, options) => {
    const first = spawnAsync(command, args, options);
    const decodedApk = apktoolBuildDir(command, args);
    if (!decodedApk) return first;

    const rebuilt = first.catch(async (error: unknown) => {
      const names = missingAttributes(stderrOf(error));
      if (names.length === 0) throw error;
      const attrsPath = path.join(decodedApk, "res", "values", "attrs.xml");
      const attrsXml = await readFile(attrsPath, "utf8").catch(() => undefined);
      await writeFile(attrsPath, declareAttributes(attrsXml, names));
      console.log(
        `Declared the attributes the shrunk resources name: ${names.join(", ")}`,
      );
      return spawnAsync(command, args, options);
    });
    return Object.assign(rebuilt, { child: first.child });
  };

/** What repack-app spawns with by default: output captured, then resolved. */
const spawnProcess: SpawnAsync = (command, args, options) => {
  const child = spawn(command, args, { stdio: "pipe", ...options });
  const done = new Promise<Awaited<ReturnType<SpawnAsync>>>(
    (resolve, reject) => {
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (data) => {
        stdout += data;
      });
      child.stderr?.on("data", (data) => {
        stderr += data;
      });
      child.on("error", reject);
      child.on("close", (status, signal) => {
        const result = {
          pid: child.pid,
          output: [stdout, stderr],
          stdout,
          stderr,
          status,
          signal,
        };
        if (status === 0) resolve(result);
        else
          reject(
            Object.assign(
              new Error(
                `${command} ${args.join(" ")} exited with non-zero code: ${status}`,
              ),
              result,
            ),
          );
      });
    },
  );
  return Object.assign(done, { child });
};

/**
 * Usage: `bun scripts/ci/repack-android.ts <source apk> <build tools dir>
 * <output apk> <working dir>`, from the project root, with the environment
 * the repack needs (NODE_ENV, EXPO_TV). With no signing options, repack-app
 * signs with the standard React Native debug key, as its CLI does.
 */
const main = async () => {
  const [sourceAppPath, androidBuildToolsDir, outputPath, workingDirectory] =
    process.argv.slice(2);
  await repackAppAndroidAsync({
    platform: "android",
    projectRoot: process.cwd(),
    sourceAppPath,
    androidBuildToolsDir,
    outputPath,
    workingDirectory,
    spawnAsync: withDeclaredAttributes(spawnProcess),
  });
  console.log(`Updated APK created at ${outputPath}`);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
