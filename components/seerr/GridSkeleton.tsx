import React from "react";
import { View } from "react-native";

// Dev note might be a good idea to standardize skeletons across the app and have one "file" for it.
export const GridSkeleton = React.memo(() => {
  return (
    <View className='flex flex-col mr-2 h-auto' style={{ width: "30.5%" }}>
      <View className='relative rounded-lg overflow-hidden border border-neutral-900 w-full mt-4 aspect-[10/15] bg-neutral-800' />
      <View className='mt-2 flex flex-col w-full'>
        <View className='h-4 bg-neutral-800 rounded mb-1' />
        <View className='h-3 bg-neutral-800 rounded w-1/2' />
      </View>
    </View>
  );
});
