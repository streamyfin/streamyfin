import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import {
  getDownloadLocationDisplay,
  requestDownloadDirectory,
  verifySafAccess,
} from "@/providers/Downloads/storagePath";
import { useSettings } from "@/utils/atoms/settings";

export default function DownloadSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [isVerifying, setIsVerifying] = useState(false);

  const handleChangeDownloadPath = useCallback(async () => {
    try {
      const result = await requestDownloadDirectory();
      if (result) {
        // Verify we can actually access the directory
        setIsVerifying(true);
        const hasAccess = await verifySafAccess(result.uri);
        setIsVerifying(false);

        if (hasAccess) {
          updateSettings({ downloadPath: result });
          toast.success(
            t("home.settings.downloads.download_path_updated", {
              defaultValue: "Download location updated",
            }),
          );
        } else {
          toast.error(
            t("home.settings.downloads.download_path_access_denied", {
              defaultValue: "Cannot access the selected folder",
            }),
          );
        }
      }
    } catch (error) {
      setIsVerifying(false);
      console.error("[SAF] Error selecting download path:", error);
      toast.error(
        t("home.settings.downloads.download_path_error", {
          defaultValue: "Failed to set download location",
        }),
      );
    }
  }, [updateSettings, t]);

  const handleResetDownloadPath = useCallback(() => {
    updateSettings({ downloadPath: null });
    toast.success(
      t("home.settings.downloads.download_path_reset", {
        defaultValue: "Download location reset to default",
      }),
    );
  }, [updateSettings, t]);

  // Only show on Android (SAF is Android-only)
  if (Platform.OS !== "android") {
    return null;
  }

  const currentPath = getDownloadLocationDisplay(
    settings.downloadPath,
    t("home.settings.downloads.app_storage_default", {
      defaultValue: "App Storage (Private)",
    }),
  );

  return (
    <View>
      <ListGroup
        title={t("home.settings.downloads.download_location_title", {
          defaultValue: "Download Location",
        })}
        description={
          <Text className='text-[#8E8D91] text-xs'>
            {t("home.settings.downloads.download_location_description", {
              defaultValue:
                "Choose where downloads are saved. Use an external folder to access files from other apps (e.g. VR video players).",
            })}
          </Text>
        }
      >
        <ListItem
          title={t("home.settings.downloads.current_location", {
            defaultValue: "Current Location",
          })}
          subtitle={currentPath}
        />
        {settings.downloadPath?.uri && (
          <ListItem
            title={t("home.settings.downloads.current_location_path", {
              defaultValue: "Path",
            })}
            subtitle={settings.downloadPath.uri}
          />
        )}
        <ListItem
          onPress={handleChangeDownloadPath}
          disabled={isVerifying}
          title={t("home.settings.downloads.change_download_location", {
            defaultValue: "Change Location",
          })}
          subtitle={
            isVerifying
              ? t("home.settings.downloads.verifying_access", {
                  defaultValue: "Verifying access...",
                })
              : undefined
          }
          showArrow
        />
        {settings.downloadPath && (
          <ListItem
            textColor='red'
            onPress={handleResetDownloadPath}
            title={t("home.settings.downloads.reset_download_location", {
              defaultValue: "Reset to Default",
            })}
          />
        )}
      </ListGroup>
    </View>
  );
}
