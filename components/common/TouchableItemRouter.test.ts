import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemNavigation, itemRouter } from "./TouchableItemRouter";

// Only the two route resolvers are under test, not the pressable around them.
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: () => {} }),
}));
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => () => {},
}));

const studio: BaseItemDto = { Id: "studio-1", Type: "Studio", Name: "Pixar" };

describe("a studio's route", () => {
  // Without its own route a studio fell through to the item page, which has
  // nothing to show for one.
  test("opens the studio's titles rather than an item page", () => {
    expect(getItemNavigation(studio, "(search)")).toEqual({
      pathname: "/studios/[studioId]",
      params: { studioId: "studio-1" },
    });
    expect(itemRouter(studio, "(search)")).toBe(
      "/(auth)/(tabs)/(search)/studios/studio-1",
    );
  });

  test("leaves a person on the person page", () => {
    expect(
      getItemNavigation({ Id: "person-1", Type: "Person" }, "(search)"),
    ).toEqual({
      pathname: "/persons/[personId]",
      params: { personId: "person-1" },
    });
  });
});
