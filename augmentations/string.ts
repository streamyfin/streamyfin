declare global {
  interface String {
    toTitle(): string;
  }
}

String.prototype.toTitle = function () {
  return this.replaceAll("_", " ").replace(
    /\w\S*/g,
    (text) => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase(),
  );
};

export {};
