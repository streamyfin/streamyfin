import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useCustomHeaderRows } from "@/hooks/useCustomHeaderRows";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import {
  type CustomHeader,
  HEADER_PRESETS,
  presetRows,
} from "@/utils/customHeaders";
import { scaleSize } from "@/utils/scaleSize";
import { TVSettingsOptionButton } from "./TVSettingsOptionButton";
import { TVSettingsRow } from "./TVSettingsRow";
import { TVSettingsTextInput } from "./TVSettingsTextInput";
import { TVSettingsToggle } from "./TVSettingsToggle";

export interface TVCustomHeaderEditorProps {
  /** Which service the headers belong to, e.g. "Jellyfin". */
  serviceLabel: string;
  headers: CustomHeader[];
  /** Every keystroke; keep the owner's state in sync without persisting. */
  onHeadersChange: (headers: CustomHeader[]) => void;
  /** Persist: fired on structural edits (add / remove / toggle) and on blur. */
  onCommit?: (headers: CustomHeader[]) => void;
  disabled?: boolean;
}

/**
 * TV counterpart of `CustomHeaderList`: a focusable row per header with the
 * same preset/add/clear actions, used by both TV settings and the TV
 * add-server screen.
 */
export function TVCustomHeaderEditor({
  serviceLabel,
  headers,
  onHeadersChange,
  onCommit,
  disabled,
}: TVCustomHeaderEditorProps): React.ReactElement {
  const { t } = useTranslation();
  const { showOptions } = useTVOptionModal();
  const typography = useScaledTVTypography();
  const {
    rowIds,
    updateRow,
    removeRow,
    appendRows,
    replaceRows,
    commitIfEdited,
  } = useCustomHeaderRows({
    headers,
    onChange: onHeadersChange,
    onCommit,
  });

  const addPreset = () => {
    showOptions({
      title: t("custom_headers.presets_title"),
      options: HEADER_PRESETS.map((preset) => ({
        label: preset.label,
        value: preset.id,
        selected: false,
      })),
      onSelect: (presetId) => {
        const preset = HEADER_PRESETS.find((p) => p.id === presetId);
        if (preset) appendRows(presetRows(preset));
      },
    });
  };

  return (
    <View style={{ marginBottom: scaleSize(24), opacity: disabled ? 0.4 : 1 }}>
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: typography.body,
          fontWeight: "600",
          marginBottom: scaleSize(8),
          marginLeft: scaleSize(8),
        }}
      >
        {serviceLabel}
      </Text>

      {headers.length === 0 ? (
        <TVSettingsRow
          label={t("custom_headers.no_headers")}
          value=''
          showChevron={false}
        />
      ) : (
        headers.map((header, index) => (
          <View key={rowIds[index]} style={{ marginBottom: scaleSize(12) }}>
            <TVSettingsToggle
              label={header.key || t("custom_headers.header_key")}
              value={header.enabled}
              disabled={disabled}
              onToggle={(enabled) => updateRow(index, { enabled }, true)}
            />
            <TVSettingsTextInput
              label={t("custom_headers.header_key")}
              value={header.key}
              placeholder={t("custom_headers.header_name_placeholder")}
              disabled={disabled}
              onChangeText={(key) => updateRow(index, { key })}
              onBlur={commitIfEdited}
            />
            <TVSettingsTextInput
              label={t("custom_headers.header_value")}
              value={header.value}
              placeholder={t("custom_headers.header_value_placeholder")}
              disabled={disabled}
              onChangeText={(value) => updateRow(index, { value })}
              onBlur={commitIfEdited}
              secureTextEntry
            />
            <TVSettingsOptionButton
              label={t("common.remove")}
              value=''
              disabled={disabled}
              onPress={() => removeRow(index)}
            />
          </View>
        ))
      )}

      <TVSettingsOptionButton
        label={t("custom_headers.add_preset")}
        value=''
        disabled={disabled}
        onPress={addPreset}
      />
      <TVSettingsOptionButton
        label={t("custom_headers.add_custom")}
        value=''
        disabled={disabled}
        onPress={() => appendRows([{ key: "", value: "", enabled: true }])}
      />
      {headers.length > 0 ? (
        <TVSettingsOptionButton
          label={t("custom_headers.clear_headers")}
          value=''
          disabled={disabled}
          onPress={() => replaceRows([])}
        />
      ) : null}
    </View>
  );
}
