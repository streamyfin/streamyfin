// export { Orientation, OrientationLock } from "expo-screen-orientation";
console.log("NOT");
export enum Orientation {
  /**
   * An unknown screen orientation. For example, the device is flat, perhaps on a table.
   */
  UNKNOWN = 0,
  /**
   * Right-side up portrait interface orientation.
   */
  PORTRAIT_UP = 1,
  /**
   * Upside down portrait interface orientation.
   */
  PORTRAIT_DOWN = 2,
  /**
   * Left landscape interface orientation.
   */
  LANDSCAPE_LEFT = 3,
  /**
   * Right landscape interface orientation.
   */
  LANDSCAPE_RIGHT = 4,
}

export enum OrientationLock {
  /**
   * The default orientation. On iOS, this will allow all orientations except `Orientation.PORTRAIT_DOWN`.
   * On Android, this lets the system decide the best orientation.
   */
  DEFAULT = 0,
  /**
   * All four possible orientations
   */
  ALL = 1,
  /**
   * Any portrait orientation.
   */
  PORTRAIT = 2,
  /**
   * Right-side up portrait only.
   */
  PORTRAIT_UP = 3,
  /**
   * Upside down portrait only.
   */
  PORTRAIT_DOWN = 4,
  /**
   * Any landscape orientation.
   */
  LANDSCAPE = 5,
  /**
   * Left landscape only.
   */
  LANDSCAPE_LEFT = 6,
  /**
   * Right landscape only.
   */
  LANDSCAPE_RIGHT = 7,
  /**
   * A platform specific orientation. This is not a valid policy that can be applied in [`lockAsync`](#screenorientationlockasyncorientationlock).
   */
  OTHER = 8,
  /**
   * An unknown screen orientation lock. This is not a valid policy that can be applied in [`lockAsync`](#screenorientationlockasyncorientationlock).
   */
  UNKNOWN = 9,
}
