# Spotify Mini Player Lyrics

Synchronized lyrics and optional Traditional Chinese translations directly
inside Spotify's native Picture-in-Picture Mini Player.

This lightweight [Spicetify](https://spicetify.app/) extension retrieves synced
lyrics from [LRCLIB](https://lrclib.net/), follows Spotify's playback position,
and renders the current lyrics over the native Mini Player.

## Features

- Synchronized lyrics in Spotify's native Mini Player
- LRCLIB exact lookup with search fallback
- Smooth previous/current/next lyric scrolling
- Full multi-line lyrics without ellipsis truncation
- Seek-aware synchronization and automatic song-change loading
- Responsive compact overlay positioned above the playback timeline
- Traditional Chinese translations from available NetEase lyric data
- Simplified-to-Traditional Chinese conversion with OpenCC
- Background translation loading without delaying the original lyrics
- Korean, Japanese, Spanish, and mixed-language lyric handling
- Romanized Korean detection and native-script replacement when reliable
- Persistent collapse control inside the lyrics panel
- Two-second pointer-hover fade so covered playback controls remain visible
- Animated searching status

## Requirements

- Spotify Desktop
- [Spicetify](https://spicetify.app/)
- Windows

Original synchronized lyrics work without additional configuration. Traditional
Chinese translations additionally require the optional CORS proxy described
below.

## Installation

1. Download `miniLyrics.js` from this repository.
2. Copy it to:

   ```text
   %APPDATA%\spicetify\Extensions\miniLyrics.js
   ```

3. Enable and apply the extension in PowerShell:

   ```powershell
   spicetify config extensions miniLyrics.js
   spicetify apply
   ```

4. Play a song and open Spotify's native Mini Player.

Spicetify appends extension names instead of replacing older entries. If an old
version such as `miniLyricsV18.js` is enabled, remove it before enabling the
current filename:

```powershell
spicetify config extensions miniLyricsV18.js-
spicetify config extensions miniLyrics.js
spicetify apply
```

Check the active filename with:

```powershell
spicetify config extensions
```

## Updating

From this repository directory, rebuild, copy, and apply the latest version:

```powershell
npm run verify
Copy-Item ".\miniLyrics.js" "$env:APPDATA\spicetify\Extensions\miniLyrics.js" -Force
spicetify apply
```

Only the generated `miniLyrics.js` needs to be copied to Spicetify.

## Mini Player controls

- Click the short line in the top-right of the lyrics panel to collapse it.
- Click the compact collapsed control to expand the lyrics again.
- The collapsed state is saved across song changes and Mini Player sessions.
- Keep the pointer over the lyrics for two seconds to fade the overlay and
  reveal playback controls underneath it.
- Move the pointer outside the lyrics panel to restore the overlay immediately.

## Optional Traditional Chinese translations

Spotify's embedded browser cannot call NetEase lyric endpoints directly because
of CORS restrictions. The included `netease-cors-worker.js` is a restricted
Cloudflare Worker that only accepts the NetEase host and lyric/search paths used
by this extension.

### 1. Deploy the Worker

Create a Cloudflare Worker, copy the contents of `netease-cors-worker.js` into
it, and deploy it. The resulting address should look like:

```text
https://YOUR-WORKER.workers.dev/
```

Use your own Worker deployment rather than another user's URL.

### 2. Configure Spotify

Open Spotify Developer Tools and run:

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

Reload Spotify or run `spicetify apply`. Verify the saved value with:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

### 3. Translation behavior

The extension keeps LRCLIB as the canonical synchronized timeline, searches
NetEase asynchronously, aligns matching translated lines, and converts
Simplified Chinese to Traditional Chinese with OpenCC. Only the current line
shows its translation so the Mini Player remains readable.

Translations may appear a few seconds after the original lyrics on first play.
Song matches and translations are cached locally, so repeated playback is
usually faster. When no sufficiently reliable match is found, the extension
keeps the original lyrics rather than showing a likely incorrect translation.

## Language handling

The matching logic supports mixed-language material such as Korean or Japanese
lyrics containing English lines and Spanish lyrics with English phrases. Pure
English lines are kept in English whenever they can be identified reliably.

For Korean romanization, timed native Korean lyrics from NetEase can be used as
alignment evidence. Romanized text is replaced with Hangul only when the match
is sufficiently confident.

## Development

The maintainable source is split by responsibility under `src/`. Do not edit
the generated root `miniLyrics.js` directly because the next build will replace
those edits.

Requirements:

- Node.js
- npm

Build and validate:

```powershell
npm run verify
```

Build without the syntax check:

```powershell
npm run build
```

`scripts/build.cjs` combines the ordered source files into the single shared
script expected by Spicetify. When adding a source file, register it in the
correct position in that build list.

## Project structure

```text
src/                       Maintainable extension source
scripts/build.cjs          Single-file build script
miniLyrics.js              Generated Spicetify extension
netease-cors-worker.js     Optional restricted NetEase CORS proxy
package.json               Build and validation commands
```

## Troubleshooting

### Changes do not appear

Confirm that Spicetify is loading `miniLyrics.js`, not an older versioned file:

```powershell
spicetify config extensions
```

Then rebuild, copy, and run `spicetify apply` again. Avoid enabling two
MiniLyrics files at the same time because both extensions will inject an
overlay.

### No synchronized lyrics

The selected track may not have synchronized lyrics in LRCLIB. Availability and
timing accuracy depend on the data returned by the provider.

### No Traditional Chinese translation

Confirm that the proxy setting is present and the Worker responds:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

Some tracks do not have matching translated lyrics on NetEase. Original LRCLIB
lyrics should continue working normally. Spotify `remote-config-resolver` and
third-party Marketplace manifest errors are unrelated to MiniLyrics.

## Lyrics sources and disclaimer

This project does not bundle or redistribute a lyrics database. Lyrics are
retrieved at runtime from LRCLIB and, when configured, NetEase. Availability and
accuracy depend on upstream data.

Spotify Mini Player Lyrics is an unofficial community project. It is not
affiliated with, endorsed by, or associated with Spotify, Spicetify, LRCLIB,
NetEase, Cloudflare, or OpenCC.
