import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import ChannelsPage from "@/app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/channels";
import GuidePage from "@/app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/guide";
import ProgramsPage from "@/app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/programs";
import RecordingsPage from "@/app/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/livetv/recordings";
import { type LiveTVTab, LiveTVTabButtons } from "./LiveTVTabButtons";

export const LiveTVView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LiveTVTab>("channels");
  const { t } = useTranslation();

  return (
    <View style={{ flex: 1 }}>
      <View className='px-4 py-2'>
        <LiveTVTabButtons activeTab={activeTab} onChange={setActiveTab} t={t} />
      </View>
      <View style={{ flex: 1 }}>
        {activeTab === "programs" && <ProgramsPage />}
        {activeTab === "guide" && <GuidePage />}
        {activeTab === "channels" && <ChannelsPage />}
        {activeTab === "recordings" && <RecordingsPage />}
      </View>
    </View>
  );
};
