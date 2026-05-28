import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Switch, TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { HEADER_PRESETS } from "@/utils/customHeaderPresets";
import { storage } from "@/utils/mmkv";
import {
  type CustomHeader,
  getServerCustomHeaders,
  updateServerCustomHeaders,
} from "@/utils/secureCredentials";
import { Button } from "../Button";
import { Input } from "../common/Input";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export function CustomHeadersSettings(): React.ReactElement | null {
  const { t } = useTranslation();
  const remoteUrl = storage.getString("serverUrl");
  const [headers, setHeaders] = useState<CustomHeader[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (remoteUrl) {
      const existingHeaders = getServerCustomHeaders(remoteUrl);
      setHeaders(existingHeaders);
    }
  }, [remoteUrl]);

  const saveHeaders = useCallback(
    (newHeaders: CustomHeader[]) => {
      if (!remoteUrl) return;
      setHeaders(newHeaders);
      updateServerCustomHeaders(remoteUrl, newHeaders);
    },
    [remoteUrl],
  );

  const handleToggleEnabled = useCallback(
    (index: number, enabled: boolean) => {
      const updated = [...headers];
      updated[index].enabled = enabled;
      saveHeaders(updated);
    },
    [headers, saveHeaders],
  );

  const handleUpdateKey = useCallback(
    (index: number, key: string) => {
      const updated = [...headers];
      updated[index].key = key;
      saveHeaders(updated);
    },
    [headers, saveHeaders],
  );

  const handleUpdateValue = useCallback(
    (index: number, value: string) => {
      const updated = [...headers];
      updated[index].value = value;
      saveHeaders(updated);
    },
    [headers, saveHeaders],
  );

  const handleRemoveHeader = useCallback(
    (index: number) => {
      const updated = headers.filter((_, i) => i !== index);
      saveHeaders(updated);
      toast.success(t("custom_headers.removed"));
    },
    [headers, saveHeaders, t],
  );

  const handleAddPreset = useCallback(() => {
    Alert.alert(
      t("custom_headers.presets_title"),
      undefined,
      [
        ...HEADER_PRESETS.map((preset) => ({
          text: preset.label,
          onPress: () => {
            const newHeaders = [...headers, ...preset.headers];
            saveHeaders(newHeaders);
            toast.success(
              t("custom_headers.preset_added", {
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
  }, [headers, saveHeaders, t]);

  const handleAddCustom = useCallback(() => {
    const newHeader: CustomHeader = {
      key: "",
      value: "",
      enabled: true,
    };
    const newHeaders = [...headers, newHeader];
    saveHeaders(newHeaders);
    setEditingIndex(newHeaders.length - 1);
  }, [headers, saveHeaders]);

  if (!remoteUrl) return null;

  return (
    <View>
      <ListGroup
        title={t("custom_headers.title")}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("custom_headers.description")}
          </Text>
        }
      >
        {headers.length === 0 && (
          <ListItem
            title={t("custom_headers.no_headers")}
            subtitle={t("custom_headers.no_headers_hint")}
          />
        )}

        {headers.map((header, index) => (
          <View
            key={index}
            className='border-b border-neutral-800 last:border-b-0'
          >
            <View className='flex-row items-center justify-between px-4 py-3'>
              <View className='flex-1 mr-3'>
                {editingIndex === index ? (
                  <View className='gap-2'>
                    <Input
                      placeholder={t(
                        "custom_headers.header_key",
                      )}
                      value={header.key}
                      onChangeText={(text) => handleUpdateKey(index, text)}
                      autoCapitalize='none'
                      autoCorrect={false}
                    />
                    <Input
                      placeholder={t(
                        "custom_headers.header_value",
                      )}
                      value={header.value}
                      onChangeText={(text) => handleUpdateValue(index, text)}
                      autoCapitalize='none'
                      autoCorrect={false}
                    />
                    <TouchableOpacity
                      onPress={() => setEditingIndex(null)}
                      className='self-start'
                    >
                      <Text className='text-purple-600'>
                        {t("common.done")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setEditingIndex(index)}>
                    <Text className='text-white font-medium'>
                      {header.key ||
                        t("custom_headers.header_key")}
                    </Text>
                    <Text className='text-neutral-400 text-sm'>
                      {header.value
                        ? "••••••••"
                        : t(
                            "custom_headers.header_value",
                          )}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View className='flex-row items-center gap-3'>
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
                  <Ionicons name='close-circle' size={22} color='#EF4444' />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}
      </ListGroup>

      <View className='py-2 gap-2'>
        <Button onPress={handleAddPreset}>
          {t("custom_headers.add_preset")}
        </Button>
        <Button onPress={handleAddCustom}>
          {t("custom_headers.add_custom")}
        </Button>
      </View>

      <View className='px-4 py-2 bg-neutral-900 rounded-xl mt-2'>
        <Text className='text-neutral-400 text-xs'>
          ℹ️ {t("custom_headers.security_note")}
        </Text>
      </View>
    </View>
  );
}
