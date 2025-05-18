# 📺 Streamyfin

<a href="https://www.buymeacoffee.com/fredrikbur3" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

Welcome to Streamyfin, a simple and user-friendly Jellyfin video streaming client built with Expo. If you're looking for an alternative to other Jellyfin clients, we hope you'll find Streamyfin to be a useful addition to your media streaming toolbox.

<div style="display: flex; flex-direction: row; gap: 8px">
  <img width=150 src="./assets/images/screenshots/screenshot1.png" />
  <img width=150 src="./assets/images/screenshots/screenshot3.png" />
  <img width=150 src="./assets/images/screenshots/screenshot2.png" />
  <img width=159 src="./assets/images/jellyseerr.PNG"/>
</div>

## 🌟 Features

- 🚀 **Skip Intro / Credits Support**
- 🖼️ **Trickplay images**: The new golden standard for chapter previews when seeking.
- 📥 **Download media** (Experimental): Save your media locally and watch it offline.
- 📡 **Chromecast** (Experimental): Cast your media to any Chromecast-enabled device.
- 📡 **Settings management** (Experimental): Manage app settings for all your users with a JF plugin.
- 🤖 **Jellyseerr integration**: Request media directly in the app.
- 👁️ **Sessions View:** View all active sessions currently streaming on your server.

## 🧪 Experimental Features

Streamyfin includes some exciting experimental features like media downloading and Chromecast support. These are still in development, and we appreciate your patience and feedback as we work to improve them.

### Downloading

Downloading works by using ffmpeg to convert an HLS stream into a video file on the device. This means that you can download and view any file you can stream! The file is converted by Jellyfin on the server in real time as it is downloaded. This means a **bit longer download times** but supports any file that your server can transcode.

### Chromecast

Chromecast support is still in development, and we're working on improving it. Currently, it supports casting videos, but we're working on adding support for subtitles and other features.

### Streamyfin Plugin

The Jellyfin Plugin for Streamyfin is a plugin you install into Jellyfin that hold all settings for the client Streamyfin. This allows you to syncronize settings accross all your users, like:

- Auto log in to Jellyseerr without the user having to do anythin
- Choose the default languages
- Set download method and search provider
- Customize homescreen
- And more...

