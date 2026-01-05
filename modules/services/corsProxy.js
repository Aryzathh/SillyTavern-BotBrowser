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
    // JannyAI - Puter first, then corsproxy.io, then cors.lol
    jannyai: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],
    jannyai_trending: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],

    // Character Tavern - Puter first, then corsproxy.io, then cors.lol
    character_tavern: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],
    character_tavern_trending: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],

    // Wyvern - Puter first, then corsproxy.io, then cors.lol
    wyvern: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],
    wyvern_trending: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],

    // Chub - direct works (no CORS issues)
    chub: [PROXY_TYPES.NONE],
    chub_trending: [PROXY_TYPES.NONE],

    // RisuRealm - Puter first, then corsproxy.io, then cors.lol
    risuai_realm: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],
    risuai_realm_trending: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],

    // MLPChag - direct first (neocities has CORS), then Puter, then cors.lol
    mlpchag: [PROXY_TYPES.NONE, PROXY_TYPES.PUTER, PROXY_TYPES.CORS_LOL],

    // Backyard.ai - corsproxy.io first (Puter has JSON parsing issues), then cors.lol, then Puter
    backyard: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER],
    backyard_trending: [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER],

    // Pygmalion.chat - direct first (has CORS), then corsproxy.io, then cors.lol
    pygmalion: [PROXY_TYPES.NONE, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],
    pygmalion_trending: [PROXY_TYPES.NONE, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL],

    // Default fallback chain
    default: [PROXY_TYPES.PUTER, PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL]
};

const PUTER_CDN_URL = 'https://js.puter.com/v2/';
let puterLoadPromise = null;
let puterLoaded = false;

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
                    console.log('[CORS Proxy] Puter.js loaded successfully');
                    resolve(true);
                } else {
                    setTimeout(checkReady, 50);
                }
            };
            setTimeout(checkReady, 100);
        };

        script.onerror = () => {
            console.warn('[CORS Proxy] Failed to load Puter.js from CDN');
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
async function puterFetch(url, options = {}) {
    const loaded = await ensurePuterLoaded();
    if (!loaded || !isPuterAvailable()) {
        throw new Error('Puter.js could not be loaded');
    }
    return window.puter.net.fetch(url, options);
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

/**
 * Perform a proxied fetch with automatic fallback
 * @param {string} url - Target URL
 * @param {Object} options - Fetch options
 * @param {string} options.service - Service identifier for proxy selection
 * @param {string[]} options.proxyChain - Override proxy chain (optional)
 * @param {RequestInit} options.fetchOptions - Standard fetch options
 * @returns {Promise<Response>}
 */
export async function proxiedFetch(url, options = {}) {
    const {
        service = 'default',
        proxyChain = null,
        fetchOptions = {}
    } = options;

    const proxies = proxyChain || getProxyChainForService(service);
    const errors = [];

    for (const proxyType of proxies) {
        try {
            let response;

            if (proxyType === PROXY_TYPES.PUTER) {
                if (!isPuterAvailable()) {
                    console.log(`[CORS Proxy] Puter not available, skipping`);
                    continue;
                }
                console.log(`[CORS Proxy] Trying Puter.js fetch for: ${url}`);
                response = await puterFetch(url, fetchOptions);
            } else {
                const proxyUrl = buildProxyUrl(proxyType, url);
                if (!proxyUrl) {
                    continue;
                }
                console.log(`[CORS Proxy] Trying ${PROXY_CONFIGS[proxyType].name} for: ${url}`);
                response = await fetch(proxyUrl, fetchOptions);
            }

            // Check for errors that should trigger fallback
            if (response.status === 429) {
                const error = new Error(`Rate limited by ${PROXY_CONFIGS[proxyType].name}`);
                errors.push({ proxy: proxyType, error });
                console.warn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} returned 429, trying next proxy`);
                continue;
            }

            if (response.status === 403) {
                // Log response body for debugging
                try {
                    const text = await response.clone().text();
                    console.warn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} 403 response body:`, text.substring(0, 500));
                } catch (e) {
                    console.warn(`[CORS Proxy] Could not read 403 response body`);
                }
                const error = new Error(`Forbidden by ${PROXY_CONFIGS[proxyType].name} (403)`);
                errors.push({ proxy: proxyType, error });
                console.warn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType].name} returned 403, trying next proxy`);
                continue;
            }

            // Success - return response
            return response;

        } catch (error) {
            errors.push({ proxy: proxyType, error });
            console.warn(`[CORS Proxy] ${PROXY_CONFIGS[proxyType]?.name || proxyType} failed:`, error.message);
        }
    }

    // All proxies failed
    throw new Error(`All proxies failed`);
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
    loadPuter().catch(() => {
        // Silently fail - fallback proxies will be used
    });
}

// Legacy exports for backward compatibility
export const CORS_PROXY = 'https://corsproxy.io/?url=';
