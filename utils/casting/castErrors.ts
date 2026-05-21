/**
 * Cast load error classification. Kept dependency-free so it is unit-testable
 * without pulling React Native modules into the test runtime.
 */

/** True when an error is a Cast "LOAD_FAILED" (status 2100) rejection. */
export const isLoadFailedError = (error: unknown): boolean => {
  if (error == null) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("2100");
};
