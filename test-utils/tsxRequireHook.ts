/**
 * Stands in for "tsx/cjs" in every spec, through moduleNameMapper in the Jest
 * config. The real module registers a require hook on Node's own loader, and
 * that loader belongs to the Jest worker, not to the spec: the hook stays on
 * after the spec's environment is torn down, and from then on every file the
 * worker requires outside a sandbox, a Babel plugin loaded on demand among
 * them, runs through code that reads the globals of a sandbox that is gone.
 * The spec that had loaded the hook passed, and a later one in the same worker
 * failed to load.
 *
 * Nothing under Jest needs the hook, babel-jest already compiles TypeScript.
 */
export {};
