import { Button, Host } from "@expo/ui/swift-ui";
import { Ionicons } from "@expo/vector-icons";
import { Platform, View } from "react-native";
import { RoundButton } from "../RoundButton";

interface MarkAsPlayedLargeButtonProps {
  isPlayed: boolean;
  onToggle: (isPlayed: boolean) => void;
}

export const MarkAsPlayedLargeButton: React.FC<
  MarkAsPlayedLargeButtonProps
> = ({ isPlayed, onToggle }) => {
  if (Platform.OS === "ios")
    return (
      <Host
        style={{
          flex: 0,
          width: 50,
          height: 50,
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "row",
        }}
      >
        <Button onPress={() => onToggle(isPlayed)} variant='glass'>
          <View>
            <Ionicons
              name='checkmark'
              size={24}
              color='white'
              style={{
                marginTop: 6,
                marginLeft: 1,
              }}
            />
          </View>
        </Button>
      </Host>
    );

  return (
    <View>
      <RoundButton
        size='large'
        icon={isPlayed ? "checkmark" : "checkmark"}
        onPress={() => onToggle(isPlayed)}
      />
    </View>
  );
};
