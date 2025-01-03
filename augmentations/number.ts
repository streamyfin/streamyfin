declare global {
  interface Number {
    bytesToReadable(): string;
    secondsToMilliseconds(): number;
    minutesToMilliseconds(): number;
    hoursToMilliseconds(): number;
  }
}

Number.prototype.bytesToReadable = function () {
  const bytes = this.valueOf();
  const gb = bytes / 1e9;

  if (gb >= 1) return `${gb.toFixed(0)} GB`;

  const mb = bytes / 1024.0 / 1024.0;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;

  const kb = bytes / 1024.0;
  if (kb >= 1) return `${kb.toFixed(0)} KB`;

  return `${bytes.toFixed(2)} B`;
};

Number.prototype.secondsToMilliseconds = function () {
  return this.valueOf() * 1000;
};

Number.prototype.minutesToMilliseconds = function () {
  return this.valueOf() * (60).secondsToMilliseconds();
};

Number.prototype.hoursToMilliseconds = function () {
  return this.valueOf() * (60).minutesToMilliseconds();
};

export {};
