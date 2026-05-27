import { Dimensions } from "react-native";

const { width: W, height: H } = Dimensions.get("window");

export const scaleSize = (size: number): number => {
  const widthRatio = W / 1920;
  const heightRatio = H / 1080;
  return size * Math.min(widthRatio, heightRatio);
};
