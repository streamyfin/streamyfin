import { Text } from "@/components/common/Text";
import {LogLevel, useLog, writeErrorLog} from "@/utils/log";
import { useTranslation } from "react-i18next";
import {ScrollView, TouchableOpacity, View} from "react-native";
import Collapsible from "react-native-collapsible";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {FilterButton} from "@/components/filters/FilterButton";
import {useNavigation} from "expo-router";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {Loader} from "@/components/Loader";

export default function page() {
  const navigation = useNavigation();
  const { logs } = useLog();
  const { t } = useTranslation();

  const defaultLevels: LogLevel[] = ["INFO", "ERROR", "DEBUG", "WARN"]
  const codeBlockStyle = {
    backgroundColor: '#000',
    padding: 10,
    fontFamily: 'monospace',
    maxHeight: 300
  }

  const [loading, setLoading] = useState<boolean>(false)
  const [state, setState] = useState<Record<string, boolean>>({})

  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [levels, setLevels] = useState<LogLevel[]>(defaultLevels);

  const filteredLogs = useMemo(
    () => logs
      ?.filter(log => levels.includes(log.level))
      // Already in asc order as they are recorded. just reverse for desc
      ?.[order === "desc" ? "reverse" : "concat"]?.(),
    [logs, order, levels]
  )

  // Sharing it as txt while its formatted allows us to share it with many more applications
  const share = useCallback(async () => {
    const uri = FileSystem.documentDirectory + "logs.txt"

    setLoading(true)
    FileSystem.writeAsStringAsync(uri, JSON.stringify(filteredLogs))
      .then(() => {
        setLoading(false)
        Sharing.shareAsync(uri, {mimeType: "txt", UTI: "txt"})
      })
      .catch((e) => writeErrorLog("Something went wrong attempting to export", e))
      .finally(() => setLoading(false))
  }, [filteredLogs])

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        loading
          ? <Loader/>
          : (
          <TouchableOpacity onPress={share}>
            <Text>{t("home.settings.logs.export_logs")}</Text>
          </TouchableOpacity>
        )
      ),
    });
  }, [share, loading]);

  return (
    <>
      <View className="flex flex-row justify-end py-2 px-4 space-x-2">
        <FilterButton
          id='order'
          queryKey='log'
          queryFn={async () => ["asc", "desc"]}
          set={(values) => setOrder(values[0])}
          values={[order]}
          title={t("library.filters.sort_order")}
          renderItemLabel={(order) => t(`library.filters.${order}`)}
          showSearch={false}
        />
        <FilterButton
          id='levels'
          queryKey='log'
          queryFn={async () => defaultLevels}
          set={setLevels}
          values={levels}
          title={t("home.settings.logs.level")}
          renderItemLabel={(level) => level}
          showSearch={false}
          multiple={true}
        />
      </View>
      <ScrollView className='pb-4 px-4'>
        <View className='flex flex-col space-y-2'>
          {filteredLogs?.map((log, index) => (
            <View
              className='bg-neutral-900 rounded-xl p-3'
              key={index}
            >
              <TouchableOpacity
                disabled={!log.data}
                onPress={() => setState((v) => ({...v, [log.timestamp]: !v[log.timestamp]}))}
              >
                <View className="flex flex-row justify-between">
                  <Text
                    className={`mb-1
                      ${log.level === "INFO" && "text-blue-500"}
                      ${log.level === "ERROR" && "text-red-500"}
                      ${log.level === "DEBUG" && "text-purple-500"}
                    `}>
                    {log.level}
                  </Text>

                  <Text className="text-xs">{new Date(log.timestamp).toLocaleString()}</Text>
                </View>
                <Text uiTextView selectable className='text-xs'>
                  {log.message}
                </Text>
              </TouchableOpacity>

              {log.data && (
                <>
                  {!state[log.timestamp] && (
                    <Text className="text-xs mt-0.5">{t("home.settings.logs.click_for_more_info")}</Text>
                  )}
                  <Collapsible collapsed={!state[log.timestamp]}>
                    <View className="mt-2 flex flex-col space-y-2">
                      <ScrollView className="rounded-xl" style={codeBlockStyle}>
                        <Text>
                          {JSON.stringify(log.data, null, 2)}
                        </Text>
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
    </>
  );
}
