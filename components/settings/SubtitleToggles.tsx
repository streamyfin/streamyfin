import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { useSettings } from "@/utils/atoms/settings";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { useMedia } from "./MediaContext";
import { SubtitleBackgroundSettings } from "./subtitles/SubtitleBackgroundSettings";
import { SubtitleColorPicker } from "./subtitles/SubtitleColorPicker";
import { SubtitleFontDropdown } from "./subtitles/SubtitleFontDropdown";
import { SubtitleLanguageDropdown } from "./subtitles/SubtitleLanguageDropdown";
import { SubtitleModeDropdown } from "./subtitles/SubtitleModeDropdown";
import { SubtitlePreviewSection } from "./subtitles/SubtitlePreviewSection";
import { SubtitleRememberSelection } from "./subtitles/SubtitleRememberSelection";
import { SubtitleSizeStepper } from "./subtitles/SubtitleSizeStepper";

interface Props extends ViewProps {}

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.subtitles.subtitle_title") || "Subtitles"}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.subtitle_hint")}
          </Text>
        }
      >
        <SubtitlePreviewSection />

        <SubtitleLanguageDropdown
          settings={settings}
          updateSettings={updateSettings}
          cultures={cultures}
        />

        <SubtitleModeDropdown
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />

        <SubtitleRememberSelection
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />

        <SubtitleFontDropdown
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />

        <SubtitleColorPicker
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />

        <SubtitleSizeStepper
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />

        <SubtitleBackgroundSettings
          settings={settings}
          updateSettings={updateSettings}
          pluginSettings={pluginSettings}
        />
      </ListGroup>
    </View>
  );
};
