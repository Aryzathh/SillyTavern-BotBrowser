// CORS Proxy Module for Bot Browser
// Provides modular CORS proxy support with fallbacks and Puter.js integration

/**
 * Available CORS proxy types
 */
export const PROXY_TYPES = {
    PUTER: 'puter',
    CORSPROXY_IO: 'corsproxy_io',
    CORS_LOL: 'cors_lol',
    NONE: 'none'
};

/**
 * Proxy configurations
 * Each proxy has different rate limits and compatibility
 */
const PROXY_CONFIGS = {
    [PROXY_TYPES.PUTER]: {
        name: 'Puter.js Fetch',
        buildUrl: null, // Puter uses its own fetch method (puter.net.fetch)
        rateLimit: 'Free, no CORS restrictions'
    },
    [PROXY_TYPES.CORSPROXY_IO]: {
        name: 'corsproxy.io',
        buildUrl: (targetUrl) => `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
        rateLimit: 'Unknown, prone to 429 errors'
    },
    [PROXY_TYPES.CORS_LOL]: {
        name: 'cors.lol',
        buildUrl: (targetUrl) => `https://api.cors.lol/?url=${encodeURIComponent(targetUrl)}`,
        rateLimit: 'Unknown'
    },
    [PROXY_TYPES.NONE]: {
        name: 'Direct (No Proxy)',
        buildUrl: (targetUrl) => targetUrl,
        rateLimit: 'N/A'
    }
};

/**
 * Service-specific proxy preferences with fallbacks
 * Order matters - first working proxy will be used
 * Puter.js is free and works well for most services
 */
const SERVICE_PROXY_MAP = {
    // JannyAI (Cloudflare) - try corsproxy.io first to avoid Puter noise when it works
    jannyai: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    jannyai_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // Character Tavern - corsproxy.io first, then Puter, then cors.lol
    character_tavern: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    character_tavern_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // Wyvern - corsproxy.io first, then Puter, then cors.lol
    wyvern: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    wyvern_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // Chub - avoid direct attempts to prevent noisy CORS console errors; proxies are required for many endpoints.
    chub: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    chub_gateway: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    chub_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // RisuRealm - corsproxy.io first, then Puter, then cors.lol
    risuai_realm: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    risuai_realm_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // MLPChag (neocities) - CORS is allowed; do not proxy by default.
    mlpchag: [PROXY_TYPES.NONE],

    // Backyard.ai - corsproxy.io first, then cors.lol, then Puter
    backyard: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    backyard_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // Pygmalion.chat - direct fetch often fails CORS; use proxies to avoid preflight errors in console.
    pygmalion: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],
    pygmalion_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER],

    // Default fallback chain
    default: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER]
};

const PUTER_CDN_URL = 'https://js.puter.com/v2/';
let puterLoadPromise = null;
let puterLoaded = false;

const DEFAULT_TIMEOUT_MS = 15000;

function isDebugEnabled() {
    return typeof window !== 'undefined' && window.__BOT_BROWSER_DEBUG === true;
}

function isPuterEnabled() {
    return typeof window === 'undefined' || window.__BOT_BROWSER_DISABLE_PUTER_PROXY !== true;
}

function debugLog(...args) {
    if (isDebugEnabled()) console.log(...args);
}

function debugWarn(...args) {
    if (isDebugEnabled()) console.warn(...args);
}

function headersToObject(headers) {
    if (!headers) return {};
    if (headers instanceof Headers) return Object.fromEntries(headers.entries());
    if (Array.isArray(headers)) return Object.fromEntries(headers);
    if (typeof headers === 'object') return { ...headers };
    return {};
}

function getGlobalAuthHeadersForService(service) {
    try {
        if (typeof window === 'undefined') return null;
        const map = window.__BOT_BROWSER_AUTH_HEADERS;
        if (!map || typeof map !== 'object') return null;
        return map[service] || map.default || null;
    } catch {
        return null;
    }
}

/**
 * Get user-configured auth headers for a service as a plain object.
 * Intended for modules that perform a direct `fetch()` without `proxiedFetch()`.
 * @param {string} service
 * @returns {Record<string,string>}
 */
export function getAuthHeadersForService(service) {
    const headers = getGlobalAuthHeadersForService(service);
    return headers ? headersToObject(headers) : {};
}

/**
 * Check if Puter.js is available
 * @returns {boolean}
 */
