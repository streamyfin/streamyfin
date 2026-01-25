import React from "react";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";

export interface TVSectionHeaderProps {
  title: string;
}

export const TVSectionHeader: React.FC<TVSectionHeaderProps> = ({ title }) => {
  const typography = useScaledTVTypography();

  return (
    <Text
      style={{
        fontSize: typography.callout,
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
};
