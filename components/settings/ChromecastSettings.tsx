import { Switch, View } from "react-native";
import { ListGroup } from "../list/ListGroup";
import { useSettings } from "@/utils/atoms/settings";
import { ListItem } from "../list/ListItem";

export const ChromecastSettings: React.FC = ({ ...props }) => {
  const [settings, updateSettings] = useSettings();
  return (
    <View {...props}>
      <ListGroup title={"Chromecast"}>
        <ListItem title={"Enable H265 for Chromecast"}>
          <Switch
            value={settings.enableH265ForChromecast}
            onValueChange={(enableH265ForChromecast) =>
              updateSettings({ enableH265ForChromecast })
            }
          />
        </ListItem>
      </ListGroup>
    </View>
  );
};
