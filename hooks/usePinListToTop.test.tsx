import { renderHook } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import { usePinListToTop } from "./usePinListToTop";

const HEADER_HEIGHT = 97;

jest.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => 97,
}));

type Props = { resetKey: string; isFetching: boolean; data: unknown };

const renderPin = async (initialProps: Props) => {
  const list = { scrollToOffset: jest.fn() };
  const ref = { current: list };
  const view = await renderHook((props: Props) => usePinListToTop(ref, props), {
    initialProps,
  });
  return { list, ...view };
};

const offsets = (list: { scrollToOffset: jest.Mock }) =>
  list.scrollToOffset.mock.calls.map(([params]) => params.offset);

describe("usePinListToTop", () => {
  // The library screen pinned to offset 0. Under the transparent iOS header
  // the list's top is at minus the header's height, so the filter bar sat
  // behind the header after every open and every filter change.
  test("pins below the transparent header on iOS", async () => {
    stubReactNative({ OS: "ios" });
    const page = [{}];
    const { list, rerender } = await renderPin({
      resetKey: "a",
      isFetching: false,
      data: page,
    });

    await rerender({ resetKey: "b", isFetching: true, data: page });

    expect(offsets(list).at(-1)).toBe(-HEADER_HEIGHT);
    expect(offsets(list)).not.toContain(0);
  });

  test("pins to 0 on Android, where the header is opaque", async () => {
    stubReactNative({ OS: "android" });
    const { list } = await renderPin({
      resetKey: "a",
      isFetching: false,
      data: [],
    });

    expect(offsets(list).every((offset) => offset === 0)).toBe(true);
    expect(list.scrollToOffset).toHaveBeenCalled();
  });

  test("pins again once the fetch for the new key settles", async () => {
    stubReactNative({ OS: "ios" });
    const { list, rerender } = await renderPin({
      resetKey: "a",
      isFetching: false,
      data: [],
    });
    await rerender({ resetKey: "b", isFetching: true, data: [] });
    list.scrollToOffset.mockClear();

    await rerender({ resetKey: "b", isFetching: false, data: [{}] });

    expect(offsets(list)).toEqual([-HEADER_HEIGHT]);
  });

  // Loading the next page changes the data under the same key. Pinning then
  // would throw the user back to the top in the middle of scrolling.
  test("leaves the list alone while more pages load", async () => {
    stubReactNative({ OS: "ios" });
    const { list, rerender } = await renderPin({
      resetKey: "a",
      isFetching: false,
      data: [{}],
    });
    list.scrollToOffset.mockClear();

    await rerender({ resetKey: "a", isFetching: true, data: [{}] });
    await rerender({ resetKey: "a", isFetching: false, data: [{}, {}] });

    expect(list.scrollToOffset).not.toHaveBeenCalled();
  });
});
