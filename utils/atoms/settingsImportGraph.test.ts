import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
// Value imports and re-exports only: a type import is erased at build time
// and cannot form a require cycle.
const IMPORT = /^(?:import|export)\s(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;
const SIDE_EFFECT_IMPORT = /^import\s+["']([^"']+)["']/gm;

const resolveModule = (from: string, specifier: string): string | null => {
  let base: string;
  if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

// Returns the import chain from `entry` to `target`, or null when unreachable.
const findChain = (entry: string, target: string): string[] | null => {
  const seen = new Set<string>([entry]);
  const queue: string[][] = [[entry]];
  while (queue.length > 0) {
    const chain = queue.shift() as string[];
    const file = chain[chain.length - 1];
    const source = readFileSync(file, "utf8");
    const specifiers = [
      ...source.matchAll(IMPORT),
      ...source.matchAll(SIDE_EFFECT_IMPORT),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      const next = resolveModule(file, specifier);
      if (!next || seen.has(next)) continue;
      if (next === target) return [...chain, next];
      seen.add(next);
      queue.push([...chain, next]);
    }
  }
  return null;
};

describe("utils/atoms/settings imports", () => {
  it("never reach the JellyfinProvider, which imports settings back", () => {
    const chain = findChain(
      join(ROOT, "utils/atoms/settings.ts"),
      join(ROOT, "providers/JellyfinProvider.tsx"),
    );

    expect(chain?.map((file) => file.slice(ROOT.length + 1))).toBeUndefined();
  });
});
