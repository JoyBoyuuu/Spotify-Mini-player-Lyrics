# Spotify Mini Player Lyrics

Synchronized lyrics and optional Traditional Chinese translations directly inside Spotify's native Picture-in-Picture Mini Player.

This is a lightweight [Spicetify](https://spicetify.app/) extension for **Spotify Desktop on Windows**. It follows Spotify's playback position, fetches synchronized lyrics from [LRCLIB](https://lrclib.net/), and displays the previous, current, and next lyric lines inside the native Mini Player.

> [!IMPORTANT]
> **You do not need to keep PowerShell, Terminal, Node.js, or any background script running.**
> After the extension has been installed and applied once, just open Spotify normally. A terminal is only needed for installation, updating the extension, troubleshooting, or re-applying Spicetify after a Spotify update.

## Features

- Synchronized lyrics in Spotify's native Mini Player
- Smooth previous/current/next lyric scrolling
- Full multi-line lyrics without ellipsis truncation
- Seek-aware synchronization
- Automatic song-change detection
- Responsive compact overlay above the playback timeline
- Persistent collapse / expand control
- Two-second pointer-hover fade to reveal covered playback controls
- Animated lyric-search status
- LRCLIB exact lookup with search fallback
- Optional Traditional Chinese translations from NetEase lyric data
- Simplified-to-Traditional Chinese conversion with OpenCC
- Background translation loading without delaying the original lyrics
- Korean, Japanese, Spanish, and mixed-language lyric handling
- Romanized Korean detection and native-script replacement when reliable

---

## Requirements

You need:

- **Windows**
- **Spotify Desktop**
- **Spicetify CLI**
- An internet connection for lyric lookup

You **do not** need Node.js or npm unless you want to modify or build the source code yourself.

If you have never installed Spicetify, follow the official guide first:

- [Spicetify Getting Started](https://spicetify.app/docs/getting-started)

For a fresh Spotify installation, it is a good idea to open Spotify, sign in, and leave it running briefly before installing Spicetify so Spotify can create the files Spicetify needs.

---

# Installation

## 1. Download `miniLyrics.js`

Download this file from the repository:

- [`miniLyrics.js`](./miniLyrics.js)

You only need the generated `miniLyrics.js` file for normal use.

You do **not** need to clone the whole repository.

## 2. Copy it to the Spicetify Extensions folder

Place the file here:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

The final path should look similar to:

```text
C:\Users\YOUR_NAME\AppData\Roaming\spicetify\Extensions\miniLyrics.js
```

You can open the folder directly from PowerShell with:

```powershell
explorer "$env:APPDATA\spicetify\Extensions"
```

If the `Extensions` folder does not exist, create it.

## 3. Enable the extension

Open PowerShell and run:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

This normally only needs to be done **once during installation**.

## 4. Start Spotify normally

Close and reopen Spotify if necessary, play a song, then open Spotify's native Mini Player.

No terminal needs to remain open.

Expected daily usage:

```text
Open Spotify
    ↓
Play a song
    ↓
Open Mini Player
    ↓
Lyrics appear automatically
```

---

# Verify the installation

If you want to confirm that everything was installed correctly, use these checks.

## Check that Spicetify has the extension enabled

```powershell
spicetify config extensions
```

The result should include:

```text
miniLyrics.js
```

## Check that the file exists in the correct folder

```powershell
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

Expected result:

```text
True
```

If both checks are correct, run:

```powershell
spicetify apply
```

Then completely close Spotify and open it again.

---

# Updating Mini Player Lyrics

For normal users, updating is simple:

1. Download the newest `miniLyrics.js`.
2. Replace the existing file in:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

3. Run:

```powershell
spicetify apply
```

4. Reopen Spotify.

If you cloned this repository for development, you can instead rebuild and copy the generated file:

```powershell
npm run verify
Copy-Item ".\miniLyrics.js" "$env:APPDATA\spicetify\Extensions\miniLyrics.js" -Force
spicetify apply
```

`npm run verify` is a **development/build command**. It is not required every time Spotify starts.

---

# After Spotify updates

Spotify updates can overwrite the files modified by Spicetify. If Mini Player Lyrics suddenly disappears after a Spotify update, run:

```powershell
spicetify backup apply
```

Then restart Spotify.

If Spicetify itself also needs an update:

```powershell
spicetify update
```

If the installation is still broken, try a full restore and re-apply:

```powershell
spicetify restore backup apply
```

If a brand-new Spotify version is not yet supported by Spicetify, you may need to wait for Spicetify compatibility to catch up. Check the official Spicetify issue tracker before changing unrelated Mini Player Lyrics settings.

---

# Mini Player controls

Click the `譯` button at the top-left to toggle translations. It is brighter when enabled and dimmer when disabled. The choice is saved across songs and sessions; turning it off skips new translation lookups.

- Click the short line in the top-right of the lyric panel to collapse it.
- Click the compact collapsed control to expand the lyrics again.
- The collapsed state is saved across song changes and Mini Player sessions.
- Keep the pointer over the lyric panel for about two seconds to fade the overlay and reveal controls underneath it.
- Move the pointer outside the lyric panel to restore it immediately.

---

# Optional Traditional Chinese translations

Original synchronized lyrics work without this section.

Traditional Chinese translations are optional and require a small CORS proxy because Spotify's embedded browser cannot directly call the NetEase lyric endpoints used by the extension.

## 1. Deploy your own Cloudflare Worker

This repository includes:

```text
netease-cors-worker.js
```

Create a Cloudflare Worker, copy the contents of that file into the Worker, and deploy it.

Your Worker URL should look similar to:

```text
https://YOUR-WORKER.workers.dev/
```

Use your own Worker deployment rather than another user's Worker URL.

## 2. Enable Spotify Developer Tools

If `Ctrl + Shift + I` does not open Spotify Developer Tools, run:

```powershell
spicetify enable-devtools
```

If necessary, follow it with:

```powershell
spicetify apply
```

Restart Spotify and try:

```text
Ctrl + Shift + I
```

Developer Tools are only needed to configure or inspect the optional translation proxy. They do not need to stay open afterward.

## 3. Save the Worker URL

Open the Spotify Developer Tools Console and run:

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

Replace `YOUR-WORKER` with your actual Worker address.

Then reload Spotify or run:

```powershell
spicetify apply
```

Verify the saved value in the Developer Tools Console:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

It should return your Worker URL.

## Translation behavior

The extension keeps LRCLIB as the canonical synchronized lyric timeline. NetEase is searched asynchronously for matching translated lyrics.

This means:

- Original lyrics can appear before translations.
- Translations may take a few seconds on first playback.
- Successful matches are cached locally.
- Not every song has a usable translation.
- If the match confidence is too low, the extension intentionally keeps the original lyrics instead of showing a likely incorrect translation.

---

# Troubleshooting

## Do I need to open PowerShell every time I use Spotify?

**No.**

If the extension is installed correctly, you should simply open Spotify normally.

PowerShell is only needed when you:

- install the extension for the first time;
- update `miniLyrics.js`;
- re-apply Spicetify after a Spotify update;
- enable Developer Tools;
- troubleshoot the installation.

If lyrics only work after you manually run a command every single time Spotify starts, check the sections below.

---

## Lyrics only work after I run `spicetify apply`

First check whether the extension is permanently enabled:

```powershell
spicetify config extensions
```

Make sure this appears:

```text
miniLyrics.js
```

Then confirm the actual file exists:

```powershell
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

Expected result:

```text
True
```

If either check fails, repeat the installation steps.

If both are correct, run once:

```powershell
spicetify backup apply
```

Then completely close Spotify, including any background Spotify process, and open Spotify normally again.

---

## I have been running `npm run verify` every time

You do not need to do that.

`npm run verify` only rebuilds and checks the generated JavaScript file for development purposes.

Normal users only need the final file:

```text
miniLyrics.js
```

Once it is copied into the Spicetify Extensions directory and enabled, no Node.js process is required.

---

## `miniLyrics.js` is in my Downloads or GitHub folder

That copy is not automatically loaded by Spotify.

The file Spicetify uses must be located here:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

Copy it there, then run:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

---

## The extension is enabled but nothing appears

Run:

```powershell
spicetify config extensions
```

Confirm that `miniLyrics.js` is listed.

Then run:

```powershell
spicetify apply
```

Completely close Spotify and reopen it.

Also make sure you are opening Spotify's **native Mini Player**. The extension does not create a separate standalone desktop window.

---

## An old version of MiniLyrics is still enabled

Spicetify appends extension names instead of replacing the old list automatically.

For example, if this appears:

```text
miniLyricsV18.js
miniLyrics.js
```

both scripts may be loaded at the same time and inject duplicate overlays or conflicting behavior.

Remove the old extension from the config:

```powershell
spicetify config extensions miniLyricsV18.js-
spicetify config extensions miniLyrics.js
spicetify apply
```

Replace `miniLyricsV18.js` with the actual old filename if yours is different.

Check again with:

```powershell
spicetify config extensions
```

Only the version you intend to use should remain enabled.

You can also remove obsolete MiniLyrics files from:

```text
%APPDATA%\spicetify\Extensions\
```

---

## I replaced `miniLyrics.js`, but Spotify still shows the old behavior

Make sure you replaced the copy inside:

```text
%APPDATA%\spicetify\Extensions\miniLyrics.js
```

not only the copy in your cloned repository or Downloads folder.

Then run:

```powershell
spicetify apply
```

and restart Spotify.

If necessary, fully exit Spotify from the system tray or Task Manager before reopening it.

---

## The extension disappeared after a Spotify update

Run:

```powershell
spicetify backup apply
```

If that does not work:

```powershell
spicetify update
spicetify restore backup apply
```

If the newest Spotify client is temporarily unsupported, check Spicetify's official issue tracker.

---

## `spicetify apply` fails after a Spotify update

Do not repeatedly run random repair commands.

Try the official recovery sequence:

```powershell
spicetify backup apply
```

If necessary:

```powershell
spicetify update
```

Then:

```powershell
spicetify restore backup apply
```

If the error started immediately after a new Spotify release, verify that the installed Spotify version is supported by the current Spicetify release.

---

## `spicetify` is not recognized as a command

Spicetify is either not installed correctly or is not available in your shell's PATH.

Install or repair Spicetify using the official instructions:

- [Spicetify Getting Started](https://spicetify.app/docs/getting-started)

After installation, open a **new** PowerShell window and test:

```powershell
spicetify --version
```

---

## Spicetify cannot find Spotify / `prefs`

This is a Spicetify setup problem rather than a Mini Player Lyrics problem.

First open Spotify, sign in, and let it run briefly so its configuration files are created.

Then run:

```powershell
spicetify
```

If Spicetify still reports that it cannot find the Spotify preferences file, follow the official Spicetify FAQ for `prefs_path` troubleshooting:

- [Spicetify FAQ](https://spicetify.app/docs/faq)

---

## Spotify opens but Spicetify customizations are gone

This commonly happens after Spotify updates.

Run:

```powershell
spicetify backup apply
```

Then restart Spotify.

If all Spicetify extensions/themes are missing, fix Spicetify first before debugging Mini Player Lyrics specifically.

---

## I accidentally enabled multiple MiniLyrics files

Check:

```powershell
spicetify config extensions
```

Remove old entries by adding `-` after their filename:

```powershell
spicetify config extensions OLD_FILE_NAME.js-
```

Then make sure the current file is enabled:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

---

## I see two lyric overlays

This almost always means two versions of the extension are enabled at the same time.

Run:

```powershell
spicetify config extensions
```

Remove obsolete MiniLyrics entries and old JavaScript files from the Extensions directory, then apply again.

---

## The Mini Player opens, but there are no synchronized lyrics

When synchronized lyrics are missing or unusable, a centered casual message and a small monochrome pixel cat appear. The message stays stable until the song changes; the cat stays still when reduced motion is enabled. Missing translations alone do not replace available original lyrics with this empty state.

Possible causes:

1. The current track has no synchronized lyric entry in LRCLIB.
2. LRCLIB cannot confidently match the track metadata.
3. Your network cannot reach the lyric provider.
4. The track metadata is unusual, local, unavailable, or unsupported by the upstream lyric source.

Try a well-known commercial track first. If some songs work and others do not, the installation is probably fine and the missing data is upstream.

Availability and timing accuracy depend on the data provided by LRCLIB.

---

## Lyrics appear for one song but not another

That normally indicates a lyric-source availability or matching issue rather than an installation problem.

The extension intentionally avoids displaying a clearly mismatched lyric result.

---

## Lyrics are not changing when I seek or change songs

First update to the latest `miniLyrics.js` from this repository.

Then replace the installed copy and run:

```powershell
spicetify apply
```

Restart Spotify completely.

If the issue persists, open Spotify Developer Tools and look for JavaScript errors while reproducing the problem.

---

## `Ctrl + Shift + I` does not open Spotify Developer Tools

Enable Developer Tools:

```powershell
spicetify enable-devtools
spicetify apply
```

Restart Spotify and try again.

Developer Tools are **not required for normal lyric playback**. They are mainly useful for configuring the optional translation proxy and debugging.

---

## Original lyrics work, but Traditional Chinese translations do not

First verify the configured Worker URL in Spotify Developer Tools:

```javascript
localStorage.getItem("miniLyrics.neteaseProxy");
```

If it returns `null`, `undefined`, or an old address, configure it again:

```javascript
localStorage.setItem(
  "miniLyrics.neteaseProxy",
  "https://YOUR-WORKER.workers.dev/?url="
);
```

Then reload Spotify.

Also check:

- your Cloudflare Worker is deployed;
- the Worker URL is correct;
- the URL ends with `/?url=` as shown above;
- the Worker is reachable from your browser/network;
- the song actually has matching translated lyrics on NetEase.

Original LRCLIB lyrics should still work even if the translation service is unavailable.

---

## Translation appears several seconds later

This can be normal.

The original synchronized lyrics are loaded first. NetEase matching and translation alignment happen asynchronously in the background so translation lookup does not delay the main lyrics.

Repeated playback is usually faster because successful results can be cached locally.

---

## Some lines are translated and others are not

The extension only displays a translation when it can align the translated line to the LRCLIB timeline with sufficient confidence.

Mixed-language songs, alternate lyric versions, live versions, remasters, metadata differences, and different line segmentation can reduce alignment confidence.

This is intentional: keeping the original lyric is better than showing a confidently wrong translation.

---

## Korean romanization was not replaced with Hangul

Native-script replacement is only performed when the match is considered reliable.

If the available timed lyrics do not align confidently with the romanized text, the original line is preserved.

---

## I see `remote-config-resolver`, Marketplace, manifest, or unrelated console errors

Spotify and Spicetify can generate console messages that are unrelated to this extension.

Errors mentioning unrelated Marketplace manifests, other extensions, or Spotify's `remote-config-resolver` do not automatically mean Mini Player Lyrics is broken.

When debugging, first determine whether:

- `miniLyrics.js` is enabled;
- the installed file exists in the correct Extensions directory;
- other MiniLyrics versions are disabled;
- original LRCLIB lyrics work on at least one known track.

---

## Nothing works anymore and I want a clean Spicetify reset

Use Spicetify's restore/reapply flow:

```powershell
spicetify restore backup apply
```

Then verify the extension again:

```powershell
spicetify config extensions
```

If `miniLyrics.js` is missing from the list:

```powershell
spicetify config extensions miniLyrics.js
spicetify apply
```

Before doing a complete Spotify reinstall, confirm whether other Spicetify extensions work. If every Spicetify customization is broken, the root cause is probably the Spicetify/Spotify installation rather than Mini Player Lyrics.

---

# Quick diagnostic checklist

If you are reporting a problem, run these commands first:

```powershell
spicetify --version
spicetify config extensions
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

Then check:

- Does `miniLyrics.js` appear in `spicetify config extensions`?
- Does `Test-Path` return `True`?
- Did the problem start immediately after Spotify updated?
- Do other Spicetify extensions still work?
- Does Mini Player Lyrics work with a different well-known song?
- Are multiple MiniLyrics versions enabled?
- Do original lyrics work while only translations fail?

These answers usually identify whether the problem is:

```text
Spotify / Spicetify installation
        ↓
Extension configuration
        ↓
Wrong or duplicate miniLyrics.js
        ↓
Lyric-provider availability
        ↓
Optional translation proxy
```

---

# Reporting an issue

If the troubleshooting steps above do not solve the problem, open a GitHub issue and include:

- Windows version
- Spotify version
- Spicetify version
- Whether other Spicetify extensions work
- Output of:

```powershell
spicetify config extensions
```

- Whether this returns `True`:

```powershell
Test-Path "$env:APPDATA\spicetify\Extensions\miniLyrics.js"
```

- Whether the problem affects all tracks or only some tracks
- Whether original lyrics work but translations fail
- Any relevant Developer Tools Console error
- The exact steps needed to reproduce the issue

Do not post private account credentials, authentication tokens, or other secrets in an issue.

---

# Language handling

The matching logic supports mixed-language material such as Korean or Japanese lyrics containing English lines and Spanish lyrics with English phrases.

All non-Chinese lyrics, including English songs and foreign-language fragments in Chinese songs, are eligible for Traditional Chinese translation. Chinese-only lines are kept as-is (Japanese kanji lines use the track language as context).

The provider's complete-line translation is preferred. When the provider splits a mixed line into fragments, available translations are joined in order and untranslated English fragments belonging to that line are preserved. Coverage still depends on NetEase; no machine-translation service is added.

For Korean romanization, timed native Korean lyrics from NetEase can be used as alignment evidence. Romanized text is replaced with Hangul only when the match is sufficiently confident.

---

# For developers

Normal users can ignore this section.

The maintainable source is split by responsibility under `src/`. Do not edit the generated root `miniLyrics.js` directly because the next build will replace those edits.

Development requirements:

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

`scripts/build.cjs` combines the ordered source files into the single shared script expected by Spicetify. When adding a source file, register it in the correct position in that build list.

Project structure:

```text
src/                       Maintainable extension source
scripts/build.cjs          Single-file build script
miniLyrics.js              Generated Spicetify extension
netease-cors-worker.js     Optional restricted NetEase CORS proxy
package.json               Build and validation commands
```

---

# Lyrics sources and disclaimer

This project does not bundle or redistribute a lyrics database.

Lyrics are retrieved at runtime from LRCLIB and, when configured, NetEase. Availability and accuracy depend on upstream data and matching quality.

Spotify Mini Player Lyrics is an unofficial community project. It is not affiliated with, endorsed by, or associated with Spotify, Spicetify, LRCLIB, NetEase, Cloudflare, or OpenCC.
