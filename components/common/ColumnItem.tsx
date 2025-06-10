import { useMemo } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

const getItemStyle = (index: number, numColumns: number) => {
  const alignItems = (() => {
    if (numColumns < 2 || index % numColumns === 0) return "flex-start";
    if ((index + 1) % numColumns === 0) return "flex-end";

    return "center";
  })();

  return {
    padding: 20,
    alignItems,
    width: "100%",
  } as const;
};

type ColumnItemProps = ViewProps & {
  children: React.ReactNode;
  index: number;
  numColumns: number;
};

export const ColumnItem = ({
  children,
  index,
  numColumns,
  ...rest
}: ColumnItemProps) => {
  return (
    <View className='flex flex-col mb-2 p-4' style={{ width: "33.3%" }}>
      <View
        className={`
        `}
        {...rest}
      >
        {children}
      </View>
    </View>
  );
};
