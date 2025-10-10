<a href="https://www.buymeacoffee.com/fredrikbur3" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>


<p align="center">
  <img src="https://raw.githubusercontent.com/streamyfin/.github/refs/heads/main/streamyfin-github-banner.png" alt="Streamyfin" width="100%">
</p>

**Streamyfin is a simple, user-friendly Jellyfin video streaming client built with Expo. Designed as an alternative to other Jellyfin clients, it aims to offer a smooth and reliable streaming experience. We hope you'll find it a valuable addition to your media streaming toolbox.**

---

<p align="center">
  <img src="./assets/images/screenshots/screenshot1.png" width="22%">
  &nbsp;
  <img src="./assets/images/screenshots/screenshot3.png" width="22%">
  &nbsp;
  <img src="./assets/images/screenshots/screenshot2.png" width="22%">
  &nbsp;
  <img src="./assets/images/jellyseerr.PNG" width="23%">
</p>


## 🌟 Features

- 🚀 **Skip Intro / Credits Support**
- 🖼️ **Trickplay images**: The new golden standard for chapter previews when seeking
- 📥 **Download media** (Experimental): Save your media locally and watch it offline
- 📡 **Chromecast** (Experimental): Cast your media to any Chromecast-enabled device
- 📡 **Settings management** (Experimental): Manage app settings for all your users with a JF plugin
- 🤖 **Seerr (former Jellyseerr) integration**: Request media directly in the app
- 👁️ **Sessions View:** View all active sessions currently streaming on your server

## 🧪 Experimental Features

Streamyfin offers exciting experimental features such as media downloading and Chromecast support. These features are under active development, and your feedback and patience help us make them even better.

### 📥 Downloading

Downloading works by using ffmpeg to convert an HLS stream into a video file on your device. This allows you to download and watch any content that you can stream. The file is converted by Jellyfin on the server in real time during the download. This may result in slightly longer download times, but it ensures compatibility with any file your server can transcode.

### 🎥 Chromecast

Chromecast support is still in development, and we're working on improving it. Currently, it supports casting videos, but we're working on adding support for subtitles and other features.

### 🧩 Streamyfin Plugin

The Jellyfin Plugin for Streamyfin is a plugin you install into Jellyfin that holds all settings for the client Streamyfin. This allows you to synchronize settings across all your users, like for example:

- Auto log in to Seerr without the user having to do anything
- Choose the default languages
- Set download method and search provider
- Customize home screen
- And much more...

