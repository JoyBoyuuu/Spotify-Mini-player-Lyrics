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
