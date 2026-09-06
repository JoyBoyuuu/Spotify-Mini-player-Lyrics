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

