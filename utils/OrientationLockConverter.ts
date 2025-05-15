import {
  Orientation,
  OrientationLock,
} from "@/packages/expo-screen-orientation";

function orientationToOrientationLock(
  orientation: Orientation,
): OrientationLock {
  switch (orientation) {
    case Orientation.PORTRAIT_UP:
      return OrientationLock.PORTRAIT_UP;
    case Orientation.PORTRAIT_DOWN:
      return OrientationLock.PORTRAIT_DOWN;
    case Orientation.LANDSCAPE_LEFT:
      return OrientationLock.LANDSCAPE_LEFT;
    case Orientation.LANDSCAPE_RIGHT:
      return OrientationLock.LANDSCAPE_RIGHT;
    default:
      return OrientationLock.DEFAULT;
  }
}

export default orientationToOrientationLock;
