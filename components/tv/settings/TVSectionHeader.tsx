import React from "react";
import { Text } from "@/components/common/Text";

export interface TVSectionHeaderProps {
  title: string;
}

export const TVSectionHeader: React.FC<TVSectionHeaderProps> = ({ title }) => (
  <Text
    style={{
      fontSize: 16,
      fontWeight: "600",
      color: "#9CA3AF",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginTop: 32,
      marginBottom: 16,
      marginLeft: 8,
    }}
  >
    {title}
  </Text>
);
