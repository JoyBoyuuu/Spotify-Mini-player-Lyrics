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

