import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { renderHook } from "@testing-library/react-native";
import { useSheetOpenState } from "./useSheetOpenState";

const makeSheet = () => {
  const sheet = { present: jest.fn(), dismiss: jest.fn() };
  return { sheet, ref: { current: sheet as unknown as BottomSheetModal } };
};

const renderSheetState = async (
  ref: { current: BottomSheetModal | null },
  open: boolean,
) =>
  renderHook((isOpen: boolean) => useSheetOpenState(ref, isOpen), {
    initialProps: open,
  });

describe("useSheetOpenState", () => {
  // The three-dot button on the now playing screen did nothing: its sheet
  // mounted closed, was dismissed before it had ever been shown, and the
  // sheet library ignores present() on a modal left in that state.
  test("does not dismiss a sheet that mounts closed", async () => {
    const { sheet, ref } = makeSheet();

    await renderSheetState(ref, false);

    expect(sheet.dismiss).not.toHaveBeenCalled();
    expect(sheet.present).not.toHaveBeenCalled();
  });

  test("presents when it opens and dismisses when it closes again", async () => {
    const { sheet, ref } = makeSheet();
    const { rerender } = await renderSheetState(ref, false);

    await rerender(true);
    expect(sheet.present).toHaveBeenCalledTimes(1);
    expect(sheet.dismiss).not.toHaveBeenCalled();

    await rerender(false);
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  test("opens again after it was closed", async () => {
    const { sheet, ref } = makeSheet();
    const { rerender } = await renderSheetState(ref, true);

    await rerender(false);
    await rerender(true);

    expect(sheet.present).toHaveBeenCalledTimes(2);
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  // Swiping the sheet away dismisses it before the owner's `open` flag
  // follows. Dismissing it a second time is what left it unable to reopen.
  test("does not dismiss a sheet that already closed itself", async () => {
    const { sheet, ref } = makeSheet();
    const { result, rerender } = await renderSheetState(ref, true);

    result.current();
    await rerender(false);
    expect(sheet.dismiss).not.toHaveBeenCalled();

    await rerender(true);
    expect(sheet.present).toHaveBeenCalledTimes(2);
  });

  // A sheet that renders nothing until it has something to show has no ref
  // yet. Nothing was presented, so there is nothing to dismiss later.
  test("has nothing to dismiss when there was no sheet to present", async () => {
    const { sheet, ref } = makeSheet();
    const empty: { current: BottomSheetModal | null } = { current: null };
    const { rerender } = await renderHook(
      ({ target, isOpen }: { target: typeof empty; isOpen: boolean }) =>
        useSheetOpenState(target, isOpen),
      { initialProps: { target: empty, isOpen: true } },
    );

    empty.current = ref.current;
    await rerender({ target: empty, isOpen: false });

    expect(sheet.dismiss).not.toHaveBeenCalled();
  });
});
