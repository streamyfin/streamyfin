import { act, renderHook } from "@testing-library/react-native";
import { useWatchlistSource } from "./useWatchlistSource";

const render = (streamystats: boolean, kefin: boolean) =>
  renderHook(
    ({ streamystats, kefin }: { streamystats: boolean; kefin: boolean }) =>
      useWatchlistSource(streamystats, kefin),
    { initialProps: { streamystats, kefin } },
  );

test("opens on Streamystats when both sources are shown", async () => {
  const { result } = await render(true, true);
  expect(result.current.activeSource).toBe("streamystats");
  expect(result.current.showToggle).toBe(true);
});

// The tab stays mounted while settings change. Starting out with KefinTweaks
// alone must not pin it there once Streamystats is set up too.
test("moves to the Streamystats default when it is turned on later", async () => {
  const view = await render(false, true);
  expect(view.result.current.activeSource).toBe("kefin");

  await view.rerender({ streamystats: true, kefin: true });

  expect(view.result.current.activeSource).toBe("streamystats");
});

test("keeps the source the user picked", async () => {
  const view = await render(true, true);

  await act(async () => view.result.current.setSource("kefin"));
  await view.rerender({ streamystats: true, kefin: true });

  expect(view.result.current.activeSource).toBe("kefin");
});

test("shows the only source there is, whatever was picked", async () => {
  const view = await render(true, true);
  await act(async () => view.result.current.setSource("kefin"));

  await view.rerender({ streamystats: true, kefin: false });

  expect(view.result.current.activeSource).toBe("streamystats");
  expect(view.result.current.showToggle).toBe(false);
});
