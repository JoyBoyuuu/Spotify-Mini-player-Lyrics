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

