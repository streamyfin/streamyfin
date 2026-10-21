import { View } from "react-native";

/**
 * A ServerImage module double for specs and perf scenarios.
 * Decoding happens in native code, which Jest cannot see; the element stays
 * so its renders are counted, named after the URL it loads so an image can be
 * found by its artwork.
 */
export const serverImageModule = {
  Image: (props: { source?: { uri?: string }; testID?: string }) => (
    <View testID={props.testID ?? `image ${props.source?.uri}`} {...props} />
  ),
  prefetchServerImage: jest.fn(async () => true),
};
