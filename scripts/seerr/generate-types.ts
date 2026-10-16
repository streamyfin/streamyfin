import openapiTS, { astToString } from "openapi-typescript";
import {
  checkPin,
  declaredShapes,
  fingerprint,
  type Pin,
  pinUrl,
  type Schema,
} from "./api-spec";

/**
 * Regenerates the types from the pinned spec.
 *
 * Nothing here is imported by the app: the generated `.d.ts` is, and it is
 * written by `bun run seerr:types` rather than by hand.
 */
const generate = async (): Promise<void> => {
  const pinPath = "utils/seerr/generated/pin.json";
  const pin = (await Bun.file(pinPath).json()) as Pin;
  const url = pinUrl(pin);

  const answer = await fetch(url);
  if (!answer.ok) {
    throw new Error(`${url} answered ${answer.status}`);
  }

  const source = await answer.text();
  const sha256 = fingerprint(source);

  checkPin(pin, sha256);

  // The text that was hashed, not the address it came from: passing the URL
  // would make openapi-typescript fetch the spec a second time, and the types
  // would come from bytes the pin never saw.
  const types = astToString(await openapiTS(source));
  const header = [
    `// Generated from ${pin.repo}@${pin.ref}, sha256 ${sha256}.`,
    "// Run `bun run seerr:types` rather than editing this file.",
    "",
  ].join("\n");

  await Bun.write("utils/seerr/generated/api.d.ts", header + types);
  await Bun.write(
    "utils/seerr/generated/api-shapes.json",
    `${JSON.stringify(declaredShapes(Bun.YAML.parse(source) as Schema), null, 1)}\n`,
  );
  await Bun.write(pinPath, `${JSON.stringify({ ...pin, sha256 }, null, 2)}\n`);

  console.log(`${pin.repo}@${pin.ref}: ${types.split("\n").length} lines`);
};

if (import.meta.main) {
  await generate();
}
