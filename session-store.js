/**
 * Session Store for Status URLs
 * 
 * Stores status_url from prepare responses for the polling proxy.
 * This allows the status proxy to use the exact URL provided by the API.
 */

const sessionStore = new Map();

// Cleanup expired sessions every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of sessionStore.entries()) {
    if (entry.expiresAt < now) {
      sessionStore.delete(key);
    }
  }
}, 60 * 1000);

/**
 * Store a status URL for a session (5 minute TTL)
 * @param {string} sessionKey 
 * @param {string} statusUrl 
 */
function storeStatusUrl(sessionKey, statusUrl) {
  sessionStore.set(sessionKey, {
    statusUrl,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

/**
 * Get the stored status URL for a session
 * @param {string} sessionKey 
 * @returns {string|undefined}
 */
function getStatusUrl(sessionKey) {
  const entry = sessionStore.get(sessionKey);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.statusUrl;
  }
  if (entry) {
    sessionStore.delete(sessionKey);
  }
  return undefined;
}

/**
 * Extract status_url from a prepare response based on strategy
 * @param {object} response - PrepareResponse from the SDK
 * @returns {string|undefined}
 */
function extractStatusUrl(response) {
  const strategy = response?.authentication_strategy;
  const data = response?.data;
  
  if (strategy === 'link') {
    return data?.status_url;
  }
  if (strategy === 'desktop') {
    return data?.data?.status_url;
  }
  // TS43 doesn't use polling
  return undefined;
}

module.exports = {
  storeStatusUrl,
  getStatusUrl,
  extractStatusUrl,
};
