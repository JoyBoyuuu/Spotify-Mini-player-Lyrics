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

