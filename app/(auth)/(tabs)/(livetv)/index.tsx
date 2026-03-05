import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import ChannelsPage from "../(home,libraries,search,favorites,watchlists)/livetv/channels";
import GuidePage from "../(home,libraries,search,favorites,watchlists)/livetv/guide";
import ProgramsPage from "../(home,libraries,search,favorites,watchlists)/livetv/programs";
import RecordingsPage from "../(home,libraries,search,favorites,watchlists)/livetv/recordings";

// Wrap with uppercase names required by React Navigation
function Programs(props: object) {
  return <ProgramsPage {...(props as any)} />;
}
function Guide(props: object) {
  return <GuidePage {...(props as any)} />;
}
function Channels(props: object) {
  return <ChannelsPage {...(props as any)} />;
}
function Recordings(props: object) {
  return <RecordingsPage {...(props as any)} />;
}

const Tab = createMaterialTopTabNavigator();

export default function LiveTV() {
  return (
    <Tab.Navigator
      initialRouteName='programs'
      keyboardDismissMode='none'
      screenOptions={{
        tabBarBounces: true,
        tabBarLabelStyle: { fontSize: 10 },
        tabBarItemStyle: {
          width: 100,
        },
        tabBarStyle: { backgroundColor: "black" },
        animationEnabled: true,
        lazy: true,
        swipeEnabled: true,
        tabBarIndicatorStyle: { backgroundColor: "#9334E9" },
        tabBarScrollEnabled: true,
      }}
    >
      <Tab.Screen name='programs' component={Programs} />
      <Tab.Screen name='guide' component={Guide} />
      <Tab.Screen name='channels' component={Channels} />
      <Tab.Screen name='recordings' component={Recordings} />
    </Tab.Navigator>
  );
}
