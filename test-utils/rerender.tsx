import { fireEvent, screen } from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { Button, View } from "react-native";
import { measureRenders } from "reassure";

const REPEATS = 5;

/**
 * Measures what `render()` costs when its parent re-renders. `render` is called
 * on every parent render, so the props it builds are as fresh as a screen's
 * would be, and only a component that memoizes well comes out cheap.
 */
export const measureParentRerenders = (render: () => ReactElement) => {
  const Parent = () => {
    const [, setTick] = useState(0);
    return (
      <View>
        <Button
          testID='re-render-button'
          title='Re-render'
          onPress={() => setTick((tick) => tick + 1)}
        />
        {render()}
      </View>
    );
  };

  return measureRenders(<Parent />, {
    scenario: async () => {
      await screen.findByTestId("re-render-button");
      for (let i = 0; i < REPEATS; i++) {
        await fireEvent.press(screen.getByTestId("re-render-button"));
      }
    },
  });
};
