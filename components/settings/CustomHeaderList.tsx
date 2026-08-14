import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { useCustomHeaderRows } from "@/hooks/useCustomHeaderRows";
import {
  type CustomHeader,
  HEADER_PRESETS,
  presetRows,
} from "@/utils/customHeaders";

interface CustomHeaderListProps {
  headers: CustomHeader[];
  /** Every keystroke; keep the owner's state in sync without persisting. */
  onChange: (headers: CustomHeader[]) => void;
  /** Persist: fired on structural edits (add / remove / toggle) and on blur. */
  onCommit: (headers: CustomHeader[]) => void;
  /**
   * Hands the preset choice to the owner — used inside a bottom sheet, where
   * the picker is a second view rather than the native alert this falls back
   * to on the settings pages.
   */
  onAddPreset?: () => void;
  disabled?: boolean;
}

/** A preset's rows, or a single hand-written one, as drawn in the editor. */
interface HeaderGroup {
  /** Positions in the header list, so edits address the original rows. */
  indices: number[];
  preset?: (typeof HEADER_PRESETS)[number];
}

/**
 * Rows that came from the same preset, in the order they were added. A
 * gateway's headers only work as a set, so they are drawn as one block.
 */
function groupHeaders(headers: CustomHeader[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];

  headers.forEach((header, index) => {
    const preset = header.presetId
      ? HEADER_PRESETS.find((candidate) => candidate.id === header.presetId)
      : undefined;
    const previous = groups.at(-1);

    if (preset && previous?.preset?.id === preset.id) {
      previous.indices.push(index);
      return;
    }

    groups.push({ indices: [index], preset });
  });

  return groups;
}

/**
 * Editor for a list of custom proxy auth headers, shared by the login screen,
 * the network settings and the per-integration selector so all three behave the
 * same. Values live in SecureStore rather than in app storage, and are masked
 * in the UI (secure entry).
 */
