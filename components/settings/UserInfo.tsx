import { View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import { ListItem } from "../list/ListItem";
import { Button } from "../Button";
import { apiAtom, useJellyfin, userAtom } from "@/providers/JellyfinProvider";
import { useAtom } from "jotai";
import Constants from "expo-constants";
import Application from "expo-application";
import { ListGroup } from "../list/ListGroup";

interface Props extends ViewProps {}

export const UserInfo: React.FC<Props> = ({ ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const version =
    Application?.nativeApplicationVersion ||
    Application?.nativeBuildVersion ||
    "N/A";

  return (
    <View {...props}>
      <ListGroup title={"User Info"}>
        <ListItem title="User" value={user?.Name} />
        <ListItem title="Server" value={api?.basePath} />
        <ListItem title="Token" value={api?.accessToken} />
        <ListItem title="App version" value={version} />
      </ListGroup>
    </View>
  );
};
