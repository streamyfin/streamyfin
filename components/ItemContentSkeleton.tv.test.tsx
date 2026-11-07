import { render } from "@testing-library/react-native";
import type { TestInstance } from "test-renderer";
import { ItemContentSkeletonTV } from "./ItemContentSkeleton.tv";

let mockWindowWidth = 1920;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({
    width: mockWindowWidth,
    height: 1080,
    scale: 1,
    fontScale: 1,
  }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const overviewMaxWidth = (root: TestInstance | null) => {
  const [overview] = root!.queryAll(
    (node) => node.props?.style?.maxWidth !== undefined,
  );
  return overview.props.style.maxWidth;
};

describe("ItemContentSkeletonTV", () => {
  test("resizes the overview placeholder when the window width changes", async () => {
    const { root, rerender } = await render(<ItemContentSkeletonTV />);

    expect(overviewMaxWidth(root)).toBe(1920 * 0.45);

    mockWindowWidth = 1280;
    await rerender(<ItemContentSkeletonTV />);

    expect(overviewMaxWidth(root)).toBe(1280 * 0.45);
  });
});
