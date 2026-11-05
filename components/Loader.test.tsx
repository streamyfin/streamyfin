import { render, screen } from "@testing-library/react-native";
import { Loader } from "@/components/Loader";
import { stubReactNative } from "@/test-utils/reactNative";

// The TV pages loaded under a small purple spinner, hard to see from the sofa and
// against the TV convention, which has no purple accent (seen on an Android TV,
// 2026-11-03).
test("draws a large white spinner on TV", async () => {
  stubReactNative({ OS: "android", isTV: true });

  await render(<Loader testID='spinner' />);

  const spinner = screen.getByTestId("spinner");
  expect(spinner.props.color).toBe("white");
  expect(spinner.props.size).toBe("large");
});

test("keeps the small purple spinner on an Android phone", async () => {
  stubReactNative({ OS: "android", isTV: false });

  await render(<Loader testID='spinner' />);

  const spinner = screen.getByTestId("spinner");
  expect(spinner.props.color).toBe("#9333ea");
  expect(spinner.props.size).toBe("small");
});
