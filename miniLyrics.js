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
    let translationsEnabled = true;
    try {
        translationsEnabled = localStorage.getItem("miniLyrics.translationsEnabled") !== "false";
    } catch {
        // Keep translations enabled when storage is unavailable.
    }

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
    const NETEASE_TRANSLATION_CACHE_PREFIX = "miniLyrics.neteaseTranslation:v20:";
    const NETEASE_SONG_CACHE_PREFIX = "miniLyrics.neteaseSongMatch:v5:";
    const NETEASE_MIN_MATCH_SCORE = 58;
    const NETEASE_SEARCH_LIMIT = 50;
    const NETEASE_TRANSLATION_TOLERANCE_MS = 1200;
    const LRCLIB_NETEASE_TIME_TOLERANCE_MS = 1800;

    const OPENCC_SCRIPT_URL =
        "https://cdn.jsdelivr.net/npm/opencc-js@1.4.2/dist/umd/full.js";

    // =========================================================
    // Spotify track
    // =========================================================

    function getCurrentTrack() {
        const item = Spicetify.Player.data?.item;

        if (!item) {
            return null;
        }

        const metadata = item.metadata || {};

        const title =
            item.name ||
            metadata.title ||
            "";

        const artist =
            metadata.artist_name ||
            metadata.artist ||
            "";

        const album =
            metadata.album_title ||
            metadata.album_name ||
            "";

        const durationMs =
            Spicetify.Player.getDuration?.() || 0;

        return {
            title,
            artist,
            album,
            durationMs,
            uri: item.uri || ""
        };
    }

    // =========================================================
    // LRC parser
    // =========================================================

    function parseLRC(lrc) {
        if (!lrc) {
            return [];
        }

        const lines = [];
        const rows = lrc.split(/\r?\n/);

        const regex =
            /\[(\d+):(\d+(?:\.\d+)?)\](.*)/;

        for (const row of rows) {
            const match = row.match(regex);

            if (!match) {
                continue;
            }

            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const text = match[3].trim();

            if (!text) {
                continue;
            }

            lines.push({
                timeMs:
                    (minutes * 60 + seconds) * 1000,
                text
            });
        }

        lines.sort(
            (a, b) => a.timeMs - b.timeMs
        );

        return lines;
    }

    // =========================================================
    // LRCLIB
    // =========================================================

    async function getExactLyrics(track) {
        const params = new URLSearchParams();

        params.set(
            "track_name",
            track.title
        );

        params.set(
            "artist_name",
            track.artist
        );

        if (track.album) {
            params.set(
                "album_name",
                track.album
            );
        }

        if (track.durationMs > 0) {
            params.set(
                "duration",
                Math.round(
                    track.durationMs / 1000
                )
            );
        }

        const response = await fetch(
            "https://lrclib.net/api/get?" +
            params.toString()
        );

        if (!response.ok) {
            throw new Error(
                `Exact lookup HTTP ${response.status}`
            );
        }

        return await response.json();
    }

    async function searchLyrics(track) {
        const params = new URLSearchParams();

        params.set(
            "track_name",
            track.title
        );

        params.set(
            "artist_name",
            track.artist
        );

        const response = await fetch(
            "https://lrclib.net/api/search?" +
            params.toString()
        );

        if (!response.ok) {
            throw new Error(
                `Search HTTP ${response.status}`
            );
        }

        const results =
            await response.json();

        if (
            !Array.isArray(results) ||
            !results.length
        ) {
            return null;
        }

        const targetDuration =
            track.durationMs / 1000;

        const candidates = results
            .filter(
                result =>
                    result.syncedLyrics
            )
            .sort((a, b) => {
                const aDuration =
                    typeof a.duration === "number"
                        ? a.duration
                        : targetDuration;

                const bDuration =
                    typeof b.duration === "number"
                        ? b.duration
                        : targetDuration;

                return (
                    Math.abs(
                        aDuration -
                        targetDuration
                    ) -
                    Math.abs(
                        bDuration -
                        targetDuration
                    )
                );
            });

        return candidates[0] || null;
    }

    async function fetchLyrics(track) {
        try {
            const exact =
                await getExactLyrics(track);

            if (exact?.syncedLyrics) {
                return exact;
            }
        } catch (error) {
            console.log(
                "[MiniLyrics] Exact match missed"
            );
        }

        console.log(
            "[MiniLyrics] Trying search fallback"
        );

        return await searchLyrics(track);
    }

    // =========================================================
    // Existing Chinese translation from NetEase + OpenCC
    // =========================================================

    function normalizeMatchText(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFKC")
            .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ")
            .replace(
                /\b(feat|ft|with|remaster|remastered|explicit|version|edit|radio)\b/gi,
                " "
            )
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function compactMatchText(value) {
        return normalizeMatchText(value)
            .replace(/\s+/g, "");
    }

    // v10.1 hotfix: v10 added two deduplication call sites that used
    // normalizeText(), but the actual helper in this extension is
    // normalizeMatchText(). Keep a tiny alias so both code paths share
    // the same normalization logic.
    function normalizeText(value) {
        return normalizeMatchText(value);
    }


    function splitArtists(value) {
        if (Array.isArray(value)) {
            return value
                .map(item =>
                    typeof item === "string"
                        ? item
                        : item?.name
                )
                .filter(Boolean);
        }

        return String(value || "")
            .split(
                /\s*(?:,|;|\/|&|\band\b|、|，| feat\.? | ft\.? | with )\s*/i
            )
            .map(item => item.trim())
            .filter(Boolean);
    }

    function textMatchScore(source, candidate) {
        const a = normalizeMatchText(source);
        const b = normalizeMatchText(candidate);
        const ac = compactMatchText(source);
        const bc = compactMatchText(candidate);

        if (!a || !b) {
            return 0;
        }

        if (a === b || ac === bc) {
            return 1;
        }

        if (
            a.includes(b) ||
            b.includes(a) ||
            ac.includes(bc) ||
            bc.includes(ac)
        ) {
            return 0.82;
        }

        const aTokens =
            new Set(
                a.split(" ").filter(Boolean)
            );

        const bTokens =
            new Set(
                b.split(" ").filter(Boolean)
            );

        if (!aTokens.size || !bTokens.size) {
            return 0;
        }

        let overlap = 0;

        for (const token of aTokens) {
            if (bTokens.has(token)) {
                overlap++;
            }
        }

        return overlap /
            Math.max(
                aTokens.size,
                bTokens.size
            );
    }

    function artistMatchScore(
        sourceArtists,
        candidateArtists
    ) {
        const source =
            splitArtists(sourceArtists);

        const candidate =
            splitArtists(candidateArtists);

        if (!source.length || !candidate.length) {
            return 0;
        }

        let best = 0;

        for (const a of source) {
            for (const b of candidate) {
                best = Math.max(
                    best,
                    textMatchScore(a, b)
                );
            }
        }

        return best;
    }

    function getNeteaseArtists(song) {
        const artists =
            song?.artists ||
            song?.ar ||
            [];

        return artists
            .map(artist => artist?.name)
            .filter(Boolean);
    }

    function getNeteaseAlbum(song) {
        return (
            song?.album?.name ||
            song?.al?.name ||
            ""
        );
    }

    function getNeteaseDuration(song) {
        return Number(
            song?.duration ||
            song?.dt ||
            0
        );
    }

    function getVersionTags(value) {
        const text =
            String(value || "")
                .toLowerCase()
                .normalize("NFKC");

        const tags = new Set();

        const rules = [
            ["live", /\blive\b|ライブ/],
            ["remix", /\bremix\b|リミックス/],
            ["instrumental", /\binstrumental\b|\binst\.?\b|インスト/],
            ["acoustic", /\bacoustic\b|アコースティック/],
            ["sped-up", /\bsped[ -]?up\b/],
            ["slowed", /\bslowed\b/],
            ["remaster", /\bremaster(?:ed)?\b/],
            ["radio-edit", /\bradio edit\b/],
            ["demo", /\bdemo\b/],
            ["karaoke", /\bkaraoke\b|カラオケ/],
            ["cover", /\bcover\b/],
            ["japanese-version", /japanese\s*(?:ver\.?|version)|jp\s*(?:ver\.?|version)/],
            ["korean-version", /korean\s*(?:ver\.?|version)|kr\s*(?:ver\.?|version)/],
            ["english-version", /english\s*(?:ver\.?|version)|eng\s*(?:ver\.?|version)/]
        ];

        for (const [tag, pattern] of rules) {
            if (pattern.test(text)) {
                tags.add(tag);
            }
        }

        return tags;
    }

    function compareVersionTags(sourceTitle, candidateTitle) {
        const source =
            getVersionTags(sourceTitle);

        const candidate =
            getVersionTags(candidateTitle);

        const extra =
            [...candidate].filter(
                tag => !source.has(tag)
            );

        const missing =
            [...source].filter(
                tag => !candidate.has(tag)
            );

        return {
            source: [...source],
            candidate: [...candidate],
            extra,
            missing,
            mismatch:
                extra.length > 0 ||
                missing.length > 0
        };
    }

    function scoreNeteaseSong(track, song) {
        const title =
            textMatchScore(
                track.title,
                song?.name
            );

        const artists =
            artistMatchScore(
                track.artist,
                getNeteaseArtists(song)
            );

        const album =
            textMatchScore(
                track.album,
                getNeteaseAlbum(song)
            );

        let duration = 0;
        let durationDiffMs = null;

        const sourceDuration =
            Number(track.durationMs || 0);

        const candidateDuration =
            getNeteaseDuration(song);

        if (
            sourceDuration > 0 &&
            candidateDuration > 0
        ) {
            durationDiffMs =
                Math.abs(
                    sourceDuration -
                    candidateDuration
                );

            if (durationDiffMs <= 2500) {
                duration = 1;
            } else if (durationDiffMs <= 5000) {
                duration = 0.75;
            } else if (durationDiffMs <= 8000) {
                duration = 0.45;
            } else if (durationDiffMs <= 12000) {
                duration = 0.15;
            }
        }

        const version =
            compareVersionTags(
                track.title,
                song?.name
            );

        let total =
            title * 52 +
            artists * 33 +
            album * 8 +
            duration * 7;

        if (version.extra.length) {
            total -= 34;
        }

        if (version.missing.length) {
            total -= 20;
        }

        if (
            durationDiffMs !== null &&
            durationDiffMs > 12000
        ) {
            total -= 15;
        }

        total =
            Math.max(
                0,
                Math.round(total)
            );

        const durationCompatible =
            durationDiffMs === null ||
            durationDiffMs <= 10000;

        const safe =
            title >= 0.72 &&
            artists >= 0.72 &&
            total >= NETEASE_MIN_MATCH_SCORE &&
            !version.mismatch &&
            durationCompatible;

        /*
         * Relaxed tier is only used after a high-confidence candidate has
         * already failed lyric retrieval. It still hard-rejects explicit
         * version mismatches (remix/live/etc.), and requires a very strong
         * title match plus either artist or near-exact duration evidence.
         */
        const relaxedSafe =
            !version.mismatch &&
            title >= 0.82 &&
            (
                artists >= 0.48 ||
                (
                    title >= 0.95 &&
                    durationDiffMs !== null &&
                    durationDiffMs <= 4500
                )
            ) &&
            (
                durationDiffMs === null ||
                durationDiffMs <= 16000
            ) &&
            total >= 52;

        return {
            total,
            title,
            artists,
            album,
            duration,
            durationDiffMs,
            durationCompatible,
            version,
            safe,
            relaxedSafe
        };
    }

    function getNeteaseProxyUrl() {
        try {
            return String(
                localStorage.getItem(
                    NETEASE_PROXY_STORAGE_KEY
                ) || ""
            ).trim();
        } catch {
            return "";
        }
    }

    function buildNeteaseProxyUrl(targetUrl) {
        const proxy =
            getNeteaseProxyUrl();

        if (!proxy) {
            return "";
        }

        const encoded =
            encodeURIComponent(targetUrl);

        if (proxy.includes("{url}")) {
            return proxy.replace(
                "{url}",
                encoded
            );
        }

        return proxy + encoded;
    }

    async function fetchNeteaseJson(targetUrl) {
        const proxyUrl =
            buildNeteaseProxyUrl(
                targetUrl
            );

        if (!proxyUrl) {
            throw new Error(
                "NetEase proxy is not configured"
            );
        }

        let lastError = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
            const controller =
                new AbortController();

            const timeout =
                setTimeout(
                    () => controller.abort(),
                    10000
                );

            try {
                const response =
                    await fetch(
                        proxyUrl,
                        {
                            signal:
                                controller.signal,
                            cache: "no-cache",
                            headers: {
                                Accept:
                                    "application/json,text/plain,*/*"
                            }
                        }
                    );

                const raw =
                    await response.text();

                if (!response.ok) {
                    throw new Error(
                        `NetEase proxy HTTP ${response.status}: ${raw.slice(0, 160)}`
                    );
                }

                let parsed;

                try {
                    parsed = JSON.parse(raw);
                } catch {
                    throw new Error(
                        `NetEase returned non-JSON: ${raw.slice(0, 160)}`
                    );
                }

                const data =
                    parsed?.data &&
                    typeof parsed.data === "object" &&
                    !parsed.result &&
                    !parsed.lrc
                        ? parsed.data
                        : parsed;

                if (
                    !data ||
                    typeof data !== "object"
                ) {
                    throw new Error(
                        "NetEase returned an empty response"
                    );
                }

                const hasUsablePayload = Boolean(
                    data?.result ||
                    data?.lrc ||
                    data?.yrc ||
                    data?.tlyric ||
                    data?.ytlrc ||
                    data?.romalrc ||
                    data?.yromalrc
                );

                if (
                    data.code &&
                    Number(data.code) !== 200 &&
                    !hasUsablePayload
                ) {
                    throw new Error(
                        `NetEase code ${data.code}${data.message ? `: ${data.message}` : ""}`
                    );
                }

                return data;

            } catch (error) {
                lastError = error;

                if (attempt < 2) {
                    await new Promise(
                        resolve =>
                            setTimeout(resolve, 250)
                    );
                }
            } finally {
                clearTimeout(timeout);
            }
        }

        throw lastError || new Error(
            "NetEase request failed"
        );
    }

    function buildNeteaseUrl(
        path,
        params
    ) {
        const url =
            new URL(
                `https://music.163.com${path}`
            );

        for (
            const [key, value] of
            Object.entries(params || {})
        ) {
            if (
                value !== undefined &&
                value !== null &&
                value !== ""
            ) {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }

        return url.toString();
    }

    function simplifyNeteaseTitle(value) {
        return String(value || "")
            .replace(/\([^)]*(?:feat\.?|ft\.?|with)[^)]*\)/gi, " ")
            .replace(/\[[^\]]*(?:feat\.?|ft\.?|with)[^\]]*\]/gi, " ")
            .replace(/\b(?:feat\.?|ft\.?)\s+.+$/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getPrimaryArtist(value) {
        return String(value || "")
            .split(/\s*(?:,|;|\/|&|、|，|\bfeat\.?\b|\bft\.?\b|\bwith\b)\s*/i)[0]
            .trim();
    }

    function buildNeteaseSearchQueries(track) {
        const cleanTitle =
            simplifyNeteaseTitle(
                track.title
            );

        const primaryArtist =
            getPrimaryArtist(
                track.artist
            );

        /*
         * NetEase search is inconsistent for K-pop naming. A Spotify title
         * such as "New Jeans" may be indexed as "NewJeans", while the artist
         * itself is also "NewJeans". Search several conservative variants
         * instead of assuming one spacing convention.
         */
        const compactTitle =
            cleanTitle
                .replace(/[^\p{L}\p{N}]+/gu, "");

        const compactArtist =
            String(primaryArtist || "")
                .replace(/[^\p{L}\p{N}]+/gu, "");

        const cleanAlbum =
            String(
                track.album || ""
            )
                .replace(
                    /\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g,
                    " "
                )
                .replace(/\s+/g, " ")
                .trim();

        const queries = [
            [track.title, track.artist]
                .filter(Boolean)
                .join(" "),
            [cleanTitle, primaryArtist]
                .filter(Boolean)
                .join(" "),
            [cleanTitle, cleanAlbum, primaryArtist]
                .filter(Boolean)
                .join(" "),
            [cleanTitle, cleanAlbum]
                .filter(Boolean)
                .join(" "),
            [compactTitle, primaryArtist]
                .filter(Boolean)
                .join(" "),
            cleanTitle,
            compactTitle,
            track.title,
            primaryArtist,
            compactArtist,
            track.artist
        ]
            .map(value =>
                String(value || "")
                    .replace(/\s+/g, " ")
                    .trim()
            )
            .filter(Boolean);

        return [...new Set(queries)];
    }

    function getNeteaseSongCacheKey(track) {
        return (
            NETEASE_SONG_CACHE_PREFIX +
            encodeURIComponent(
                track?.uri ||
                `${track?.title || ""}|${track?.artist || ""}`
            )
        );
    }

    function readCachedNeteaseSong(track) {
        try {
            const raw =
                localStorage.getItem(
                    getNeteaseSongCacheKey(
                        track
                    )
                );

            if (!raw) {
                return null;
            }

            const song =
                JSON.parse(raw);

            if (!song?.id) {
                return null;
            }

            /*
             * Re-score cached metadata against the current Spotify track.
             * This prevents an old wrong live/remix match from becoming
             * permanent.
             */
            const score =
                scoreNeteaseSong(
                    track,
                    song
                );

            if (!score.safe) {
                localStorage.removeItem(
                    getNeteaseSongCacheKey(
                        track
                    )
                );
                return null;
            }

            return {
                song,
                score
            };
        } catch {
            return null;
        }
    }

    function writeCachedNeteaseSong(
        track,
        song
    ) {
        if (!song?.id) {
            return;
        }

        try {
            localStorage.setItem(
                getNeteaseSongCacheKey(
                    track
                ),
                JSON.stringify(song)
            );
        } catch {
            // Cache failure is non-fatal.
        }
    }

    function invalidateCachedNeteaseSong(track) {
        try {
            localStorage.removeItem(
                getNeteaseSongCacheKey(
                    track
                )
            );
        } catch {
            // Cache cleanup is non-fatal.
        }
    }

    function getNeteaseSearchSongs(data) {
        const candidates = [
            data?.result?.songs,
            data?.result?.song,
            data?.songs
        ];

        for (const value of candidates) {
            if (Array.isArray(value)) {
                return value;
            }
        }

        return [];
    }

    async function searchNeteaseTrack(
        track,
        excludedSongIds = new Set()
    ) {
        const excluded =
            new Set(
                [...excludedSongIds].map(
                    value => String(value)
                )
            );

        const cached =
            readCachedNeteaseSong(
                track
            );

        if (
            cached &&
            !excluded.has(
                String(cached.song?.id)
            )
        ) {
            console.log(
                "[MiniLyrics] NetEase song-match cache hit:",
                cached.song?.name,
                cached.score
            );

            return cached.song;
        }

        const queries =
            buildNeteaseSearchQueries(
                track
            );

        const endpoints = [
            "/api/cloudsearch/pc",
            "/api/search/get/web"
        ];

        const deduped =
            new Map();

        /*
         * Keep rejected candidates too. This does not make matching looser;
         * it simply gives useful diagnostics when NetEase returns relevant
         * songs that miss one of our safety gates.
         */
        const diagnostics =
            new Map();

        const normalizedTitle =
            normalizeMatchText(
                track.title
            );

        const titleTokens =
            normalizedTitle
                .split(/\s+/)
                .filter(Boolean);

        const ambiguousShortTitle =
            normalizedTitle.length <= 6 ||
            titleTokens.length <= 1;

        let lastError = null;
        let sawAnySongs = false;

        for (const query of queries) {
            for (const endpoint of endpoints) {
                /*
                 * NetEase ranking is especially noisy for very short titles
                 * such as "OMG". Search a second page on cloudsearch in that
                 * case instead of assuming the correct song is in the first
                 * 20/50 results.
                 */
                const offsets =
                    endpoint === "/api/cloudsearch/pc" &&
                    ambiguousShortTitle
                        ? [0, NETEASE_SEARCH_LIMIT]
                        : [0];

                for (const offset of offsets) {
                    const url =
                        buildNeteaseUrl(
                            endpoint,
                            {
                                s: query,
                                type: 1,
                                offset,
                                total: "false",
                                limit:
                                    NETEASE_SEARCH_LIMIT
                            }
                        );

                    try {
                        const data =
                            await fetchNeteaseJson(
                                url
                            );

                        const songs =
                            getNeteaseSearchSongs(
                                data
                            );

                        console.log(
                            `[MiniLyrics] NetEase search "${query}" via ${endpoint} offset=${offset}: ${songs.length} songs`
                        );

                        if (!songs.length) {
                            continue;
                        }

                        sawAnySongs = true;

                        for (const song of songs) {
                            if (
                                !song?.id ||
                                excluded.has(
                                    String(song.id)
                                )
                            ) {
                                continue;
                            }

                            const score =
                                scoreNeteaseSong(
                                    track,
                                    song
                                );

                            const key =
                                String(song.id);

                            const diagnosticPrevious =
                                diagnostics.get(key);

                            if (
                                !diagnosticPrevious ||
                                score.total >
                                    diagnosticPrevious.score.total
                            ) {
                                diagnostics.set(
                                    key,
                                    {
                                        song,
                                        score,
                                        via: endpoint,
                                        query,
                                        offset
                                    }
                                );
                            }

                            if (
                                !score.safe &&
                                !score.relaxedSafe
                            ) {
                                continue;
                            }

                            const previous =
                                deduped.get(key);

                            if (
                                !previous ||
                                score.total >
                                    previous.score.total
                            ) {
                                deduped.set(
                                    key,
                                    {
                                        song,
                                        score,
                                        via: endpoint,
                                        query,
                                        offset
                                    }
                                );
                            }
                        }

                    } catch (error) {
                        lastError = error;

                        console.warn(
                            `[MiniLyrics] NetEase search attempt failed (${endpoint}, ${query}, offset=${offset}):`,
                            error?.message || error
                        );
                    }
                }
            }
        }

        const allRanked =
            [...deduped.values()]
                .sort(
                    (a, b) =>
                        b.score.total -
                        a.score.total
                );

        const strictRanked =
            allRanked.filter(
                item =>
                    item.score.safe
            );

        const relaxedRanked =
            allRanked.filter(
                item =>
                    !item.score.safe &&
                    item.score.relaxedSafe
            );

        let best = null;
        let tier = null;

        if (strictRanked.length) {
            best = strictRanked[0];
            tier = "strict";
        } else if (
            excluded.size > 0 &&
            relaxedRanked.length
        ) {
            best = relaxedRanked[0];
            tier = "relaxed";
        }

        if (best) {
            console.log(
                "[MiniLyrics] NetEase match:",
                best.song?.name,
                best.score,
                `via ${best.via}`,
                `offset=${best.offset}`,
                `tier=${tier}`
            );

            return best.song;
        }

        const diagnosticRanked =
            [...diagnostics.values()]
                .sort(
                    (a, b) =>
                        b.score.total -
                        a.score.total
                )
                .slice(0, 10)
                .map(
                    item => ({
                        id:
                            item.song?.id,
                        name:
                            item.song?.name,
                        artists:
                            getNeteaseArtists(
                                item.song
                            ),
                        album:
                            getNeteaseAlbum(
                                item.song
                            ),
                        durationMs:
                            getNeteaseDuration(
                                item.song
                            ),
                        total:
                            item.score.total,
                        title:
                            item.score.title,
                        artistScore:
                            item.score.artists,
                        albumScore:
                            item.score.album,
                        durationDiffMs:
                            item.score.durationDiffMs,
                        version:
                            item.score.version,
                        safe:
                            item.score.safe,
                        relaxedSafe:
                            item.score.relaxedSafe,
                        query:
                            item.query,
                        offset:
                            item.offset
                    })
                );

        if (diagnosticRanked.length) {
            console.log(
                "[MiniLyrics] NetEase candidate diagnostics:",
                diagnosticRanked
            );
        }

        if (
            lastError &&
            !sawAnySongs
        ) {
            throw lastError;
        }

        console.log(
            "[MiniLyrics] NetEase: no safe track match",
            {
                excluded:
                    [...excluded],
                sawAnySongs,
                ambiguousShortTitle,
                queries
            }
        );

        return null;
    }

    function inspectNeteaseLyricPayload(data) {
        const payload =
            data?.data &&
            typeof data.data === "object"
                ? data.data
                : data;

        const lrcLines =
            parseTimedLRC(
                payload?.lrc?.lyric || ""
            );

        const yrcLines =
            parseTimedYRC(
                payload?.yrc?.lyric || ""
            );

        const translatedLines =
            parseBestTimedLyrics(
                payload?.ytlrc?.lyric ||
                payload?.tlyric?.lyric ||
                ""
            );

        const romanizedLines =
            parseBestTimedLyrics(
                payload?.yromalrc?.lyric ||
                payload?.romalrc?.lyric ||
                ""
            );

        const rawLengths = {
            lrc:
                String(
                    payload?.lrc?.lyric || ""
                ).length,
            yrc:
                String(
                    payload?.yrc?.lyric || ""
                ).length,
            tlyric:
                String(
                    payload?.tlyric?.lyric || ""
                ).length,
            ytlrc:
                String(
                    payload?.ytlrc?.lyric || ""
                ).length,
            romalrc:
                String(
                    payload?.romalrc?.lyric || ""
                ).length,
            yromalrc:
                String(
                    payload?.yromalrc?.lyric || ""
                ).length
        };

        const score =
            Math.max(
                lrcLines.length,
                yrcLines.length
            ) * 4 +
            translatedLines.length * 3 +
            romanizedLines.length * 2;

        return {
            payload,
            lrcLines,
            yrcLines,
            translatedLines,
            romanizedLines,
            rawLengths,
            score
        };
    }

    async function fetchNeteaseLyrics(songId) {
        const requests = [
            {
                label:
                    "/api/song/lyric/v1 (-1)",
                url:
                    buildNeteaseUrl(
                        "/api/song/lyric/v1",
                        {
                            id: songId,
                            cp: "false",
                            lv: -1,
                            tv: -1,
                            rv: -1,
                            kv: -1,
                            yv: -1,
                            ytv: -1,
                            yrv: -1
                        }
                    )
            },
            {
                label:
                    "/api/song/lyric (-1)",
                url:
                    buildNeteaseUrl(
                        "/api/song/lyric",
                        {
                            id: songId,
                            lv: -1,
                            kv: -1,
                            tv: -1,
                            rv: -1,
                            yv: -1
                        }
                    )
            },
            {
                label:
                    "/api/song/lyric/v1 (legacy 0)",
                url:
                    buildNeteaseUrl(
                        "/api/song/lyric/v1",
                        {
                            id: songId,
                            cp: "false",
                            lv: 0,
                            tv: 0,
                            rv: 0,
                            kv: 0,
                            yv: 0,
                            ytv: 0,
                            yrv: 0
                        }
                    )
            }
        ];

        let best = null;
        let lastError = null;

        for (const request of requests) {
            try {
                const data =
                    await fetchNeteaseJson(
                        request.url
                    );

                const inspected =
                    inspectNeteaseLyricPayload(
                        data
                    );

                console.log(
                    `[MiniLyrics] NetEase lyric response ${request.label}:`,
                    {
                        parsed: {
                            lrc:
                                inspected.lrcLines.length,
                            yrc:
                                inspected.yrcLines.length,
                            translated:
                                inspected.translatedLines.length,
                            romanized:
                                inspected.romanizedLines.length
                        },
                        rawLengths:
                            inspected.rawLengths,
                        score:
                            inspected.score
                    }
                );

                if (
                    !best ||
                    inspected.score >
                        best.inspected.score
                ) {
                    best = {
                        label:
                            request.label,
                        inspected
                    };
                }

                if (
                    (
                        inspected.lrcLines.length ||
                        inspected.yrcLines.length
                    ) &&
                    (
                        inspected.translatedLines.length ||
                        inspected.romanizedLines.length
                    )
                ) {
                    break;
                }

            } catch (error) {
                lastError = error;

                console.warn(
                    `[MiniLyrics] NetEase lyric request failed ${request.label}:`,
                    error?.message || error
                );
            }
        }

        if (
            best &&
            best.inspected.score > 0
        ) {
            console.log(
                "[MiniLyrics] NetEase lyric response selected:",
                best.label
            );

            return best.inspected.payload;
        }

        throw (
            lastError ||
            new Error(
                "NetEase lyric response has no parseable timed lyric fields"
            )
        );
    }

    function parseTimedLRC(raw) {
        const lines = [];

        String(raw || "")
            .split(/\r?\n/)
            .forEach(row => {
                const timestamps = [
                    ...row.matchAll(
                        /\[(\d{1,2}:\d{2}(?:[.:]\d{1,3})?)\]/g
                    )
                ];

                if (!timestamps.length) {
                    return;
                }

                const text =
                    row
                        .replace(/\[[^\]]+\]/g, "")
                        .trim();

                if (!text) {
                    return;
                }

                for (const match of timestamps) {
                    const parts =
                        match[1].match(
                            /^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/
                        );

                    if (!parts) {
                        continue;
                    }

                    const minutes =
                        Number(parts[1]);

                    const seconds =
                        Number(parts[2]);

                    const fraction =
                        String(parts[3] || "0")
                            .padEnd(3, "0")
                            .slice(0, 3);

                    lines.push({
                        timeMs:
                            minutes * 60000 +
                            seconds * 1000 +
                            Number(fraction),
                        text
                    });
                }
            });

        return lines.sort(
            (a, b) =>
                a.timeMs - b.timeMs
        );
    }


    /*
     * NetEase's newer lyric payload may store the real native-script lyric
     * only in `yrc` (word-by-word lyric) while `lrc` is empty or incomplete.
     *
     * Typical YRC line:
     * [16210,3460](16210,670,0)还(16880,410,0)没...
     *
     * We only need the line start time and reconstructed text because the
     * MiniLyrics renderer is line-synced, not word-synced.
     */
    function parseTimedYRC(raw) {
        const lines = [];
        const value = String(raw || "");

        for (const rowRaw of value.split(/\r?\n/)) {
            const row = rowRaw.trim();

            if (!row) {
                continue;
            }

            // New YRC payloads may include JSON metadata rows.
            if (
                row.startsWith("{") &&
                row.endsWith("}")
            ) {
                continue;
            }

            const match =
                row.match(
                    /^\[(\d+),(\d+)\](.*)$/
                );

            if (!match) {
                continue;
            }

            const timeMs =
                Number(match[1]);

            if (!Number.isFinite(timeMs)) {
                continue;
            }

            const text =
                String(match[3] || "")
                    .replace(
                        /\(\d+,\d+,\d+\)/g,
                        ""
                    )
                    .replace(/\u200b/g, "")
                    .trim();

            if (!text) {
                continue;
            }

            lines.push({
                timeMs,
                text
            });
        }

        /*
         * Some responses expose an LRC-like value under a YRC-named field.
         * Accept that shape as a fallback instead of treating it as empty.
         */
        if (!lines.length) {
            return parseTimedLRC(value);
        }

        return lines.sort(
            (a, b) =>
                a.timeMs - b.timeMs
        );
    }

    function parseBestTimedLyrics(raw) {
        const lrcLines =
            parseTimedLRC(raw);

        if (lrcLines.length) {
            return lrcLines;
        }

        return parseTimedYRC(raw);
    }

    function chooseNeteaseOriginalLines(data) {
        const lrcLines =
            parseTimedLRC(
                data?.lrc?.lyric || ""
            );

        const yrcLines =
            parseTimedYRC(
                data?.yrc?.lyric || ""
            );

        const lrcLanguage =
            detectLyricsLanguage(
                lrcLines
            );

        const yrcLanguage =
            detectLyricsLanguage(
                yrcLines
            );

        /*
         * Prefer YRC when it clearly exposes Korean/Japanese native script
         * that the ordinary LRC does not. This is exactly the case that made
         * v6 misclassify some romanized K-pop tracks as "unknown".
         */
        if (
            yrcLines.length &&
            (
                !lrcLines.length ||
                lrcLanguage === "unknown" ||
                (
                    (
                        yrcLanguage === "ko" ||
                        yrcLanguage === "ja"
                    ) &&
                    lrcLanguage !== yrcLanguage
                )
            )
        ) {
            return {
                lines: yrcLines,
                language: yrcLanguage,
                source: "yrc",
                lrcLines,
                yrcLines
            };
        }

        if (lrcLines.length) {
            return {
                lines: lrcLines,
                language: lrcLanguage,
                source: "lrc",
                lrcLines,
                yrcLines
            };
        }

        if (yrcLines.length) {
            return {
                lines: yrcLines,
                language: yrcLanguage,
                source: "yrc",
                lrcLines,
                yrcLines
            };
        }

        return {
            lines: [],
            language: "unknown",
            source: "none",
            lrcLines,
            yrcLines
        };
    }

    function countLyricRows(raw, parser = parseBestTimedLyrics) {
        try {
            return parser(raw || "").length;
        } catch {
            return 0;
        }
    }

    function getLocalLineTolerance(
        lines,
        index,
        minMs = 520,
        maxMs = 1500
    ) {
        const current =
            lines?.[index];

        if (!current) {
            return maxMs;
        }

        const previous =
            lines[index - 1];

        const next =
            lines[index + 1];

        const gaps = [];

        if (previous) {
            gaps.push(
                Math.max(
                    0,
                    current.timeMs -
                    previous.timeMs
                )
            );
        }

        if (next) {
            gaps.push(
                Math.max(
                    0,
                    next.timeMs -
                    current.timeMs
                )
            );
        }

        const localGap =
            gaps.length
                ? Math.min(...gaps)
                : maxMs * 2;

        return Math.max(
            minMs,
            Math.min(
                maxMs,
                localGap * 0.46
            )
        );
    }

    function nearestLineIndexByTime(
        lines,
        timeMs
    ) {
        let bestIndex = -1;
        let bestDiff = Infinity;

        for (
            let i = 0;
            i < (lines || []).length;
            i++
        ) {
            const diff =
                Math.abs(
                    lines[i].timeMs -
                    timeMs
                );

            if (diff < bestDiff) {
                bestDiff = diff;
                bestIndex = i;
            }
        }

        return {
            index: bestIndex,
            diff: bestDiff
        };
    }

    function estimateTimelineOffset(
        referenceLines,
        movingLines
    ) {
        if (
            !referenceLines?.length ||
            !movingLines?.length
        ) {
            return 0;
        }

        const offsets = [];

        for (
            const moving of
            movingLines
        ) {
            const nearest =
                nearestLineIndexByTime(
                    referenceLines,
                    moving.timeMs
                );

            if (
                nearest.index >= 0 &&
                nearest.diff <= 2200
            ) {
                offsets.push(
                    moving.timeMs -
                    referenceLines[
                        nearest.index
                    ].timeMs
                );
            }
        }

        if (offsets.length < 3) {
            return 0;
        }

        const median =
            medianNumber(offsets);

        const inliers =
            offsets.filter(
                value =>
                    Math.abs(
                        value - median
                    ) <= 650
            );

        if (
            inliers.length <
            Math.max(
                3,
                Math.floor(
                    offsets.length * 0.35
                )
            )
        ) {
            return 0;
        }

        return Math.round(
            medianNumber(inliers)
        );
    }

    function mergeNeteaseTranslation(
        originalLines,
        translatedLines
    ) {
        if (
            !translatedLines.length
        ) {
            return [];
        }

        if (!originalLines.length) {
            return translatedLines.map(
                line => ({
                    timeMs:
                        line.timeMs,
                    text: "",
                    translation:
                        line.text
                })
            );
        }

        const offsetMs =
            estimateTimelineOffset(
                originalLines,
                translatedLines
            );

        const groups =
            originalLines.map(
                () => []
            );

        let assigned = 0;

        for (
            const translated of
            translatedLines
        ) {
            const correctedTime =
                translated.timeMs -
                offsetMs;

            const nearest =
                nearestLineIndexByTime(
                    originalLines,
                    correctedTime
                );

            if (nearest.index < 0) {
                continue;
            }

            const tolerance =
                getLocalLineTolerance(
                    originalLines,
                    nearest.index,
                    520,
                    NETEASE_TRANSLATION_TOLERANCE_MS
                );

            if (
                nearest.diff >
                tolerance
            ) {
                continue;
            }

            groups[
                nearest.index
            ].push(translated);

            assigned++;
        }

        let joined = 0;
        let originalsWithTranslation = 0;

        const merged =
            originalLines.map(
                (line, index) => {
                    const pieces = [];
                    const seen = new Set();

                    for (
                        const translated of
                        groups[index]
                    ) {
                        const value =
                            String(
                                translated?.text || ""
                            ).trim();

                        if (!value) {
                            continue;
                        }

                        const key =
                            normalizeText(value);

                        if (
                            !key ||
                            seen.has(key)
                        ) {
                            continue;
                        }

                        seen.add(key);
                        pieces.push(value);
                    }

                    if (pieces.length) {
                        originalsWithTranslation++;
                    }

                    if (pieces.length > 1) {
                        joined++;
                    }

                    return {
                        timeMs:
                            line.timeMs,
                        text:
                            line.text,
                        translation:
                            pieces.join(" ")
                    };
                }
            );

        console.log(
            "[MiniLyrics] NetEase original/translation pairing:",
            {
                offsetMs,
                original:
                    originalLines.length,
                translated:
                    translatedLines.length,
                assigned,
                originalsWithTranslation,
                joined
            }
        );

        return merged;
    }

    function detectLyricsLanguage(lines) {
        const text =
            lines
                .map(line => line.text || "")
                .join(" ")
                .normalize("NFKC");

        if (!text.trim()) {
            return "unknown";
        }

        if (/[\uac00-\ud7af]/.test(text)) {
            return "ko";
        }

        if (/[\u3040-\u30ff]/.test(text)) {
            return "ja";
        }

        const hanCount =
            (text.match(/[\u3400-\u9fff]/g) || [])
                .length;

        const latinCount =
            (text.match(/[A-Za-zÀ-ÿ]/g) || [])
                .length;

        if (
            hanCount >= 8 &&
            hanCount > latinCount * 0.45
        ) {
            return "zh";
        }

        const words =
            text
                .toLowerCase()
                .replace(/[^a-zà-ÿ'’]+/g, " ")
                .split(/\s+/)
                .filter(Boolean);

        if (!words.length) {
            return "other";
        }

        const englishWords =
            new Set([
                "the", "and", "you", "i", "to", "a", "of", "in",
                "my", "me", "your", "is", "it", "for", "on", "that",
                "we", "be", "with", "this", "love", "know", "want",
                "just", "but", "don't", "dont", "i'm", "im", "not",
                "can", "can't", "cant", "all", "so", "when", "what",
                "like", "feel", "never", "let", "go", "baby", "yeah"
            ]);

        const spanishWords =
            new Set([
                "el", "la", "los", "las", "de", "que", "y", "en",
                "un", "una", "por", "para", "con", "no", "me", "te",
                "mi", "tu", "es", "soy", "eres", "quiero", "como",
                "pero", "si", "se", "lo", "le", "del", "al", "porque",
                "cuando", "más", "mas", "ya", "yo", "tú", "esta",
                "está", "todo", "nada", "amor", "quieres", "quiero"
            ]);

        let englishScore = 0;
        let spanishScore = 0;

        for (const word of words) {
            if (englishWords.has(word)) {
                englishScore++;
            }

            if (spanishWords.has(word)) {
                spanishScore++;
            }
        }

        if (/[áéíóúñü¿¡]/i.test(text)) {
            spanishScore += 5;
        }

        if (
            englishScore >= 4 &&
            englishScore >=
                spanishScore * 1.2
        ) {
            return "en";
        }

        if (
            spanishScore >= 3 &&
            spanishScore > englishScore
        ) {
            return "es";
        }

        return "other";
    }

    function shouldProbeNeteaseTranslation(lines) {
        const language =
            detectLyricsLanguage(lines);

        console.log(
            "[MiniLyrics] Detected LRCLIB lyric language:",
            language
        );

        return lines.some(line => lineNeedsChineseTranslation(line.text, language));
    }

    function hasHangul(text) {
        return /[\uac00-\ud7af]/.test(
            String(text || "")
        );
    }

    function hasKana(text) {
        return /[\u3040-\u30ff]/.test(
            String(text || "")
        );
    }

    function isMostlyLatinText(text) {
        const value =
            String(text || "")
                .normalize("NFKC");

        const latin =
            (value.match(/[A-Za-zÀ-ÿ]/g) || [])
                .length;

        const nonLatinLetters =
            (
                value.match(
                    /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g
                ) || []
            ).length;

        return (
            latin >= 3 &&
            latin >
                nonLatinLetters * 2
        );
    }

    function hasNativeEastAsianScript(text) {
        return (
            hasHangul(text) ||
            hasKana(text)
        );
    }

    function looksLikeKoreanRomanizationLine(text) {
        const value =
            String(text || "")
                .normalize("NFKC")
                .toLowerCase()
                .replace(/[^a-z' -]+/g, " ")
                .trim();

        if (
            !value ||
            !isMostlyLatinText(value)
        ) {
            return false;
        }

        const words =
            value
                .split(/\s+/)
                .filter(Boolean);

        if (!words.length) {
            return false;
        }

        /*
         * Precision-first Korean romanization detector.
         *
         * This is deliberately language-level rather than song-level:
         * it scores Revised-Romanization-like vowel clusters, consonant
         * patterns, particles and endings. A mixed English/Korean line can
         * therefore be detected even when most characters are Latin.
         */
        const rareClusters = [
            /eo/,
            /eu/,
            /ui/,
            /yeo/,
            /wae/,
            /gye/,
            /ryeo/,
            /myeo/,
            /deu/,
            /tteu/,
            /kk/,
            /tt/,
            /pp/,
            /jj/
        ];

        const commonEndings = [
            /eun$/,
            /neun$/,
            /eul$/,
            /reul$/,
            /eseo$/,
            /euro$/,
            /ro$/,
            /deon$/,
            /myeon$/,
            /geoya$/,
            /goya$/,
            /jullae$/,
            /hae$/,
            /haeyo$/,
            /hada$/,
            /haneun$/,
            /cheoreom$/,
            /boda$/,
            /gama$/,
            /gayo$/,
            /jiman$/,
            /ji$/,
            /kka$/,
            /kkae$/
        ];

        const grammarWords =
            new Set([
                "na", "nae", "nan",
                "neo", "neon", "neodo",
                "naneun", "neoneun",
                "uri", "uril",
                "nuga", "naega", "naege",
                "niga", "nege",
                "nal", "geon",
                "tto", "deo",
                "han", "beon",
                "bwa", "jigeum",
                "sarang", "eolmana",
                "deudieo", "deureobwa",
                "nuneul", "gama",
                "saebyeok", "saenggak",
                "saenggage", "allyeojul",
                "mweo", "mwo"
            ]);

        let score = 0;
        let strongWords = 0;

        for (const word of words) {
            let wordScore = 0;

            const clusterHits =
                rareClusters.filter(
                    pattern =>
                        pattern.test(word)
                ).length;

            if (clusterHits >= 2) {
                wordScore += 2;
            } else if (clusterHits === 1) {
                wordScore += 1;
            }

            if (
                commonEndings.some(
                    pattern =>
                        pattern.test(word)
                )
            ) {
                wordScore += 1.5;
            }

            if (grammarWords.has(word)) {
                wordScore += 1.5;
            }

            /*
             * Long tokens with several RR-like syllables are strong evidence
             * even when embedded in an otherwise English line, e.g.
             * "Euiminhadae" or "Namdeulgwaneun".
             */
            if (
                word.length >= 8 &&
                (
                    clusterHits >= 1 ||
                    /(hada|deul|gwan|saeng|myeon|jull|rye|tteu)/.test(
                        word
                    )
                )
            ) {
                wordScore += 1.5;
            }

            if (wordScore >= 2) {
                strongWords++;
            }

            score += wordScore;
        }

        /*
         * Require either two Korean-looking tokens or one very strong token.
         * This keeps ordinary English lines such as "Maybe you could be the
         * one" from being treated as Korean.
         */
        return (
            strongWords >= 2 ||
            score >= 4 ||
            (
                strongWords >= 1 &&
                score >= 3
            )
        );
    }

    function looksLikeRomanizedKoreanTrack(lines) {
        let strongLines = 0;

        for (const line of lines || []) {
            if (
                looksLikeKoreanRomanizationLine(
                    line?.text
                )
            ) {
                strongLines++;

                if (strongLines >= 2) {
                    return true;
                }
            }
        }

        return false;
    }


    function joinUniqueLyricTexts(lines) {
        const result = [];
        const seen = new Set();

        for (const line of lines || []) {
            const text =
                String(
                    line?.text || ""
                ).trim();

            if (!text) {
                continue;
            }

            const key =
                normalizeText(text);

            if (
                !key ||
                seen.has(key)
            ) {
                continue;
            }

            seen.add(key);
            result.push(text);
        }

        return result.join(" ");
    }

    function getLrclibLineWindow(index) {
        const current =
            lyricLines[index];

        const previous =
            lyricLines[index - 1];

        const next =
            lyricLines[index + 1];

        const previousGap =
            previous
                ? Math.max(
                    0,
                    current.timeMs -
                    previous.timeMs
                )
                : 1600;

        const nextGap =
            next
                ? Math.max(
                    0,
                    next.timeMs -
                    current.timeMs
                )
                : 3200;

        /*
         * Use the LRCLIB line as a time interval, not a single timestamp.
         * This is important when NetEase splits one LRCLIB lyric into two
         * or three shorter native-script lines.
         */
        const start =
            current.timeMs -
            Math.min(
                650,
                previousGap * 0.25
            );

        const end =
            next
                ? next.timeMs -
                    Math.min(
                        180,
                        nextGap * 0.08
                    )
                : current.timeMs + 3600;

        return {
            start,
            end:
                Math.max(
                    start + 500,
                    end
                )
        };
    }

    function medianNumber(values) {
        const sorted =
            (values || [])
                .filter(
                    Number.isFinite
                )
                .sort(
                    (a, b) => a - b
                );

        if (!sorted.length) {
            return 0;
        }

        const middle =
            Math.floor(
                sorted.length / 2
            );

        if (
            sorted.length % 2
        ) {
            return sorted[middle];
        }

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }

    function estimateNeteaseTimeOffset(
        originalLines
    ) {
        const offsets = [];

        for (
            const target of
            lyricLines
        ) {
            const targetNative =
                hasNativeEastAsianScript(
                    target?.text
                );

            if (!targetNative) {
                continue;
            }

            let best = null;
            let bestTextScore = 0;

            for (
                const candidate of
                originalLines || []
            ) {
                if (
                    !hasNativeEastAsianScript(
                        candidate?.text
                    )
                ) {
                    continue;
                }

                const score =
                    textMatchScore(
                        target.text,
                        candidate.text
                    );

                if (
                    score > bestTextScore
                ) {
                    best = candidate;
                    bestTextScore = score;
                }
            }

            if (
                best &&
                bestTextScore >= 0.72
            ) {
                offsets.push(
                    best.timeMs -
                    target.timeMs
                );
            }
        }

        /*
         * A single lyric line can repeat in a chorus, so require at least two
         * anchors before trusting a global offset. Median is robust to one
         * repeated-line mismatch.
         */
        if (offsets.length < 2) {
            return 0;
        }

        const median =
            medianNumber(offsets);

        const inliers =
            offsets.filter(
                value =>
                    Math.abs(
                        value - median
                    ) <= 900
            );

        return (
            inliers.length >= 2
                ? Math.round(
                    medianNumber(inliers)
                )
                : 0
        );
    }

    function candidateSupportsTarget(
        candidateText,
        targetText,
        neteaseLanguage
    ) {
        const candidate =
            String(
                candidateText || ""
            ).trim();

        const target =
            String(
                targetText || ""
            ).trim();

        if (
            !candidate ||
            !target
        ) {
            return false;
        }

        if (
            neteaseLanguage === "ko"
        ) {
            /*
             * Critical precision gate: a Korean/romanized target must not
             * borrow the Chinese translation attached to a neighbouring
             * pure-English NetEase line. This was the source of occasional
             * one-line shifts in v10.1.
             */
            return (
                hasHangul(candidate) ||
                looksLikeKoreanRomanizationLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "ja"
        ) {
            return (
                hasKana(candidate) ||
                hasHan(candidate) ||
                !looksPlainEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "romanized"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    candidate
                ) ||
                !looksPlainEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    candidate
                ) ||
                !looksLikeStrongEnglishLine(
                    candidate
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                candidate
            );
        }

        return true;
    }

    function getNeteaseWindowForLrclib(
        index,
        offsetMs
    ) {
        const window =
            getLrclibLineWindow(index);

        return {
            start:
                window.start +
                offsetMs,
            end:
                window.end +
                offsetMs
        };
    }

    function getNearestLrclibIndex(
        candidateTimeMs,
        offsetMs = 0
    ) {
        if (!lyricLines.length) {
            return {
                index: -1,
                diff: Infinity
            };
        }

        let bestIndex = -1;
        let bestDiff = Infinity;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const expected =
                lyricLines[i].timeMs +
                offsetMs;

            const diff =
                Math.abs(
                    candidateTimeMs -
                    expected
                );

            if (diff < bestDiff) {
                bestDiff = diff;
                bestIndex = i;
            }
        }

        return {
            index: bestIndex,
            diff: bestDiff
        };
    }

    function getAdaptiveAssignmentTolerance(
        index
    ) {
        const current =
            lyricLines[index];

        if (!current) {
            return 1400;
        }

        const previous =
            lyricLines[index - 1];

        const next =
            lyricLines[index + 1];

        const gaps = [];

        if (previous) {
            gaps.push(
                Math.max(
                    0,
                    current.timeMs -
                    previous.timeMs
                )
            );
        }

        if (next) {
            gaps.push(
                Math.max(
                    0,
                    next.timeMs -
                    current.timeMs
                )
            );
        }

        const localGap =
            gaps.length
                ? Math.min(...gaps)
                : 2800;

        /*
         * Close lyric lines need a tighter gate; sparse lyric regions may
         * safely use a wider tolerance. Clamp to avoid absurd matches.
         */
        return Math.max(
            650,
            Math.min(
                1650,
                localGap * 0.48
            )
        );
    }

    function assignNeteaseLinesToLrclib(
        candidates,
        offsetMs = 0
    ) {
        const groups =
            lyricLines.map(
                () => []
            );

        for (
            const candidate of
            candidates || []
        ) {
            if (
                !candidate ||
                !Number.isFinite(
                    candidate.timeMs
                )
            ) {
                continue;
            }

            const nearest =
                getNearestLrclibIndex(
                    candidate.timeMs,
                    offsetMs
                );

            if (
                nearest.index < 0
            ) {
                continue;
            }

            const tolerance =
                getAdaptiveAssignmentTolerance(
                    nearest.index
                );

            if (
                nearest.diff >
                tolerance
            ) {
                continue;
            }

            groups[
                nearest.index
            ].push({
                ...candidate,
                __assignmentDiff:
                    nearest.diff
            });
        }

        for (const group of groups) {
            group.sort(
                (a, b) =>
                    a.timeMs -
                    b.timeMs
            );
        }

        return groups;
    }

    function isNetEaseCandidateNativeForLanguage(
        text,
        neteaseLanguage
    ) {
        const value =
            String(
                text || ""
            ).trim();

        if (!value) {
            return false;
        }

        if (
            neteaseLanguage === "ko"
        ) {
            return (
                hasHangul(value) ||
                looksLikeKoreanRomanizationLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "ja"
        ) {
            return (
                hasKana(value) ||
                hasHan(value)
            );
        }

        if (
            neteaseLanguage === "romanized"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    value
                ) ||
                !looksLikeStrongEnglishLine(
                    value
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                value
            );
        }

        return false;
    }

    function getBestEnglishMatchScore(
        targetText,
        candidates
    ) {
        let best = 0;

        for (
            const candidate of
            candidates || []
        ) {
            const text =
                String(
                    candidate?.text || ""
                ).trim();

            if (
                !text ||
                !looksPlainEnglishLine(
                    text
                )
            ) {
                continue;
            }

            best =
                Math.max(
                    best,
                    textMatchScore(
                        targetText,
                        text
                    )
                );
        }

        return best;
    }

    function shouldTreatTargetAsForeignByAssignment(
        target,
        group,
        neteaseLanguage
    ) {
        const targetText =
            String(
                target?.text || ""
            ).trim();

        if (!targetText) {
            return false;
        }

        if (
            hasHangul(targetText) ||
            hasKana(targetText)
        ) {
            return true;
        }

        if (
            neteaseLanguage === "ko" &&
            looksLikeKoreanRomanizationLine(
                targetText
            )
        ) {
            return true;
        }

        if (
            neteaseLanguage === "ja" &&
            (
                hasHan(targetText) ||
                !looksPlainEnglishLine(
                    targetText
                )
            )
        ) {
            return true;
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    targetText
                ) ||
                !looksLikeStrongEnglishLine(
                    targetText
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                targetText
            );
        }

        const foreignCandidates =
            (group || []).filter(
                candidate =>
                    isNetEaseCandidateNativeForLanguage(
                        candidate.text,
                        neteaseLanguage
                    )
            );

        if (!foreignCandidates.length) {
            return false;
        }

        /*
         * If NetEase has a strong literal English match for this LRCLIB line,
         * then this is genuinely an English segment. Do not let a neighbouring
         * Korean/Japanese candidate force translation onto it.
         */
        const englishMatch =
            getBestEnglishMatchScore(
                targetText,
                group
            );

        if (englishMatch >= 0.62) {
            return false;
        }

        /*
         * Rescue romanization lines the text classifier misses:
         * a very close native-script NetEase line is strong evidence that the
         * LRCLIB Latin text is a romanized foreign lyric rather than English.
         */
        const closestForeignDiff =
            Math.min(
                ...foreignCandidates.map(
                    candidate =>
                        candidate.__assignmentDiff ??
                        Infinity
                )
            );

        return (
            isMostlyLatinText(
                targetText
            ) &&
            closestForeignDiff <= 900
        );
    }

    function candidateIsPlainEnglish(
        candidate
    ) {
        return Boolean(
            candidate?.text &&
            looksPlainEnglishLine(
                candidate.text
            )
        );
    }

    function targetCandidateContainmentScore(
        targetText,
        candidateText
    ) {
        const target =
            normalizeText(
                targetText
            );

        const candidate =
            normalizeText(
                candidateText
            );

        if (
            !target ||
            !candidate
        ) {
            return 0;
        }

        if (
            target.includes(candidate) ||
            candidate.includes(target)
        ) {
            return (
                Math.min(
                    target.length,
                    candidate.length
                ) /
                Math.max(
                    target.length,
                    candidate.length
                )
            );
        }

        const targetWords =
            new Set(
                target
                    .split(/\s+/)
                    .filter(Boolean)
            );

        const candidateWords =
            candidate
                .split(/\s+/)
                .filter(Boolean);

        if (!candidateWords.length) {
            return 0;
        }

        const overlap =
            candidateWords.filter(
                word =>
                    targetWords.has(word)
            ).length;

        return (
            overlap /
            candidateWords.length
        );
    }

    function groupHasStrongEnglishAnchor(
        targetText,
        group
    ) {
        return (
            (group || []).some(
                candidate =>
                    candidateIsPlainEnglish(
                        candidate
                    ) &&
                    targetCandidateContainmentScore(
                        targetText,
                        candidate.text
                    ) >= 0.55
            )
        );
    }

    function rebalanceMixedForeignGroups(
        groups,
        neteaseLanguage
    ) {
        if (
            neteaseLanguage !== "ko" &&
            neteaseLanguage !== "ja"
        ) {
            return {
                movedFromPrevious: 0,
                movedFromNext: 0
            };
        }

        let movedFromPrevious = 0;
        let movedFromNext = 0;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const target =
                lyricLines[i];

            const targetText =
                String(
                    target?.text || ""
                ).trim();

            if (
                !targetText ||
                !isMostlyLatinText(
                    targetText
                )
            ) {
                continue;
            }

            const looksRomanized =
                neteaseLanguage === "ko"
                    ? looksLikeKoreanRomanizationLine(
                        targetText
                    )
                    : true;

            if (!looksRomanized) {
                continue;
            }

            const current =
                groups[i] || [];

            if (
                !groupHasStrongEnglishAnchor(
                    targetText,
                    current
                )
            ) {
                continue;
            }

            const currentForeign =
                current.filter(
                    candidate =>
                        isNetEaseCandidateNativeForLanguage(
                            candidate.text,
                            neteaseLanguage
                        )
                );

            if (currentForeign.length) {
                continue;
            }

            const currentEnglish =
                current
                    .filter(
                        candidateIsPlainEnglish
                    )
                    .sort(
                        (a, b) =>
                            a.timeMs -
                            b.timeMs
                    );

            if (!currentEnglish.length) {
                continue;
            }

            const anchorTime =
                currentEnglish[0]
                    .timeMs;

            /*
             * Most mixed K-pop/J-pop lines put the foreign fragment before
             * the English fragment. Prefer moving the last extra foreign
             * fragment from the previous group.
             */
            const previous =
                groups[i - 1];

            if (previous?.length) {
                const foreignIndices = [];

                previous.forEach(
                    (candidate, index) => {
                        if (
                            isNetEaseCandidateNativeForLanguage(
                                candidate.text,
                                neteaseLanguage
                            )
                        ) {
                            foreignIndices.push(
                                index
                            );
                        }
                    }
                );

                if (
                    foreignIndices.length >= 2
                ) {
                    const moveIndex =
                        foreignIndices[
                            foreignIndices.length - 1
                        ];

                    const candidate =
                        previous[
                            moveIndex
                        ];

                    if (
                        Math.abs(
                            anchorTime -
                            candidate.timeMs
                        ) <= 1900
                    ) {
                        previous.splice(
                            moveIndex,
                            1
                        );

                        current.unshift(
                            candidate
                        );

                        movedFromPrevious++;
                        continue;
                    }
                }
            }

            /*
             * Less common reverse ordering: English first, foreign fragment
             * immediately after. Pull the first extra native fragment from the
             * next group when it is very close.
             */
            const next =
                groups[i + 1];

            if (next?.length) {
                const foreignIndices = [];

                next.forEach(
                    (candidate, index) => {
                        if (
                            isNetEaseCandidateNativeForLanguage(
                                candidate.text,
                                neteaseLanguage
                            )
                        ) {
                            foreignIndices.push(
                                index
                            );
                        }
                    }
                );

                if (
                    foreignIndices.length >= 2
                ) {
                    const moveIndex =
                        foreignIndices[0];

                    const candidate =
                        next[
                            moveIndex
                        ];

                    if (
                        Math.abs(
                            candidate.timeMs -
                            anchorTime
                        ) <= 1900
                    ) {
                        next.splice(
                            moveIndex,
                            1
                        );

                        current.push(
                            candidate
                        );

                        movedFromNext++;
                    }
                }
            }
        }

        for (const group of groups) {
            group.sort(
                (a, b) =>
                    a.timeMs -
                    b.timeMs
            );
        }

        return {
            movedFromPrevious,
            movedFromNext
        };
    }

    function replaceRomanizedLinesWithNeteaseOriginal(
        originalLines,
        neteaseLanguage,
        frozenOffsetMs = null
    ) {
        if (!originalLines?.length) {
            return 0;
        }

        if (
            neteaseLanguage !== "ko" &&
            neteaseLanguage !== "ja"
        ) {
            return 0;
        }

        const offsetMs =
            Number.isFinite(
                frozenOffsetMs
            )
                ? frozenOffsetMs
                : estimateNeteaseTimeOffset(
                    originalLines
                );

        const groups =
            assignNeteaseLinesToLrclib(
                originalLines,
                offsetMs
            );

        const rebalance =
            rebalanceMixedForeignGroups(
                groups,
                neteaseLanguage
            );

        let replaced = 0;
        let rescuedByAssignment = 0;
        let mixedRebuilt = 0;

        for (
            let i = 0;
            i < lyricLines.length;
            i++
        ) {
            const target =
                lyricLines[i];

            const group =
                groups[i] || [];

            if (!group.length) {
                continue;
            }

            const nativeCandidates =
                group.filter(
                    candidate =>
                        isNetEaseCandidateNativeForLanguage(
                            candidate.text,
                            neteaseLanguage
                        )
                );

            if (!nativeCandidates.length) {
                continue;
            }

            const obviousRomanization =
                neteaseLanguage === "ko"
                    ? looksLikeKoreanRomanizationLine(
                        target.text
                    )
                    : isMostlyLatinText(
                        target.text
                    );

            const assignmentRescue =
                shouldTreatTargetAsForeignByAssignment(
                    target,
                    group,
                    neteaseLanguage
                );

            if (
                !obviousRomanization &&
                !assignmentRescue
            ) {
                continue;
            }

            /*
             * Rebuild from every assigned NetEase original fragment, not only
             * the native-script fragments. This preserves an English fragment
             * in a mixed lyric while replacing the romanized foreign fragment.
             *
             * Example conceptually:
             * LRCLIB: "Got me feeling you, Neodo malhaejullae?"
             * NetEase fragments: "Got me feeling you" + "너도 말해줄래"
             * Result: "Got me feeling you 너도 말해줄래"
             */
            const rebuilt =
                joinUniqueLyricTexts(
                    group
                );

            if (!rebuilt) {
                continue;
            }

            const originalTargetText =
                target.text;

            target.romanizedText =
                originalTargetText;

            target.text =
                rebuilt;

            replaced++;

            if (
                !obviousRomanization &&
                assignmentRescue
            ) {
                rescuedByAssignment++;
            }

            if (
                group.some(
                    candidate =>
                        looksPlainEnglishLine(
                            candidate.text
                        )
                ) &&
                nativeCandidates.length
            ) {
                mixedRebuilt++;
            }
        }

        console.log(
            "[MiniLyrics] Native-script assignment alignment:",
            {
                offsetMs,
                replaced,
                rescuedByAssignment,
                mixedRebuilt,
                movedFromPrevious:
                    rebalance.movedFromPrevious,
                movedFromNext:
                    rebalance.movedFromNext
            }
        );

        if (replaced) {
            lastRenderedPiPIndex =
                null;

            renderPiPLyrics(
                currentLineIndex
            );
        }

        return replaced;
    }

    function getTranslationCacheKey(track) {
        return (
            NETEASE_TRANSLATION_CACHE_PREFIX +
            encodeURIComponent(
                track?.uri ||
                `${track?.title || ""}|${track?.artist || ""}`
            )
        );
    }

    function readCachedTranslations(track) {
        try {
            const key =
                getTranslationCacheKey(
                    track
                );

            const raw =
                localStorage.getItem(
                    key
                );

            if (!raw) {
                return null;
            }

            const parsed =
                JSON.parse(raw);

            if (
                !Array.isArray(parsed) ||
                parsed.length !==
                    lyricLines.length ||
                !parsed.some(Boolean)
            ) {
                return null;
            }

            const language =
                detectLyricsLanguage(
                    lyricLines
                );

            const translatedCount =
                parsed.filter(
                    value =>
                        String(
                            value || ""
                        ).trim()
                ).length;

            const eligibleCount =
                lyricLines.filter(
                    line =>
                        lineNeedsChineseTranslation(
                            line.text,
                            language
                        )
                ).length;

            const minimumUseful =
                (
                    language === "es" ||
                    language === "other"
                )
                    ? Math.max(
                        3,
                        Math.ceil(
                            eligibleCount * 0.12
                        )
                    )
                    : 1;

            if (
                translatedCount <
                minimumUseful
            ) {
                console.log(
                    "[MiniLyrics] Ignoring sparse translation cache:",
                    {
                        language,
                        translatedCount,
                        eligibleCount,
                        minimumUseful
                    }
                );

                localStorage.removeItem(
                    key
                );

                return null;
            }

            console.log(
                "[MiniLyrics] Translation cache coverage:",
                {
                    language,
                    translatedCount,
                    eligibleCount
                }
            );

            return parsed;
        } catch {
            return null;
        }
    }

    function writeCachedTranslations(
        track,
        translations
    ) {
        if (!translations?.some(Boolean)) {
            return;
        }

        try {
            localStorage.setItem(
                getTranslationCacheKey(track),
                JSON.stringify(translations)
            );
        } catch {
            // Cache failure should never stop lyrics.
        }
    }

    function applyTranslationArray(translations) {
        if (!Array.isArray(translations)) {
            return false;
        }

        let changed = false;

        lyricLines.forEach(
            (line, index) => {
                const value =
                    String(
                        translations[index] || ""
                    ).trim();

                if (value) {
                    line.translation = value;
                    changed = true;
                }
            }
        );

        if (changed) {
            lastRenderedPiPIndex = null;
            renderPiPLyrics(
                currentLineIndex
            );

            /*
             * NetEase finishes asynchronously. Re-run once after the PiP
             * document has painted so translations also appear when the
             * current lyric index itself did not change.
             */
            if (pipWindow && pipDocument) {
                requestAnimationFrame(() => {
                    lastRenderedPiPIndex = null;
                    renderPiPLyrics(
                        currentLineIndex
                    );
                });
            }
        }

        return changed;
    }

    function hasHan(text) {
        return /[\u3400-\u9fff]/.test(
            String(text || "")
        );
    }

    function looksPlainEnglishLine(text) {
        const value =
            String(text || "")
                .normalize("NFKC")
                .trim();

        if (!value) {
            return true;
        }

        if (
            hasHangul(value) ||
            hasKana(value) ||
            hasHan(value) ||
            /[áéíóúñü¿¡]/i.test(value)
        ) {
            return false;
        }

        const letters =
            (value.match(/[A-Za-z]/g) || [])
                .length;

        const otherLetters =
            (value.match(/[^\x00-\x7F]/g) || [])
                .length;

        return (
            letters >= 2 &&
            otherLetters === 0
        );
    }

    function getLatinWords(text) {
        return String(text || "")
            .normalize("NFKC")
            .toLowerCase()
            .replace(
                /[^a-záéíóúüñàèìòùç'’]+/gi,
                " "
            )
            .split(/\s+/)
            .map(
                word =>
                    word
                        .replace(
                            /^['’]+|['’]+$/g,
                            ""
                        )
                        .trim()
            )
            .filter(Boolean);
    }

    function looksLikeStrongEnglishLine(text) {
        const value =
            String(text || "")
                .normalize("NFKC")
                .trim();

        if (!value) {
            return false;
        }

        if (
            hasHangul(value) ||
            hasKana(value) ||
            hasHan(value)
        ) {
            return false;
        }

        const words =
            getLatinWords(value);

        if (!words.length) {
            return false;
        }

        const commonEnglish =
            new Set([
                "the", "and", "you", "your",
                "i", "i'm", "im", "me", "my",
                "we", "our", "they", "their",
                "he", "she", "it", "this", "that",
                "is", "are", "am", "was", "were",
                "be", "been", "being",
                "to", "of", "in", "on", "for",
                "with", "at", "from", "by",
                "a", "an", "not", "don't", "dont",
                "can't", "cant", "won't", "wont",
                "do", "does", "did",
                "have", "has", "had",
                "want", "wanna", "need", "like",
                "love", "know", "think", "feel",
                "make", "take", "go", "come",
                "get", "got", "let", "say", "tell",
                "what", "when", "where", "why", "how",
                "who", "which",
                "all", "just", "only", "right",
                "now", "time", "baby", "yeah",
                "oh", "boy", "girl"
            ]);

        const strongEnglishOnly =
            new Set([
                "the", "your", "our", "their",
                "this", "that", "with", "from",
                "where", "when", "why", "how",
                "don't", "dont", "can't", "cant",
                "won't", "wont", "wanna",
                "baby", "yeah", "boy", "girl"
            ]);

        let common = 0;
        let strong = 0;

        for (const word of words) {
            if (commonEnglish.has(word)) {
                common++;
            }

            if (strongEnglishOnly.has(word)) {
                strong++;
            }
        }

        const ratio =
            common /
            Math.max(
                1,
                words.length
            );

        return (
            strong >= 1 &&
            ratio >= 0.45
        ) || (
            words.length >= 3 &&
            common >= 2 &&
            ratio >= 0.58
        ) || (
            words.length >= 5 &&
            ratio >= 0.48
        );
    }

    function looksLikeSpanishLine(text) {
        const value =
            String(text || "")
                .normalize("NFKC")
                .trim();

        if (!value) {
            return false;
        }

        if (
            hasHangul(value) ||
            hasKana(value) ||
            hasHan(value)
        ) {
            return false;
        }

        if (
            /[áéíóúüñ¿¡]/i.test(
                value
            )
        ) {
            return true;
        }

        const words =
            getLatinWords(value);

        if (!words.length) {
            return false;
        }

        const spanishCommon =
            new Set([
                "el", "la", "los", "las",
                "de", "del", "al",
                "que", "qué",
                "y", "en",
                "un", "una", "unos", "unas",
                "por", "para", "con", "sin",
                "pero", "porque", "como", "cómo",
                "cuando", "cuándo",
                "donde", "dónde",
                "quien", "quién",
                "yo", "tu", "tú",
                "usted", "ustedes",
                "nos", "nosotros",
                "me", "te", "se",
                "mi", "mis", "su", "sus",
                "lo", "le",
                "es", "soy", "eres",
                "estoy", "estas", "estás",
                "esta", "está",
                "quiero", "quieres",
                "tengo", "tienes", "tiene",
                "voy", "vas", "vamos",
                "vamo", "vamo'",
                "ya", "si", "sí",
                "no", "más", "mas",
                "todo", "toda", "todos", "todas",
                "nada", "aquí", "aqui",
                "ahora", "hoy",
                "amor", "corazón", "corazon",
                "mami", "papi",
                "pa", "pa'"
            ]);

        const spanishStrong =
            new Set([
                "el", "la", "los", "las",
                "de", "del", "al",
                "que", "qué",
                "un", "una", "unos", "unas",
                "por", "para", "con", "sin",
                "pero", "porque",
                "como", "cómo",
                "cuando", "cuándo",
                "donde", "dónde",
                "quien", "quién",
                "quiero", "quieres",
                "tengo", "tienes", "tiene",
                "eres", "soy",
                "estoy", "estás", "está",
                "vamos", "vamo", "vamo'",
                "aquí", "aqui",
                "mami", "papi",
                "pa", "pa'"
            ]);

        let common = 0;
        let strong = 0;

        for (const word of words) {
            if (spanishCommon.has(word)) {
                common++;
            }

            if (spanishStrong.has(word)) {
                strong++;
            }
        }

        const ratio =
            common /
            Math.max(
                1,
                words.length
            );

        return (
            strong >= 2
        ) || (
            strong >= 1 &&
            common >= 2
        ) || (
            words.length >= 4 &&
            common >= 3 &&
            ratio >= 0.45
        );
    }

    // Han-only lines are kept as-is; any other letters are translation-eligible.
    // Japanese kanji-only lines need the track's language as context.
    function lineNeedsChineseTranslation(originalText, trackLanguage) {
        const text = String(originalText || "").normalize("NFKC").trim();
        if (trackLanguage === "ja" && hasHan(text)) return true;
        return /\p{L}/u.test(text.replace(/\p{Script=Han}/gu, ""));
    }

    function targetNeedsTranslation(targetText, neteaseLanguage) {
        return lineNeedsChineseTranslation(targetText, neteaseLanguage);
    }

    function alignNeteaseToLrclib(neteaseLines, neteaseLanguage, frozenOffsetMs = null) {
        const usable = (neteaseLines || []).filter(line => line?.text);
        const offsetMs = Number.isFinite(frozenOffsetMs)
            ? frozenOffsetMs : estimateNeteaseTimeOffset(usable);
        const groups = assignNeteaseLinesToLrclib(usable, offsetMs);
        return lyricLines.map((target, index) => {
            if (!targetNeedsTranslation(target.text, neteaseLanguage)) return "";
            const group = groups[index] || [];
            // A provider's complete-line translation takes priority over fragments.
            const exact = group.find(candidate =>
                normalizeText(candidate.text) === normalizeText(target.text) &&
                hasHan(candidate.translation));
            if (exact) return exact.translation.trim();
            if (!group.some(candidate => hasHan(candidate.translation))) return "";
            const pieces = [];
            const seen = new Set();
            for (const candidate of group) {
                const value = String(candidate.translation || (
                    // Keep untranslated English/Chinese fragments only if they
                    // actually occur in this target, not just a nearby timestamp.
                    compactMatchText(target.text).includes(compactMatchText(candidate.text)) &&
                    !hasHangul(candidate.text) && !hasKana(candidate.text)
                        ? candidate.text : ""
                )).trim();
                const key = normalizeText(value);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                pieces.push(value);
            }
            return pieces.join(" ");
        });
    }

    async function ensureOpenCC() {
        if (openCCConverter) {
            return openCCConverter;
        }

        if (
            window.OpenCC?.Converter
        ) {
            openCCConverter =
                window.OpenCC.Converter({
                    from: "cn",
                    to: "tw"
                });

            return openCCConverter;
        }

        if (!openCCLoadPromise) {
            openCCLoadPromise =
                new Promise(
                    (resolve, reject) => {
                        const existing =
                            document.querySelector(
                                "script[data-minilyrics-opencc]"
                            );

                        const finish = () => {
                            if (
                                window.OpenCC?.Converter
                            ) {
                                openCCConverter =
                                    window.OpenCC.Converter({
                                        from: "cn",
                                        to: "tw"
                                    });

                                resolve(
                                    openCCConverter
                                );
                            } else {
                                reject(
                                    new Error(
                                        "OpenCC loaded without a global API"
                                    )
                                );
                            }
                        };

                        if (existing) {
                            existing.addEventListener(
                                "load",
                                finish,
                                { once: true }
                            );

                            existing.addEventListener(
                                "error",
                                () => reject(
                                    new Error(
                                        "OpenCC script load failed"
                                    )
                                ),
                                { once: true }
                            );

                            return;
                        }

                        const script =
                            document.createElement(
                                "script"
                            );

                        script.src =
                            OPENCC_SCRIPT_URL;

                        script.defer = true;
                        script.dataset.minilyricsOpencc =
                            "1";

                        script.addEventListener(
                            "load",
                            finish,
                            { once: true }
                        );

                        script.addEventListener(
                            "error",
                            () => reject(
                                new Error(
                                    "OpenCC script load failed"
                                )
                            ),
                            { once: true }
                        );

                        document.body.appendChild(
                            script
                        );
                    }
                );
        }

        return await openCCLoadPromise;
    }

    async function convertTranslationsToTraditional(
        translations
    ) {
        if (!translations?.some(Boolean)) {
            return translations || [];
        }

        try {
            const converter =
                await ensureOpenCC();

            return translations.map(
                text =>
                    text
                        ? converter(text)
                        : ""
            );
        } catch (error) {
            console.warn(
                "[MiniLyrics] OpenCC unavailable; hiding Simplified Chinese translation:",
                error
            );

            // The user preference is Traditional Chinese only.
            // If OpenCC cannot load, keep the original lyrics instead
            // of showing Simplified Chinese.
            return translations.map(() => "");
        }
    }

    async function resolveNeteaseSongWithLyrics(track) {
        const excluded =
            new Set();

        let bestPartial = null;

        for (
            let attempt = 1;
            attempt <= 6;
            attempt++
        ) {
            const song =
                await searchNeteaseTrack(
                    track,
                    excluded
                );

            if (!song?.id) {
                break;
            }

            try {
                const data =
                    await fetchNeteaseLyrics(
                        song.id
                    );

                const inspected =
                    inspectNeteaseLyricPayload(
                        data
                    );

                const originalCount =
                    Math.max(
                        inspected.lrcLines.length,
                        inspected.yrcLines.length
                    );

                const translatedCount =
                    inspected.translatedLines.length;

                const translationCoverage =
                    translatedCount /
                    Math.max(
                        1,
                        originalCount
                    );

                const countFit =
                    originalCount
                        ? Math.min(
                            originalCount,
                            lyricLines.length
                        ) /
                        Math.max(
                            originalCount,
                            lyricLines.length
                        )
                        : 0;

                const metadata =
                    scoreNeteaseSong(
                        track,
                        song
                    );

                const candidateOriginalLines =
                    inspected.yrcLines.length
                        ? inspected.yrcLines
                        : inspected.lrcLines;

                const candidateLanguage =
                    detectLyricsLanguage(
                        candidateOriginalLines
                    );

                const lrclibLanguage =
                    detectLyricsLanguage(
                        lyricLines
                    );

                const lrclibLooksRomanizedKorean =
                    looksLikeRomanizedKoreanTrack(
                        lyricLines
                    );

                let languageBonus = 0;

                if (
                    lrclibLooksRomanizedKorean &&
                    candidateLanguage === "ko"
                ) {
                    languageBonus += 18;
                } else if (
                    lrclibLooksRomanizedKorean &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 24;
                }

                if (
                    lrclibLanguage === "ko" &&
                    candidateLanguage === "ko"
                ) {
                    languageBonus += 10;
                } else if (
                    lrclibLanguage === "ko" &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 18;
                }

                if (
                    lrclibLanguage === "ja" &&
                    candidateLanguage === "ja"
                ) {
                    languageBonus += 10;
                } else if (
                    lrclibLanguage === "ja" &&
                    candidateLanguage === "en"
                ) {
                    languageBonus -= 18;
                }

                const quality =
                    metadata.total +
                    translationCoverage * 24 +
                    countFit * 6 +
                    languageBonus;

                const candidate = {
                    song,
                    data,
                    inspected,
                    quality,
                    translationCoverage,
                    originalCount,
                    translatedCount,
                    candidateLanguage,
                    languageBonus
                };

                console.log(
                    "[MiniLyrics] NetEase candidate lyric quality:",
                    song?.name,
                    {
                        metadata:
                            metadata.total,
                        originalCount,
                        translatedCount,
                        translationCoverage:
                            Number(
                                translationCoverage.toFixed(3)
                            ),
                        candidateLanguage,
                        languageBonus,
                        quality:
                            Number(
                                quality.toFixed(2)
                            )
                    }
                );

                if (
                    !bestPartial ||
                    candidate.quality >
                        bestPartial.quality
                ) {
                    bestPartial = candidate;
                }

                const enoughTranslation =
                    translatedCount >=
                        Math.max(
                            8,
                            Math.round(
                                lyricLines.length * 0.45
                            )
                        ) ||
                    translationCoverage >= 0.45;

                const languageCompatible =
                    !(
                        looksLikeRomanizedKoreanTrack(
                            lyricLines
                        ) &&
                        candidateLanguage === "en"
                    );

                if (
                    enoughTranslation &&
                    languageCompatible
                ) {
                    writeCachedNeteaseSong(
                        track,
                        song
                    );

                    return {
                        song,
                        data
                    };
                }

                excluded.add(
                    String(song.id)
                );

                invalidateCachedNeteaseSong(
                    track
                );

                console.log(
                    `[MiniLyrics] NetEase candidate has sparse translated lyrics (${translatedCount}/${originalCount}); trying another safe version`
                );

            } catch (error) {
                excluded.add(
                    String(song.id)
                );

                invalidateCachedNeteaseSong(
                    track
                );

                console.warn(
                    `[MiniLyrics] NetEase candidate ${song?.name || song.id} has unusable lyrics; trying another safe match:`,
                    error?.message || error
                );
            }
        }

        if (bestPartial) {
            writeCachedNeteaseSong(
                track,
                bestPartial.song
            );

            console.log(
                "[MiniLyrics] Using best partial NetEase translation source:",
                bestPartial.song?.name,
                {
                    translated:
                        bestPartial.translatedCount,
                    original:
                        bestPartial.originalCount,
                    coverage:
                        Number(
                            bestPartial.translationCoverage.toFixed(3)
                        )
                }
            );

            return {
                song:
                    bestPartial.song,
                data:
                    bestPartial.data
            };
        }

        return null;
    }

    async function loadNeteaseTranslation(
        track,
        parentRequestId
    ) {
        if (!translationsEnabled) return;
        if (
            !shouldProbeNeteaseTranslation(
                lyricLines
            )
        ) {
            return;
        }

        const lrclibLanguage =
            detectLyricsLanguage(
                lyricLines
            );

        const cached =
            readCachedTranslations(
                track
            );

        if (cached) {
            console.log(
                "[MiniLyrics] NetEase translation cache hit"
            );

            applyTranslationArray(
                cached
            );

            return;
        }

        console.log(
            "[MiniLyrics] Probing NetEase with per-line mixed-language handling"
        );

        if (!getNeteaseProxyUrl()) {
            console.log(
                "[MiniLyrics] NetEase translation skipped: proxy not configured"
            );
            return;
        }

        const myTranslationRequest =
            ++translationRequestId;

        try {
            const resolved =
                await resolveNeteaseSongWithLyrics(
                    track
                );

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            if (!resolved?.song?.id) {
                return;
            }

            const song =
                resolved.song;

            const data =
                resolved.data;

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            const originalInfo =
                chooseNeteaseOriginalLines(
                    data
                );

            let originalLines =
                originalInfo.lines;

            let neteaseOriginalLanguage =
                originalInfo.language;

            let neteaseOriginalSource =
                originalInfo.source;

            const translatedLines =
                parseBestTimedLyrics(
                    data?.ytlrc?.lyric ||
                    data?.tlyric?.lyric ||
                    ""
                );

            const romanizedLines =
                parseBestTimedLyrics(
                    data?.yromalrc?.lyric ||
                    data?.romalrc?.lyric ||
                    ""
                );

            console.log(
                "[MiniLyrics] NetEase lyric fields:",
                {
                    lrc:
                        originalInfo.lrcLines.length,
                    yrc:
                        originalInfo.yrcLines.length,
                    translated:
                        translatedLines.length,
                    romanized:
                        romanizedLines.length
                }
            );

            /*
             * If NetEase has no usable original line track, do NOT treat
             * "unknown" as proof that the song is English. v6 did that and
             * incorrectly skipped tracks whose native lyric lived only in YRC.
             *
             * For an LRCLIB track that is already visibly Korean/Japanese/
             * Spanish/other, LRCLIB itself is a safe original-time fallback.
             */
            if (
                neteaseOriginalLanguage === "unknown" &&
                (
                    lrclibLanguage === "ko" ||
                    lrclibLanguage === "ja" ||
                    lrclibLanguage === "es" ||
                    lrclibLanguage === "en" ||
                    lrclibLanguage === "zh" ||
                    lrclibLanguage === "other"
                )
            ) {
                originalLines =
                    lyricLines.map(
                        line => ({
                            timeMs:
                                line.timeMs,
                            text:
                                line.text
                        })
                    );

                neteaseOriginalLanguage =
                    lrclibLanguage;

                neteaseOriginalSource =
                    "lrclib-fallback";
            }

            /*
             * A romanization field is explicit evidence that NetEase knows a
             * non-native-script reading for the song. If the native original
             * is missing but LRCLIB looks Latin, use that romanization track
             * for timestamp alignment instead of declaring the song English.
             */
            if (
                neteaseOriginalLanguage === "unknown" &&
                romanizedLines.length &&
                translatedLines.length
            ) {
                originalLines =
                    romanizedLines;

                neteaseOriginalLanguage =
                    "romanized";

                neteaseOriginalSource =
                    "romalrc";
            }

            if (
                neteaseOriginalLanguage === "unknown" &&
                translatedLines.length &&
                looksLikeRomanizedKoreanTrack(
                    lyricLines
                )
            ) {
                originalLines =
                    lyricLines.map(
                        line => ({
                            timeMs:
                                line.timeMs,
                            text:
                                line.text
                        })
                    );

                neteaseOriginalLanguage =
                    "romanized";

                neteaseOriginalSource =
                    "lrclib-romanized-evidence";

                console.log(
                    "[MiniLyrics] LRCLIB contains strong Korean romanization evidence; aligning timed NetEase translation directly"
                );
            }

            console.log(
                "[MiniLyrics] NetEase original lyric source:",
                neteaseOriginalSource
            );

            console.log(
                "[MiniLyrics] NetEase original lyric language:",
                neteaseOriginalLanguage
            );

            /*
             * If LRCLIB looked English but NetEase's real lyric contains
             * Korean/Japanese script, this is a romanized or mixed-language
             * song. Use NetEase native-script lyrics where timestamps line up.
             */
            const frozenLrclibNeteaseOffsetMs =
                estimateNeteaseTimeOffset(
                    originalLines
                );

            console.log(
                "[MiniLyrics] Frozen LRCLIB↔NetEase offset:",
                frozenLrclibNeteaseOffsetMs
            );

            if (
                neteaseOriginalLanguage === "ko" ||
                neteaseOriginalLanguage === "ja"
            ) {
                replaceRomanizedLinesWithNeteaseOriginal(
                    originalLines,
                    neteaseOriginalLanguage,
                    frozenLrclibNeteaseOffsetMs
                );
            }

            if (
                neteaseOriginalLanguage === "unknown"
            ) {
                console.log(
                    "[MiniLyrics] NetEase original lyric is unavailable; cannot align translations safely"
                );
                return;
            }

            if (!translatedLines.length) {
                console.log(
                    "[MiniLyrics] NetEase matched the track but has no translated lyrics"
                );
                return;
            }

            const neteaseLines =
                mergeNeteaseTranslation(
                    originalLines,
                    translatedLines
                );

            let translations =
                alignNeteaseToLrclib(
                    neteaseLines,
                    neteaseOriginalLanguage,
                    frozenLrclibNeteaseOffsetMs
                );

            if (!translations.some(Boolean)) {
                console.log(
                    "[MiniLyrics] NetEase translation exists but could not be aligned safely"
                );
                return;
            }

            translations =
                await convertTranslationsToTraditional(
                    translations
                );

            if (
                parentRequestId !== requestId ||
                myTranslationRequest !==
                    translationRequestId
            ) {
                return;
            }

            writeCachedTranslations(
                track,
                translations
            );

            applyTranslationArray(
                translations
            );

            console.log(
                `[MiniLyrics] Added Traditional Chinese translations to ${translations.filter(Boolean).length}/${translations.length} lines (mixed-language per-line mode)`
            );

            if (
                neteaseOriginalLanguage === "es"
            ) {
                const eligibleSpanish =
                    lyricLines.filter(
                        line =>
                            lineNeedsChineseTranslation(
                                line.text,
                                "es"
                            )
                    ).length;

                console.log(
                    "[MiniLyrics] Spanish translation coverage:",
                    {
                        added:
                            translations.filter(
                                Boolean
                            ).length,
                        eligible:
                            eligibleSpanish,
                        total:
                            lyricLines.length
                    }
                );
            }
        } catch (error) {
            console.warn(
                "[MiniLyrics] NetEase translation unavailable:",
                error
            );
        }
    }

    // =========================================================
    // PiP CSS
    // =========================================================

    function injectPiPStyles(doc) {
        if (
            doc.getElementById(
                PIP_STYLE_ID
            )
        ) {
            return;
        }

        const style =
            doc.createElement("style");

        style.id = PIP_STYLE_ID;

        style.textContent = `
            #${PIP_ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483647;

                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                align-items: center;

                box-sizing: border-box;

                padding:
                    16px
                    16px
                    clamp(96px, 36vh, 128px);

                pointer-events: none;

                font-family:
                    "Spotify Mix",
                    "CircularSp",
                    Arial,
                    sans-serif;
            }

            #${PIP_ROOT_ID}
            .minilyrics-shell {
                position: relative;

                width: min(88vw, 680px);
                box-sizing: border-box;

                pointer-events: none;

                transition:
                    opacity 180ms ease,
                    transform 180ms ease;
            }

            #${PIP_ROOT_ID}
            .minilyrics-panel {
                position: relative;
                width: 100%;
                box-sizing: border-box;

                padding: 5px 14px;

                border-radius: 14px;
                color: white;

                /*
                 * v17: lighter glass panel.
                 * Keep enough contrast for white lyrics while allowing much
                 * more of the Spotify artwork/video to remain visible.
                 */
                background:
                    linear-gradient(
                        to bottom,
                        rgba(0,0,0,0.10),
                        rgba(0,0,0,0.30)
                    );

                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);

                border:
                    1px solid rgba(255,255,255,0.06);

                text-shadow:
                    0 1px 4px rgba(0,0,0,0.95);

                overflow: hidden;

                transition:
                    width 200ms ease,
                    height 200ms ease,
                    padding 200ms ease,
                    border-radius 200ms ease;
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse {
                position: absolute;
                top: 4px;
                right: 7px;
                z-index: 100;

                width: 32px;
                height: 20px;

                display: flex;
                align-items: center;
                justify-content: center;

                padding: 0;
                margin: 0;

                border: 0;
                border-radius: 999px;
                background: transparent;

                cursor: pointer;
                pointer-events: auto;

                opacity: 0.58;

                transition:
                    opacity 140ms ease,
                    transform 140ms ease;

                -webkit-app-region:
                    no-drag;
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse span {
                display: block;
                width: 20px;
                height: 2px;
                border-radius: 999px;
                background: rgba(255,255,255,0.82);
                box-shadow: 0 1px 3px rgba(0,0,0,0.72);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:hover {
                opacity: 1;
                transform: scaleX(1.12);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:active {
                transform: scale(0.92);
            }

            #${PIP_ROOT_ID}
            .minilyrics-collapse:focus-visible {
                outline:
                    2px solid rgba(255,255,255,0.72);
                outline-offset: 2px;
            }

            #${PIP_ROOT_ID} .minilyrics-translation-toggle {
                position: absolute;
                left: 7px;
                top: 4px;
                z-index: 100;
                width: 32px;
                height: 20px;
                padding: 0;
                border: 0;
                border-radius: 6px;
                background: transparent;
                box-shadow: none;
                color: rgba(255,255,255,0.88);
                font: 12px/20px Arial, sans-serif;
                text-align: center;
                cursor: pointer;
                pointer-events: auto;
                -webkit-app-region: no-drag;
            }
            #${PIP_ROOT_ID} .minilyrics-translation-toggle[aria-pressed="false"] {
                opacity: 0.45;
                text-decoration: line-through;
            }
            #${PIP_ROOT_ID} .minilyrics-translation-toggle:hover {
                color: white;
            }
            #${PIP_ROOT_ID} .minilyrics-translation-toggle:focus-visible {
                outline: 2px solid white;
                outline-offset: 1px;
            }
            #${PIP_ROOT_ID}.minilyrics-collapsed .minilyrics-translation-toggle {
                display: none;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-shell {
                width: 52px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-panel {
                width: 52px;
                height: 24px;
                padding: 0;
                border-radius: 12px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-collapse {
                inset: 0;
                width: 52px;
                height: 24px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-collapse span {
                width: 24px;
            }

            #${PIP_ROOT_ID}.minilyrics-collapsed
            .minilyrics-viewport {
                display: none;
            }

            #${PIP_ROOT_ID}.minilyrics-measuring .minilyrics-shell,
            #${PIP_ROOT_ID}.minilyrics-measuring .minilyrics-panel,
            #${PIP_ROOT_ID}.minilyrics-measuring .minilyrics-viewport,
            #${PIP_ROOT_ID}.minilyrics-measuring .minilyrics-line,
            #${PIP_ROOT_ID}.minilyrics-measuring .minilyrics-translation {
                transition: none !important;
            }

            #${PIP_ROOT_ID}.minilyrics-peek-through
            .minilyrics-shell {
                opacity: 0.08;
            }

            /*
             * 固定高度的歌詞視窗。
             * 每一句都是 absolute positioned，
             * 所以換句時可以真正往上捲動，
             * 而不是直接替換文字。
             */
            #${PIP_ROOT_ID}
            .minilyrics-viewport {
                position: relative;

                width: 100%;
                height: 84px;

                overflow: hidden;

                /*
                 * 長歌詞換行時，viewport 會依目前句高度
                 * 自動平滑伸縮，不再用 ... 截斷。
                 */
                transition:
                    height 420ms
                        cubic-bezier(0.22, 1, 0.36, 1);

                -webkit-mask-image:
                    linear-gradient(
                        to bottom,
                        transparent 0%,
                        black 16%,
                        black 84%,
                        transparent 100%
                    );

                mask-image:
                    linear-gradient(
                        to bottom,
                        transparent 0%,
                        black 16%,
                        black 84%,
                        transparent 100%
                    );
            }

            #${PIP_ROOT_ID}
            .minilyrics-line {
                position: absolute;

                left: 0;
                right: 0;
                top: 50%;

                padding: 0 5px;

                text-align: center;

                /*
                 * 不截斷長歌詞：
                 * 允許完整換行顯示，不使用 ellipsis。
                 */
                white-space: normal;
                overflow: visible;
                text-overflow: clip;
                overflow-wrap: anywhere;
                word-break: normal;

                font-size:
                    clamp(
                        12px,
                        3.8vw,
                        17px
                    );

                font-weight: 550;
                line-height: 1.28;

                opacity: 0;

                /*
                 * 主要動畫：
                 * 快速起步、柔順收尾。
                 */
                transition:
                    transform 540ms
                        cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 420ms ease,
                    filter 460ms ease;

                will-change:
                    transform,
                    opacity,
                    filter;

                transform-origin:
                    center center;
            }

            #${PIP_ROOT_ID}
            .minilyrics-line.current {
                font-weight: 760;

                text-shadow:
                    0 1px 5px
                        rgba(0,0,0,0.95),
                    0 0 10px
                        rgba(255,255,255,0.08);
            }

            #${PIP_ROOT_ID}
            .minilyrics-status {
                min-height: 54px;

                display: flex;
                justify-content: center;
                align-items: center;

                padding: 0 8px;

                text-align: center;

                opacity: 0.72;

                font-size: 13px;
                font-weight: 500;
            }

            #${PIP_ROOT_ID}
            .minilyrics-translation {
                display: block;
                visibility: hidden;
                opacity: 0;
                max-height: 0;
                overflow: hidden;
                margin-top: 0;
                padding: 0 2px;
                transform: translateY(4px);

                font-size: 0.80em;
                line-height: 1.26;
                font-weight: 520;
                letter-spacing: 0;

                color: rgba(255,255,255,0.82);
                text-shadow:
                    0 1px 4px rgba(0,0,0,0.9);

                transition:
                    opacity 240ms ease,
                    transform 320ms cubic-bezier(0.22, 1, 0.36, 1),
                    max-height 320ms cubic-bezier(0.22, 1, 0.36, 1),
                    margin-top 320ms cubic-bezier(0.22, 1, 0.36, 1);
            }

            #${PIP_ROOT_ID}
            .minilyrics-line.current
            .minilyrics-translation:not(:empty) {
                visibility: visible;
                opacity: 1;
                max-height: 120px;
                margin-top: 4px;
                transform: translateY(0);
            }

            /* Searching: three dots move like a small wave. */
            #${PIP_ROOT_ID} .minilyrics-empty {
                display: grid;
                grid-template-columns: 58px minmax(0, 1fr) 58px;
                gap: 8px;
                padding: 12px 8px;
            }
            #${PIP_ROOT_ID} .minilyrics-empty::before { content: ''; }
            #${PIP_ROOT_ID} .minilyrics-empty-text { min-width: 0; }
            #${PIP_ROOT_ID} .minilyrics-cat-lane {
                position: relative; width: 58px; height: 28px;
                flex: 0 0 58px; overflow: hidden;
            }
            #${PIP_ROOT_ID} .minilyrics-empty-cat {
                position: absolute; width: 24px; height: 24px; left: 0; bottom: 0;
                animation: minilyrics-cat-roam 7.2s linear infinite;
            }
            #${PIP_ROOT_ID} .minilyrics-empty-cat span { position: absolute; display: block; }
            #${PIP_ROOT_ID} .cat-body { left: 5px; top: 12px; width: 13px; height: 7px; background: currentColor; }
            #${PIP_ROOT_ID} .cat-head {
                left: 15px; top: 7px; width: 8px; height: 9px; background: currentColor;
                box-shadow: -1px -3px 0 -1px currentColor, 1px -3px 0 -1px currentColor;
            }
            #${PIP_ROOT_ID} .cat-tail { left: 2px; top: 7px; width: 3px; height: 10px; background: currentColor; }
            #${PIP_ROOT_ID} .cat-feet {
                left: 6px; top: 19px; width: 3px; height: 3px;
                background: currentColor; box-shadow: 9px 0 currentColor;
                animation: minilyrics-cat-step 480ms steps(2, end) infinite;
            }
            @keyframes minilyrics-cat-step { to { transform: translateX(2px); } }
            @keyframes minilyrics-cat-roam {
                0% { transform: translateX(0) scaleX(1); }
                49% { transform: translateX(32px) scaleX(1); }
                50% { transform: translateX(32px) scaleX(-1); }
                99% { transform: translateX(0) scaleX(-1); }
                100% { transform: translateX(0) scaleX(1); }
            }
            @media (prefers-reduced-motion: reduce) {
                #${PIP_ROOT_ID} .minilyrics-empty-cat,
                #${PIP_ROOT_ID} .cat-feet { animation: none; }
            }

            /* Searching: three dots move like a small wave. */
            #${PIP_ROOT_ID}
            .minilyrics-searching {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                max-width: 100%;
            }

            #${PIP_ROOT_ID}
            .minilyrics-status-text {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dots {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                flex: 0 0 auto;
                height: 16px;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot {
                width: 5px;
                height: 5px;
                border-radius: 999px;
                background: currentColor;
                opacity: 0.35;
                animation:
                    minilyrics-search-wave
                    900ms
                    cubic-bezier(0.4, 0, 0.2, 1)
                    infinite;
                will-change: transform, opacity;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot:nth-child(2) {
                animation-delay: 120ms;
            }

            #${PIP_ROOT_ID}
            .minilyrics-search-dot:nth-child(3) {
                animation-delay: 240ms;
            }

            @keyframes minilyrics-search-wave {
                0%,
                60%,
                100% {
                    transform:
                        translateY(2px)
                        scale(0.86);
                    opacity: 0.32;
                }

                30% {
                    transform:
                        translateY(-6px)
                        scale(1);
                    opacity: 1;
                }
            }

            /*
             * 橫向 Mini Player
             */
            @media
            (min-aspect-ratio: 1/1) {

                #${PIP_ROOT_ID} {
                    padding-bottom:
                        clamp(92px, 34vh, 118px);
                }

                #${PIP_ROOT_ID}
                .minilyrics-shell {
                    width: min(84vw, 680px);
                }

                #${PIP_ROOT_ID}
                .minilyrics-panel {
                    padding: 4px 12px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-viewport {
                    height: 80px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-line {
                    font-size:
                        clamp(
                            12px,
                            3.2vw,
                            17px
                        );

                    line-height: 1.28;
                }
            }

            @media
            (prefers-reduced-motion: reduce) {

                #${PIP_ROOT_ID}
                .minilyrics-line {
                    transition:
                        opacity 160ms linear;
                }

                #${PIP_ROOT_ID}
                .minilyrics-search-dot {
                    animation: none;
                    transform: none;
                    opacity: 0.65;
                }

            }
        `;

        doc.head.appendChild(style);
    }

    // Original pixel cat drawn from integer-sized CSS blocks; no external asset.
    const MISSING_LYRICS_MESSAGES = [
        "Can't find the lyrics, take care of my cat instead.",
        "Where did you even find this song?",
        "Oops, these lyrics got away.",
        "No lyrics here. Just vibes.",
        "Can't find the words. Enjoy the music."
    ];
    let missingLyricsMessage = "";

    function renderMissingLyrics(panel) {
        if (!missingLyricsMessage) {
            missingLyricsMessage = MISSING_LYRICS_MESSAGES[
                Math.floor(Math.random() * MISSING_LYRICS_MESSAGES.length)
            ];
        }
        panel.innerHTML = `
            <div class="minilyrics-status minilyrics-empty">
                <span class="minilyrics-empty-text"></span>
                <span class="minilyrics-cat-lane" aria-hidden="true">
                    <span class="minilyrics-empty-cat">
                        <span class="cat-body"></span><span class="cat-head"></span>
                        <span class="cat-tail"></span><span class="cat-feet"></span>
                    </span>
                </span>
            </div>`;
        panel.querySelector(".minilyrics-empty-text").textContent = missingLyricsMessage;
    }

    // =========================================================
    // PiP UI
    // =========================================================

    function readPiPCollapsed() {
        try {
            return localStorage.getItem(
                PIP_COLLAPSED_STORAGE_KEY
            ) === "true";
        } catch {
            return false;
        }
    }

    function setPiPCollapsed(
        root,
        collapsed,
        persist = true
    ) {
        root.classList.toggle(
            "minilyrics-collapsed",
            collapsed
        );

        const button = root.querySelector(
            ".minilyrics-collapse"
        );

        if (button) {
            button.setAttribute(
                "aria-expanded",
                String(!collapsed)
            );
            button.setAttribute(
                "aria-label",
                collapsed
                    ? "Expand lyrics"
                    : "Collapse lyrics"
            );
            button.title = collapsed
                ? "Expand lyrics"
                : "Collapse lyrics";
        }

        if (!persist) {
            return;
        }

        try {
            localStorage.setItem(
                PIP_COLLAPSED_STORAGE_KEY,
                String(collapsed)
            );
        } catch {
            // Storage failure should not affect the lyrics UI.
        }
    }

    function resetLyricsHoverReveal(root) {
        if (pipHoverTimer) {
            clearTimeout(pipHoverTimer);
            pipHoverTimer = null;
        }

        root?.classList.remove(
            "minilyrics-peek-through"
        );
    }

    function cleanupLyricsHoverReveal() {
        if (pipHoverCleanup) {
            pipHoverCleanup();
            pipHoverCleanup = null;
        }

        if (pipHoverTimer) {
            clearTimeout(pipHoverTimer);
            pipHoverTimer = null;
        }
    }

    function initLyricsHoverReveal(root, doc) {
        cleanupLyricsHoverReveal();

        let pointerInside = false;

        const onPointerMove = event => {
            const shell = root.querySelector(
                ".minilyrics-shell"
            );

            if (
                !shell ||
                root.classList.contains(
                    "minilyrics-collapsed"
                )
            ) {
                pointerInside = false;
                resetLyricsHoverReveal(root);
                return;
            }

            const rect =
                shell.getBoundingClientRect();

            const inside =
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom;

            if (!inside) {
                pointerInside = false;
                resetLyricsHoverReveal(root);
                return;
            }

            pointerInside = true;

            if (
                pipHoverTimer ||
                root.classList.contains(
                    "minilyrics-peek-through"
                )
            ) {
                return;
            }

            pipHoverTimer = setTimeout(
                () => {
                    pipHoverTimer = null;

                    if (
                        pointerInside &&
                        root.isConnected &&
                        !root.classList.contains(
                            "minilyrics-collapsed"
                        )
                    ) {
                        root.classList.add(
                            "minilyrics-peek-through"
                        );
                    }
                },
                2000
            );
        };

        const onPointerLeave = () => {
            pointerInside = false;
            resetLyricsHoverReveal(root);
        };

        doc.addEventListener(
            "pointermove",
            onPointerMove,
            { passive: true }
        );

        doc.addEventListener(
            "pointerleave",
            onPointerLeave
        );

        pipHoverCleanup = () => {
            doc.removeEventListener(
                "pointermove",
                onPointerMove
            );
            doc.removeEventListener(
                "pointerleave",
                onPointerLeave
            );
            resetLyricsHoverReveal(root);
        };
    }

    function updateTranslationToggle(root) {
        const button = root.querySelector(".minilyrics-translation-toggle");
        if (!button) return;
        button.setAttribute("aria-pressed", String(translationsEnabled));
        button.title = translationsEnabled ? "關閉翻譯" : "開啟翻譯";
        button.setAttribute("aria-label", button.title);
    }

    function createPiPUI(doc) {
        injectPiPStyles(doc);

        let root =
            doc.getElementById(
                PIP_ROOT_ID
            );

        if (root) {
            return root;
        }

        root =
            doc.createElement("div");

        root.id =
            PIP_ROOT_ID;

        root.innerHTML = `
            <div class="minilyrics-shell">
                <button
                    class="minilyrics-collapse"
                    type="button"
                    aria-label="Collapse lyrics"
                    aria-expanded="true"
                    title="Collapse lyrics">
                    <span></span>
                </button>

                <div class="minilyrics-panel">
                    <div
                        class="minilyrics-viewport">
                    </div>
                </div>
                <button
                    class="minilyrics-translation-toggle"
                    type="button"
                    aria-label="關閉翻譯"
                    aria-pressed="true">譯</button>
            </div>
        `;

        const collapseButton =
            root.querySelector(
                ".minilyrics-collapse"
            );

        collapseButton?.addEventListener(
            "click",
            event => {
                event.preventDefault();
                event.stopPropagation();

                const collapse =
                    !root.classList.contains(
                        "minilyrics-collapsed"
                    );

                resetLyricsHoverReveal(root);
                if (collapse) {
                    setPiPCollapsed(root, true);
                    return;
                }

                // Measure at the final expanded width, not partway through
                // the panel's width/padding transition from the 52px capsule.
                root.classList.add("minilyrics-measuring");
                try {
                    setPiPCollapsed(root, false);
                    void root.offsetWidth;
                    lastRenderedPiPIndex = null;
                    if (lyricLines.length) {
                        renderPiPLyrics(currentLineIndex);
                    } else {
                        renderPiPStatus(displayStatus);
                    }
                    // Commit the computed height before restoring transitions.
                    void root.offsetHeight;
                } finally {
                    root.classList.remove("minilyrics-measuring");
                }
            }
        );

        root.querySelector(".minilyrics-translation-toggle").addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            translationsEnabled = !translationsEnabled;
            // Discard results from any translation task started before this toggle.
            ++translationRequestId;
            try {
                localStorage.setItem("miniLyrics.translationsEnabled", String(translationsEnabled));
            } catch {}
            resetLyricsHoverReveal(root);
            updateTranslationToggle(root);
            root.classList.add("minilyrics-measuring");
            try {
                lastRenderedPiPIndex = null;
                renderPiPLyrics(currentLineIndex);
                void root.offsetHeight;
            } finally {
                root.classList.remove("minilyrics-measuring");
            }
            if (translationsEnabled && currentTrack && lyricLines.length) {
                loadNeteaseTranslation(currentTrack, requestId);
            }
        });
        updateTranslationToggle(root);
        doc.body.appendChild(root);

        setPiPCollapsed(
            root,
            readPiPCollapsed(),
            false
        );

        initLyricsHoverReveal(root, doc);

        return root;
    }

    function renderPiPStatus(text) {
        displayStatus = text;

        if (
            !pipDocument ||
            !pipDocument.body
        ) {
            return;
        }

        const root =
            createPiPUI(
                pipDocument
            );

        if (
            root.classList.contains(
                "minilyrics-collapsed"
            )
        ) {
            lastRenderedPiPIndex = null;
            return;
        }

        const panel =
            root.querySelector(
                ".minilyrics-panel"
            );

        const isSearching =
            /^Searching(?::|\b)/i
                .test(text);

        if (text === "No synchronized lyrics" || text === "Unable to parse lyrics") {
            renderMissingLyrics(panel);
            return;
        }

        if (isSearching) {
            panel.innerHTML = `
                <div
                    class="minilyrics-status">
                    <div
                        class="minilyrics-searching">
                        <span
                            class="minilyrics-status-text">
                        </span>
                        <span
                            class="minilyrics-search-dots"
                            aria-hidden="true">
                            <span
                                class="minilyrics-search-dot">
                            </span>
                            <span
                                class="minilyrics-search-dot">
                            </span>
                            <span
                                class="minilyrics-search-dot">
                            </span>
                        </span>
                    </div>
                </div>
            `;

            panel
                .querySelector(
                    ".minilyrics-status-text"
                )
                .textContent = text;

            return;
        }

        panel.innerHTML = `
            <div
                class="minilyrics-status">
            </div>
        `;

        panel
            .querySelector(
                ".minilyrics-status"
            )
            .textContent = text;
    }

    function setLinePosition(
        element,
        offset,
        animate = true,
        yOverride = null
    ) {
        /*
         * yOverride 由實際文字高度計算。
         * 如果沒有提供，就用 fallback 距離，
         * 主要給剛建立的透明預備行使用。
         */
        const FALLBACK_DISTANCE = 40;

        const y =
            Number.isFinite(yOverride)
                ? yOverride
                : offset * FALLBACK_DISTANCE;

        let scale = 0.88;
        let opacity = 0;
        let blur = 1;

        if (offset === 0) {
            scale = 1;
            opacity = 1;
            blur = 0;
        } else if (
            Math.abs(offset) === 1
        ) {
            scale = 0.92;
            opacity = 0.43;
            blur = 0.25;
        } else if (
            Math.abs(offset) === 2
        ) {
            scale = 0.88;
            opacity = 0;
            blur = 0.8;
        }

        if (!animate) {
            element.style.transition =
                "none";
        }

        element.style.transform =
            `translateY(calc(-50% + ${y}px)) ` +
            `scale(${scale})`;

        element.style.opacity =
            String(opacity);

        element.style.filter =
            `blur(${blur}px)`;

        element.style.zIndex =
            String(
                10 -
                Math.abs(offset)
            );

        if (!animate) {
            /*
             * 強制 browser 套用無動畫的位置，
             * 下一 frame 再恢復 CSS transition。
             */
            void element.offsetHeight;

            requestAnimationFrame(
                () => {
                    element.style.transition =
                        "";
                }
            );
        }
    }

    /*
     * 依每一句「實際換行後的高度」計算位置。
     *
     * 這樣即使 current lyric 有 2~4 行，
     * prev / next 也不會疊在它上面。
     */
    function layoutLyricLines(
        viewport,
        activeIndex,
        animate = true
    ) {
        const elements = [
            ...viewport.querySelectorAll(
                ".minilyrics-line"
            )
        ];

        if (!elements.length) {
            return;
        }

        const byIndex =
            new Map();

        for (const element of elements) {
            byIndex.set(
                Number(
                    element.dataset
                        .lyricIndex
                ),
                element
            );
        }

        const current =
            byIndex.get(activeIndex);

        if (!current) {
            return;
        }

        /*
         * 行與行之間保留真正的空隙。
         * 位置由元素的 offsetHeight 決定，
         * 不再假設每一句只有單行。
         */
        const GAP = 6;
        const positions =
            new Map();

        positions.set(
            activeIndex,
            0
        );

        let previousIndex =
            activeIndex;

        let previousY = 0;

        for (
            let lyricIndex =
                activeIndex + 1;
            lyricIndex <=
                activeIndex + 2;
            lyricIndex++
        ) {
            const previous =
                byIndex.get(
                    previousIndex
                );

            const currentLine =
                byIndex.get(
                    lyricIndex
                );

            if (
                !previous ||
                !currentLine
            ) {
                continue;
            }

            previousY +=
                previous.offsetHeight / 2 +
                currentLine.offsetHeight / 2 +
                GAP;

            positions.set(
                lyricIndex,
                previousY
            );

            previousIndex =
                lyricIndex;
        }

        previousIndex =
            activeIndex;

        previousY = 0;

        for (
            let lyricIndex =
                activeIndex - 1;
            lyricIndex >=
                activeIndex - 2;
            lyricIndex--
        ) {
            const previous =
                byIndex.get(
                    previousIndex
                );

            const currentLine =
                byIndex.get(
                    lyricIndex
                );

            if (
                !previous ||
                !currentLine
            ) {
                continue;
            }

            previousY -=
                previous.offsetHeight / 2 +
                currentLine.offsetHeight / 2 +
                GAP;

            positions.set(
                lyricIndex,
                previousY
            );

            previousIndex =
                lyricIndex;
        }

        /*
         * viewport 也跟著 current lyric 的實際高度調整。
         * current 無論多長都完整顯示，不會出現 ...
         */
        const previous =
            byIndex.get(
                activeIndex - 1
            );

        const next =
            byIndex.get(
                activeIndex + 1
            );

        const currentHeight =
            current.offsetHeight;

        const contextAbove =
            previous
                ? Math.min(
                    previous.offsetHeight,
                    22
                )
                : 0;

        const contextBelow =
            next
                ? Math.min(
                    next.offsetHeight,
                    22
                )
                : 0;

        const viewportHeight =
            Math.max(
                84,
                Math.ceil(
                    currentHeight +
                    contextAbove +
                    contextBelow +
                    16
                )
            );

        viewport.style.height =
            `${viewportHeight}px`;

        for (const element of elements) {
            const lyricIndex =
                Number(
                    element.dataset
                        .lyricIndex
                );

            const offset =
                lyricIndex -
                activeIndex;

            const y =
                positions.has(
                    lyricIndex
                )
                    ? positions.get(
                        lyricIndex
                    )
                    : offset * 50;

            setLinePosition(
                element,
                offset,
                animate,
                y
            );
        }
    }

    function setTranslationVisibility(
        node,
        text,
        isCurrent
    ) {
        if (!node) {
            return;
        }

        const value =
            String(text || "").trim();

        node.textContent = value;

        const visible =
            translationsEnabled && Boolean(value) && isCurrent;

        /*
         * Do not use display:none. Keeping the node mounted makes PiP
         * rendering much more reliable and lets the line height animate.
         */
        node.style.setProperty(
            "display",
            "block",
            "important"
        );
        node.style.setProperty(
            "visibility",
            visible ? "visible" : "hidden",
            "important"
        );
        node.style.setProperty(
            "opacity",
            visible ? "1" : "0",
            "important"
        );
        node.style.setProperty(
            "max-height",
            visible ? "120px" : "0px",
            "important"
        );
        node.style.setProperty(
            "margin-top",
            visible ? "4px" : "0px",
            "important"
        );
        node.style.setProperty(
            "transform",
            visible
                ? "translateY(0)"
                : "translateY(4px)",
            "important"
        );
    }

    function createLyricLine(
        viewport,
        lyricIndex,
        activeIndex,
        animate
    ) {
        const element =
            pipDocument.createElement(
                "div"
            );

        element.className =
            "minilyrics-line";

        element.dataset.lyricIndex =
            String(lyricIndex);

        const lyric =
            lyricLines[lyricIndex] || {};

        const original =
            pipDocument.createElement(
                "div"
            );

        original.className =
            "minilyrics-original";

        original.textContent =
            lyric.text || "";

        const translation =
            pipDocument.createElement(
                "div"
            );

        translation.className =
            "minilyrics-translation";

        translation.lang =
            "zh-Hant";

        translation.textContent =
            lyric.translation || "";

        /*
         * Keep the translation node in layout at all times and let the
         * current-line state reveal it.  We use !important inline values
         * because Spotify's PiP document can inject styles after our CSS.
         */
        setTranslationVisibility(
            translation,
            lyric.translation || "",
            lyricIndex === activeIndex
        );

        element.appendChild(
            original
        );

        element.appendChild(
            translation
        );

        viewport.appendChild(
            element
        );

        setLinePosition(
            element,
            lyricIndex - activeIndex,
            animate
        );

        element.classList.toggle(
            "current",
            lyricIndex === activeIndex
        );

        return element;
    }

    function rebuildPiPLyrics(
        viewport,
        index
    ) {
        viewport.innerHTML = "";

        for (
            let lyricIndex = index - 2;
            lyricIndex <= index + 2;
            lyricIndex++
        ) {
            if (
                lyricIndex < 0 ||
                lyricIndex >= lyricLines.length
            ) {
                continue;
            }

            createLyricLine(
                viewport,
                lyricIndex,
                index,
                false
            );
        }

        /*
         * 所有 DOM 都建立後，再依實際文字高度排版。
         */
        layoutLyricLines(
            viewport,
            index,
            false
        );

        lastRenderedPiPIndex =
            index;
    }

    function renderPiPLyrics(index) {
        if (
            !pipDocument ||
            !pipDocument.body ||
            !lyricLines.length
        ) {
            return;
        }

        const root =
            createPiPUI(
                pipDocument
            );

        if (
            root.classList.contains(
                "minilyrics-collapsed"
            )
        ) {
            lastRenderedPiPIndex = null;
            return;
        }

        const panel =
            root.querySelector(
                ".minilyrics-panel"
            );

        /*
         * renderPiPStatus() 會換掉 panel 內容，
         * 因此歌詞開始時需要重新建立 viewport。
         */
        let viewport =
            panel.querySelector(
                ".minilyrics-viewport"
            );

        if (!viewport) {
            panel.innerHTML = `
                <div
                    class="minilyrics-viewport">
                </div>
            `;

            viewport =
                panel.querySelector(
                    ".minilyrics-viewport"
                );

            lastRenderedPiPIndex =
                null;
        }

        /*
         * 還沒進第一句時，
         * 先把第一句放在中央下方等待。
         */
        const activeIndex =
            index < 0 ? 0 : index;

        /*
         * 第一次 render、倒帶、拖曳進度，
         * 或一次跳超過一行時不要讓文字飛過整個畫面；
         * 直接重建到正確位置。
         */
        const isNormalStep =
            lastRenderedPiPIndex !== null &&
            activeIndex -
                lastRenderedPiPIndex === 1;

        if (!isNormalStep) {
            rebuildPiPLyrics(
                viewport,
                activeIndex
            );

            return;
        }

        /*
         * 預先建立新的 +2 行。
         * 它從 viewport 下方的透明位置開始，
         * 下一次換句時會自然滑入。
         */
        for (
            let lyricIndex =
                activeIndex - 2;
            lyricIndex <=
                activeIndex + 2;
            lyricIndex++
        ) {
            if (
                lyricIndex < 0 ||
                lyricIndex >=
                    lyricLines.length
            ) {
                continue;
            }

            let element =
                viewport.querySelector(
                    `[data-lyric-index="${lyricIndex}"]`
                );

            if (!element) {
                element =
                    createLyricLine(
                        viewport,
                        lyricIndex,
                        activeIndex,
                        false
                    );
            }
        }

        /*
         * 這裡才是真正的 rolling：
         *
         * 舊 current：0 -> -1
         * 舊 next：   +1 -> 0
         * 新句：      +2 -> +1
         */
        const allLines =
            viewport.querySelectorAll(
                ".minilyrics-line"
            );

        for (
            const element of allLines
        ) {
            const lyricIndex =
                Number(
                    element.dataset
                        .lyricIndex
                );

            const offset =
                lyricIndex -
                activeIndex;

            element.classList.toggle(
                "current",
                offset === 0
            );

            /*
             * Refresh translation text and visibility on every roll.
             * NetEase translation is loaded asynchronously, so the DOM may
             * have been created before line.translation was available.
             */
            const translationElement =
                element.querySelector(
                    ".minilyrics-translation"
                );

            if (translationElement) {
                const translationText =
                    lyricLines[lyricIndex]
                        ?.translation || "";

                setTranslationVisibility(
                    translationElement,
                    translationText,
                    offset === 0
                );
            }

            /*
             * 真正的位置會在 loop 後由
             * layoutLyricLines() 使用實際文字高度統一計算。
             */

            /*
             * 已經滑出頂部的舊句，
             * 等 transition 完成再移除。
             */
            if (offset < -2) {
                setTimeout(
                    () => {
                        if (
                            element
                                .parentElement &&
                            Number(
                                element.dataset
                                    .lyricIndex
                            ) <
                                activeIndex - 2
                        ) {
                            element.remove();
                        }
                    },
                    620
                );
            }
        }

        /*
         * 依 current / prev / next 的實際換行高度，
         * 一次更新所有位置，讓長句也能平滑捲動。
         */
        layoutLyricLines(
            viewport,
            activeIndex,
            true
        );

        lastRenderedPiPIndex =
            activeIndex;
    }

    // =========================================================
    // PiP Detection
    // =========================================================

    function cleanupPiP() {
        cleanupLyricsHoverReveal();
        pipWindow = null;
        pipDocument = null;
        lastRenderedPiPIndex = null;
    }

    function attachToPiP(win) {
        if (!win) {
            return;
        }

        if (pipWindow === win) {
            return;
        }

        pipWindow = win;
        pipDocument = win.document;

        console.log(
            "[MiniLyrics] Attached to Spotify Mini Player"
        );

        createPiPUI(
            pipDocument
        );

        if (lyricLines.length) {
            renderPiPLyrics(
                currentLineIndex
            );

            const currentTranslation =
                lyricLines[currentLineIndex]
                    ?.translation || "";

            if (currentTranslation) {
                console.log(
                    "[MiniLyrics] Current Traditional Chinese translation:",
                    currentTranslation
                );
            }
        } else {
            renderPiPStatus(
                displayStatus
            );
        }

        const onClose = () => {
            if (pipWindow === win) {
                console.log(
                    "[MiniLyrics] Mini Player closed"
                );

                cleanupPiP();
            }
        };

        win.addEventListener(
            "pagehide",
            onClose
        );

        win.addEventListener(
            "unload",
            onClose
        );
    }

    function checkPiP() {
        const api =
            window.documentPictureInPicture;

        if (!api) {
            return;
        }

        const win =
            api.window;

        if (
            win &&
            win !== pipWindow
        ) {
            attachToPiP(win);
        }

        if (
            !win &&
            pipWindow
        ) {
            cleanupPiP();
        }
    }

    function initPiPDetection() {
        const api =
            window.documentPictureInPicture;

        if (api) {
            api.addEventListener(
                "enter",
                event => {
                    if (event.window) {
                        attachToPiP(
                            event.window
                        );
                    }
                }
            );
        }

        pipPollTimer =
            setInterval(
                checkPiP,
                500
            );

        checkPiP();

        console.log(
            "[MiniLyrics] PiP detection ready"
        );
    }

    // =========================================================
    // Synchronization
    // =========================================================

    function findCurrentLine(
        progressMs
    ) {
        if (!lyricLines.length) {
            return -1;
        }

        let low = 0;
        let high =
            lyricLines.length - 1;

        let answer = -1;

        while (low <= high) {
            const mid =
                Math.floor(
                    (low + high) / 2
                );

            if (
                lyricLines[mid].timeMs
                <= progressMs
            ) {
                answer = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        return answer;
    }

    function updateLyrics() {
        if (!lyricLines.length) {
            return;
        }

        // PiP React rerender 後，
        // 如果我們的元素被移掉，
        // 就自動補回去。
        if (
            pipDocument?.body &&
            !pipDocument.getElementById(
                PIP_ROOT_ID
            )
        ) {
            createPiPUI(
                pipDocument
            );
        }

        const progress =
            Spicetify.Player
                .getProgress?.() || 0;

        const index =
            findCurrentLine(
                progress
            );

        if (
            index ===
            currentLineIndex
        ) {
            return;
        }

        currentLineIndex =
            index;

        renderPiPLyrics(index);

        if (index >= 0) {
            console.log(
                "[MiniLyrics] ♪",
                lyricLines[index].text
            );

            const translation =
                lyricLines[index]
                    ?.translation || "";

            if (translation) {
                console.log(
                    "[MiniLyrics] ↳ zh-Hant:",
                    translation
                );
            }
        }
    }

    function startSync() {
        if (syncTimer) {
            clearInterval(
                syncTimer
            );
        }

        syncTimer =
            setInterval(
                updateLyrics,
                100
            );

        updateLyrics();
    }

    // =========================================================
    // Load song
    // =========================================================

    async function loadCurrentTrack() {
        const track =
            getCurrentTrack();

        if (
            !track ||
            !track.uri
        ) {
            return false;
        }

        if (
            track.uri ===
            currentTrackUri
        ) {
            return true;
        }

        currentTrackUri =
            track.uri;

        currentTrack =
            track;
        missingLyricsMessage = "";

        const myRequestId =
            ++requestId;

        // Cancel any translation request belonging to the previous song.
        ++translationRequestId;

        lyricLines = [];
        currentLineIndex = -1;
        lastRenderedPiPIndex = null;

        if (syncTimer) {
            clearInterval(
                syncTimer
            );

            syncTimer = null;
        }

        console.log(
            "[MiniLyrics] TRACK:",
            track
        );

        renderPiPStatus(
            `Searching: ${track.title}`
        );

        try {
            const result =
                await fetchLyrics(
                    track
                );

            if (
                myRequestId !==
                requestId
            ) {
                return true;
            }

            if (
                !result ||
                !result.syncedLyrics
            ) {
                console.warn(
                    "[MiniLyrics] No synchronized lyrics"
                );

                renderPiPStatus(
                    "No synchronized lyrics"
                );

                return true;
            }

            lyricLines =
                parseLRC(
                    result.syncedLyrics
                );

            console.log(
                `[MiniLyrics] Loaded ${lyricLines.length} lines`
            );

            if (!lyricLines.length) {
                renderPiPStatus(
                    "Unable to parse lyrics"
                );

                return true;
            }

            displayStatus = "";

            /*
             * 歌詞載入成功後直接開始同步。
             * 不再跳 Spotify 白色 "Lyrics ready" 通知。
             */
            console.log(
                `[MiniLyrics] Lyrics ready: ${track.title}`
            );

            const cachedTranslations =
                readCachedTranslations(
                    track
                );

            if (translationsEnabled && cachedTranslations) {
                applyTranslationArray(
                    cachedTranslations
                );
            }

            startSync();

            /*
             * Translation is intentionally background-only:
             * original LRCLIB lyrics start immediately and never wait
             * for NetEase or OpenCC.
             */
            loadNeteaseTranslation(
                track,
                myRequestId
            );

            return true;

        } catch (error) {
            if (myRequestId !== requestId) return true;
            console.error(
                "[MiniLyrics] Lyrics error:",
                error
            );

            renderPiPStatus(
                "Lyrics request failed"
            );

            return true;
        }
    }

    // =========================================================
    // Start
    // =========================================================

    initPiPDetection();

    const startupTimer =
        setInterval(
            async () => {
                const ready =
                    await loadCurrentTrack();

                if (ready) {
                    clearInterval(
                        startupTimer
                    );
                }
            },
            500
        );

    setTimeout(
        () => {
            clearInterval(
                startupTimer
            );
        },
        15000
    );

    Spicetify.Player.addEventListener(
        "songchange",
        () => {
            setTimeout(
                loadCurrentTrack,
                300
            );
        }
    );
})();
