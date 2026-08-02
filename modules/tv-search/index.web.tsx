// Web (desktop) variant: TvSearchView wraps the tvOS native search controller,
// which has no desktop equivalent. Desktop uses the regular search tab, so this
// renders nothing.
const TvSearchView: React.FC<Record<string, unknown>> = () => null;

export default TvSearchView;
export * from "./src/TvSearchView.types";
export { TvSearchView };
