import type { Lockable } from "./atoms/settings";

/**
 * Utility function to extract the value from a Lockable object or return the direct value
 * @param lockableValue - The value that might be wrapped in a Lockable object
 * @param defaultValue - The default value to use if the lockable value is undefined or null
 * @returns The extracted value or the default value (never undefined)
 */
export function getLockableValue<T>(
  lockableValue: Lockable<T> | T | undefined | null,
  defaultValue: NonNullable<T>,
): NonNullable<T> {
  if (lockableValue == null) {
    return defaultValue;
  }

  // Check if it's a Lockable object (has 'value' and 'locked' properties)
  if (
    typeof lockableValue === "object" &&
    lockableValue !== null &&
    "value" in lockableValue &&
    "locked" in lockableValue
  ) {
    const value = (lockableValue as Lockable<T>).value;
    return (value ?? defaultValue) as NonNullable<T>;
  }

  // If it's not a Lockable, return the value directly or default
  return (lockableValue ?? defaultValue) as NonNullable<T>;
}
