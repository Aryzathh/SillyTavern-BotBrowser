import { logger } from '../utils/logger.js';
import '../../lib/localforage.min.js';

// --- IndexedDB Wrapper & In-Memory Cache System using localForage ---
localforage.config({
    name: 'BotBrowserDB',
    storeName: 'keyval',
    description: 'SillyTavern BotBrowser Cache and Key/Value Store'
});

let memoryCache = {
    persistentSearches: {},
    searchCollapsed: false,
    recentlyViewed: [],
    importStats: { totalCharacters: 0, totalLorebooks: 0, imports: [], bySource: {}, byCreator: {} },
    bookmarks: [],
    importedCards: []
};
let isStorageInitialized = false;

export async function idbSet(key, val) {
    try {
        await localforage.setItem(key, val);
    } catch (e) {
        logger.warn('localForage write failed, falling back to localStorage', e);
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e2) { }
    }
}

export async function idbGet(key) {
    try {
        const value = await localforage.getItem(key);
        return value;
    } catch (e) {
        logger.warn('localForage read failed for key:', key, e);
        return null;
    }
}

// Yüksek hacimli API sorgu sonuçlarını TTL (Süre) bazlı cache'lemek için:
export async function idbGetCachedApi(key, ttlMs = 3600000) { // Default 1 Hour
    const data = await idbGet(key);
    if (data && data.timestamp && (Date.now() - data.timestamp < ttlMs)) {
        return data.payload;
    }
    return null;
}

export async function idbSetCachedApi(key, payload) {
    await idbSet(key, { timestamp: Date.now(), payload });
}

// Migrate data from localStorage to IndexedDB once, and load everything into in-memory cache
export async function initializeStorage() {
    if (isStorageInitialized) return;
    
    // List of keys to manage
    const keys = [
        'botBrowser_searchCollapsed',
        'botBrowser_recentlyViewed',
        'botBrowser_importStats',
        'botBrowser_bookmarks',
        'botBrowser_importedCards'
    ];

    for (const key of keys) {
        // Try to get from localStorage (legacy)
        const lsVal = localStorage.getItem(key);
        // Try to get from IndexedDB (new)
        let idbVal = await idbGet(key);
        
        // If we have legacy LS data but no IDB data, migrate it!
        if (lsVal && !idbVal) {
            try {
                const parsed = JSON.parse(lsVal);
                await idbSet(key, parsed);
                idbVal = parsed;
                // Leave it in LS or clear it? Better leave it for a while to prevent data loss.
            } catch (e) {}
        }
        
        // Load into memory cache
        if (idbVal !== undefined && idbVal !== null) {
            if (key === 'botBrowser_searchCollapsed') memoryCache.searchCollapsed = idbVal;
            if (key === 'botBrowser_recentlyViewed') memoryCache.recentlyViewed = idbVal;
            if (key === 'botBrowser_importStats') memoryCache.importStats = idbVal;
            if (key === 'botBrowser_bookmarks') memoryCache.bookmarks = idbVal;
            if (key === 'botBrowser_importedCards') memoryCache.importedCards = idbVal;
        } else if (lsVal) {
            // Only LS existed and migration failed? Just use LS
            try {
                const parsed = JSON.parse(lsVal);
                 if (key === 'botBrowser_searchCollapsed') memoryCache.searchCollapsed = parsed;
                 if (key === 'botBrowser_recentlyViewed') memoryCache.recentlyViewed = parsed;
                 if (key === 'botBrowser_importStats') memoryCache.importStats = parsed;
                 if (key === 'botBrowser_bookmarks') memoryCache.bookmarks = parsed;
                 if (key === 'botBrowser_importedCards') memoryCache.importedCards = parsed;
            } catch(e) {}
        }
    }
    
    // Also load dynamic keys (searches) from LS to memory (searches aren't usually massive so LS is fine)
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('botBrowser_lastSearch_')) {
                const serviceName = key.replace('botBrowser_lastSearch_', '');
                memoryCache.persistentSearches[serviceName] = JSON.parse(localStorage.getItem(key));
            }
        }
    } catch (e) {}

    isStorageInitialized = true;
    logger.log('Persistent storage initialized (IndexedDB + Memory Cache).');
}

// --- Sync Adapters for application logic (Synchronous reads, Asynchronous background writes) ---

export function loadPersistentSearch(extensionName, extension_settings, serviceName) {
    if (!extension_settings[extensionName].persistentSearchEnabled) return null;
    return memoryCache.persistentSearches[serviceName] || null;
}

