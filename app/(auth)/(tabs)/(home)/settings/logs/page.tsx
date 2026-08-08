import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useNavigation } from "expo-router";
import type * as SharingType from "expo-sharing";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import Collapsible from "react-native-collapsible";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import {
  HEADER_BUTTON_INSET,
  HeaderButton,
} from "@/components/common/HeaderButton";
import { Text } from "@/components/common/Text";
import { FilterButton } from "@/components/filters/FilterButton";
import { Loader } from "@/components/Loader";
import { LogLevel, useLog, writeErrorLog } from "@/utils/log";

// Conditionally import expo-sharing only on non-TV platforms
const Sharing = Platform.isTV
  ? null
  : (require("expo-sharing") as typeof SharingType);

export default function Page() {
  const navigation = useNavigation();
  const { logs } = useLog();
  const { t } = useTranslation();

  const orderFilterId = useId();
  const levelsFilterId = useId();

  const defaultLevels: LogLevel[] = ["INFO", "ERROR", "DEBUG", "WARN"];
  const codeBlockStyle = {
    backgroundColor: "#000",
    padding: 10,
    fontFamily: "monospace",
    maxHeight: 300,
  };

  const [loading, setLoading] = useState<boolean>(false);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [levels, setLevels] = useState<LogLevel[]>(defaultLevels);

  const _orderId = useId();
  const _levelsId = useId();
  const insets = useSafeAreaInsets();

  const filteredLogs = useMemo(
    () =>
      logs
        ?.filter((log) => levels.includes(log.level))
        ?.[
          // Already in asc order as they are recorded. just reverse for desc
          order === "desc" ? "reverse" : "concat"
        ]?.(),
    [logs, order, levels],
  );

  // Sharing it as txt while its formatted allows us to share it with many more applications
  const share = useCallback(async () => {
    if (!Sharing) return;

    const logsFile = new File(Paths.document, "logs.txt");

    setLoading(true);
    try {
      logsFile.write(JSON.stringify(filteredLogs));
      await Sharing.shareAsync(logsFile.uri, {
        mimeType: "text/plain",
        UTI: "public.plain-text",
      });
    } catch (e: any) {
      writeErrorLog("Something went wrong attempting to export", e);
    } finally {
      setLoading(false);
    }
  }, [filteredLogs, Sharing]);

  const copyLog = useCallback(
    async (log: NonNullable<typeof logs>[number]) => {
      // Skip on builds that don't ship the expo-clipboard native module
      // (probe returns null instead of throwing); same guard as Quick Connect.
      if (!requireOptionalNativeModule("ExpoClipboard")) return;
      const Clipboard = await import("expo-clipboard");
      const text = [
        `[${log.level}] ${new Date(log.timestamp).toLocaleString()}`,
        log.message,
        log.data ? JSON.stringify(log.data, null, 2) : null,
      ]
        .filter(Boolean)
        .join("\n");
      await Clipboard.setStringAsync(text);
      toast.success(t("home.settings.logs.copied"));
    },
    [logs, t],
  );

  useEffect(() => {
    if (Platform.isTV) return;

    navigation.setOptions({
      headerRight: () =>
        loading ? (
          // Same inset as the button it stands in for, so the iOS 26 pill
          // doesn't change shape when the spinner swaps out.
          <View style={{ paddingHorizontal: HEADER_BUTTON_INSET }}>
            <Loader />
          </View>
        ) : (
          <HeaderButton onPress={share}>
            <Text>{t("home.settings.logs.export_logs")}</Text>
          </HeaderButton>
        ),
    });
  }, [share, loading]);

  return (
    <ScrollView
      // Like the sibling settings pages, let iOS auto-inset the content below the
      // transparent header (no manual header-height math). The filter bar is a
      // sticky header so it stays pinned just under the header while logs scroll.
      contentInsetAdjustmentBehavior='automatic'
      stickyHeaderIndices={[0]}
      contentContainerStyle={{ paddingBottom: insets.bottom }}
    >
      <View className='flex flex-row justify-end py-2 px-4 space-x-2 bg-black'>
        <FilterButton
          id={orderFilterId}
          queryKey='log'
          queryFn={async () => ["asc", "desc"]}
          set={(values) => setOrder(values[0])}
          values={[order]}
          title={t("library.filters.sort_order")}
          renderItemLabel={(order) => t(`library.filters.${order}`)}
        />
        <FilterButton
          id={levelsFilterId}
          queryKey='log'
          queryFn={async () => defaultLevels}
          set={setLevels}
          values={levels}
          title={t("home.settings.logs.level")}
          renderItemLabel={(level) => level}
          multiple={true}
        />
      </View>
      <View className='flex flex-col space-y-2 px-4'>
        {filteredLogs?.map((log, index) => (
          <View className='bg-neutral-900 rounded-xl p-3' key={index}>
            <TouchableOpacity
              disabled={!log.data}
              onPress={() =>
                setState((v) => ({
                  ...v,
                  [log.timestamp]: !v[log.timestamp],
                }))
              }
            >
              <View className='flex flex-row justify-between'>
                <Text
                  className={`mb-1
                      ${log.level === "INFO" && "text-blue-500"}
                      ${log.level === "ERROR" && "text-red-500"}
                      ${log.level === "DEBUG" && "text-purple-500"}
                    `}
                >
                  {log.level}
                </Text>

                <Text className='text-xs'>
                  {new Date(log.timestamp).toLocaleString()}
                </Text>
              </View>
              <Text className='text-xs'>{log.message}</Text>
              {/* Keep the whole collapsed row tappable: the hint lives inside
                  the toggle so tapping it expands too. */}
              {log.data && !state[log.timestamp] && (
                <Text className='text-xs mt-0.5'>
                  {t("home.settings.logs.click_for_more_info")}
                </Text>
              )}
            </TouchableOpacity>

            {log.data && (
              <Collapsible collapsed={!state[log.timestamp]}>
                <View className='mt-2 flex flex-col space-y-2'>
                  <ScrollView
                    className='rounded-xl'
                    style={codeBlockStyle}
                    nestedScrollEnabled
                  >
                    {/* Only the raw payload is selectable (per request); the
                        header/message stay tap-to-toggle. */}
                    <Text selectable>{JSON.stringify(log.data, null, 2)}</Text>
                  </ScrollView>
                  {!Platform.isTV && (
                    <TouchableOpacity
                      onPress={() => copyLog(log)}
                      className='flex flex-row items-center self-end px-2 py-1'
                    >
                      <Ionicons name='copy-outline' size={16} color='white' />
                      <Text className='text-xs ml-1'>
                        {t("home.settings.logs.copy")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Collapsible>
            )}
          </View>
        ))}
        {filteredLogs?.length === 0 && (
          <Text className='opacity-50'>
            {t("home.settings.logs.no_logs_available")}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
