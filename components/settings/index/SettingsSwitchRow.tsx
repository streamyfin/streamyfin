import type React from "react";
import { Switch } from "react-native";
import { ListItem } from "@/components/list/ListItem";

interface Props {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export const SettingsSwitchRow: React.FC<Props> = ({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}) => (
  <ListItem title={title} subtitle={subtitle} disabled={disabled}>
    <Switch value={value} disabled={disabled} onValueChange={onValueChange} />
  </ListItem>
);
