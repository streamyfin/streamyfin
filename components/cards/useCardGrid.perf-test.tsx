import { FlashList } from "@shopify/flash-list";
import { fireEvent, screen } from "@testing-library/react-native";
import { useMemo, useState } from "react";
import { Button, View } from "react-native";
import { measureRenders } from "reassure";
import { useCardGrid } from "@/components/cards/useCardGrid";
import { makeItems } from "@/test-utils/baseItems";

const PAGE_SIZE = 36;
const TOTAL_PAGES = 10;
const COLUMNS = 3;

// Built once so items keep their identity across pages, as the library's
// `data.pages.flatMap` does.
const allItems = makeItems(PAGE_SIZE * TOTAL_PAGES);

const PagedGridComponent = () => {
  const [pages, setPages] = useState(1);

  const items = useMemo(() => allItems.slice(0, pages * PAGE_SIZE), [pages]);

  const { data, renderItem, keyExtractor } = useCardGrid({
    items,
    columns: COLUMNS,
    kind: "portrait",
  });

  return (
    <View style={{ flex: 1 }}>
      <Button
        testID='load-next-page'
        title={`Pages: ${pages}`}
        onPress={() => setPages((p) => p + 1)}
      />
      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={COLUMNS}
      />
    </View>
  );
};

describe("CardGrid Performance", () => {
  test("the library grid loads 10 pages", async () => {
    await measureRenders(<PagedGridComponent />, {
      scenario: async () => {
        await screen.findByText("Movie 0");
        for (let i = 1; i < TOTAL_PAGES; i++) {
          await fireEvent.press(screen.getByTestId("load-next-page"));
        }
        await screen.findByText(`Pages: ${TOTAL_PAGES}`);
      },
    });
  });
});
