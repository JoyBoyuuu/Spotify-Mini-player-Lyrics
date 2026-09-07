# Spotify Mini Player Lyrics

**English version guide** | [繁體中文導覽](./README.zh-TW.md)

Synchronized lyrics and optional Traditional Chinese translations inside Spotify's native Mini Player on Windows.

See the current line and nearby lyrics over the album artwork, with a compact translucent panel that follows playback and seeking.

> **Once installed, just open Spotify and play music.** You can close PowerShell after installation. Normal use does not require Node.js, npm, or a background script.

## Start here

- [Install the extension](#installation)
- [Use the Mini Player controls](#mini-player-controls)
- [Update the extension](#updating)
- [Set up optional translations](#optional-traditional-chinese-translations)
- [Fix a problem](#troubleshooting)
- [Modify the source code](#for-developers)

## Requirements

- Windows and Spotify Desktop
- [Spicetify](https://spicetify.app/docs/getting-started) installed and working
- Internet access for lyric lookup

If you have not installed Spicetify yet, complete its official setup first. Open Spotify and sign in before setting up Spicetify.

Original lyrics work without a translation proxy. Translations require the [optional setup below](#optional-traditional-chinese-translations).

## Installation

### 1. Download the file

Open [miniLyrics.js](./miniLyrics.js), then click **Download raw file** in the file toolbar.

Save it as `miniLyrics.js`. Do not copy the code manually or save the GitHub webpage as HTML.

You only need this one file. You do not need to download or clone the entire repository.

### 2. Put it in the Extensions folder

Press **Win + R**, paste the following path, and press Enter:

```text
%APPDATA%\spicetify\Extensions
```

Copy the downloaded `miniLyrics.js` into that folder. If prompted, replace the existing file.

If the folder does not exist, open `%APPDATA%\spicetify` and create a folder named `Extensions`. If the Spicetify folder itself is missing, finish the Spicetify setup first.

The final filename must be `miniLyrics.js`, not `miniLyrics.js.txt` or `miniLyrics (1).js`. Turn on **File name extensions** in File Explorer if you need to check.

### 3. Enable it

Open PowerShell, paste these commands, and press Enter:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

These commands can run from any folder. Copy only the commands, not a terminal prompt such as `PS C:\...`.

If you previously enabled a versioned file such as `miniLyricsV18.js`, [disable that old entry](#old-behavior-or-two-lyric-overlays) as well.

### 4. Open the Mini Player

Play a song in Spotify and open its native Mini Player using the Mini Player button in Spotify's playback area. If necessary, close and reopen Spotify after applying the extension.

Lyrics appear automatically when a matching synchronized entry is available. You can now close PowerShell.

This extension adds lyrics to Spotify's existing Mini Player; it does not create a separate desktop player.

## Mini Player controls

| Control | What it does |
| --- | --- |
| Short line at the top-right | Collapses the lyrics into a small pill; click the pill to expand again. |
| `譯` at the top-left | Toggles translations. Bright means enabled; dim means disabled. Requires translation setup. |
| Pointer over lyrics for two seconds | Fades the panel so playback controls beneath it are easier to see. |
| Pointer leaving the lyrics | Restores the panel. |

Collapse and translation preferences are remembered across songs and Mini Player sessions.

Lyrics scroll with playback, support multiple lines, and update when you seek. When synchronized lyrics are missing or unusable, a centered casual message and a small monochrome pixel cat appear. The cat stays still if your system requests reduced motion.

## Updating

For normal users:

1. Download the newest [miniLyrics.js](./miniLyrics.js) using **Download raw file**.
2. Replace the copy in `%APPDATA%\spicetify\Extensions`.
3. Run this in PowerShell:

   ```powershell
   spicetify apply
   ```

4. Reopen Spotify if the new behavior does not appear.

You do not need to enable the same filename again or run `npm run verify`. Updating a copy in Downloads alone does not update the copy Spicetify loads.

### After Spotify updates

Spotify updates can remove Spicetify's applied changes. Follow the [recovery steps below](#spicetify-customizations-disappeared-or-apply-fails) if the extension disappears.

## Optional Traditional Chinese translations

Original lyrics come from [LRCLIB](https://lrclib.net/). Translations use existing NetEase lyrics and OpenCC for Traditional Chinese conversion.

All non-Chinese lyrics, including English songs, are eligible. The extension uses the provider's full-line translation when available. For split mixed-language lines, it joins available translations and preserves untranslated English fragments belonging to that line.

This is not a machine-translation service: some songs or lines have no usable translation. Original lyrics remain visible even when translations are unavailable.

### 1. Deploy the included proxy

Spotify cannot request NetEase directly because of browser CORS restrictions. You need a Cloudflare account and your own Cloudflare Worker:

1. Open [netease-cors-worker.js](./netease-cors-worker.js) and copy its complete contents.
2. Create a Worker in Cloudflare's Workers dashboard.
3. Replace the Worker's starter code with that file and deploy it.
4. Copy the deployed HTTPS address, such as `https://YOUR-WORKER.workers.dev/`.

The Worker is a separately deployed service. Do not add it to Spicetify's Extensions folder. It restricts requests to the NetEase host and lyric/search endpoints used by this extension.

### 2. Open Spotify Developer Tools

In PowerShell, run:

```powershell
spicetify enable-devtools
spicetify apply
```

Reopen Spotify if needed, then press **Ctrl + Shift + I** and select the **Console** tab.

### 3. Save your proxy URL

Paste this into the **Spotify Developer Tools Console**, not PowerShell. Replace the example address with your deployed Worker URL and keep `?url=` at the end:

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

Check the saved value in the same Console:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

It should return your full URL, including `?url=`. Reload Spotify and make sure the `譯` button is enabled.

Developer Tools can now be closed. This setup is only needed once, or when your Worker address changes.

Translations load in the background and can appear a few seconds after the original lyrics. Successful matches are cached locally. Only the current lyric line displays its translation.

## Troubleshooting

### Nothing appears

First check the file and enabled extension in PowerShell:

```powershell
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
spicetify config extensions
```

The first command should return `True`; the second should include `miniLyrics.js`.

- If the file is missing, repeat installation step 2.
- If the filename is not enabled, repeat installation step 3.
- If a small collapsed pill is visible, click it to expand the lyrics.
- Confirm that you opened Spotify's native Mini Player.
- If all checks pass, run `spicetify apply`, fully exit Spotify, and reopen it.

You should not need to repeat these steps every time Spotify starts.

### Old behavior or two lyric overlays

Spicetify adds extension names to its list; enabling a new filename does not remove an old one.

Check `spicetify config extensions`. For example, if `miniLyricsV18.js` is also enabled, run:

```powershell
spicetify config extensions miniLyricsV18.js-
spicetify config extensions miniLyrics.js
spicetify apply
```

Replace `miniLyricsV18.js` with your actual old filename. The trailing `-` disables that entry without deleting the file. Keep your other unrelated extensions enabled.

Also confirm you replaced the file in the Extensions folder, not just the copy in Downloads or a development repository.

### Spicetify customizations disappeared or apply fails

If the issue started after a Spotify update, run:

```powershell
spicetify backup apply
```

If your Spicetify version needs updating, use `spicetify upgrade` for script-based installations. If you installed it through a package manager, update it through that package manager.

If it still fails, try:

```powershell
spicetify restore backup apply
```

This restores Spotify's original files and reapplies your configured customizations; it does not erase your extension settings. Restart Spotify afterward.

If a new Spotify release is not yet supported, consult the [Spicetify FAQ](https://spicetify.app/docs/faq) and [issue tracker](https://github.com/spicetify/cli/issues). If every theme and extension is affected, resolve Spicetify compatibility before debugging this extension.

### PowerShell cannot find spicetify, or Spicetify cannot find Spotify

- **Command not recognized:** complete the [Spicetify installation](https://spicetify.app/docs/getting-started), open a new PowerShell window, and try `spicetify --version`.
- **Spotify or prefs file not found:** open Spotify, sign in, then follow the official [prefs-path troubleshooting](https://spicetify.app/docs/faq).

### Some songs have no lyrics or incorrect timing

Availability depends on LRCLIB and the track metadata. Live versions, remasters, and alternate recordings may not match the available lyrics.

Try another track. If others work, the extension is installed correctly and the problem may be specific to that song.

If lyrics stop following seeking or song changes, update the extension and restart Spotify. Report the track and reproduction steps if it persists.

### Original lyrics work but translations do not

Check these in order:

1. **Is `譯` enabled?** Click it if it is dim. The disabled state is remembered across songs.
2. **Is the proxy configured?** In Spotify's Developer Tools Console, run `localStorage.getItem("miniLyrics.neteaseProxy")`. If it returns `null` or an old URL, repeat the translation setup.
3. **Is your Worker deployed and reachable?** Use the exact configured URL, including `?url=`.
4. **Does the song have translated lyrics?** NetEase may lack a usable match. Try another song.

Opening the bare Worker address without a `url` parameter may return a missing-URL error; that alone does not mean deployment failed.

Delayed or partial translations can be normal. Different line segmentation or recording versions can prevent reliable alignment. Korean romanization is replaced with native text only when alignment is sufficiently confident.

### Console shows unrelated errors

Spotify, Marketplace, and other extensions can produce their own errors. Messages about `remote-config-resolver` or unrelated manifests do not by themselves identify a Mini Player Lyrics issue. Look for `[MiniLyrics]` messages when reporting a problem.

## Reporting an issue

Open an [issue](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics/issues) with:

- Windows, Spotify, and Spicetify versions
- The affected song and whether other songs work
- Whether original lyrics or only translations fail
- Whether other Spicetify extensions work
- Steps to reproduce, plus relevant `[MiniLyrics]` errors

Include the output of these PowerShell checks:

```powershell
spicetify --version
spicetify config extensions
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

Do not include passwords, authentication tokens, or other private credentials.

## For developers

Normal users can skip this section. Development requires Node.js and npm.

Edit files under `src/`. The root `miniLyrics.js` is generated and will be overwritten by the next build.

From the repository folder:

```powershell
npm run verify
node scripts/test-translation-policy.cjs
```

The first command builds the extension and checks its JavaScript syntax. The second runs translation-policy regression checks; these do not replace testing the UI in Spotify.

To install your local build:

```powershell
Copy-Item ".\miniLyrics.js" "$env:APPDATA\spicetify\Extensions\miniLyrics.js" -Force
spicetify apply
```

| File or folder | Purpose |
| --- | --- |
| `src/` | Maintainable source, including UI, providers, translation, and empty state |
| `scripts/build.cjs` | Ordered source list and single-file build |
| `scripts/test-translation-policy.cjs` | Translation-policy checks |
| `miniLyrics.js` | Generated file installed in Spicetify |
| `netease-cors-worker.js` | Optional proxy, deployed separately to Cloudflare |
| `package.json` | Build commands |

Register new source files in `scripts/build.cjs`. Sources are combined into one shared function scope; they are not independently loaded modules. Use `npm run build` if you only want to rebuild without the syntax check.

## Sources and disclaimer

Lyrics are retrieved at runtime from LRCLIB and, when configured, NetEase. This project does not bundle a lyric database. Availability and accuracy depend on upstream data and matching quality.

Spotify Mini Player Lyrics is an unofficial community project, not affiliated with or endorsed by Spotify, Spicetify, LRCLIB, NetEase, Cloudflare, or OpenCC.
