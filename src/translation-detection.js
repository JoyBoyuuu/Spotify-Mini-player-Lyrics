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

    function lineNeedsChineseTranslation(
        originalText,
        trackLanguage
    ) {
        const text =
            String(originalText || "")
                .normalize("NFKC")
                .trim();

        if (!text) {
            return false;
        }

        if (
            hasHangul(text) ||
            hasKana(text)
        ) {
            return true;
        }

        if (
            trackLanguage === "ja" &&
            hasHan(text)
        ) {
            return true;
        }

        if (
            trackLanguage === "zh"
        ) {
            return false;
        }

        if (
            trackLanguage === "romanized"
        ) {
            if (
                looksLikeKoreanRomanizationLine(
                    text
                )
            ) {
                return true;
            }

            const words =
                text
                    .toLowerCase()
                    .replace(/[^a-z']+/g, " ")
                    .split(/\s+/)
                    .filter(Boolean);

            const strongEnglishWords =
                new Set([
                    "the", "and", "you", "your", "i", "me", "my",
                    "we", "our", "they", "it", "this", "that",
                    "is", "are", "was", "were", "be", "been",
                    "to", "of", "in", "on", "for", "with", "at",
                    "a", "an", "not", "don't", "dont", "can't",
                    "cant", "i'm", "im", "it's", "its", "who's",
                    "whos", "what", "when", "where", "why", "how",
                    "look", "new", "switched", "up", "so", "fresh",
                    "clean", "feel", "feeling", "right", "time",
                    "never", "left", "show", "must", "go", "power",
                    "baby", "yeah", "love", "know", "want", "just"
                ]);

            const recognized =
                words.filter(
                    word =>
                        strongEnglishWords.has(
                            word
                        )
                ).length;

            const strongEnglish =
                words.length >= 2 &&
                (
                    recognized ===
                        words.length ||
                    (
                        words.length >= 4 &&
                        recognized /
                            words.length >=
                            0.8
                    )
                );

            return !strongEnglish;
        }

        if (
            trackLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    text
                ) ||
                !looksLikeStrongEnglishLine(
                    text
                )
            );
        }

        if (
            trackLanguage === "ko" ||
            trackLanguage === "ja" ||
            trackLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                text
            );
        }

        return false;
    }

    function targetNeedsTranslation(
        targetText,
        neteaseLanguage
    ) {
        const text =
            String(
                targetText || ""
            ).trim();

        if (!text) {
            return false;
        }

        if (
            hasHangul(text) ||
            hasKana(text)
        ) {
            return true;
        }

        if (
            neteaseLanguage === "ko"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    text
                )
            );
        }

        if (
            neteaseLanguage === "romanized"
        ) {
            return (
                looksLikeKoreanRomanizationLine(
                    text
                )
            );
        }

        if (
            neteaseLanguage === "ja"
        ) {
            return (
                hasHan(text) ||
                !looksPlainEnglishLine(text)
            );
        }

        if (
            neteaseLanguage === "es"
        ) {
            return (
                looksLikeSpanishLine(
                    text
                ) ||
                !looksLikeStrongEnglishLine(
                    text
                )
            );
        }

        if (
            neteaseLanguage === "other"
        ) {
            return !looksLikeStrongEnglishLine(
                text
            );
        }

        return false;
    }

