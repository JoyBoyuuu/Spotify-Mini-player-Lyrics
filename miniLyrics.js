(function miniLyrics() {
    if (!window.Spicetify || !Spicetify.Player) {
        setTimeout(miniLyrics, 300);
        return;
    }

    console.log("[MiniLyrics] Extension loaded");

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

    let displayStatus = "Waiting for lyrics...";

    const PIP_ROOT_ID = "minilyrics-pip-root";
    const PIP_STYLE_ID = "minilyrics-pip-style";

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
                    82px;

                pointer-events: none;

                font-family:
                    "Spotify Mix",
                    "CircularSp",
                    Arial,
                    sans-serif;
            }

            #${PIP_ROOT_ID}
            .minilyrics-panel {
                width: min(94vw, 760px);
                box-sizing: border-box;

                padding: 8px 14px;

                border-radius: 14px;
                color: white;

                background:
                    linear-gradient(
                        to bottom,
                        rgba(0,0,0,0.24),
                        rgba(0,0,0,0.58)
                    );

                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);

                text-shadow:
                    0 1px 4px rgba(0,0,0,0.95);

                overflow: hidden;
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
                height: 112px;

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
                min-height: 80px;

                display: flex;
                justify-content: center;
                align-items: center;

                padding: 0 8px;

                text-align: center;

                opacity: 0.72;

                font-size: 13px;
                font-weight: 500;
            }

            /*
             * 橫向 Mini Player
             */
            @media
            (min-aspect-ratio: 1/1) {

                #${PIP_ROOT_ID} {
                    padding-bottom: 66px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-panel {
                    width: min(90vw, 760px);
                    padding: 7px 12px;
                }

                #${PIP_ROOT_ID}
                .minilyrics-viewport {
                    height: 108px;
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
            }
        `;

        doc.head.appendChild(style);
    }

    // =========================================================
    // PiP UI
    // =========================================================

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
            <div class="minilyrics-panel">
                <div
                    class="minilyrics-viewport">
                </div>
            </div>
        `;

        doc.body.appendChild(root);

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

        const panel =
            root.querySelector(
                ".minilyrics-panel"
            );

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
        const GAP = 10;
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
                    34
                )
                : 0;

        const contextBelow =
            next
                ? Math.min(
                    next.offsetHeight,
                    34
                )
                : 0;

        const viewportHeight =
            Math.max(
                112,
                Math.ceil(
                    currentHeight +
                    contextAbove +
                    contextBelow +
                    28
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

        element.textContent =
            lyricLines[lyricIndex]
                ?.text || "";

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

        const myRequestId =
            ++requestId;

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

            startSync();

            return true;

        } catch (error) {
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