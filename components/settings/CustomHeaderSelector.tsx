import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Switch, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { HEADER_PRESETS } from "@/utils/customHeaderPresets";
import {
  type HeaderConfig,
  type HeaderSource,
  getIntegrationHeaderConfig,
  updateIntegrationHeaderConfig,
} from "@/utils/integrationHeaders";
import { normalizeCustomHeaders } from "@/utils/normalizeCustomHeaders";
import type { CustomHeader } from "@/utils/secureCredentials";
import { getServerCustomHeaders } from "@/utils/secureCredentials";
import { storage } from "@/utils/mmkv";

interface CustomHeaderSelectorProps {
  integrationKey: string; // e.g., "jellyseerr", "jellystat", etc.
  title?: string;
  description?: string;
  onHeadersChange?: (headers: Record<string, string>) => void;
}

export function CustomHeaderSelector({
  integrationKey,
  title,
  description,
  onHeadersChange,
}: CustomHeaderSelectorProps): React.ReactElement {
  const { t } = useTranslation();
  const serverUrl = storage.getString("serverUrl");

  const [config, setConfig] = useState<HeaderConfig>(() =>
    getIntegrationHeaderConfig(integrationKey),
  );

  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Save config when it changes
  useEffect(() => {
    updateIntegrationHeaderConfig(integrationKey, config);
  }, [config, integrationKey]);

  // Calculate effective headers
  const effectiveHeaders = useMemo(() => {
    if (config.source === "jellyfin" && serverUrl) {
      return normalizeCustomHeaders(getServerCustomHeaders(serverUrl));
    }
    if (config.source === "custom") {
      return normalizeCustomHeaders(config.customHeaders);
    }
    return {};
  }, [config, serverUrl]);

  // Notify parent of header changes
  useEffect(() => {
    onHeadersChange?.(effectiveHeaders);
  }, [effectiveHeaders, onHeadersChange]);

  const handleSourceChange = useCallback((source: HeaderSource) => {
    setConfig((prev) => ({
      ...prev,
      source,
    }));
  }, []);

  const handleAddPreset = useCallback(() => {
    Alert.alert(
      t("home.settings.network.custom_headers_presets_title"),
      undefined,
      [
        ...HEADER_PRESETS.map((preset) => ({
          text: preset.label,
          onPress: () => {
            setConfig((prev) => ({
              ...prev,
              source: "custom",
              customHeaders: [...prev.customHeaders, ...preset.headers],
            }));
            toast.success(
              t("home.settings.network.custom_headers_preset_added", {
                name: preset.label,
              }),
            );
          },
        })),
        {
          text: t("common.cancel"),
          style: "cancel" as const,
        },
      ],
    );
  }, [t]);

  const handleAddCustom = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      source: "custom",
      customHeaders: [
        ...prev.customHeaders,
        { key: "", value: "", enabled: true },
      ],
    }));
    setEditingIndex(config.customHeaders.length);
  }, [config.customHeaders.length]);

  const handleUpdateHeader = useCallback(
    (index: number, updates: Partial<CustomHeader>) => {
      setConfig((prev) => {
        const updated = [...prev.customHeaders];
        updated[index] = { ...updated[index], ...updates };
        return { ...prev, customHeaders: updated };
      });
    },
    [],
  );

  const handleRemoveHeader = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      customHeaders: prev.customHeaders.filter((_, i) => i !== index),
    }));
  }, []);

  const handleToggleEnabled = useCallback(
    (index: number, enabled: boolean) => {
      handleUpdateHeader(index, { enabled });
    },
    [handleUpdateHeader],
  );

  return (
    <View className='mt-4'>
      {title && (
        <Text className='text-sm font-semibold text-neutral-300 mb-2'>
          {title}
        </Text>
      )}
      {description && (
        <Text className='text-xs text-neutral-500 mb-3'>{description}</Text>
      )}

      {/* Source Selection */}
      <View className='flex-row gap-2 mb-4'>
        <SourceButton
          selected={config.source === "jellyfin"}
          onPress={() => handleSourceChange("jellyfin")}
          icon='link'
          label='Jellyfin'
          disabled={!serverUrl}
        />
        <SourceButton
          selected={config.source === "custom"}
          onPress={() => handleSourceChange("custom")}
          icon='code-working'
          label='Custom'
        />
        <SourceButton
          selected={config.source === "none"}
          onPress={() => handleSourceChange("none")}
          icon='close-circle'
          label='None'
        />
      </View>

      {/* Show Jellyfin headers preview */}
      {config.source === "jellyfin" && serverUrl && (
        <View className='bg-neutral-900 rounded-xl p-3'>
          <Text className='text-xs text-neutral-500 mb-2'>
            Using headers from Jellyfin server:
          </Text>
          {Object.keys(effectiveHeaders).length === 0 ? (
            <Text className='text-xs text-neutral-400 italic'>
              No custom headers configured for Jellyfin server
            </Text>
          ) : (
            Object.entries(effectiveHeaders).map(([key]) => (
              <View key={key} className='flex-row items-center gap-2 mb-1'>
                <Ionicons
                  name='checkmark-circle'
                  size={14}
                  color={Colors.primary}
                />
                <Text className='text-xs text-neutral-300'>{key}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Show custom header editor */}
      {config.source === "custom" && (
        <View>
          {config.customHeaders.length === 0 ? (
            <View className='bg-neutral-900 rounded-xl p-4 mb-2'>
              <Text className='text-neutral-400 text-sm text-center'>
                No custom headers configured
              </Text>
            </View>
          ) : (
            config.customHeaders.map((header, index) => (
              <View key={index} className='bg-neutral-900 rounded-xl p-3 mb-2'>
                <View className='flex-row items-center justify-between'>
                  <View className='flex-1'>
                    {editingIndex === index ? (
                      <View className='gap-2'>
                        <Input
                          placeholder={t(
                            "home.settings.network.custom_headers_header_key",
                          )}
                          value={header.key}
                          onChangeText={(text) =>
                            handleUpdateHeader(index, { key: text })
                          }
                          autoCapitalize='none'
                          autoCorrect={false}
                          className='text-sm'
                        />
                        <Input
                          placeholder={t(
                            "home.settings.network.custom_headers_header_value",
                          )}
                          value={header.value}
                          onChangeText={(text) =>
                            handleUpdateHeader(index, { value: text })
                          }
                          autoCapitalize='none'
                          autoCorrect={false}
                          className='text-sm'
                        />
                        <TouchableOpacity
                          onPress={() => setEditingIndex(null)}
                          className='self-start'
                        >
                          <Text className='text-purple-600 text-sm'>
                            {t("common.done")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => setEditingIndex(index)}>
                        <Text className='text-white font-medium text-sm'>
                          {header.key || "Header Name"}
                        </Text>
                        <Text className='text-neutral-400 text-xs'>
                          {header.value ? "••••••••" : "No value"}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View className='flex-row items-center gap-2'>
                    <Switch
                      value={header.enabled}
                      onValueChange={(enabled) =>
                        handleToggleEnabled(index, enabled)
                      }
                    />
                    <TouchableOpacity
                      onPress={() => handleRemoveHeader(index)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name='close-circle' size={20} color='#EF4444' />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}

          <View className='flex-row gap-2 mt-2'>
            <Button onPress={handleAddPreset} className='flex-1'>
              Add Preset
            </Button>
            <Button onPress={handleAddCustom} className='flex-1'>
              Add Custom
            </Button>
          </View>
        </View>
      )}

      {config.source === "none" && (
        <View className='bg-neutral-900 rounded-xl p-3'>
          <Text className='text-xs text-neutral-500'>
            No custom headers will be sent to this integration
          </Text>
        </View>
      )}
    </View>
  );
}

interface SourceButtonProps {
  selected: boolean;
  onPress: () => void;
  icon: string;
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
        name={icon as any}
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
