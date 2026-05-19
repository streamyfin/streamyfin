export interface TvRecommendationsModuleType {
  syncRecommendations(json: string): boolean;
  clearRecommendations(): boolean;
  refreshRecommendations(): boolean;
}