export function savePersistentSearch(extensionName, extension_settings, serviceName, filters, sortBy, advancedFilters = null, jannyAdvancedFilters = null, ctAdvancedFilters = null, wyvernAdvancedFilters = null) {
    if (!extension_settings[extensionName].persistentSearchEnabled) return;
    const data = { filters, sortBy, advancedFilters, jannyAdvancedFilters, ctAdvancedFilters, wyvernAdvancedFilters };
    memoryCache.persistentSearches[serviceName] = data;
    try { localStorage.setItem(`botBrowser_lastSearch_${serviceName}`, JSON.stringify(data)); } catch (e) {}
}

export function loadSearchCollapsed() {
    return memoryCache.searchCollapsed;
}

export function saveSearchCollapsed(collapsed) {
    memoryCache.searchCollapsed = collapsed;
    idbSet('botBrowser_searchCollapsed', collapsed);
}

// Load recently viewed cards
export function loadRecentlyViewed(extensionName, extension_settings) {
    if (!extension_settings[extensionName].recentlyViewedEnabled) return [];
    
    let recentlyViewed = memoryCache.recentlyViewed || [];
    const maxRecent = extension_settings[extensionName].maxRecentlyViewed || 10;
    if (recentlyViewed.length > maxRecent) {
        recentlyViewed = recentlyViewed.slice(0, maxRecent);
        memoryCache.recentlyViewed = recentlyViewed;
    }
    return recentlyViewed;
}

// Add card to recently viewed
export function addToRecentlyViewed(extensionName, extension_settings, recentlyViewed, card) {
    if (!extension_settings[extensionName].recentlyViewedEnabled) {
        return recentlyViewed;
    }
    try {
        // Remove if already in list
        recentlyViewed = recentlyViewed.filter(c => c.id !== card.id);

        // Add to front - save all relevant card data for offline viewing
        recentlyViewed.unshift({
            id: card.id,
            name: card.name,
            creator: card.creator,
            avatar_url: card.avatar_url || card.image_url,
            service: card.service,
            chunk: card.chunk,
            chunk_idx: card.chunk_idx,
            sourceService: card.sourceService,
            possibleNsfw: card.possibleNsfw || false,
            // Live Chub fields for fetching full data
            isLiveChub: card.isLiveChub || false,
            fullPath: card.fullPath || null,
            nodeId: card.nodeId || null,
            isLorebook: card.isLorebook || false,
            // JannyAI fields for fetching full data
            isJannyAI: card.isJannyAI || false,
            slug: card.slug || null,
            // Character Tavern fields
            isCharacterTavern: card.isCharacterTavern || false,
            // Wyvern fields
            isWyvern: card.isWyvern || false,
            // QuillGen fields
            isQuillGen: card.service === 'quillgen' || card.sourceService === 'quillgen' || false,
            // Character data fields (for services that embed data in search results)
            description: card.description || card.tagline || card.summary || null,
            personality: card.personality || null,
            scenario: card.scenario || null,
            first_message: card.first_message || card.first_mes || null,
            mes_example: card.mes_example || null,
            alternate_greetings: card.alternate_greetings || null,
            tags: card.tags || null,
            creator_notes: card.creator_notes || null,
            nTokens: card.nTokens || card.token_count || null,
            // Store full _rawData for import support
            _rawData: card._rawData || null
        });

        // Keep only max allowed
        const maxRecent = extension_settings[extensionName].maxRecentlyViewed || 10;
        if (recentlyViewed.length > maxRecent) {
            recentlyViewed = recentlyViewed.slice(0, maxRecent);
        }

        memoryCache.recentlyViewed = recentlyViewed;
        idbSet('botBrowser_recentlyViewed', recentlyViewed); // Note: writes in background
        return recentlyViewed;
    } catch (error) {
        logger.error('Error adding to recently viewed:', error);
        return recentlyViewed;
    }
}

// Load import stats
export function loadImportStats() {
    return memoryCache.importStats;
}

// Save import stats
export function saveImportStats(importStats) {
    memoryCache.importStats = importStats;
    idbSet('botBrowser_importStats', importStats);
}

// Load bookmarks
export function loadBookmarks() {
    return memoryCache.bookmarks || [];
}

// Save bookmarks
export function saveBookmarks(bookmarks) {
    memoryCache.bookmarks = bookmarks;
    idbSet('botBrowser_bookmarks', bookmarks);
}

