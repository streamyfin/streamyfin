import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { TVMediaItem } from "../media/TVMediaItem";
import { Colors } from "@/constants/Colors";

interface TVScrollingCollectionListProps {
  queryFn: () => Promise<BaseItemDto[]>;
  queryKey: string[];
  title: string;
  hideIfEmpty?: boolean;
  orientation?: "horizontal" | "vertical";
}

export const TVScrollingCollectionList = ({
  queryFn,
  queryKey,
  title,
  hideIfEmpty = false,
  orientation = "horizontal",
}: TVScrollingCollectionListProps) => {
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn,
  });

  const renderItem = useCallback(
    (item: BaseItemDto) => {
      return <TVMediaItem key={item.Id} item={item} />;
    },
    []
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    if (hideIfEmpty) {
      return null;
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No items found</Text>
      </View>
    );
  }

  // Use a standalone component instead of nesting FlatLists
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {orientation === "horizontal" ? (
        <View style={styles.horizontalList}>
          {data.map(item => renderItem(item))}
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {data.map((item) => (
            <View key={item.Id} style={styles.gridItem}>
              {renderItem(item)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "white",
    paddingHorizontal: 10,
  },
  horizontalList: {
    flexDirection: "row",
    paddingHorizontal: 10,
    overflow: "scroll",
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "white",
    fontSize: 16,
  },
  emptyContainer: {
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "white",
    fontSize: 16,
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 10,
  },
  gridItem: {
    width: "20%",
    padding: 5,
  }
});