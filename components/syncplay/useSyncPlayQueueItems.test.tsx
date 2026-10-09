import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSyncPlayQueueItems } from "./useSyncPlayQueueItems";

jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockState,
}));

const state = () => ({
  connected: true,
  playlist: [
    { ItemId: "a", PlaylistItemId: "1" },
    { ItemId: "a", PlaylistItemId: "2" },
  ],
  resolveVideos: jest.fn().mockResolvedValue([{ Id: "a", Name: "Arrival" }]),
});
let mockState = state();

beforeEach(() => {
  mockState = state();
});

test("looks the queue's videos up by media id", async () => {
  const { result } = await renderHook(() => useSyncPlayQueueItems());
  await waitFor(() => expect(result.current.items.a?.Name).toBe("Arrival"));
  expect(mockState.resolveVideos).toHaveBeenCalledWith(["a"]);
});

test("a reordered queue is not looked up again", async () => {
  mockState.playlist = [
    { ItemId: "a", PlaylistItemId: "1" },
    { ItemId: "b", PlaylistItemId: "2" },
  ];
  const { rerender } = await renderHook(() => useSyncPlayQueueItems());
  await waitFor(() => expect(mockState.resolveVideos).toHaveBeenCalledTimes(1));
  mockState.playlist = [...mockState.playlist].reverse();
  await rerender({});
  expect(mockState.resolveVideos).toHaveBeenCalledTimes(1);
});

test("a failed lookup can be tried again", async () => {
  mockState.resolveVideos.mockRejectedValueOnce(new Error("offline"));
  const { result } = await renderHook(() => useSyncPlayQueueItems());
  await waitFor(() => expect(result.current.failed).toBe(true));
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.items.a?.Name).toBe("Arrival"));
  expect(result.current.failed).toBe(false);
});

test("an empty queue asks the server nothing", async () => {
  mockState.playlist = [];
  const { result } = await renderHook(() => useSyncPlayQueueItems());
  expect(result.current.items).toEqual({});
  expect(mockState.resolveVideos).not.toHaveBeenCalled();
});
