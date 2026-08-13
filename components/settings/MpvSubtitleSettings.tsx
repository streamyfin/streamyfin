import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Stepper } from "@/components/inputs/Stepper";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { PlatformDropdown } from "../PlatformDropdown";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

type AlignX = "left" | "center" | "right";
type AlignY = "top" | "center" | "bottom";

export const MpvSubtitleSettings: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;
  const media = useMedia();
  const { settings, updateSettings } = media;
  const { t } = useTranslation();

  const alignXOptions: AlignX[] = ["left", "center", "right"];
  const alignYOptions: AlignY[] = ["top", "center", "bottom"];

  const alignXLabels: Record<AlignX, string> = {
    left: t("home.settings.subtitles.align.left"),
    center: t("home.settings.subtitles.align.center"),
    right: t("home.settings.subtitles.align.right"),
  };

  const alignYLabels: Record<AlignY, string> = {
    top: t("home.settings.subtitles.align.top"),
    center: t("home.settings.subtitles.align.center"),
    bottom: t("home.settings.subtitles.align.bottom"),
  };

  const alignXOptionGroups = useMemo(() => {
    const options = alignXOptions.map((align) => ({
      type: "radio" as const,
      label: alignXLabels[align],
      value: align,
      selected: align === (settings?.mpvSubtitleAlignX ?? "center"),
      onPress: () => updateSettings({ mpvSubtitleAlignX: align }),
    }));
    return [{ options }];
  }, [settings?.mpvSubtitleAlignX, updateSettings]);

  const alignYOptionGroups = useMemo(() => {
    const options = alignYOptions.map((align) => ({
      type: "radio" as const,
      label: alignYLabels[align],
      value: align,
      selected: align === (settings?.mpvSubtitleAlignY ?? "bottom"),
      onPress: () => updateSettings({ mpvSubtitleAlignY: align }),
    }));
    return [{ options }];
  }, [settings?.mpvSubtitleAlignY, updateSettings]);

  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.subtitles.mpv_settings_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.mpv_settings_description")}
          </Text>
        }
      >
        {!isTv && (
          <>
            <ListItem
              title={t("home.settings.subtitles.mpv_subtitle_margin_y")}
            >
              <Stepper
                value={settings.mpvSubtitleMarginY ?? 0}
                step={5}
                min={0}
                max={100}
                onUpdate={(value) =>
                  updateSettings({ mpvSubtitleMarginY: value })
                }
              />
            </ListItem>

            <ListItem title={t("home.settings.subtitles.mpv_subtitle_align_x")}>
              <PlatformDropdown
                groups={alignXOptionGroups}
                trigger={
                  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {alignXLabels[settings?.mpvSubtitleAlignX ?? "center"]}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t("home.settings.subtitles.mpv_subtitle_align_x")}
              />
            </ListItem>

            <ListItem title={t("home.settings.subtitles.mpv_subtitle_align_y")}>
              <PlatformDropdown
                groups={alignYOptionGroups}
                trigger={
                  <View className='flex flex-row items-center justify-between py-1.5 pl-3'>
                    <Text className='mr-1 text-[#8E8D91]'>
                      {alignYLabels[settings?.mpvSubtitleAlignY ?? "bottom"]}
                    </Text>
                    <Ionicons
                      name='chevron-expand-sharp'
                      size={18}
                      color='#5A5960'
                    />
                  </View>
                }
                title={t("home.settings.subtitles.mpv_subtitle_align_y")}
              />
            </ListItem>
          </>
        )}

        <ListItem title={t("home.settings.subtitles.opaque_background")}>
          <SettingSwitch
            value={settings.mpvSubtitleBackgroundEnabled ?? false}
            onValueChange={(value) =>
              updateSettings({ mpvSubtitleBackgroundEnabled: value })
            }
          />
        </ListItem>

        {settings.mpvSubtitleBackgroundEnabled && (
          <ListItem title={t("home.settings.subtitles.background_opacity")}>
            <Stepper
              value={settings.mpvSubtitleBackgroundOpacity ?? 75}
              step={5}
              min={10}
              max={100}
              appendValue='%'
              onUpdate={(value) =>
                updateSettings({ mpvSubtitleBackgroundOpacity: value })
              }
            />
          </ListItem>
        )}
      </ListGroup>
    </View>
  );
};
