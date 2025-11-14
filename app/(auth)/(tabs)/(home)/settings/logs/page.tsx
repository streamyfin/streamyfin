import { File, Paths } from "expo-file-system";
import { useNavigation } from "expo-router";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, TouchableOpacity, View } from "react-native";
import Collapsible from "react-native-collapsible";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { FilterButton } from "@/components/filters/FilterButton";
import { Loader } from "@/components/Loader";
import { LogLevel, useLog, writeErrorLog } from "@/utils/log";

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
    const logsFile = new File(Paths.document, "logs.txt");

    setLoading(true);
    try {
      logsFile.write(JSON.stringify(filteredLogs));
      await Sharing.shareAsync(logsFile.uri, { mimeType: "txt", UTI: "txt" });
    } catch (e: any) {
      writeErrorLog("Something went wrong attempting to export", e);
    } finally {
      setLoading(false);
    }
  }, [filteredLogs]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        loading ? (
          <Loader />
        ) : (
          <TouchableOpacity onPress={share} className='px-2'>
            <Text>{t("home.settings.logs.export_logs")}</Text>
          </TouchableOpacity>
        ),
    });
  }, [share, loading]);

  return (
    <View
      className='flex-1'
      style={{
        paddingTop: insets.top + 48,
      }}
    >
      <View className='flex flex-row justify-end py-2 px-4 space-x-2'>
        <FilterButton
          id={orderFilterId}
          queryKey='log'
          queryFn={async () => ["asc", "desc"]}
          set={(values) => setOrder(values[0])}
          values={[order]}
          title={t("library.filters.sort_order")}
          renderItemLabel={(order) => t(`library.filters.${order}`)}
          disableSearch={true}
        />
        <FilterButton
          id={levelsFilterId}
          queryKey='log'
          queryFn={async () => defaultLevels}
          set={setLevels}
          values={levels}
          title={t("home.settings.logs.level")}
          renderItemLabel={(level) => level}
          disableSearch={true}
          multiple={true}
        />
      </View>
      <ScrollView className='pb-4 px-4'>
        <View className='flex flex-col space-y-2'>
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
                <Text selectable className='text-xs'>
                  {log.message}
                </Text>
              </TouchableOpacity>

              {log.data && (
                <>
                  {!state[log.timestamp] && (
                    <Text className='text-xs mt-0.5'>
                      {t("home.settings.logs.click_for_more_info")}
                    </Text>
                  )}
                  <Collapsible collapsed={!state[log.timestamp]}>
                    <View className='mt-2 flex flex-col space-y-2'>
                      <ScrollView className='rounded-xl' style={codeBlockStyle}>
                        <Text>{JSON.stringify(log.data, null, 2)}</Text>
                      </ScrollView>
                    </View>
                  </Collapsible>
                </>
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
    </View>
  );
}
