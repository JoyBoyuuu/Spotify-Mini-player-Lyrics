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

