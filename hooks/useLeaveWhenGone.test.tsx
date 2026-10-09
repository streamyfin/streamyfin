import { renderHook } from "@testing-library/react-native";
import { useLeaveWhenGone } from "./useLeaveWhenGone";

const mockBack = jest.fn();

// A new router object on every render, which is what the real hook hands out
// whenever the navigation state changes.
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ back: mockBack }),
}));

describe("useLeaveWhenGone", () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  test("stays while there is something to show", async () => {
    const { rerender } = await renderHook(
      (gone: boolean) => useLeaveWhenGone(gone),
      { initialProps: false },
    );
    await rerender(false);

    expect(mockBack).not.toHaveBeenCalled();
  });

  // #2153: deleting the last downloaded episode of a series left its offline
  // page empty, to be closed by hand.
  test("goes back when the content disappears", async () => {
    const { rerender } = await renderHook(
      (gone: boolean) => useLeaveWhenGone(gone),
      { initialProps: false },
    );
    await rerender(true);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("goes back only once, however often the screen renders", async () => {
    const { rerender } = await renderHook(
      (gone: boolean) => useLeaveWhenGone(gone),
      { initialProps: true },
    );
    await rerender(true);
    await rerender(true);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
