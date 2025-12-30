// Web implementation - no-op stubs since lock screen controls don't apply to web
export default {
  async updateNowPlaying(_metadata: any): Promise<void> {
    // No-op on web
  },
  async clearNowPlaying(): Promise<void> {
    // No-op on web
  },
};
