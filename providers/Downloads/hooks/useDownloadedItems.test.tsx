import { act, render, renderHook } from "@testing-library/react-native";
import { Component, type ReactNode } from "react";
import { stubReactNative } from "@/test-utils/reactNative";
import type { DownloadedItem } from "../types";

const mockGetAllDownloadedItems = jest.fn<DownloadedItem[], []>();
jest.mock("../database", () => ({
  getAllDownloadedItems: () => mockGetAllDownloadedItems(),
}));

import { useDownloadedItems } from "./useDownloadedItems";

const downloaded = (id: string) =>
  ({ item: { Id: id }, videoFilePath: `/${id}.mp4` }) as DownloadedItem;

beforeEach(() => {
  jest.useFakeTimers();
  stubReactNative();
  mockGetAllDownloadedItems.mockReset();
  mockGetAllDownloadedItems.mockReturnValue([downloaded("a")]);
});

afterEach(() => {
  jest.useRealTimers();
});

test("returns no items on the first render, without reading storage", async () => {
  const { result } = await renderHook(() => useDownloadedItems(0));

  expect(result.current).toEqual([]);
  expect(mockGetAllDownloadedItems).not.toHaveBeenCalled();
});

test("reads the downloaded items a tick after mount", async () => {
  const { result } = await renderHook(() => useDownloadedItems(0));

  await act(async () => jest.runAllTimers());

  expect(mockGetAllDownloadedItems).toHaveBeenCalledTimes(1);
  expect(result.current).toEqual([downloaded("a")]);
});

test("reads again when the refresh key changes", async () => {
  const { result, rerender } = await renderHook(
    ({ refreshKey }: { refreshKey: number }) => useDownloadedItems(refreshKey),
    { initialProps: { refreshKey: 0 } },
  );
  await act(async () => jest.runAllTimers());

  mockGetAllDownloadedItems.mockReturnValue([downloaded("a"), downloaded("b")]);
  await rerender({ refreshKey: 1 });
  await act(async () => jest.runAllTimers());

  expect(mockGetAllDownloadedItems).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual([downloaded("a"), downloaded("b")]);
});

test("does not read after unmounting before the tick", async () => {
  const { unmount } = await renderHook(() => useDownloadedItems(0));

  await unmount();
  await act(async () => jest.runAllTimers());

  expect(mockGetAllDownloadedItems).not.toHaveBeenCalled();
});

test("never reads on TV, where downloads do not exist", async () => {
  stubReactNative({ isTV: true });
  const { result } = await renderHook(() => useDownloadedItems(0));

  await act(async () => jest.runAllTimers());

  expect(mockGetAllDownloadedItems).not.toHaveBeenCalled();
  expect(result.current).toEqual([]);
});

class Boundary extends Component<
  { onError: (error: unknown) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Read in a timer, a damaged index skipped every error boundary and went
// straight to the global handler.
test("hands a failed read to the nearest error boundary", async () => {
  const failure = new SyntaxError("Unexpected token");
  mockGetAllDownloadedItems.mockImplementation(() => {
    throw failure;
  });
  const onError = jest.fn();
  const Reader = () => {
    useDownloadedItems(0);
    return null;
  };
  jest.spyOn(console, "error").mockImplementation(() => {});

  await render(
    <Boundary onError={onError}>
      <Reader />
    </Boundary>,
  );
  await act(async () => jest.runAllTimers());

  expect(onError).toHaveBeenCalledWith(failure);
});
