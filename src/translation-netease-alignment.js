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

