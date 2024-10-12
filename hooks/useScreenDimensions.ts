import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";

const useScreenDimensions = (): ScaledSize => {
  const [screenDimensions, setScreenDimensions] = useState(
    Dimensions.get("screen")
  );

  useEffect(() => {
    const updateDimensions = () => {
      setScreenDimensions(Dimensions.get("screen"));
    };

    const dimensionsListener = Dimensions.addEventListener(
      "change",
      updateDimensions
    );

    return () => {
      dimensionsListener.remove();
    };
  }, []);

  return screenDimensions;
};

export default useScreenDimensions;
