// Generated entry source: edit files in src/, then run `npm run build`.
(function miniLyrics() {
    if (!window.Spicetify || !Spicetify.Player) {
        setTimeout(miniLyrics, 300);
        return;
    }

    console.log("[MiniLyrics] Extension loaded");
    console.log("[MiniLyrics] Version: NetEase-TW-v19");

    // =========================================================
    // State
    // =========================================================

    let currentTrackUri = null;
    let currentTrack = null;

    let lyricLines = [];
    let currentLineIndex = -1;
    let lastRenderedPiPIndex = null;

    let syncTimer = null;
    let requestId = 0;

    let pipWindow = null;
    let pipDocument = null;
    let pipPollTimer = null;
    let pipHoverTimer = null;
    let pipHoverCleanup = null;

    let displayStatus = "Waiting for lyrics...";

    // NetEase translation state.
    let translationRequestId = 0;
    let openCCConverter = null;
    let openCCLoadPromise = null;

    const PIP_ROOT_ID = "minilyrics-pip-root";
    const PIP_STYLE_ID = "minilyrics-pip-style";
    const PIP_COLLAPSED_STORAGE_KEY =
        "miniLyrics.pipCollapsed";

    // The NetEase APIs do not allow the Spotify webview to call them
    // directly because of CORS. Set this once in Spotify DevTools:
    // localStorage.setItem("miniLyrics.neteaseProxy", "https://YOUR-WORKER.workers.dev/?url=");
    const NETEASE_PROXY_STORAGE_KEY = "miniLyrics.neteaseProxy";
    const NETEASE_TRANSLATION_CACHE_PREFIX = "miniLyrics.neteaseTranslation:v18:";
    const NETEASE_SONG_CACHE_PREFIX = "miniLyrics.neteaseSongMatch:v5:";
    const NETEASE_MIN_MATCH_SCORE = 58;
    const NETEASE_SEARCH_LIMIT = 50;
    const NETEASE_TRANSLATION_TOLERANCE_MS = 1200;
    const LRCLIB_NETEASE_TIME_TOLERANCE_MS = 1800;

    const OPENCC_SCRIPT_URL =
        "https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/full.js";
