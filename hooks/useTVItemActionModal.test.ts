import { renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";

// Both hooks hand out new functions on every render, as the real ones do;
// each render's are kept to tell them apart.
const mockMarkItemPlayedByRender: jest.Mock[] = [];
const mockInvalidateByRender: jest.Mock[] = [];

jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => {
    const markItemPlayed = jest.fn();
    mockMarkItemPlayedByRender.push(markItemPlayed);
    return { markItemPlayed, markItemUnplayed: async () => {} };
  },
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => {
    const invalidate = jest.fn();
    mockInvalidateByRender.push(invalidate);
    return invalidate;
  },
}));
jest.mock("@tanstack/react-query", () => {
  const client = { setQueriesData: jest.fn(), invalidateQueries: jest.fn() };
  return { useQueryClient: () => client };
});
jest.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

describe("useTVItemActionModal", () => {
  // The TV rows, cards and hero are memoized and take this callback as a
  // prop: a new one on every render re-rendered all of them.
  it("keeps showItemActions stable across renders", async () => {
    const { result, rerender } = await renderHook(() => useTVItemActionModal());
    const first = result.current.showItemActions;
    await rerender({});
    await rerender({});
    expect(result.current.showItemActions).toBe(first);
  });

  it("marks the item played with the functions of the latest render", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { result, rerender } = await renderHook(() => useTVItemActionModal());
    await rerender({});

    result.current.showItemActions({ Id: "m1", Name: "Movie" });
    const markPlayed = alert.mock.calls[0][2]?.[1];
    await markPlayed?.onPress?.();

    expect(mockMarkItemPlayedByRender[0]).not.toHaveBeenCalled();
    expect(mockMarkItemPlayedByRender.at(-1)).toHaveBeenCalledWith("m1");
    expect(mockInvalidateByRender[0]).not.toHaveBeenCalled();
    expect(mockInvalidateByRender.at(-1)).toHaveBeenCalled();
    alert.mockRestore();
  });
});
