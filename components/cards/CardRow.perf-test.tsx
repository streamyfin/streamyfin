import { fireEvent, screen } from "@testing-library/react-native";
import { useState } from "react";
import { Button, View } from "react-native";
import { measureRenders } from "reassure";
import { CardRow } from "@/components/cards/CardRow";
import { makeItems } from "@/test-utils/baseItems";

const sampleItems = makeItems(20);

const ParentWithCardRow = () => {
  const [, setTick] = useState(0);

  return (
    <View>
      <Button
        testID='re-render-button'
        title='Re-render'
        onPress={() => setTick((t) => t + 1)}
      />
      <CardRow title='Latest Movies' items={sampleItems} kind='wide' />
    </View>
  );
};

describe("CardRow Performance", () => {
  test("a CardRow re-renders when its parent updates", async () => {
    await measureRenders(<ParentWithCardRow />, {
      scenario: async () => {
        await screen.findByText("Latest Movies");
        for (let i = 0; i < 5; i++) {
          await fireEvent.press(screen.getByTestId("re-render-button"));
        }
      },
    });
  });
});
