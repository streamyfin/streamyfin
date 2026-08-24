import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import type { CustomHeader } from "@/utils/customHeaders";
import { storage } from "@/utils/mmkv";
import {
  getServerCustomHeaders,
  updateServerCustomHeaders,
} from "@/utils/secureCredentials";
import { CustomHeaderList } from "./CustomHeaderList";

/**
 * Custom proxy auth headers for the connected Jellyfin server — for servers
 * behind Cloudflare Zero Trust, Pangolin and similar gateways.
 */
export function CustomHeadersSettings(): React.ReactElement | null {
  const { t } = useTranslation();
  // The remote address is the one headers are keyed on: a local-network URL
  // reaches the server directly and never goes through the gateway.
  const remoteUrl = storage.getString("serverUrl");
  const [headers, setHeaders] = useState<CustomHeader[]>([]);

  useEffect(() => {
    setHeaders(remoteUrl ? getServerCustomHeaders(remoteUrl) : []);
  }, [remoteUrl]);

  const persist = useCallback(
    (next: CustomHeader[]) => {
      if (!remoteUrl) return;
      updateServerCustomHeaders(remoteUrl, next);
    },
    [remoteUrl],
  );

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
        <View className='p-3'>
          <CustomHeaderList
            headers={headers}
            onChange={setHeaders}
            onCommit={persist}
          />
        </View>
      </ListGroup>

      <View className='px-4 py-2 bg-neutral-900 rounded-xl mt-2'>
        <Text className='text-neutral-400 text-xs'>
          {t("custom_headers.security_note")}
        </Text>
      </View>
    </View>
  );
}
