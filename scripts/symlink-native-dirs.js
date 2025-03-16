#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const process = require("process");
const { execSync } = require("child_process");

const root = process.cwd();
// const tvosPath = path.join(root, 'iostv');
// const iosPath = path.join(root, 'iosmobile');
// const androidPath = path.join(root, 'androidmobile');
// const androidTVPath = path.join(root, 'androidtv');
// const device = process.argv[2];
// const platform = process.argv[2];
const isTV = process.env.EXPO_TV || false;

const paths = new Map([
  ["tvos", path.join(root, "iostv")],
  ["ios", path.join(root, "iosmobile")],
  ["android", path.join(root, "androidmobile")],
  ["androidtv", path.join(root, "androidtv")],
]);

// const platformPath = paths.get(platform);

if (isTV) {
  stdout = execSync(
    `mkdir -p ${paths.get("tvos")}; ln -nsf ${paths.get("tvos")} ios`,
  );
  console.log(stdout.toString());
  stdout = execSync(
    `mkdir -p ${paths.get("androidtv")}; ln -nsf ${paths.get(
      "androidtv",
    )} android`,
  );
  console.log(stdout.toString());
} else {
  stdout = execSync(
    `mkdir -p ${paths.get("ios")}; ln -nsf ${paths.get("ios")} ios`,
  );
  console.log(stdout.toString());
  stdout = execSync(
    `mkdir -p ${paths.get("android")}; ln -nsf ${paths.get("android")} android`,
  );
  console.log(stdout.toString());
}

// target = "";
// switch (platform) {
//   case "tvos":
//     target = "ios";
//     break;
//   case "ios":
//     target = "ios";
//     break;
//   case "android":
//     target = "android";
//     break;
//   case "androidtv":
//     target = "android";
//     break;
// }
