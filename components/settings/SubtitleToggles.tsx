import { useEffect, useState } from "react";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";

const _DropdownMenu = !Platform.isTV ? require("zeego/dropdown-menu") : null;

import { Ionicons } from "@expo/vector-icons";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { useTranslation } from "react-i18next";
import { Switch } from "react-native-gesture-handler";
import Dropdown from "@/components/common/Dropdown";
import { Stepper } from "@/components/inputs/Stepper";
import { useSettings } from "@/utils/atoms/settings";
import { storage } from "@/utils/mmkv";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { useMedia } from "./MediaContext";

interface Props extends ViewProps {}

const VLC_COLORS = {
  Black: 0,
  Gray: 8421504,
  Silver: 12632256,
  White: 16777215,
  Maroon: 8388608,
  Red: 16711680,
  Fuchsia: 16711935,
  Yellow: 16776960,
  Olive: 8421376,
  Green: 32768,
  Teal: 32896,
  Lime: 65280,
  Purple: 8388736,
  Navy: 128,
  Blue: 255,
  Aqua: 65535,
};

const OUTLINE_THICKNESS = {
  None: 0,
  Thin: 2,
  Normal: 4,
  Thick: 6,
};

export const SubtitleToggles: React.FC<Props> = ({ ...props }) => {
  const isTv = Platform.isTV;

  const media = useMedia();
  const { pluginSettings } = useSettings();
  const { settings, updateSettings } = media;
  const cultures = media.cultures;
  const { t } = useTranslation();

  // VLC subtitle styling states
  const [textColor, setTextColor] = useState(
    storage.getString("vlc.textColor") || "White",
  );
  const [backgroundColor, setBackgroundColor] = useState(
    storage.getString("vlc.backgroundColor") || "Black",
  );
  const [outlineColor, setOutlineColor] = useState(
    storage.getString("vlc.outlineColor") || "Black",
  );
  const [outlineThickness, setOutlineThickness] = useState(
    storage.getString("vlc.outlineThickness") || "Normal",
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState(
    storage.getNumber("vlc.backgroundOpacity") || 128,
  );
  const [outlineOpacity, setOutlineOpacity] = useState(
    storage.getNumber("vlc.outlineOpacity") || 255,
  );
  const [isBold, setIsBold] = useState(
    storage.getBoolean("vlc.isBold") || false,
  );

  // VLC settings effects
  useEffect(() => {
    storage.set("vlc.textColor", textColor);
  }, [textColor]);
  useEffect(() => {
    storage.set("vlc.backgroundColor", backgroundColor);
  }, [backgroundColor]);
  useEffect(() => {
    storage.set("vlc.outlineColor", outlineColor);
  }, [outlineColor]);
  useEffect(() => {
    storage.set("vlc.outlineThickness", outlineThickness);
  }, [outlineThickness]);
  useEffect(() => {
    storage.set("vlc.backgroundOpacity", backgroundOpacity);
  }, [backgroundOpacity]);
  useEffect(() => {
    storage.set("vlc.outlineOpacity", outlineOpacity);
  }, [outlineOpacity]);
  useEffect(() => {
    storage.set("vlc.isBold", isBold);
  }, [isBold]);

  if (isTv) return null;
  if (!settings) return null;

  const subtitleModes = [
    SubtitlePlaybackMode.Default,
    SubtitlePlaybackMode.Smart,
    SubtitlePlaybackMode.OnlyForced,
    SubtitlePlaybackMode.Always,
    SubtitlePlaybackMode.None,
  ];

  const subtitleModeKeys = {
    [SubtitlePlaybackMode.Default]: "home.settings.subtitles.modes.Default",
    [SubtitlePlaybackMode.Smart]: "home.settings.subtitles.modes.Smart",
    [SubtitlePlaybackMode.OnlyForced]:
      "home.settings.subtitles.modes.OnlyForced",
    [SubtitlePlaybackMode.Always]: "home.settings.subtitles.modes.Always",
    [SubtitlePlaybackMode.None]: "home.settings.subtitles.modes.None",
  };

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.subtitles.subtitle_title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.subtitles.subtitle_hint")}
          </Text>
        }
      >
        <ListItem title={t("home.settings.subtitles.subtitle_language")}>
          <Dropdown
            data={[
              {
                DisplayName: t("home.settings.subtitles.none"),
                ThreeLetterISOLanguageName: "none-subs",
              },
              ...(cultures ?? []),
            ]}
            keyExtractor={(item) =>
              item?.ThreeLetterISOLanguageName ?? "unknown"
            }
            titleExtractor={(item) => item?.DisplayName}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {settings?.defaultSubtitleLanguage?.DisplayName ||
                    t("home.settings.subtitles.none")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.language")}
            onSelected={(defaultSubtitleLanguage) =>
              updateSettings({
                defaultSubtitleLanguage:
                  defaultSubtitleLanguage.DisplayName ===
                  t("home.settings.subtitles.none")
                    ? null
                    : defaultSubtitleLanguage,
              })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_mode")}
          disabled={pluginSettings?.subtitleMode?.locked}
        >
          <Dropdown
            data={subtitleModes}
            disabled={pluginSettings?.subtitleMode?.locked}
            keyExtractor={String}
            titleExtractor={(item) => t(subtitleModeKeys[item]) || String(item)}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(subtitleModeKeys[settings?.subtitleMode]) ||
                    t("home.settings.subtitles.loading")}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.subtitle_mode")}
            onSelected={(subtitleMode) => updateSettings({ subtitleMode })}
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.set_subtitle_track")}
          disabled={pluginSettings?.rememberSubtitleSelections?.locked}
        >
          <Switch
            value={settings.rememberSubtitleSelections}
            disabled={pluginSettings?.rememberSubtitleSelections?.locked}
            onValueChange={(value) =>
              updateSettings({ rememberSubtitleSelections: value })
            }
          />
        </ListItem>

        <ListItem
          title={t("home.settings.subtitles.subtitle_size")}
          disabled={pluginSettings?.subtitleSize?.locked}
        >
          <Stepper
            value={settings.subtitleSize}
            disabled={pluginSettings?.subtitleSize?.locked}
            step={5}
            min={0}
            max={120}
            onUpdate={(subtitleSize) => updateSettings({ subtitleSize })}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.text_color")}>
          <Dropdown
            data={Object.keys(VLC_COLORS)}
            keyExtractor={(item) => item}
            titleExtractor={(item) =>
              t(`home.settings.subtitles.colors.${item}`)
            }
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.subtitles.colors.${textColor}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.text_color")}
            onSelected={setTextColor}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.background_color")}>
          <Dropdown
            data={Object.keys(VLC_COLORS)}
            keyExtractor={(item) => item}
            titleExtractor={(item) =>
              t(`home.settings.subtitles.colors.${item}`)
            }
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.subtitles.colors.${backgroundColor}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.background_color")}
            onSelected={setBackgroundColor}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_color")}>
          <Dropdown
            data={Object.keys(VLC_COLORS)}
            keyExtractor={(item) => item}
            titleExtractor={(item) =>
              t(`home.settings.subtitles.colors.${item}`)
            }
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.subtitles.colors.${outlineColor}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.outline_color")}
            onSelected={setOutlineColor}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_thickness")}>
          <Dropdown
            data={Object.keys(OUTLINE_THICKNESS)}
            keyExtractor={(item) => item}
            titleExtractor={(item) =>
              t(`home.settings.subtitles.thickness.${item}`)
            }
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>
                  {t(`home.settings.subtitles.thickness.${outlineThickness}`)}
                </Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.outline_thickness")}
            onSelected={setOutlineThickness}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.background_opacity")}>
          <Dropdown
            data={[0, 32, 64, 96, 128, 160, 192, 224, 255]}
            keyExtractor={String}
            titleExtractor={(item) => `${Math.round((item / 255) * 100)}%`}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>{`${Math.round((backgroundOpacity / 255) * 100)}%`}</Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.background_opacity")}
            onSelected={setBackgroundOpacity}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.outline_opacity")}>
          <Dropdown
            data={[0, 32, 64, 96, 128, 160, 192, 224, 255]}
            keyExtractor={String}
            titleExtractor={(item) => `${Math.round((item / 255) * 100)}%`}
            title={
              <TouchableOpacity className='flex flex-row items-center justify-between py-3 pl-3'>
                <Text className='mr-1 text-[#8E8D91]'>{`${Math.round((outlineOpacity / 255) * 100)}%`}</Text>
                <Ionicons
                  name='chevron-expand-sharp'
                  size={18}
                  color='#5A5960'
                />
              </TouchableOpacity>
            }
            label={t("home.settings.subtitles.outline_opacity")}
            onSelected={setOutlineOpacity}
          />
        </ListItem>
        <ListItem title={t("home.settings.subtitles.bold_text")}>
          <Switch value={isBold} onValueChange={setIsBold} />
        </ListItem>
      </ListGroup>
    </View>
  );
};
