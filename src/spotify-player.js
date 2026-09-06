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

