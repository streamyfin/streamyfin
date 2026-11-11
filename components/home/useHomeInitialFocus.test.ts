import { renderHook } from "@testing-library/react-native";
import {
  resetHomeInitialFocus,
  useHomeInitialFocus,
} from "./useHomeInitialFocus";

beforeEach(() => {
  resetHomeInitialFocus();
});

describe("useHomeInitialFocus", () => {
  // Android TV mounts Home again on every press of its tab. Each new Home
  // asked for the focus and pulled it off the tab bar.
  test("lets only the first Home of a session take the focus", async () => {
    const first = await renderHook(() => useHomeInitialFocus("user-1"));
    expect(first.result.current).toBe(true);

    await first.unmount();
    const again = await renderHook(() => useHomeInitialFocus("user-1"));
    expect(again.result.current).toBe(false);
  });

  test("keeps its answer for the whole life of a Home", async () => {
    const { result, rerender } = await renderHook(() =>
      useHomeInitialFocus("user-1"),
    );
    await rerender({});
    expect(result.current).toBe(true);
  });

  // Signed in as someone else, the user is not on the tab bar: the new
  // session's first Home takes the focus as a launch does.
  test("gives a new session's first Home the focus", async () => {
    await renderHook(() => useHomeInitialFocus("user-1"));
    const other = await renderHook(() => useHomeInitialFocus("user-2"));
    expect(other.result.current).toBe(true);
  });

  test("asks for nothing before a session exists", async () => {
    const { result } = await renderHook(() => useHomeInitialFocus(undefined));
    expect(result.current).toBe(false);
  });
});
