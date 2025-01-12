import { Pressable } from "react-native";
import { useTapDetection } from "./useTapDetection";

interface Props {
  screenWidth: number;
  screenHeight: number;
  showControls: boolean;
  onToggleControls: () => void;
}

export const VideoTouchOverlay = ({
  screenWidth,
  screenHeight,
  showControls,
  onToggleControls,
}: Props) => {
  const { handleTouchStart, handleTouchEnd } = useTapDetection({
    onValidTap: onToggleControls,
  });

  return (
    <Pressable
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "absolute",
        width: screenWidth,
        height: screenHeight,
        backgroundColor: "black",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        opacity: showControls ? 0.5 : 0,
      }}
    />
  );
};
