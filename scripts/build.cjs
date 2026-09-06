const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src");
const outputPath = path.join(root, "miniLyrics.js");

const sourceFiles = [
    "00-bootstrap-state.js",
    "spotify-player.js",
    "lyrics-lrc-parser.js",
    "lyrics-lrclib.js",
    "netease-text-matching.js",
    "netease-api.js",
    "netease-song-search.js",
    "netease-lyric-parser.js",
    "netease-timeline.js",
    "translation-language.js",
    "translation-alignment.js",
    "translation-cache.js",
    "translation-detection.js",
    "translation-netease-alignment.js",
    "translation-opencc.js",
    "translation-loader.js",
    "pip-styles.js",
    "pip-renderer.js",
    "pip-lifecycle.js",
    "lyrics-synchronizer.js",
    "track-loader.js",
    "startup.js"
];

const missingFiles = sourceFiles.filter(
    fileName => !fs.existsSync(path.join(sourceDir, fileName))
);

if (missingFiles.length) {
    throw new Error(`Missing source files: ${missingFiles.join(", ")}`);
}

const output = sourceFiles
    .map(fileName => fs.readFileSync(path.join(sourceDir, fileName), "utf8").trimEnd())
    .join("\n\n") + "\n";

fs.writeFileSync(outputPath, output, "utf8");
console.log(`Built miniLyrics.js from ${sourceFiles.length} source files.`);