export function CustomHeaderList({
  headers,
  onChange,
  onCommit,
  onAddPreset,
  disabled,
}: CustomHeaderListProps): React.ReactElement {
  const { t } = useTranslation();
  const {
    rowIds,
    updateRow,
    updateRows,
    removeRows,
    appendRows,
    commitIfEdited,
  } = useCustomHeaderRows({ headers, onChange, onCommit });

  // Values are masked by default, but they are typed by hand and easy to get
  // wrong, so each row can be revealed while it is being filled in.
  const [revealedRows, setRevealedRows] = useState<Set<string>>(new Set());
  const toggleReveal = useCallback((rowId: string) => {
    setRevealedRows((previous) => {
      const next = new Set(previous);
      if (!next.delete(rowId)) next.add(rowId);
      return next;
    });
  }, []);

  const groups = useMemo(() => groupHeaders(headers), [headers]);

  const addPreset = useCallback(() => {
    if (onAddPreset) {
      onAddPreset();
      return;
    }

    Alert.alert(t("custom_headers.presets_title"), undefined, [
      ...HEADER_PRESETS.map((preset) => ({
        text: preset.label,
        onPress: () => appendRows(presetRows(preset)),
      })),
      { text: t("common.cancel"), style: "cancel" as const },
    ]);
  }, [appendRows, onAddPreset, t]);

  const valueField = (index: number) => (
    <View className='justify-center'>
      <Input
        placeholder={t("custom_headers.header_value_placeholder")}
        value={headers[index].value}
        onChangeText={(value) => updateRow(index, { value })}
        onBlur={commitIfEdited}
        editable={!disabled}
        secureTextEntry={!revealedRows.has(rowIds[index])}
        autoCapitalize='none'
        autoCorrect={false}
        // A masked field otherwise reads as a password: Android offers the
        // saved account from the password manager, which is never what belongs
        // in a gateway header.
        autoComplete='off'
        importantForAutofill='no'
        textContentType='none'
        extraClassName='pr-12 border border-neutral-700'
        clearButtonMode='never'
      />
      <TouchableOpacity
        onPress={() => toggleReveal(rowIds[index])}
        disabled={disabled}
        className='absolute right-3'
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={t(
          revealedRows.has(rowIds[index])
            ? "custom_headers.hide_value"
            : "custom_headers.show_value",
        )}
      >
        <Ionicons
          name={revealedRows.has(rowIds[index]) ? "eye-off" : "eye"}
          size={20}
          color='#9CA3AF'
        />
      </TouchableOpacity>
    </View>
  );

  /**
   * The switch and the delete action sit on their own line: next to a
   * full-height input they crowd its right edge, and an unlabelled switch
   * doesn't say what it toggles. Both address the whole group.
   */
  const groupFooter = (group: HeaderGroup) => (
    <View className='flex-row items-center justify-between border-t border-neutral-800 pt-3'>
      <View className='flex-row items-center gap-x-2'>
        <SettingSwitch
          value={group.indices.every((index) => headers[index].enabled)}
          disabled={disabled}
          onValueChange={(enabled) =>
            updateRows(group.indices, { enabled }, true)
          }
        />
        <Text className='text-xs text-neutral-400'>
          {t("custom_headers.enabled")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => removeRows(group.indices)}
        disabled={disabled}
        className='flex-row items-center gap-x-1 py-1 px-2'
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name='trash-outline' size={15} color='#F87171' />
        <Text className='text-xs text-red-400'>{t("common.remove")}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View className='gap-y-2'>
      {headers.length === 0 ? (
        <View className='bg-neutral-900 border border-neutral-800 rounded-xl p-4'>
          <Text className='text-neutral-400 text-sm text-center'>
            {t("custom_headers.no_headers")}
          </Text>
        </View>
      ) : (
        groups.map((group) => (
          <View
            key={rowIds[group.indices[0]]}
            // Spacing is explicit rather than `gap-y-*`: that utility lands as
            // a leading margin on every child here, so a nested one indents the
            // whole card away from its own top padding.
            className='bg-neutral-900 border border-neutral-800 rounded-xl p-4'
          >
            {group.preset ? (
              <>
                {/* A preset's header names are fixed, so they label the value
                    they belong to instead of being editable fields. */}
                <Text className='font-semibold mb-4'>{group.preset.label}</Text>
                {group.indices.map((index) => (
                  <View key={rowIds[index]} className='mb-4'>
                    <Text className='text-xs text-neutral-400 mb-2'>
                      {headers[index].key}
                    </Text>
                    {valueField(index)}
                  </View>
                ))}
              </>
            ) : (
              // Labelled the same way as a preset's fields; the difference is
              // that the name is the user's to write here.
              <>
                <View className='mb-4'>
                  <Text className='text-xs text-neutral-400 mb-2'>
                    {t("custom_headers.header_key")}
                  </Text>
                  <Input
                    placeholder={t("custom_headers.header_name_placeholder")}
                    value={headers[group.indices[0]].key}
                    onChangeText={(key) => updateRow(group.indices[0], { key })}
                    onBlur={commitIfEdited}
                    editable={!disabled}
                    autoCapitalize='none'
                    autoCorrect={false}
                    autoComplete='off'
                    importantForAutofill='no'
                    extraClassName='border border-neutral-700'
                  />
                </View>
                <View className='mb-4'>
                  <Text className='text-xs text-neutral-400 mb-2'>
                    {t("custom_headers.header_value")}
                  </Text>
                  {valueField(group.indices[0])}
                </View>
              </>
            )}

            {groupFooter(group)}
          </View>
        ))
      )}

      <View className='flex-row gap-x-2'>
        <Button
          className='flex-1 border border-neutral-700'
          disabled={disabled}
          onPress={addPreset}
          color='black'
        >
          {t("custom_headers.add_preset")}
        </Button>
        <Button
          className='flex-1 border border-neutral-700'
          disabled={disabled}
          onPress={() => appendRows([{ key: "", value: "", enabled: true }])}
          color='black'
        >
          {t("custom_headers.add_custom")}
        </Button>
      </View>
    </View>
  );
}
