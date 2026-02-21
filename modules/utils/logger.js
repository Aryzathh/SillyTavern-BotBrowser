export const IS_DEBUG = false;

export const logger = {
    log: (...args) => {
        if (IS_DEBUG) console.log('[Bot Browser]', ...args);
    },
    warn: (...args) => {
        if (IS_DEBUG) console.warn('[Bot Browser]', ...args);
    },
    error: (...args) => {
        // We still log errors but structured
        console.error('[Bot Browser]', ...args);
    },
    info: (...args) => {
        if (IS_DEBUG) console.info('[Bot Browser]', ...args);
    }
};
