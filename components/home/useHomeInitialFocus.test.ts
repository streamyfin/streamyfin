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
    const first = await renderHook(() => useHomeInitialFocus("sign-in-1"));
    expect(first.result.current).toBe(true);

    await first.unmount();
    const again = await renderHook(() => useHomeInitialFocus("sign-in-1"));
    expect(again.result.current).toBe(false);
  });

  test("keeps its answer for the whole life of a Home", async () => {
    const { result, rerender } = await renderHook(() =>
      useHomeInitialFocus("sign-in-1"),
    );
    await rerender({});
    expect(result.current).toBe(true);
  });

  // A new sign-in, the same user's after a sign out included: its first Home
  // takes the focus as a launch does. Keyed on the user, the same user signed
  // in again never got it.
  test("gives a new sign-in's first Home the focus", async () => {
    await renderHook(() => useHomeInitialFocus("sign-in-1"));
    const other = await renderHook(() => useHomeInitialFocus("sign-in-2"));
    expect(other.result.current).toBe(true);
  });

  // On tvOS Home can stay mounted through an account switch in Settings: it
  // must not take the focus for the new sign-in from there, nor use up that
  // sign-in's turn, so the new sign-in's next Home still takes it.
  test("leaves a sign-in that changed under it to its next Home", async () => {
    const mounted = await renderHook(
      ({ key }: { key: string }) => useHomeInitialFocus(key),
      { initialProps: { key: "sign-in-1" } },
    );
    expect(mounted.result.current).toBe(true);

    await mounted.rerender({ key: "sign-in-2" });
    expect(mounted.result.current).toBe(false);

    const next = await renderHook(() => useHomeInitialFocus("sign-in-2"));
    expect(next.result.current).toBe(true);
  });

  // Switching back to an account can reuse its sign-in: A, then B, then A
  // again gave the old Home its permission back, and its next card could take
  // the focus out of the tab bar.
  test("does not give the focus back when the sign-in returns", async () => {
    const mounted = await renderHook(
      ({ key }: { key: string }) => useHomeInitialFocus(key),
      { initialProps: { key: "sign-in-1" } },
    );
    await mounted.rerender({ key: "sign-in-2" });
    await mounted.rerender({ key: "sign-in-1" });

    expect(mounted.result.current).toBe(false);
  });

  test("asks for nothing before a session exists", async () => {
    const { result } = await renderHook(() => useHomeInitialFocus(undefined));
    expect(result.current).toBe(false);
  });
});