[Streamyfin Plugin](https://github.com/streamyfin/jellyfin-plugin-streamyfin)

### 🔍 Jellysearch

[Jellysearch](https://gitlab.com/DomiStyle/jellysearch) now works with Streamyfin!

> A fast full-text search proxy for Jellyfin. Integrates seamlessly with most Jellyfin clients.

## 🛣️ Roadmap for V1

Check out our [Roadmap](https://github.com/users/fredrikburmester/projects/5) To see what we're working on next, we are always open to feedback and suggestions. Please let us know if you have any ideas or feature requests.

## 📥 Download Streamyfin

<div style="display: flex; gap: 5px;">
  <a href="https://apps.apple.com/app/streamyfin/id6593660679?l=en-GB"><img height=50 alt="Get Streamyfin on App Store" src="./assets/Download_on_the_App_Store_Badge.png"/></a>
  <a href="https://play.google.com/store/apps/details?id=com.fredrikburmester.streamyfin"><img height=50 alt="Get Streamyfin on Google Play Store" src="./assets/Google_Play_Store_badge_EN.svg"/></a>
  <a href="https://github.com/streamyfin/streamyfin/releases/latest"><img height=50 alt="Get Streamyfin on Github" src="./assets/Download_on_Github_.png"/></a>
</div>

### 🧪 Beta testing

To access the Streamyfin beta, you need to subscribe to the Member tier (or higher) on [Patreon](https://www.patreon.com/streamyfin). This will give you immediate access to the ⁠🧪-public-beta channel on Discord and I'll know that you have subscribed. This is where I post APKs and IPAs. This won't give automatic access to the TestFlight, however, so you need to send me a DM with the email you use for Apple so that I can manually add you.

**Note**: Everyone who is actively contributing to the source code of Streamyfin will have automatic access to the betas.

## 🚀 Getting Started

### Prerequisites

- Ensure you have an active Jellyfin server.
- Make sure your device is connected to the same network as your Jellyfin server.

## 🙌 Contributing

We appreciate all contributions that help make Streamyfin better. To get started, fork the repository and submit a pull request. For significant changes or new features, open an issue first to discuss your ideas and ensure alignment with the project.

### 👨‍💻 Development info

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
- For the full text of the license, please see the LICENSE file in this repository

## 🌐 Connect with Us

Join our Discord: [![](https://dcbadge.limes.pink/api/server/https://discord.gg/BuGG9ZNhaE)](https://discord.gg/BuGG9ZNhaE)

Need support or have questions:

- GitHub Issues: Report bugs or request features [here](https://github.com/streamyfin/streamyfin/issues)
- Email: [developer@streamyfin.app](mailto:developer@streamyfin.app)

## ❓ FAQ

1. Q: Why can't I see my libraries in Streamyfin?   
   A: Make sure your server is running one of the latest versions and that you have at least one library that isn't audio only.
2. Q: Why can't I see my music library?   
   A: We don't currently support music and are unlikely to support music in the near future.

## 📝 Credits

Streamyfin is developed by [Fredrik Burmester](https://github.com/fredrikburmester) and is not affiliated with Jellyfin. The app is built with Expo, React Native, and other open-source libraries.

## ✨ Acknowledgements

We would like to thank the Jellyfin team for their great software and awesome support on discord.

Special shoutout to the JF official clients for being an inspiration to ours.

## 🏆 Core Developers

Thanks to the following contributors for their significant contributions:

<div align="left">
<table>
  <tr>
    <td align="center">
      <a href="https://github.com/Alexk2309">
        <img src="https://github.com/Alexk2309.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@Alexk2309</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/herrrta">
        <img src="https://github.com/herrrta.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@herrrta</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/lostb1t">
        <img src="https://github.com/lostb1t.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@lostb1t</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Simon-Eklundh">
        <img src="https://github.com/Simon-Eklundh.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@Simon-Eklundh</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/topiga">
        <img src="https://github.com/topiga.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@topiga</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/lancechant">
        <img src="https://github.com/lancechant.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@lancechant</b></sub>
      </a>
    </td>
  </tr>
  <tr>
    <td align="center">
      <a href="https://github.com/simoncaron">
        <img src="https://github.com/simoncaron.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@simoncaron</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/jakequade">
        <img src="https://github.com/jakequade.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@jakequade</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Ryan0204">
        <img src="https://github.com/Ryan0204.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@Ryan0204</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/retardgerman">
        <img src="https://github.com/retardgerman.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@retardgerman</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/whoopsi-daisy">
        <img src="https://github.com/whoopsi-daisy.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@whoopsi-daisy</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/Gauvino">
        <img src="https://github.com/Gauvino.png?size=55" width="55" style="border-radius: 50%;" />
        <br /><sub><b>@Gauvino</b></sub>
      </a>
    </td>
  </tr>
</table>
</div>

And all other developers who have contributed to Streamyfin, thank you for your contributions.

I'd also like to thank the following people and projects for their contributions to Streamyfin:

- [Reiverr](https://github.com/aleksilassila/reiverr) for great help with understanding the Jellyfin API.
- [Jellyfin TS SDK](https://github.com/jellyfin/jellyfin-sdk-typescript) for the TypeScript SDK.
- [Seerr](https://github.com/seerr-team/seerr) for enabling API integration with their project.
- The Jellyfin developers for always being helpful on Discord.

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=streamyfin/streamyfin&type=Date)](https://star-history.com/#streamyfin/streamyfin&Date)

## ⚠️ Disclaimer
Streamyfin does not promote, support, or condone piracy in any form. The app is intended solely for streaming media that you personally own and control. It does not provide or include any media content. Any discussions or support requests related to piracy are strictly prohibited across all our channels.

## 🤝 Sponsorship
VPS hosting generously provided by [Hexabyte](https://hexabyte.se/en/vps/?currency=eur) and [SweHosting](https://swehosting.se/en/#tj%C3%A4nster)
