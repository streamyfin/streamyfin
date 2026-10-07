import { disabled, menuOrder } from "@expo/ui/swift-ui/modifiers";
import { render, screen } from "@testing-library/react-native";
import { renderedMenuModifiers } from "@/test-utils/expoUi";
import { stubReactNative } from "@/test-utils/reactNative";

jest.mock(
  "@expo/ui/swift-ui",
  () => jest.requireActual("@/test-utils/expoUi").swiftUiModule,
);

// The module reads Platform when it loads, so each case requires it after
// patching the platform rather than importing it at the top.
const loadMenu = (overrides: Parameters<typeof stubReactNative>[0]) => {
  let FixedOrderMenu!: typeof import("./FixedOrderMenu").FixedOrderMenu;
  jest.isolateModules(() => {
    stubReactNative(overrides);
    FixedOrderMenu = require("./FixedOrderMenu").FixedOrderMenu;
  });
  return FixedOrderMenu;
};

describe("FixedOrderMenu", () => {
  // UIMenu orders items by distance to the anchor, so a menu that opens upward
  // lists them backwards. Every SwiftUI menu in the app needs the fixed order,
  // and a squash on a stale base already dropped it once (#1543 over #1937).
  test("puts the fixed item order ahead of the modifiers it is given", async () => {
    const FixedOrderMenu = loadMenu({ OS: "ios" });
    await render(
      <FixedOrderMenu label='Sort' modifiers={[disabled(true)]}>
        {null}
      </FixedOrderMenu>,
    );

    expect(renderedMenuModifiers(screen)).toEqual([
      [menuOrder("fixed"), disabled(true)],
    ]);
  });

  test("keeps the fixed item order when it is given no modifiers", async () => {
    const FixedOrderMenu = loadMenu({ OS: "ios" });
    await render(<FixedOrderMenu label='Sort'>{null}</FixedOrderMenu>);

    expect(renderedMenuModifiers(screen)).toEqual([[menuOrder("fixed")]]);
  });

  // The order is built once at load. Android phones load this module too, so a
  // change in the @expo/ui modifier API must not be able to break them there.
  test("does not build the fixed order on Android", () => {
    const menuOrderSpy = jest.fn(
      jest.requireActual("@expo/ui/swift-ui/modifiers").menuOrder,
    );
    jest.isolateModules(() => {
      jest.doMock("@expo/ui/swift-ui/modifiers", () => ({
        ...jest.requireActual("@expo/ui/swift-ui/modifiers"),
        menuOrder: menuOrderSpy,
      }));
      stubReactNative({ OS: "android" });
      require("./FixedOrderMenu");
    });

    expect(menuOrderSpy).not.toHaveBeenCalled();
  });

  // tvOS builds have no ExpoUI native module, and requiring @expo/ui there
  // crashes the route tree at load.
  test("does not load @expo/ui on TV", () => {
    const loadSwiftUi = jest.fn(
      () => jest.requireActual("@/test-utils/expoUi").swiftUiModule,
    );
    jest.isolateModules(() => {
      jest.doMock("@expo/ui/swift-ui", loadSwiftUi);
      stubReactNative({ OS: "ios", isTV: true });
      require("./FixedOrderMenu");
    });

    expect(loadSwiftUi).not.toHaveBeenCalled();
  });
});
