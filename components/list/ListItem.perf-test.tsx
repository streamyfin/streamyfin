import type { ReactElement } from "react";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { measureParentRerenders } from "@/test-utils/rerender";
import { ListItem } from "./ListItem";

const noop = () => {};
const SUBTITLE =
  "Let this device search OpenSubtitles directly when your Jellyfin server has no subtitle provider of its own.";

// Every settings screen is a column of these, so a screen re-render costs one
// of each per row.
const VARIANTS: [string, () => ReactElement][] = [
  [
    "a toggle row with a subtitle",
    () => (
      <ListItem title='Search OpenSubtitles' subtitle={SUBTITLE}>
        <SettingSwitch value onValueChange={noop} />
      </ListItem>
    ),
  ],
  [
    "a value row",
    () => <ListItem title='Version' value='0.99.0 (1234) dev-abcdef' />,
  ],
  [
    "a pressable row with an arrow",
    () => <ListItem title='Seerr' onPress={noop} showArrow />,
  ],
  [
    "a row locked by the admin",
    () => (
      <ListItem title='Crash reports' subtitle={SUBTITLE} disabledByAdmin>
        <SettingSwitch value={false} disabled />
      </ListItem>
    ),
  ],
];

describe.each(VARIANTS)("ListItem: %s", (_name, render) => {
  test("re-renders when its parent updates", async () => {
    await measureParentRerenders(render);
  });
});
