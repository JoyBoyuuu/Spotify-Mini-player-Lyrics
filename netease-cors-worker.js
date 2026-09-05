/**
 * Cloudflare Worker CORS proxy for Spotify-Mini-player-Lyrics v18.
 *
 * Incoming requests stay GET-only. For NetEase search endpoints the Worker
 * first tries upstream GET. If NetEase returns HTTP 200 but zero songs, it
 * retries the SAME request upstream as application/x-www-form-urlencoded POST.
 *
 * This is still a restricted proxy:
 * - host: music.163.com only
 * - paths: lyric/search endpoints only
 */

const ALLOWED_HOSTS = new Set([
  "music.163.com",
]);

const ALLOWED_PATHS = [
  "/api/cloudsearch/pc",
  "/api/search/get/web",
  "/api/song/lyric/v1",
  "/api/song/lyric",
];

const SEARCH_PATHS = new Set([
  "/api/cloudsearch/pc",
  "/api/search/get/web",
]);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...corsHeaders(),
      },
    },
  );
}

function upstreamHeaders() {
  return {
    "Accept": "application/json,text/plain,*/*",
    "Referer": "https://music.163.com/",
    "Origin": "https://music.163.com",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
  };
}

async function readUpstream(response) {
  const text = await response.text();

  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    // Keep raw body. The extension will report malformed JSON if needed.
  }

  return {
    status: response.status,
    contentType:
      response.headers.get("Content-Type") ||
      "application/json; charset=utf-8",
    text,
    json,
  };
}

function searchSongCount(json) {
  const songs =
    json?.result?.songs ??
    json?.result?.song ??
    json?.songs;

  return Array.isArray(songs)
    ? songs.length
    : 0;
}

async function fetchGet(target) {
  return readUpstream(
    await fetch(target.toString(), {
      method: "GET",
      headers: upstreamHeaders(),
      redirect: "follow",
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    }),
  );
}

async function fetchSearchPost(target) {
  const form =
    new URLSearchParams(
      target.searchParams
    );

  const headers = {
    ...upstreamHeaders(),
    "Content-Type":
      "application/x-www-form-urlencoded; charset=UTF-8",
  };

  return readUpstream(
    await fetch(
      `${target.origin}${target.pathname}`,
      {
        method: "POST",
        headers,
        body: form.toString(),
        redirect: "follow",
        cf: {
          cacheTtl: 0,
          cacheEverything: false,
        },
      },
    ),
  );
}

function makeResponse(upstream, isSearch) {
  const headers =
    new Headers(
      corsHeaders()
    );

  headers.set(
    "Content-Type",
    upstream.contentType
  );

  /*
   * Never browser-cache search responses: an empty NetEase result should
   * not poison the next retry. Lyrics are safe to cache briefly.
   */
  headers.set(
    "Cache-Control",
    isSearch
      ? "no-store, max-age=0"
      : "public, max-age=300"
  );

  headers.set(
    "X-MiniLyrics-Upstream-Mode",
    upstream.mode || "GET"
  );

  return new Response(
    upstream.text,
    {
      status:
        upstream.status,
      headers,
    },
  );
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (request.method !== "GET") {
      return jsonError(
        "Only GET is allowed",
        405
      );
    }

    const incoming =
      new URL(request.url);

    const rawTarget =
      incoming.searchParams.get(
        "url"
      );

    if (!rawTarget) {
      return jsonError(
        "Missing ?url= parameter"
      );
    }

    let target;

    try {
      target =
        new URL(rawTarget);
    } catch {
      return jsonError(
        "Invalid target URL"
      );
    }

    if (
      target.protocol !== "https:" ||
      !ALLOWED_HOSTS.has(
        target.hostname
      )
    ) {
      return jsonError(
        "Target host is not allowed",
        403
      );
    }

    if (
      !ALLOWED_PATHS.includes(
        target.pathname
      )
    ) {
      return jsonError(
        "Target path is not allowed",
        403
      );
    }

    const isSearch =
      SEARCH_PATHS.has(
        target.pathname
      );

    try {
      let upstream =
        await fetchGet(
          target
        );

      upstream.mode = "GET";

      /*
       * NetEase search can intermittently answer code 200 with zero songs.
       * A form POST to the same official endpoint often succeeds when GET
       * does not, so retry before returning an empty search response.
       */
      if (
        isSearch &&
        upstream.status >= 200 &&
        upstream.status < 300 &&
        searchSongCount(
          upstream.json
        ) === 0
      ) {
        const post =
          await fetchSearchPost(
            target
          );

        post.mode = "POST";

        if (
          searchSongCount(
            post.json
          ) > 0 ||
          !upstream.text
        ) {
          upstream = post;
        }
      }

      return makeResponse(
        upstream,
        isSearch
      );

    } catch (error) {
      return jsonError(
        `Upstream request failed: ${error?.message || error}`,
        502
      );
    }
  },
};