// Add card to bookmarks
export function addBookmark(card) {
    try {
        let bookmarks = loadBookmarks();

        // Check if already bookmarked
        if (bookmarks.some(b => b.id === card.id)) {
            logger.log('Card already bookmarked:', card.name);
            return bookmarks;
        }

        // Add bookmark with essential data
        bookmarks.unshift({
            id: card.id,
            name: card.name,
            creator: card.creator,
            avatar_url: card.avatar_url || card.image_url,
            service: card.service,
            chunk: card.chunk,
            chunk_idx: card.chunk_idx,
            sourceService: card.sourceService,
            possibleNsfw: card.possibleNsfw || false,
            isLiveChub: card.isLiveChub || false,
            fullPath: card.fullPath || null,
            nodeId: card.nodeId || null,
            isLorebook: card.isLorebook || false,
            // JannyAI fields
            isJannyAI: card.isJannyAI || false,
            slug: card.slug || null,
            // Wyvern fields
            isWyvern: card.isWyvern || false,
            bookmarkedAt: new Date().toISOString()
        });

        saveBookmarks(bookmarks);
        logger.log('Added bookmark:', card.name);
        return bookmarks;
    } catch (error) {
        logger.error('Error adding bookmark:', error);
        return loadBookmarks();
    }
}

// Remove card from bookmarks
export function removeBookmark(cardId) {
    try {
        let bookmarks = loadBookmarks();
        const before = bookmarks.length;
        bookmarks = bookmarks.filter(b => b.id !== cardId);

        if (bookmarks.length < before) {
            saveBookmarks(bookmarks);
            logger.log('Removed bookmark:', cardId);
        }
        return bookmarks;
    } catch (error) {
        logger.error('Error removing bookmark:', error);
        return loadBookmarks();
    }
}

// Check if card is bookmarked
export function isBookmarked(cardId) {
    const bookmarks = loadBookmarks();
    return bookmarks.some(b => b.id === cardId);
}

// Load imported cards
export function loadImportedCards() {
    return memoryCache.importedCards || [];
}

// Save imported cards
export function saveImportedCards(cards) {
    memoryCache.importedCards = cards;
    idbSet('botBrowser_importedCards', cards);
}

// Track an imported card with full data for browsing
export function trackImportedCard(card, type = 'character') {
    try {
        let importedCards = loadImportedCards();

        // Check if already tracked (by id)
        const existingIndex = importedCards.findIndex(c => c.id === card.id);
        if (existingIndex !== -1) {
            // Update existing entry with new timestamp
            importedCards[existingIndex].imported_at = new Date().toISOString();
            // Move to front
            const existing = importedCards.splice(existingIndex, 1)[0];
            importedCards.unshift(existing);
        } else {
            // Add new import record with essential data for browsing
            const importRecord = {
                id: card.id,
                name: card.name,
                creator: card.creator || 'Unknown',
                avatar_url: card.avatar_url || card.image_url,
                image_url: card.image_url || card.avatar_url,
                tags: card.tags || [],
                description: card.description || card.desc_preview || '',
                desc_preview: card.desc_preview || (card.description ? card.description.substring(0, 200) : ''),
                service: card.service,
                sourceService: card.sourceService || card.service,
                possibleNsfw: card.possibleNsfw || false,
                nTokens: card.nTokens || null,
                created_at: card.created_at || null,
                type: type,
                imported_at: new Date().toISOString(),
                // Store identifiers for potential re-fetch
                isLiveChub: card.isLiveChub || false,
                fullPath: card.fullPath || null,
                isJannyAI: card.isJannyAI || false,
                slug: card.slug || null,
                isCharacterTavern: card.isCharacterTavern || false,
                isMlpchag: card.isMlpchag || false,
                isWyvern: card.isWyvern || false
            };

            importedCards.unshift(importRecord);
        }

        // Keep max 500 imports
        if (importedCards.length > 500) {
            importedCards = importedCards.slice(0, 500);
        }

        saveImportedCards(importedCards);
        logger.log('Tracked imported card:', card.name);

        return importedCards;
    } catch (error) {
        logger.error('Error tracking imported card:', error);
        return loadImportedCards();
    }
}

// Remove an imported card from tracking
export function removeImportedCard(cardId) {
    try {
        let importedCards = loadImportedCards();
        const before = importedCards.length;
        importedCards = importedCards.filter(c => c.id !== cardId);

        if (importedCards.length < before) {
            saveImportedCards(importedCards);
            logger.log('Removed imported card:', cardId);
        }
        return importedCards;
    } catch (error) {
        logger.error('Error removing imported card:', error);
        return loadImportedCards();
    }
}

// Clear all imported cards
export function clearImportedCards() {
    memoryCache.importedCards = [];
    idbSet('botBrowser_importedCards', []);
    logger.log('Cleared all imported cards');
    return [];
}