[Streamyfin Plugin](https://github.com/streamyfin/jellyfin-plugin-streamyfin)

### Jellysearch

[Jellysearch](https://gitlab.com/DomiStyle/jellysearch) now works with Streamyfin! 🚀

> A fast full-text search proxy for Jellyfin. Integrates seamlessly with most Jellyfin clients.

## Roadmap for V1

Check out our [Roadmap](https://github.com/users/fredrikburmester/projects/5) to see what we're working on next. We are always open for feedback and suggestions, so please let us know if you have any ideas or feature requests.

## Get it now

<div style="display: flex; gap: 5px;">
  <a href="https://apps.apple.com/app/streamyfin/id6593660679?l=en-GB"><img height=50 alt="Get Streamyfin on App Store" src="./assets/Download_on_the_App_Store_Badge.png"/></a>
  <a href="https://play.google.com/store/apps/details?id=com.fredrikburmester.streamyfin"><img height=50 alt="Get the beta on Google Play" src="./assets/Google_Play_Store_badge_EN.svg"/></a>
</div>

Or download the APKs [here on GitHub](https://github.com/streamyfin/streamyfin/releases) for Android.

### Beta testing

To access the Streamyfin beta, you need to subscribe to the Member tier (or higher) on [Patreon](https://www.patreon.com/streamyfin). This will give you immediate access to the ⁠🧪-public-beta channel on Discord and i'll know that you have subscribed. This is where I post APKs and IPAs. This won't give automatic access to the TestFlight, however, so you need to send me a DM with the email you use for Apple so that i can manually add you.

**Note**: Everyone who is actively contributing to the source code of Streamyfin will have automatic access to the betas.

## 🚀 Getting Started

### Prerequisites

- Ensure you have an active Jellyfin server.
- Make sure your device is connected to the same network as your Jellyfin server.

## 🙌 Contributing

We welcome any help to make Streamyfin better. If you'd like to contribute, please fork the repository and submit a pull request. For major changes, it's best to open an issue first to discuss your ideas.

### Development info

1. Use node `>20`
2. Install dependencies `bun i && bun run submodule-reload`
3. Make sure you have xcode and/or android studio installed. (follow the guides for expo: https://docs.expo.dev/workflow/android-studio-emulator/)
4. Install BiomeJS extension in VSCode/Your IDE (https://biomejs.dev/)
4. run `npm run prebuild`
5. Create an expo dev build by running `npm run ios` or `npm run android`. This will open a simulator on your computer and run the app.

For the TV version suffix the npm commands with `:tv`.

`npm run prebuild:tv`  
`npm run ios:tv or npm run android:tv`

## 📄 License

Streamyfin is licensed under the Mozilla Public License 2.0 (MPL-2.0).
This means you are free to use, modify, and distribute this software. The MPL-2.0 is a copyleft license that allows for more flexibility in combining the software with proprietary code.
Key points of the MPL-2.0:

- You can use the software for any purpose
- You can modify the software and distribute modified versions
- You must include the original copyright and license notices
- You must disclose your source code for any modifications to the covered files
- Larger works may combine MPL code with code under other licenses
- MPL-licensed components must remain under the MPL, but the larger work can be under a different license
- For the full text of the license, please see the LICENSE file in this repository.

## 🌐 Connect with Us

Join our Discord: [https://discord.gg/aJvAYeycyY](https://discord.gg/aJvAYeycyY)

If you have questions or need support, feel free to reach out:

- GitHub Issues: Report bugs or request features here.
- Email: [fredrik.burmester@gmail.com](mailto:fredrik.burmester@gmail.com)

## FAQ

1. Q: Why can't I see my libraries in streamyfin?   
   A: Make sure your server is running one of the latest versions and that you have at least one library that isn't audio only.
2. Q: Why can't I see my music library?   
   A: We don't currently support music and are unlikely to support music in the near future.

## 📝 Credits

Streamyfin is developed by [Fredrik Burmester](https://github.com/fredrikburmester) and is not affiliated with Jellyfin. The app is built with Expo, React Native, and other open-source libraries.

## ✨ Acknowledgements

We would like to thank the Jellyfin team for their great software and awesome support on discord.

Special shoutout to the JF official clients for being an inspiration to ours.

### Core Developers

Thanks to the following contributors for their significant contributions:

<table>
  <tr
    style="
      display: flex;
      justify-content: space-around;
      align-items: center;
      flex-wrap: wrap;
    "
  >
    <td align="center">
      <a href="https://github.com/Alexk2309">
        <img src="https://github.com/Alexk2309.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@Alexk2309</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/herrrta">
        <img src="https://github.com/herrrta.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@herrrta</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/lostb1t">
        <img src="https://github.com/lostb1t.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@lostb1t</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Simon-Eklundh">
        <img src="https://github.com/Simon-Eklundh.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@Simon-Eklundh</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/topiga">
        <img src="https://github.com/topiga.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@topiga</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/simoncaron">
        <img src="https://github.com/simoncaron.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@simoncaron</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/jakequade">
        <img src="https://github.com/jakequade.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@jakequade</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Ryan0204">
        <img src="https://github.com/Ryan0204.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@Ryan0204</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/retardgerman">
        <img src="https://github.com/retardgerman.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@retardgerman</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/whoopsi-daisy">
        <img src="https://github.com/whoopsi-daisy.png?size=80" width="80" style="border-radius: 50%;" />
        <br /><sub><b>@whoopsi-daisy</b></sub>
      </a>
    </td>
  </tr>
</table>

And all other developers who have contributed to Streamyfin, thank you for your contributions.

I'd also like to thank the following people and projects for their contributions to Streamyfin:

- [Reiverr](https://github.com/aleksilassila/reiverr) for great help with understanding the Jellyfin API.
- [Jellyfin TS SDK](https://github.com/jellyfin/jellyfin-sdk-typescript) for the TypeScript SDK.
- [Jellyseerr](https://github.com/Fallenbagel/jellyseerr) for enabling API integration with their project.
- The Jellyfin devs for always being helpful in the Discord.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=streamyfin/streamyfin&type=Date)](https://star-history.com/#streamyfin/streamyfin&Date)
