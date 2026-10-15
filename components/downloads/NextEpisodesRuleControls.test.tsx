import { fireEvent, render, screen } from "@testing-library/react-native";
import type { NextEpisodesRuleDraft } from "@/providers/Downloads/nextEpisodesRules";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

import { NextEpisodesRuleControls } from "./NextEpisodesRuleControls";

const KEEP = "item_card.download.keep_next_episodes";
const DELETE_WATCHED = "item_card.download.delete_watched_episodes";

const renderControls = async (draft: NextEpisodesRuleDraft | null) => {
  const onChange = jest.fn();
  await render(
    <NextEpisodesRuleControls
      draft={draft}
      onChange={onChange}
      defaultCount={5}
      deletesAnyDownload={false}
    />,
  );
  return onChange;
};

describe("NextEpisodesRuleControls", () => {
  test("is off for a series without a rule", async () => {
    await renderControls(null);

    expect(screen.getByLabelText(KEEP).props.value).toBe(false);
    expect(screen.queryByLabelText(DELETE_WATCHED)).toBeNull();
  });

  // Turning it on used to store the rule and start downloading at once, before
  // the sheet's download button was pressed. It only changes the sheet's choice.
  test("turning it on only changes the sheet's choice, at the default count", async () => {
    const onChange = await renderControls(null);

    await fireEvent(screen.getByLabelText(KEEP), "valueChange", true);

    expect(onChange).toHaveBeenCalledWith({ count: 5, deleteWatched: false });
  });

  test("shows the count and deleting watched episodes while on", async () => {
    await renderControls({ count: 3, deleteWatched: true });

    expect(
      screen.getByLabelText("item_card.download.next_episodes_count_option:3")
        .props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(screen.getByLabelText(DELETE_WATCHED).props.value).toBe(true);
  });

  test("picks another count", async () => {
    const onChange = await renderControls({ count: 3, deleteWatched: true });

    await fireEvent.press(
      screen.getByLabelText("item_card.download.next_episodes_count_option:10"),
    );

    expect(onChange).toHaveBeenCalledWith({ count: 10, deleteWatched: true });
  });

  test("turns deleting watched episodes on", async () => {
    const onChange = await renderControls({ count: 3, deleteWatched: false });

    await fireEvent(screen.getByLabelText(DELETE_WATCHED), "valueChange", true);

    expect(onChange).toHaveBeenCalledWith({ count: 3, deleteWatched: true });
  });

  test("turning it off clears the choice", async () => {
    const onChange = await renderControls({ count: 3, deleteWatched: false });

    await fireEvent(screen.getByLabelText(KEEP), "valueChange", false);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
