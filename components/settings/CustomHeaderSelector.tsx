import { Ionicons } from "@expo/vector-icons";
import { useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import {
  type CustomHeader,
  customHeadersVersionAtom,
  getIntegrationHeaderConfig,
  getJellyfinHeaders,
  type HeaderConfig,
  type HeaderSource,
  type IntegrationKey,
  updateIntegrationHeaderConfig,
} from "@/utils/customHeaders";
import { storage } from "@/utils/mmkv";
import { CustomHeaderList } from "./CustomHeaderList";

interface CustomHeaderSelectorProps {
  integrationKey: IntegrationKey;
  title?: string;
  description?: string;
}

/**
 * Header configuration for a self-hosted integration: reuse the Jellyfin
 * headers (same gateway), define its own, or send none.
 */
export function CustomHeaderSelector({
  integrationKey,
  title,
  description,
}: CustomHeaderSelectorProps): React.ReactElement {
  const { t } = useTranslation();
  const serverUrl = storage.getString("serverUrl");

  const [config, setConfig] = useState<HeaderConfig>(() =>
    getIntegrationHeaderConfig(integrationKey),
  );

  const persist = useCallback(
    (next: HeaderConfig) => {
      setConfig(next);
      updateIntegrationHeaderConfig(integrationKey, next);
    },
    [integrationKey],
  );

  const setSource = useCallback(
    (source: HeaderSource) => persist({ ...config, source }),
    [config, persist],
  );

  const setHeaders = useCallback(
    (customHeaders: CustomHeader[]) =>
      setConfig((prev) => ({ ...prev, customHeaders })),
    [],
  );

  const commitHeaders = useCallback(
    (customHeaders: CustomHeader[]) =>
      persist({ ...config, source: "custom", customHeaders }),
    [config, persist],
  );

  // Subscribed to the version so the preview isn't stale after the Jellyfin
  // headers are edited on another screen while this one stays mounted.
  const customHeadersVersion = useAtomValue(customHeadersVersionAtom);
  const jellyfinHeaderNames = useMemo(
    () => Object.keys(getJellyfinHeaders(serverUrl)),
    [serverUrl, customHeadersVersion],
  );

  return (
    <View className='mt-4'>
      {title ? (
        <Text className='text-sm font-semibold text-neutral-300 mb-2'>
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text className='text-xs text-neutral-500 mb-3'>{description}</Text>
      ) : null}

      <View className='flex-row gap-2 mb-4'>
        <SourceButton
          selected={config.source === "jellyfin"}
          onPress={() => setSource("jellyfin")}
          icon='link'
          label={t("custom_headers.source_jellyfin")}
          disabled={!serverUrl}
        />
        <SourceButton
          selected={config.source === "custom"}
          onPress={() => setSource("custom")}
          icon='code-working'
          label={t("custom_headers.source_custom")}
        />
        <SourceButton
          selected={config.source === "none"}
          onPress={() => setSource("none")}
          icon='close-circle'
          label={t("custom_headers.source_none")}
        />
      </View>

      {config.source === "jellyfin" ? (
        <View className='bg-neutral-900 rounded-xl p-3'>
          <Text className='text-xs text-neutral-500 mb-2'>
            {t("custom_headers.using_jellyfin_headers")}
          </Text>
          {jellyfinHeaderNames.length === 0 ? (
            <Text className='text-xs text-neutral-400 italic'>
              {t("custom_headers.no_jellyfin_headers")}
            </Text>
          ) : (
            jellyfinHeaderNames.map((name) => (
              <View key={name} className='flex-row items-center gap-2 mb-1'>
                <Ionicons
                  name='checkmark-circle'
                  size={14}
                  color={Colors.primary}
                />
                <Text className='text-xs text-neutral-300'>{name}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {config.source === "custom" ? (
        <CustomHeaderList
          headers={config.customHeaders}
          onChange={setHeaders}
          onCommit={commitHeaders}
        />
      ) : null}

      {config.source === "none" ? (
        <View className='bg-neutral-900 rounded-xl p-3'>
          <Text className='text-xs text-neutral-500'>
            {t("custom_headers.integration_none")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface SourceButtonProps {
  selected: boolean;
  onPress: () => void;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  disabled?: boolean;
}

function SourceButton({
  selected,
  onPress,
  icon,
  label,
  disabled,
}: SourceButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 rounded-lg py-2 px-1 items-center justify-center ${
        selected
          ? "bg-purple-600"
          : disabled
            ? "bg-neutral-800 opacity-50"
            : "bg-neutral-800"
      }`}
    >
      <Ionicons
        name={icon}
        size={16}
        color={selected ? "white" : disabled ? "#666" : "#999"}
      />
      <Text
        className={`text-[10px] mt-0.5 ${
          selected
            ? "text-white"
            : disabled
              ? "text-neutral-500"
              : "text-neutral-400"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