export function isPuterAvailable() {
    return typeof window !== 'undefined' &&
           window.puter &&
           window.puter.net &&
           typeof window.puter.net.fetch === 'function';
}

/**
 * Load Puter.js dynamically from CDN
 * @returns {Promise<boolean>} True if loaded successfully
 */
export async function loadPuter() {
    if (isPuterAvailable()) {
        puterLoaded = true;
        return true;
    }

    if (!isPuterEnabled()) {
        return false;
    }

    if (puterLoaded === false && puterLoadPromise) {
        return puterLoadPromise;
    }

    puterLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = PUTER_CDN_URL;
        script.async = true;

        script.onload = () => {
            // Wait a bit for puter to initialize
            const checkReady = () => {
                if (isPuterAvailable()) {
                    puterLoaded = true;
                    debugLog('[CORS Proxy] Puter.js loaded successfully');
                    resolve(true);
                } else {
                    setTimeout(checkReady, 50);
                }
            };
            setTimeout(checkReady, 100);
        };

        script.onerror = () => {
            debugWarn('[CORS Proxy] Failed to load Puter.js from CDN');
            puterLoaded = false;
            resolve(false);
        };

        document.head.appendChild(script);
    });

    return puterLoadPromise;
}

/**
 * Ensure Puter.js is loaded before use
 * @returns {Promise<boolean>}
 */
async function ensurePuterLoaded() {
    if (!isPuterEnabled()) {
        return false;
    }
    if (isPuterAvailable()) {
        return true;
    }
    return loadPuter();
}

/**
 * Fetch using Puter.js (bypasses CORS restrictions)
 * Auto-loads Puter.js if not available
 * @param {string} url - Target URL
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>}
 */
async function puterFetch(url, options = {}, timeoutMs = 15000) {
    const loaded = await ensurePuterLoaded();
    if (!loaded || !isPuterAvailable()) {
        throw new Error('Puter.js could not be loaded');
    }

    // Add timeout to prevent hanging forever
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Puter.js fetch timed out')), timeoutMs);
    });

    return Promise.race([
        window.puter.net.fetch(url, options),
        timeoutPromise
    ]);
}

/**
 * Build proxied URL for a given proxy type
 * @param {string} proxyType - Proxy type from PROXY_TYPES
 * @param {string} targetUrl - Target URL to proxy
 * @returns {string|null} Proxied URL or null if not applicable
 */
export function buildProxyUrl(proxyType, targetUrl) {
    const config = PROXY_CONFIGS[proxyType];
    if (!config || !config.buildUrl) {
        return null;
    }
    return config.buildUrl(targetUrl);
}

/**
 * Get proxy chain for a service
 * @param {string} service - Service identifier
 * @returns {string[]} Array of proxy types to try
 */
export function getProxyChainForService(service) {
    return SERVICE_PROXY_MAP[service] || SERVICE_PROXY_MAP.default;
}

function withTimeout(fetchOptions, timeoutMs) {
    if (!timeoutMs || timeoutMs <= 0) return { fetchOptions, cleanup: () => {} };
    if (fetchOptions?.signal) return { fetchOptions, cleanup: () => {} };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return {
        fetchOptions: { ...fetchOptions, signal: controller.signal },
        cleanup: () => clearTimeout(timeoutId),
    };
}

/**
 * Perform a proxied fetch with automatic fallback
 * @param {string} url - Target URL
 * @param {Object} options - Fetch options
 * @param {string} options.service - Service identifier for proxy selection
 * @param {string[]} options.proxyChain - Override proxy chain (optional)
 * @param {RequestInit} options.fetchOptions - Standard fetch options
 * @param {number} options.timeoutMs - Timeout in ms per attempt
 * @returns {Promise<Response>}
 */
