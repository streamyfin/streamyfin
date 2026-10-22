/**
 * Doubles for the app providers a screen reads but a scenario does not
 * measure. A spec mocks the provider with one of these, so the line still shows
 * what it replaced.
 */
export const networkStatusModule = {
  useNetworkStatus: () => ({ isConnected: true, serverConnected: true }),
};

export const globalModalModule = {
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
};

export const downloadModule = {
  useDownload: () => ({
    downloadedItems: [],
    processes: [],
    getDownloadedItems: () => [],
    cleanCacheDirectory: async () => {},
  }),
};
