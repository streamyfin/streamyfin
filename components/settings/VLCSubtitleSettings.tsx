import { t } from "i18next";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { storage } from "@/utils/mmkv";

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

export function VLCSubtitleSettings({
  className = "",
}: {
  className?: string;
}) {
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

  return (
    <View className={className}>
      <ListGroup title={t("home.settings.vlc_subtitles.title")}>
        <ListItem
          title={t("home.settings.vlc_subtitles.text_color")}
          value={textColor}
          onPress={() => {
            const colors = Object.keys(VLC_COLORS);
            const currentIndex = colors.indexOf(textColor);
            const nextIndex = (currentIndex + 1) % colors.length;
            setTextColor(colors[nextIndex]);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.background_color")}
          value={backgroundColor}
          onPress={() => {
            const colors = Object.keys(VLC_COLORS);
            const currentIndex = colors.indexOf(backgroundColor);
            const nextIndex = (currentIndex + 1) % colors.length;
            setBackgroundColor(colors[nextIndex]);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.outline_color")}
          value={outlineColor}
          onPress={() => {
            const colors = Object.keys(VLC_COLORS);
            const currentIndex = colors.indexOf(outlineColor);
            const nextIndex = (currentIndex + 1) % colors.length;
            setOutlineColor(colors[nextIndex]);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.outline_thickness")}
          value={outlineThickness}
          onPress={() => {
            const thicknesses = Object.keys(OUTLINE_THICKNESS);
            const currentIndex = thicknesses.indexOf(outlineThickness);
            const nextIndex = (currentIndex + 1) % thicknesses.length;
            setOutlineThickness(thicknesses[nextIndex]);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.background_opacity")}
          value={`${Math.round((backgroundOpacity / 255) * 100)}%`}
          onPress={() => {
            const newOpacity = (backgroundOpacity + 32) % 256;
            setBackgroundOpacity(newOpacity);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.outline_opacity")}
          value={`${Math.round((outlineOpacity / 255) * 100)}%`}
          onPress={() => {
            const newOpacity = (outlineOpacity + 32) % 256;
            setOutlineOpacity(newOpacity);
          }}
        />
        <ListItem
          title={t("home.settings.vlc_subtitles.bold_text")}
          value={isBold ? "On" : "Off"}
          onPress={() => setIsBold(!isBold)}
        />
      </ListGroup>
    </View>
  );
}
