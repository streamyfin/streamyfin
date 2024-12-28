declare global {
  interface Number {
    bytesToReadable(): string;
  }
}

Number.prototype.bytesToReadable = function () {
  const bytes = this.valueOf();
  const gb = bytes / 1e9;

  if (gb >= 1) return `${gb.toFixed(2)} GB`;

  const mb = bytes / 1024.0 / 1024.0;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;

  const kb = bytes / 1024.0;
  if (kb >= 1) return `${kb.toFixed(2)} KB`;

  return `${bytes.toFixed(2)} B`;
}

export {};