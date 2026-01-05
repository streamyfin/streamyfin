import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View, type ViewProps } from "react-native";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";
import { Input } from "../common/Input";
import { Button } from "../Button";

interface Props extends ViewProps {}

export const AddNewServer: React.FC<Props> = ({ ...props }) => {
  const [showForm, setShowForm] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { addNewServer } = useJellyfin();
  const { t } = useTranslation();

  const handleAddServer = async () => {
    if (!serverUrl.trim()) {
      Alert.alert(t("login.error_title"), "Please enter a server URL");
      return;
    }

    setLoading(true);
    try {
      // Validate URL format
      const cleanUrl = serverUrl.trim().replace(/\/$/, "");
      
      // Test connection to the server
      const baseUrl = cleanUrl.replace(/^https?:\/\//i, "");
      const protocols = ["https", "http"];
      let validUrl: string | null = null;

      for (const protocol of protocols) {
        try {
          const response = await fetch(
            `${protocol}://${baseUrl}/System/Info/Public`,
            { mode: "cors" }
          );
          if (response.ok) {
            validUrl = `${protocol}://${baseUrl}`;
            break;
          }
        } catch (error) {
          // Continue to next protocol
        }
      }

      if (!validUrl) {
        Alert.alert(
          t("login.connection_failed"),
          t("login.could_not_connect_to_server")
        );
        return;
      }

      // Add the server to the list
      await addNewServer({ address: validUrl });
      
      Alert.alert(
        "Success",
        `Server ${validUrl} has been added to your server list. You can now switch to it from Quick Switch Servers.`
      );
      
      setServerUrl("");
      setShowForm(false);
    } catch (error) {
      console.error("Failed to add server:", error);
      Alert.alert(
        t("login.error_title"),
        "Failed to add server. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View {...props}>
      <ListGroup title={t("server.add_new_server")}>
        {!showForm ? (
          <ListItem
            onPress={() => setShowForm(true)}
            title="Add Server"
            icon="add"
            showArrow
          />
        ) : (
          <View className="p-4 space-y-4">
            <Input
              placeholder={t("server.server_url_placeholder")}
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
              textContentType="URL"
              maxLength={500}
            />
            <View className="flex-row space-x-2">
              <Button
                onPress={handleAddServer}
                loading={loading}
                disabled={loading || !serverUrl.trim()}
                className="flex-1"
              >
                Add Server
              </Button>
              <Button
                onPress={() => {
                  setShowForm(false);
                  setServerUrl("");
                }}
                className="flex-1 bg-neutral-800 border border-neutral-700"
              >
                Cancel
              </Button>
            </View>
          </View>
        )}
      </ListGroup>
    </View>
  );
};