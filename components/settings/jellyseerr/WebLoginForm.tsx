import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Platform, View } from "react-native";
import NitroCookies from "react-native-nitro-cookies";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { Button } from "../../Button";
import { Text } from "../../common/Text";

export interface WebCredentials {
  cookies: string[];
}

interface JellyseerrWebLoginProps {
  serverUrl?: string;
  onSubmit: (credentials: WebCredentials) => void;
}

export const WebLoginForm: React.FC<JellyseerrWebLoginProps> = ({
  serverUrl,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();

  const [isVisible, setIsVisible] = useState(false);

  if (Platform.isTV) return null;

  const checkNativeCookies = async () => {
    if (!serverUrl) return;

    try {
      const cookies = await NitroCookies.get(serverUrl);

      if (cookies["connect.sid"]) {
        const cookieStrings = Object.values(cookies).map(
          (cookie) => `${cookie.name}=${cookie.value}`,
        );

        setIsVisible(false);
        onSubmit({ cookies: cookieStrings });
      }
    } catch (e) {
      console.error("Failed to fetch native cookies", e);
    }
  };

  const handleClose = () => {
    checkNativeCookies();
    setIsVisible(false);
  };

  return (
    <View>
      <Text className='text-xs text-gray-500 mb-4'>
        {t("home.settings.plugins.jellyseerr.login_via_web_hint")}
      </Text>
      <Button
        variant='border'
        color='purple'
        className='h-12'
        onPress={() => setIsVisible(true)}
        disabled={!serverUrl}
      >
        {t("home.settings.plugins.jellyseerr.login_via_web")}
      </Button>

      <Modal
        visible={isVisible}
        animationType='slide'
        presentationStyle='pageSheet'
        onRequestClose={handleClose}
      >
        <View className='flex-1 bg-black'>
          <View
            className='flex-row items-center justify-between px-4 pb-2 border-b border-neutral-800'
            style={{ paddingTop: Math.max(insets.top, 16) }}
          >
            <Text className='text-lg font-bold text-white'>
              {t("home.settings.plugins.jellyseerr.web_login_title")}
            </Text>
            <Button variant='solid' onPress={handleClose} className='p-2'>
              {t("home.settings.plugins.jellyseerr.web_login_done")}
            </Button>
          </View>

          {serverUrl && (
            <WebView
              ref={webViewRef}
              source={{ uri: serverUrl }}
              onNavigationStateChange={checkNativeCookies}
              onLoadEnd={checkNativeCookies}
              style={{ flex: 1, backgroundColor: "black" }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              sharedCookiesEnabled={true}
            />
          )}
        </View>
      </Modal>
    </View>
  );
};
