import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View, type ViewProps } from "react-native";
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
    left: t("player.alignment_left"),
    center: t("player.alignment_center"),
    right: t("player.alignment_right"),
  };

  const alignYLabels: Record<AlignY, string> = {
    top: t("player.alignment_top"),
    center: t("player.alignment_center"),
    bottom: t("player.alignment_bottom"),
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

  if (isTv) return null;
  if (!settings) return null;

  return (
    <View {...props}>
      <ListGroup
        title={t("player.mpv_subtitle_settings_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("player.mpv_subtitle_settings_description")}
          </Text>
        }
      >
        <ListItem title={t("player.subtitle_scale")}>
          <Stepper
            value={settings.mpvSubtitleScale ?? 1.0}
            step={0.1}
            min={0.5}
            max={2.0}
            onUpdate={(value) =>
              updateSettings({ mpvSubtitleScale: Math.round(value * 10) / 10 })
            }
          />
        </ListItem>

        <ListItem title={t("player.vertical_margin")}>
          <Stepper
            value={settings.mpvSubtitleMarginY ?? 0}
            step={5}
            min={0}
            max={100}
            onUpdate={(value) => updateSettings({ mpvSubtitleMarginY: value })}
          />
        </ListItem>

        <ListItem title={t("player.horizontal_alignment")}>
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
            title={t("player.horizontal_alignment")}
          />
        </ListItem>

        <ListItem title={t("player.vertical_alignment")}>
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
            title={t("player.vertical_alignment")}
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
