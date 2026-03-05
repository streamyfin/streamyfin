import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  type LiveTVTab,
  LiveTVTabButtons,
} from "@/components/livetv/LiveTVTabButtons";
import ChannelsPage from "../(home,libraries,search,favorites,watchlists)/livetv/channels";
import GuidePage from "../(home,libraries,search,favorites,watchlists)/livetv/guide";
import ProgramsPage from "../(home,libraries,search,favorites,watchlists)/livetv/programs";
import RecordingsPage from "../(home,libraries,search,favorites,watchlists)/livetv/recordings";

export default function LiveTV() {
  const [activeTab, setActiveTab] = useState<LiveTVTab>("guide");
  const { t } = useTranslation();
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ marginRight: 8 }}>
          <LiveTVTabButtons
            activeTab={activeTab}
            onChange={setActiveTab}
            t={t}
          />
        </View>
      ),
    });
  }, [activeTab, navigation, t]);

  return (
    <View style={{ flex: 1 }}>
      {activeTab === "programs" && <ProgramsPage />}
      {activeTab === "guide" && <GuidePage />}
      {activeTab === "channels" && <ChannelsPage />}
      {activeTab === "recordings" && <RecordingsPage />}
    </View>
  );
}