export async function proxiedFetch(url, options = {}) {
    const {
        service = 'default',
        proxyChain = null,
        fetchOptions = {},
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = options;

    const proxies = proxyChain || getProxyChainForService(service);
    const errors = [];

    const authHeaders = getGlobalAuthHeadersForService(service);
    const mergedHeaders = {
        ...(authHeaders ? headersToObject(authHeaders) : {}),
        ...headersToObject(fetchOptions.headers),
    };
    const finalFetchOptions = Object.keys(mergedHeaders).length > 0
        ? { ...fetchOptions, headers: mergedHeaders }
        : fetchOptions;

    for (const proxyType of proxies) {
        try {
            let response;

            if (proxyType === PROXY_TYPES.PUTER) {
                if (!isPuterEnabled()) {
                    continue;
                }
                const loaded = await ensurePuterLoaded();
                if (!loaded || !isPuterAvailable()) {
                    continue;
                }
                debugLog(`[CORS Proxy] Trying Puter.js fetch for: ${url}`);
                response = await puterFetch(url, finalFetchOptions);
            } else {
                const proxyUrl = buildProxyUrl(proxyType, url);
                if (!proxyUrl) {
                    continue;
                }
                debugLog(`[CORS Proxy] Trying ${PROXY_CONFIGS[proxyType].name} for: ${url}`);
                const { fetchOptions: timedOptions, cleanup } = withTimeout(finalFetchOptions, timeoutMs);
                try {
                    response = await fetch(proxyUrl, timedOptions);
                } finally {
                    cleanup();
                }
            }

            // Check for errors that should trigger fallback
            if (response.status === 429) {
                const error = new Error(`Rate limited by ${PROXY_CONFIGS[proxyType].name}`);
                errors.push({ proxy: proxyType, error });
                debugWarn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} returned 429, trying next proxy`);
                continue;
            }

            if (response.status === 413) {
                // Some proxies (notably corsproxy.io free tier) reject large responses (>1MB).
                const error = new Error(`Payload too large from ${PROXY_CONFIGS[proxyType].name} (413)`);
                errors.push({ proxy: proxyType, error });
                debugWarn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} returned 413, trying next proxy`);
                continue;
            }

            if (response.status === 403) {
                // Log response body for debugging
                try {
                    const text = await response.clone().text();
                    debugWarn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} 403 response body:`, text.substring(0, 500));
                } catch (e) {
                    debugWarn(`[CORS Proxy] Could not read 403 response body`);
                }
                const error = new Error(`Forbidden by ${PROXY_CONFIGS[proxyType].name} (403)`);
                errors.push({ proxy: proxyType, error });
                debugWarn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} returned 403, trying next proxy`);
                continue;
            }

            if (proxyType === PROXY_TYPES.PUTER && response.status === 401) {
                const error = new Error('Unauthorized (Puter)');
                errors.push({ proxy: proxyType, error });
                debugWarn('[CORS Proxy] Puter returned 401, trying next proxy');
                continue;
            }

            // Success - return response
            return response;

        } catch (error) {
            errors.push({ proxy: proxyType, error });
            debugWarn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType]?.name || proxyType} failed:`, error.message);
        }
    }

    // All proxies failed
    if (isDebugEnabled() && errors.length > 0) {
        debugWarn('[CORS Proxy] All proxies failed:', errors.map(e => ({ proxy: e.proxy, message: e.error?.message })));
    }

    const summary = errors
        .map(({ proxy, error }) => {
            const name = PROXY_CONFIGS[proxy]?.name || proxy;
            const message = (error?.message || 'failed').toString();
            return `${name}: ${message}`;
        })
        .join('; ');

    const finalError = new Error(summary ? `All proxies failed: ${summary}` : 'All proxies failed');
    finalError.name = 'ProxyChainError';
    finalError.proxyErrors = errors;
    throw finalError;
}

/**
 * Simple proxied fetch using a specific proxy type (no fallback)
 * @param {string} proxyType - Proxy type to use
 * @param {string} url - Target URL
 * @param {RequestInit} fetchOptions - Fetch options
 * @returns {Promise<Response>}
 */
export async function fetchWithProxy(proxyType, url, fetchOptions = {}) {
    if (proxyType === PROXY_TYPES.PUTER) {
        return puterFetch(url, fetchOptions);
    }

    const proxyUrl = buildProxyUrl(proxyType, url);
    if (!proxyUrl) {
        throw new Error(`Invalid proxy type: ${proxyType}`);
    }

    return fetch(proxyUrl, fetchOptions);
}

/**
 * Preload Puter.js in the background
 * Call this early during extension init to have it ready when needed
 */
export function preloadPuter() {
    if (!isPuterEnabled()) return;
    loadPuter().catch(() => {
        // Silently fail - fallback proxies will be used
    });
}

// Legacy exports for backward compatibility
export const CORS_PROXY = 'https://corsproxy.io/?url=';
