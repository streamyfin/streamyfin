declare global {
  interface Number {
    bytesToReadable(decimals?: number): string;
    secondsToMilliseconds(): number;
    minutesToMilliseconds(): number;
    hoursToMilliseconds(): number;
  }
}

Number.prototype.bytesToReadable = function (decimals = 2) {
  const bytes = this.valueOf();
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
  );
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
