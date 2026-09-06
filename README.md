# Spotify-Mini-player-Lyrics

Synchronized lyrics and optional Traditional Chinese translations directly inside Spotify's native Mini Player.

**Spotify-Mini-player-Lyrics** is a lightweight [Spicetify](https://spicetify.app/) extension that retrieves synchronized lyrics from [LRCLIB](https://lrclib.net/) and displays them inside Spotify's native Picture-in-Picture Mini Player. When available, existing Chinese translations are retrieved from NetEase Cloud Music and converted to Traditional Chinese with OpenCC.

## Features

- Synchronized lyrics inside Spotify's native Mini Player
- Smooth vertical lyric scrolling animations
- Previous, current, and next lyric display
- Multi-line lyrics with automatic wrapping
- Seek-aware lyric synchronization
- Automatic lyric lookup when changing tracks
- LRCLIB exact lookup with search fallback
- Optional Traditional Chinese translations from NetEase Cloud Music
- Simplified Chinese to Traditional Chinese conversion with OpenCC
- Mixed-language lyric handling
- Korean, Japanese, and Spanish translation support when a matching NetEase translation is available
- Romanized Korean lyric detection and native-script replacement when possible
- Pure English lines are kept in English instead of being translated unnecessarily
- Translation is shown only for the current lyric line to keep the Mini Player uncluttered
- More transparent subtitle background for a less intrusive overlay
- Top-right `×` button to hide the lyric overlay without closing Spotify's Mini Player
- No separate lyrics window required

## Requirements

- Spotify Desktop
- [Spicetify](https://spicetify.app/)
- Windows

Traditional Chinese translation support additionally requires a small CORS proxy. A ready-to-deploy Cloudflare Worker script is included in this repository as `netease-cors-worker.js`.

## Installation

### 1. Download the extension

Download `miniLyrics.js` from this repository:

[Spotify-Mini-player-Lyrics](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics)

### 2. Copy the extension

Place `miniLyrics.js` in your Spicetify Extensions directory:

```text
%APPDATA%\spicetify\Extensions\
```

For example:

```text
C:\Users\<YourUsername>\AppData\Roaming\spicetify\Extensions\miniLyrics.js
```

### 3. Enable the extension

Open PowerShell and run:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

Spotify will restart automatically.

### 4. Open the Mini Player

Start playing a song and open Spotify's native Mini Player.

If synchronized lyrics are available, they will appear automatically.

At this point, synchronized original lyrics work without any additional translation setup.

## Optional: Traditional Chinese Translation Setup

Spotify's embedded browser cannot directly request NetEase lyric endpoints because of browser CORS restrictions. The repository therefore includes `netease-cors-worker.js`, which can be deployed as a small Cloudflare Worker proxy.

### 1. Deploy the Worker

Create a Cloudflare Worker, copy the contents of:

```text
netease-cors-worker.js
```

into the Worker, and deploy it.

Your deployed address should look similar to:

```text
https://YOUR-WORKER.workers.dev/
```

Do not use another user's Worker URL. Deploy your own instance.

### 2. Configure the extension

Open Spotify Developer Tools and run:

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

Then reload Spotify or run:

```powershell
spicetify apply
```

You can verify the setting in Spotify Developer Tools with:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy")
```

### 3. Translation behavior

When a translated lyric is available, the extension will:

1. Keep LRCLIB as the canonical synchronized lyric timeline.
2. Search NetEase Cloud Music for the matching song.
3. Retrieve existing translated lyric data when available.
4. Align the NetEase lyric lines with the LRCLIB timestamps.
5. Convert Simplified Chinese to Traditional Chinese with OpenCC.
6. Display the Traditional Chinese translation beneath the current lyric line.

Translations may appear a few seconds after the original synchronized lyrics, especially the first time a song is played. This is expected because NetEase search, lyric matching, alignment, and Traditional Chinese conversion run asynchronously.

Previously matched songs and translations are cached locally, so repeated playback is usually faster.

## Updating

Replace the existing:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

with the latest version from this repository.

Then run:

```powershell
spicetify apply
```

If the extension filename changes during local testing, disable the old version before enabling the new one.

## How It Works

The extension reads the currently playing track and playback position through Spicetify.

The synchronized lyric pipeline is:

1. Detect the currently playing song.
2. Retrieve synchronized lyrics from LRCLIB.
3. Parse the LRC timestamps.
4. Match Spotify's playback position to the corresponding lyric line.
5. Inject the lyric overlay into Spotify's native Picture-in-Picture Mini Player.
6. Update the displayed lyrics during playback.
7. Re-synchronize immediately when seeking or changing tracks.

If Traditional Chinese translation is enabled, a second asynchronous pipeline searches NetEase Cloud Music for translated lyric data and safely aligns it to the LRCLIB timeline.

## Lyrics Display

The Mini Player displays the surrounding lyrics with the current line emphasized.

```text
Previous lyric

CURRENT LYRIC
Traditional Chinese translation

Next lyric
```

Only the current line displays its translation. Previous and next lines remain original-only so the Mini Player stays readable.

When the song moves to the next line, the lyrics smoothly scroll upward instead of switching instantly.

Long lyric lines are automatically wrapped instead of being truncated with `...`.

The lyric panel uses a lightweight translucent background. Click the `×` button in the top-right corner of the lyric overlay to hide subtitles while keeping Spotify's Mini Player open. Closing and reopening the Mini Player restores the lyric overlay.

## Language Handling

The translation system is designed for mixed-language songs rather than blindly translating every Latin-script line.

Examples include:

- Korean lyrics mixed with English
- Romanized Korean lyrics mixed with English
- Japanese lyrics
- Spanish lyrics
- Songs where NetEase and LRCLIB split lyric lines differently

Pure English lines are intentionally kept in English whenever they can be identified reliably.

For Korean romanization, the extension can use NetEase's native Korean lyric timing as evidence and replace romanized text with Hangul when alignment is sufficiently confident.

## Lyrics and Translation Sources

Original synchronized lyrics are retrieved from [LRCLIB](https://lrclib.net/).

Existing Chinese translations, when available, are retrieved from NetEase Cloud Music through the optional CORS proxy.

Traditional Chinese conversion is performed with OpenCC.

This project does not include or redistribute a bundled lyrics or translation database.

Availability and synchronization accuracy depend on the data provided by the upstream lyric sources. Some songs may have synchronized lyrics but no translation, incomplete translations, or metadata that cannot be matched safely.

When the extension cannot find a sufficiently reliable translation match, it prefers showing only the original lyrics rather than displaying an incorrect translation.

## Troubleshooting

If original lyrics work but translations do not, check Spotify Developer Tools for MiniLyrics messages such as:

```text
[MiniLyrics] NetEase translation cache hit
[MiniLyrics] NetEase match: ...
[MiniLyrics] Added Traditional Chinese translations to ... lines
```

Also verify that your proxy is configured:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy")
```

If it returns `null`, configure your Worker URL as described above.

Messages related to Spotify `remote-config-resolver` or third-party Spicetify Marketplace manifest errors are unrelated to MiniLyrics.

## Repository

GitHub:

[JoyBoyuuu/Spotify-Mini-player-Lyrics](https://github.com/JoyBoyuuu/Spotify-Mini-player-Lyrics)

## Disclaimer

Spotify-Mini-player-Lyrics is an unofficial community project.

It is not affiliated with, endorsed by, or associated with Spotify, Spicetify, LRCLIB, NetEase Cloud Music, Cloudflare, or OpenCC.
