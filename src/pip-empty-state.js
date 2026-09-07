// Original pixel cat drawn from integer-sized CSS blocks; no external asset.
const MISSING_LYRICS_MESSAGES = [
    "Can't find the lyrics, take care of my cat instead.",
    "Where did you even find this song?",
    "Lyrics not found. The cat knows why.",
    "No lyrics here. Just vibes.",
    "Can't find the words. Enjoy the music.",
    "No lyrics here. The song refuses to elaborate.",
    "Nothing to read. Pretend you know the words.",
    "Lyrics unavailable. Humming is now mandatory.",
    "I swear we looked everywhere. Even under the cat.",
    "Lyrics? In this economy?",
    "The lyrics have entered witness protection.",
    "The lyrics plead the fifth",
    "Lyrics unavailable. Blame the drummer.",
    "Apparently, this song is classified.",
    "Expected lyrics, received cat.",
    "No lyrics found. At least the cat showed up.",
    "不會自己查喔",
    "貓把歌詞吃了",
    "付費解鎖",
    "就免費的，不要太刁難我",
    "沒歌詞但你知道章魚有三顆心臟嗎，酷齁",
    "Newjeans我很想妳們",
    "我懷念大麥克套餐99元的年代",
    "Paul George 2018-19場均28分8.2籃板2.2抄截，MVP排第三DPOY也第三，好強",
    "2015-16 Curry的三分進球數402顆，兩分球則是403顆，只差一顆，好準",
    "21歲的LeBron James在2005-06場均31.4分7籃板6.6助攻，這tm21歲?"
];

let missingLyricsMessage = "";
let missingLyricsTrackUri = null;

function pickMissingLyricsMessage() {
    if (MISSING_LYRICS_MESSAGES.length === 0) {
        return "No synchronized lyrics.";
    }

    if (MISSING_LYRICS_MESSAGES.length === 1) {
        return MISSING_LYRICS_MESSAGES[0];
    }

    let nextMessage;

    // Avoid showing the same message twice in a row.
    do {
        nextMessage =
            MISSING_LYRICS_MESSAGES[
                Math.floor(
                    Math.random() *
                    MISSING_LYRICS_MESSAGES.length
                )
            ];
    } while (nextMessage === missingLyricsMessage);

    return nextMessage;
}

function renderMissingLyrics(panel) {
    // Pick a new message only when the track changes.
    // Re-rendering the same track keeps the same message.
    if (
        !missingLyricsMessage ||
        missingLyricsTrackUri !== currentTrackUri
    ) {
        missingLyricsMessage =
            pickMissingLyricsMessage();

        missingLyricsTrackUri =
            currentTrackUri;
    }

    panel.innerHTML = `
        <div class="minilyrics-status minilyrics-empty">
            <span class="minilyrics-empty-text"></span>
            <span class="minilyrics-cat-lane" aria-hidden="true">
                <span class="minilyrics-empty-cat">
                    <span class="cat-body"></span>
                    <span class="cat-head"></span>
                    <span class="cat-tail"></span>
                    <span class="cat-feet"></span>
                </span>
            </span>
        </div>`;

    panel.querySelector(
        ".minilyrics-empty-text"
    ).textContent =
        missingLyricsMessage;
}