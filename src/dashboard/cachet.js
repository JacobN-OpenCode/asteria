const CACHET_BASE = 'https://cachet.hackclub.com';
const CACHE_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4000;

/**
 * Hack Club's Cachet is the source of truth for who someone is: display name, real
 * name, pronouns and their Slack-hosted avatar. It answers for any Slack member id
 * with no authentication, which makes it ideal for decorating the dashboard.
 *
 *   GET /users/U012ABCDEF   -> json profile
 *   GET /users/U012ABCDEF/r -> 302 to the profile picture
 */
export function cachetUserUrl(slackUserId) {
  return `${CACHET_BASE}/users/${encodeURIComponent(slackUserId)}`;
}

export function cachetAvatarUrl(slackUserId) {
  return `${cachetUserUrl(slackUserId)}/r`;
}

export function createCachetDirectory({ fetchImpl = globalThis.fetch, logger = console, cacheMs = CACHE_MS } = {}) {
  const cache = new Map();

  async function fetchProfile(slackUserId) {
    const cached = cache.get(slackUserId);
    if (cached && Date.now() - cached.fetchedAt < cacheMs) {
      return cached.value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let value = null;
    try {
      const response = await fetchImpl(cachetUserUrl(slackUserId), {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (response.ok) {
        const body = await response.json();
        value = {
          slackUserId,
          displayName: body?.displayName || '',
          realName: body?.realName || '',
          pronouns: body?.pronouns || '',
          imageUrl: body?.imageUrl || '',
        };
      } else {
        logger.warn?.(`[cachet] ${slackUserId} -> HTTP ${response.status}`);
      }
    } catch (error) {
      // A missing profile must never break a page render.
      logger.warn?.(`[cachet] ${slackUserId} lookup failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
    // Cache misses too, so one unknown id cannot hammer Cachet on every refresh.
    cache.set(slackUserId, { value, fetchedAt: Date.now() });
    return value;
  }

  /** Profiles for a set of ids, keyed by id, skipping anyone Cachet does not know. */
  async function list(slackUserIds) {
    const unique = [...new Set((slackUserIds || []).filter(Boolean))];
    const results = await Promise.all(unique.map((id) => fetchProfile(id).catch(() => null)));
    const byId = {};
    for (const profile of results) {
      if (profile) {
        byId[profile.slackUserId] = profile;
      }
    }
    return byId;
  }

  return {
    fetchProfile,
    list,
    avatarUrl: cachetAvatarUrl,
    profileUrl: cachetUserUrl,
    clear: () => cache.clear(),
  };
}
