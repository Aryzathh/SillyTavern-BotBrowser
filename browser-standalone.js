/**
 * Bot Browser Standalone - Self-contained browser
 * Imports from clean API modules only (no SillyTavern dependencies)
 */

// ============================================
// IMPORTS - ALL CLEAN API MODULES
// ============================================

// Chub
import { searchChubCards, getChubCharacter, transformChubCard, transformFullChubCharacter, searchChubLorebooks, transformChubLorebook, getChubLorebook } from './modules/services/chubApi.js';

// JannyAI
import { searchJannyCharacters, fetchJannyCharacterDetails, transformJannyCard, transformFullJannyCharacter } from './modules/services/jannyApi.js';

// Backyard.ai
import { browseBackyardCharacters, searchBackyardCharacters, getBackyardCharacter, getBackyardUserProfile, transformBackyardCard, transformFullBackyardCharacter, backyardApiState, resetBackyardApiState } from './modules/services/backyardApi.js';

// Wyvern
import { searchWyvernCharacters, transformWyvernCard, wyvernApiState, resetWyvernApiState, searchWyvernLorebooks, transformWyvernLorebook, resetWyvernLorebooksApiState } from './modules/services/wyvernApi.js';

// RisuRealm
import { searchRisuRealm, transformRisuRealmCard, risuRealmApiState, resetRisuRealmState, fetchRisuRealmCharacter, transformFullRisuRealmCharacter } from './modules/services/risuRealmApi.js';

// Character Tavern
import { searchCharacterTavern, transformCharacterTavernCard, characterTavernApiState, resetCharacterTavernState } from './modules/services/characterTavernApi.js';

// Pygmalion
import { browsePygmalionCharacters, searchPygmalionCharacters, getPygmalionCharacter, transformPygmalionCard, transformFullPygmalionCharacter, pygmalionApiState, resetPygmalionApiState, PYGMALION_SORT_TYPES } from './modules/services/pygmalionApi.js';

// MLPchag
import { loadMlpchagLive, transformMlpchagCard, mlpchagApiState, resetMlpchagState } from './modules/services/mlpchagApi.js';

// Trending
import {
    fetchChubTrending, transformChubTrendingCard, chubTrendingState, resetChubTrendingState,
    fetchBackyardTrending, transformBackyardTrendingCard, backyardTrendingState, resetBackyardTrendingState, loadMoreBackyardTrending,
    fetchWyvernTrending, transformWyvernTrendingCard, wyvernTrendingState, resetWyvernTrendingState,
    fetchJannyTrending, transformJannyTrendingCard, jannyTrendingState, resetJannyTrendingState, loadMoreJannyTrending,
    fetchCharacterTavernTrending, transformCharacterTavernTrendingCard
} from './modules/services/trendingApi.js';

// RisuRealm trending
import { fetchRisuRealmTrending } from './modules/services/risuRealmApi.js';

// CORS proxy support (Puter.js is lazy-loaded by corsProxy.js when needed)
import { proxiedFetch, PROXY_TYPES, buildProxyUrl } from './modules/services/corsProxy.js';

// ============================================
// INLINE FUNCTIONS (index loading, storage)
// ============================================

const GITHUB_BASE = 'https://raw.githubusercontent.com/mia13165/updated_cards/main';
const serviceIndexes = {};
const loadedChunks = {};

// Convert RisuRealm/other formats to SillyTavern Character Card V2 format
function convertToV2Format(cardData) {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: cardData.name || cardData.data?.name || '',
            description: cardData.description || cardData.data?.description || '',
            personality: cardData.personality || cardData.data?.personality || '',
            scenario: cardData.scenario || cardData.data?.scenario || '',
            first_mes: cardData.firstMessage || cardData.first_mes || cardData.data?.first_mes || '',
            mes_example: cardData.exampleMessage || cardData.mes_example || cardData.data?.mes_example || '',
            creator_notes: cardData.creatorNotes || cardData.creator_notes || cardData.data?.creator_notes || '',
            system_prompt: cardData.systemPrompt || cardData.system_prompt || cardData.data?.system_prompt || '',
            post_history_instructions: cardData.postHistoryInstructions || cardData.post_history_instructions || cardData.data?.post_history_instructions || '',
            creator: cardData.creator || cardData.data?.creator || '',
            character_version: cardData.characterVersion || cardData.character_version || cardData.data?.character_version || '',
            tags: cardData.tags || cardData.data?.tags || [],
            alternate_greetings: cardData.alternateGreetings || cardData.alternate_greetings || cardData.data?.alternate_greetings || [],
            extensions: cardData.extensions || cardData.data?.extensions || {}
        }
    };
}

// Load chunk data from GitHub archive (contains full character data)
async function loadCardChunk(service, chunkFile) {
    const chunkKey = `${service}/${chunkFile}`;
    if (loadedChunks[chunkKey]) {
        return loadedChunks[chunkKey];
    }

    try {
        const response = await fetch(`${GITHUB_BASE}/chunks/${service}/${chunkFile}`);
        if (!response.ok) throw new Error(`Failed to load chunk ${chunkKey}`);

        const parsedData = await response.json();

        let data;
        if (Array.isArray(parsedData)) {
            data = parsedData;
        } else if (parsedData.cards) {
            data = parsedData.cards;
        } else if (parsedData.lorebooks) {
            data = parsedData.lorebooks;
        } else {
            data = [parsedData];
        }

        loadedChunks[chunkKey] = data;
        console.log(`[Bot Browser] Loaded chunk ${chunkKey} with ${data.length} items`);
        return data;
    } catch (error) {
        console.error(`[Bot Browser] Error loading chunk ${chunkKey}:`, error);
        return [];
    }
}

async function loadServiceIndex(serviceName) {
    // Return cached data if available
    if (serviceIndexes[serviceName]) {
        return serviceIndexes[serviceName];
    }

    try {
        // Load directly from {serviceName}-search.json like the original extension
        const response = await fetch(`${GITHUB_BASE}/index/${serviceName}-search.json`);
        if (!response.ok) {
            console.warn(`[Bot Browser] ${serviceName} index not found (${response.status})`);
            serviceIndexes[serviceName] = [];
            return [];
        }

        const text = await response.text();
        if (!text || text.trim().length === 0) {
            console.warn(`[Bot Browser] ${serviceName} index is empty`);
            serviceIndexes[serviceName] = [];
            return [];
        }

        const data = JSON.parse(text);

        // Handle different data formats: object with cards/lorebooks array, or direct array
        const items = data.cards || data.lorebooks || data;
        if (!Array.isArray(items)) {
            throw new Error(`Invalid data format for ${serviceName}`);
        }

        console.log(`[Bot Browser] Loaded ${items.length} items from ${serviceName} archive`);
        serviceIndexes[serviceName] = items;
        return items;
    } catch (e) {
        console.error(`[Bot Browser] ${serviceName} error:`, e);
        serviceIndexes[serviceName] = [];
        return [];
    }
}

// Load user's SillyTavern characters
async function loadMyCharacters() {
    try {
        const response = await fetch('/api/characters/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({})
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const characters = await response.json();

        // Transform to card format
        return characters.map(char => ({
            id: char.avatar || char.name,
            name: char.name || 'Unknown',
            creator: char.data?.creator || '',
            avatar_url: `/characters/${encodeURIComponent(char.avatar)}`,
            image_url: `/characters/${encodeURIComponent(char.avatar)}`,
            tags: char.data?.tags || [],
            description: char.data?.description || char.description || '',
            desc_preview: (char.data?.description || '').substring(0, 150),
            personality: char.data?.personality || '',
            scenario: char.data?.scenario || '',
            first_message: char.data?.first_mes || char.first_mes || '',
            first_mes: char.data?.first_mes || char.first_mes || '',
            mes_example: char.data?.mes_example || '',
            system_prompt: char.data?.system_prompt || '',
            creator_notes: char.data?.creator_notes || '',
            created_at: char.create_date,
            possibleNsfw: (char.data?.tags || []).some(t => t.toLowerCase() === 'nsfw'),
            service: 'local',
            sourceService: 'sillytavern',
            isLocal: true,
            _rawData: char
        }));
    } catch (e) {
        console.error('[Bot Browser Standalone] Failed to load characters:', e);
        return [];
    }
}

function loadBookmarks() {
    try { return JSON.parse(localStorage.getItem('botBrowser_bookmarks') || '[]'); } catch { return []; }
}
function saveBookmarksStorage(bookmarks) {
    try { localStorage.setItem('botBrowser_bookmarks', JSON.stringify(bookmarks)); } catch {}
}
function addBookmark(card) {
    const bookmarks = loadBookmarks();
    if (!bookmarks.some(b => b.id === card.id)) bookmarks.push(card);
    saveBookmarksStorage(bookmarks);
    return bookmarks;
}
function removeBookmark(cardId) {
    const bookmarks = loadBookmarks().filter(b => b.id !== cardId);
    saveBookmarksStorage(bookmarks);
    return bookmarks;
}
function loadImportedCards() {
    try {
        const raw = JSON.parse(localStorage.getItem('botBrowser_importedCards') || '[]');
        if (!Array.isArray(raw)) return [];
        return raw.map(normalizeImportedRecord);
    } catch {
        return [];
    }
}

function isLorebookImportRecord(record) {
    if (!record || typeof record !== 'object') return false;
    if (record.isLorebook === true) return true;

    const type = String(record.type || '').toLowerCase().trim();
    if (type.includes('lorebook') || type === 'worldinfo' || type === 'world_info' || type === 'wi') return true;

    const service = String(record.service || record.sourceService || '').toLowerCase();
    if (service.includes('lorebook') || service.includes('worldinfo') || service.includes('world_info')) return true;

    const id = String(record.id || '').toLowerCase();
    if (id.includes('/lorebooks/') || id.includes('lorebooks')) return true;

    const file = String(record.st_file_name || record.file_name || '').toLowerCase();
    if (file.endsWith('.json') && !file.endsWith('.png.json')) return true;

    return false;
}

function normalizeImportedRecord(record) {
    const r = record && typeof record === 'object' ? { ...record } : {};

    // Normalize timestamps (standalone uses importedAt; in-app uses imported_at)
    if (!r.importedAt && r.imported_at) r.importedAt = r.imported_at;
    if (!r.imported_at && r.importedAt) r.imported_at = r.importedAt;

    // Normalize description preview
    if (!r.desc_preview && r.description) r.desc_preview = String(r.description).slice(0, 500);

    // Normalize tags
    if (!Array.isArray(r.tags)) r.tags = [];

    // Robust lorebook detection for old import records
    const isLorebook = isLorebookImportRecord(r);
    r.isLorebook = isLorebook;

    // Normalize type
    if (!r.type) r.type = isLorebook ? 'lorebook' : 'character';

    return r;
}

function getAllTags(cards) {
    const m = new Map();
    cards.forEach(c => (c.tags || []).forEach(t => { const n = String(t).toLowerCase().trim(); if (!m.has(n)) m.set(n, t.trim()); }));
    return Array.from(m.values()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function getAllCreators(cards) {
    const s = new Set();
    cards.forEach(c => { if (c.creator) s.add(c.creator); });
    return Array.from(s).sort();
}

function sortCards(cards, sortBy) {
    const sorted = [...cards];
    switch (sortBy) {
        case 'date_desc': return sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        case 'date_asc': return sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
        case 'name_asc': return sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        case 'name_desc': return sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
        case 'tokens_desc': return sorted.sort((a, b) => (b.nTokens || 0) - (a.nTokens || 0));
        case 'tokens_asc': return sorted.sort((a, b) => (a.nTokens || 0) - (b.nTokens || 0));
        case 'tags_desc': return sorted.sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0));
        case 'tags_asc': return sorted.sort((a, b) => (a.tags?.length || 0) - (b.tags?.length || 0));
        case 'downloads_desc': return sorted.sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
        case 'stars_desc': return sorted.sort((a, b) => (b.starCount || 0) - (a.starCount || 0));
        case 'import_desc': return sorted.sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0));
        case 'import_asc': return sorted.sort((a, b) => new Date(a.importedAt || 0) - new Date(b.importedAt || 0));
        default: return sorted;
    }
}

// ============================================
// SHARED STATE WITH MAIN EXTENSION
// ============================================

const SETTINGS_KEY = 'botBrowser_settings';
const EXTENSION_NAME = 'bot-browser';

// State
const state = {
    currentSource: null,
    currentCards: [],
    filteredCards: [],
    sourceCards: [], // Original cards from source before creator/tag search
    isCreatorFiltered: false, // Whether viewing creator-specific results
    creatorSearchOrigin: null, // 'searchInput' | 'creatorFilter' | null
    isRemoteSearch: false, // Whether current cards are from a remote search
    remoteSearchQuery: '',
    remoteSearchKind: null, // 'text' | 'tag' | 'creator'
    remoteSearchOriginSource: null, // Source to return to when clearing remote-search results
    pendingSearch: '', // Search box draft value (remote sources submit on Enter)
    importsTypeFilter: 'characters', // 'characters' | 'lorebooks' | 'all'
    bookmarks: [],
    imports: [],
    myCharacterNames: new Set(), // Track owned character names for "already owned" indicator
    filters: {
        search: '',
        searchField: 'all',
        tags: [],
        mandatoryTags: [], // Must have ALL of these
        facultativeTags: [], // Must have at least ONE of these
        excludedTags: [], // Must NOT have any of these
        creators: [],
        favoritesOnly: false,
        ownedOnly: false,
        lorebookOnly: false,
        altGreetingsOnly: false,
        localFavoritesOnly: false // Local favorites filter
    },
    sortBy: 'relevance',
    settings: null,
    currentPage: 1,
    selectedCard: null,
    isLoading: false,
    activeRequestId: 0,
    chubHasMore: false,
    // Bulk selection
    bulkSelectMode: false,
    selectedCards: new Set(), // Card IDs
    // Creator grouping
    groupByCreator: false,
    collapsedGroups: new Set(), // Creator names that are collapsed

    // Creator-search restore
    sourceBeforeCreatorFilter: null,
};

// CSRF Token
let csrfToken = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Bot Browser Standalone] Initializing...');

    // Get CSRF token
    const urlParams = new URLSearchParams(window.location.search);
    csrfToken = urlParams.get('csrf') || await fetchCsrfToken();

    // Load shared settings from localStorage (same as main extension)
    loadSharedSettings();

    // Load saved data
    state.bookmarks = loadBookmarks();
    state.imports = loadImportedCards();

    // Setup UI
    setupSourceButtons();
    setupViewToggle();
    setupImportsTypeToggle();
    setupSearch();
    setupFilters();
    setupModals();
    setupSettings();
    setupMobileMenu();

    // Logo click - go to My Characters
    document.getElementById('logoArea')?.addEventListener('click', () => {
        clearAllFilters();
        loadSource(csrfToken ? 'my_characters' : 'chub_trending');
    });

    // Apply initial settings
    applySettings();

    // Hide loading on init
    hideLoading();

    // Default landing page: local library when running under SillyTavern, otherwise a live source.
    loadSource(csrfToken ? 'my_characters' : 'chub_trending');

    console.log('[Bot Browser Standalone] Ready!');
});

function setupImportsTypeToggle() {
    const wrap = document.getElementById('importsTypeToggle');
    if (!wrap) return;

    wrap.querySelectorAll('.imports-type-btn')?.forEach((btn) => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.importsType || 'characters';
            state.importsTypeFilter = type;
            wrap.querySelectorAll('.imports-type-btn').forEach((b) => b.classList.toggle('active', b === btn));
            applyFilters();
        });
    });

    updateImportsTypeToggleVisibility();
}

function updateImportsTypeToggleVisibility() {
    const wrap = document.getElementById('importsTypeToggle');
    if (!wrap) return;
    wrap.classList.toggle('hidden', state.currentSource !== 'imports');
}

async function fetchCsrfToken() {
    try {
        const response = await fetch('/csrf-token');
        if (response.ok) {
            const data = await response.json();
            return data.token;
        }
    } catch (e) {
        console.error('[Bot Browser Standalone] Failed to fetch CSRF token:', e);
    }
    return null;
}

function resetResultsUiForLoading() {
    const grid = document.getElementById('cardsGrid');
    const noResults = document.getElementById('noResults');
    if (grid) {
        grid.classList.add('hidden');
        grid.innerHTML = '';
    }
    noResults?.classList.add('hidden');
    document.getElementById('pagination')?.classList.add('hidden');
    updateResultsCount();
}

function getFriendlyLoadError(error, source) {
    const raw = (error?.message || String(error || '')).trim();
    if (!raw) return 'Unknown error';

    if (raw.includes('All proxies failed')) {
        if (raw.toLowerCase().includes('unauthorized (puter)')) {
            return `${getServiceDisplayName(source)} is blocked by CORS/Cloudflare and Puter is not signed in. Open Puter in a tab, sign in, then retry.`;
        }
        if (raw.includes('(413)') || raw.toLowerCase().includes('payload too large')) {
            return `${getServiceDisplayName(source)} response is too large for some free proxies. Try again (it will rotate proxies), or enable/sign in to Puter for best reliability.`;
        }
        return `${getServiceDisplayName(source)} is blocked by CORS/proxies. ${raw}`;
    }

    return raw;
}

// ============================================
// SHARED SETTINGS (synced with main extension)
// ============================================

function loadSharedSettings() {
    // Try to load from SillyTavern's extension settings first
    try {
        const stSettings = localStorage.getItem('settings');
        if (stSettings) {
            const parsed = JSON.parse(stSettings);
            if (parsed[EXTENSION_NAME]) {
                state.settings = parsed[EXTENSION_NAME];
                console.log('[Bot Browser Standalone] Loaded settings from SillyTavern');
                return;
            }
        }
    } catch (e) {
        console.warn('[Bot Browser Standalone] Could not load ST settings:', e);
    }

    // Fallback to standalone settings
    try {
        const saved = localStorage.getItem('botBrowser_standaloneSettings');
        if (saved) {
            state.settings = JSON.parse(saved);
            return;
        }
    } catch (e) {
        console.warn('[Bot Browser Standalone] Could not load standalone settings:', e);
    }

    // Default settings
    state.settings = {
        hideNsfw: false,
        blurCards: false,
        blurNsfw: true,
        cardsPerPage: 50,
        tagBlocklist: [],
        chubToken: '',
        authHeadersJson: '',
        useChubLiveApi: true,
        useCharacterTavernLiveApi: false,
        useWyvernLiveApi: true,
        useRisuRealmLiveApi: true,
        useJannyAiLiveApi: true,
        useBackyardLiveApi: true,
        usePygmalionLiveApi: true
    };
}

function saveSettings() {
    try {
        localStorage.setItem('botBrowser_standaloneSettings', JSON.stringify(state.settings));
    } catch (e) {
        console.error('[Bot Browser Standalone] Failed to save settings:', e);
    }
}

function applySettings() {
    document.body.classList.toggle('blur-all-cards', state.settings.blurCards);
    document.body.classList.toggle('blur-nsfw-cards', state.settings.blurNsfw);

    // Apply optional service auth headers (used by proxiedFetch in corsProxy.js)
    try {
        const raw = (state.settings.authHeadersJson || '').toString().trim();
        const parsed = raw ? JSON.parse(raw) : {};
        const authMap = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};

        // Chub token is a special case: it must be injected as headers (not Authorization) to enable
        // account-specific features (favorites, etc.) and some repository fetches.
        const chubToken = (state.settings.chubToken || '').toString().trim();
        if (chubToken) {
            const chubHeaders = {
                samwise: chubToken,
                'CH-API-KEY': chubToken,
                'private-token': chubToken,
            };
            authMap.chub = { ...(authMap.chub || {}), ...chubHeaders };
            authMap.chub_favorites = { ...(authMap.chub_favorites || {}), ...chubHeaders };
            authMap.chub_timeline = { ...(authMap.chub_timeline || {}), ...chubHeaders };
        }

        if (!authMap || typeof authMap !== 'object' || Array.isArray(authMap) || Object.keys(authMap).length === 0) {
            delete window.__BOT_BROWSER_AUTH_HEADERS;
        } else {
            window.__BOT_BROWSER_AUTH_HEADERS = authMap;
        }
    } catch {
        // Ignore parse errors here; save flow validates and warns.
        delete window.__BOT_BROWSER_AUTH_HEADERS;
    }
}

// ============================================
// MOBILE MENU
// ============================================

function setupMobileMenu() {
    // Create mobile menu toggle button
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.mobile-menu-toggle')) {
        const menuBtn = document.createElement('button');
        menuBtn.className = 'mobile-menu-toggle glass-btn icon-only';
        menuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
        menuBtn.addEventListener('click', toggleMobileSidebar);
        topbar.insertBefore(menuBtn, topbar.firstChild);
    }

    // Close sidebar when clicking overlay
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar?.classList.contains('open') && !e.target.closest('.sidebar') && !e.target.closest('.mobile-menu-toggle')) {
            sidebar.classList.remove('open');
            document.body.classList.remove('sidebar-open');
        }
    });
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar?.classList.toggle('open');
    document.body.classList.toggle('sidebar-open');
}

// ============================================
// SOURCE LOADING
// ============================================

function setupSourceButtons() {
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const source = btn.dataset.source;
            if (source) {
                loadSource(source);
                setActiveSourceButton(source);
                // Close mobile sidebar after selection
                document.querySelector('.sidebar')?.classList.remove('open');
                document.body.classList.remove('sidebar-open');
            }
        });
    });

    document.getElementById('randomCardBtn')?.addEventListener('click', loadRandomCard);
}

function setActiveSourceButton(source) {
    document.querySelectorAll('.source-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.source === source);
    });
}

async function loadSource(source) {
    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;

    const searchInput = document.getElementById('searchInput');
    const currentSearchValue = (searchInput?.value || '').trim();
    const normalizedSearchValue = currentSearchValue.toLowerCase().trim();
    const shouldCarryRemoteSearch = state.isRemoteSearch &&
        state.remoteSearchQuery &&
        normalizedSearchValue === state.remoteSearchQuery;

    state.currentSource = source;
    state.currentCards = [];
    state.filteredCards = [];
    state.currentPage = 1;
    state.chubHasMore = false;
    state.chubTimelinePage = 1;
    state.chubTimelineHasMore = false;
    state.chubFavoritesPage = 1;
    state.chubFavoritesHasMore = false;

    // Update search button labels to show current source
    updateSearchButtonLabels(source);
    setActiveSourceButton(source);

    // Improve UX: make it explicit when the current source only searches on Enter.
    if (searchInput) {
        const { textSearch } = getSourceCapabilities(source);
        searchInput.placeholder = textSearch ? 'Search (press Enter)…' : 'Search…';
    }

    // Reset page counters for API pagination
    state.chubPage = 1;
    state.jannyPage = 1;

    hideWelcome();
    resetResultsUiForLoading();

    // If the user explicitly performed a remote search, keep that intent when switching sources.
    // This avoids the confusing "0 cards" state caused by local filtering on a single browse page.
    const caps = getSourceCapabilities(source);
    if (shouldCarryRemoteSearch && caps.textSearch && currentSearchValue) {
        state.isRemoteSearch = false;
        state.remoteSearchQuery = '';
        state.remoteSearchKind = null;
        state.remoteSearchOriginSource = null;
        await searchTextOnSource(currentSearchValue);
        return;
    }

    state.isLoading = true;
    state.isRemoteSearch = false;
    state.remoteSearchQuery = '';
    state.remoteSearchKind = null;
    state.remoteSearchOriginSource = null;

    showLoading();

    try {
        let cards = [];

        // Ensure we have the owned characters list loaded (for "already owned" indicator)
        if (state.myCharacterNames.size === 0 && source !== 'my_characters') {
            const myChars = await loadMyCharacters();
            if (isStale()) return;
            state.myCharacterNames = new Set(myChars.map(c => c.name?.toLowerCase().trim()).filter(Boolean));
        }

        // ===============================
        // MY LIBRARY
        // ===============================
        if (source === 'my_characters') {
            showToast('Loading your characters...', 'info');
            cards = await loadMyCharacters();
            if (isStale()) return;
            // Update owned character names for "already owned" indicator
            state.myCharacterNames = new Set(cards.map(c => c.name?.toLowerCase().trim()).filter(Boolean));
        }
        // ===============================
        // LIVE APIs
        // ===============================
        // Chub Live API
        else if (source === 'chub' && state.settings.useChubLiveApi) {
            showToast('Loading from Chub API...', 'info');
            const result = await searchChubCards({
                search: '',
                nsfw: !state.settings.hideNsfw,
                limit: 48
            });
            if (isStale()) return;
            // API returns { data: { nodes: [...] } }
            cards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
            state.chubHasMore = cards.length >= 48;
        }
        // Chub Timeline (Chub API)
        else if (source === 'chub_timeline') {
            showToast('Loading Chub timeline...', 'info');
            const result = await fetchChubTimeline(1);
            if (isStale()) return;
            cards = (result.nodes || []).map(transformChubCard);
            state.chubTimelinePage = 1;
            state.chubTimelineHasMore = !!result.hasMore;
        }
        // Chub Favorites (requires token to show anything)
        else if (source === 'chub_favorites') {
            showToast('Loading Chub favorites...', 'info');
            const result = await fetchChubFavorites(1, 48);
            if (isStale()) return;
            cards = (result.nodes || []).map(transformChubCard);
            state.chubFavoritesPage = 1;
            state.chubFavoritesHasMore = !!result.hasMore;
        }
        // JannyAI Live API
        else if (source === 'jannyai') {
            showToast('Loading from JannyAI...', 'info');
            const result = await searchJannyCharacters({
                search: '',
                nsfw: !state.settings.hideNsfw,
                page: 1
            });
            if (isStale()) return;
            // searchJannyCharacters returns raw MeiliSearch response: { results: [{ hits, totalHits, ... }] }
            const hits = result?.results?.[0]?.hits || [];
            cards = hits.map(transformJannyCard);
        }
        // Backyard.ai Live API
        else if (source === 'backyard') {
            showToast('Loading from Backyard.ai...', 'info');
            resetBackyardApiState();
            const result = await browseBackyardCharacters({
                type: state.settings.hideNsfw ? 'sfw' : 'all'
            });
            if (isStale()) return;
            cards = (result.characters || []).map(transformBackyardCard);
            backyardApiState.cursor = result.nextCursor;
            backyardApiState.hasMore = result.hasMore;
        }
        // Pygmalion Live API
        else if (source === 'pygmalion') {
            showToast('Loading from Pygmalion...', 'info');
            resetPygmalionApiState();
            const result = await browsePygmalionCharacters({
                includeSensitive: !state.settings.hideNsfw
            });
            if (isStale()) return;
            // browsePygmalionCharacters returns { characters: [] (already transformed), hasMore }
            cards = result.characters || [];
            pygmalionApiState.hasMore = result.hasMore;
        }
        // Character Tavern Live API
        else if (source === 'character_tavern' && state.settings.useCharacterTavernLiveApi) {
            showToast('Loading from Character Tavern...', 'info');
            resetCharacterTavernState();
            // searchCharacterTavern returns array directly (already transformed)
            cards = await searchCharacterTavern({
                query: ''
            }) || [];
            if (isStale()) return;
            // Set hasMore based on whether we got a full page
            characterTavernApiState.hasMore = cards.length >= 30;
        }
        // Wyvern Live API
        else if (source === 'wyvern' && state.settings.useWyvernLiveApi) {
            showToast('Loading from Wyvern Chat...', 'info');
            resetWyvernApiState();
            const result = await searchWyvernCharacters({
                search: '',
                limit: state.settings.cardsPerPage || 50,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            // searchWyvernCharacters returns { results: [], hasMore }
            cards = (result.results || []).map(transformWyvernCard);
            wyvernApiState.hasMore = result.hasMore;
        }
        // RisuRealm Live API
        else if (source === 'risuai_realm' && state.settings.useRisuRealmLiveApi) {
            showToast('Loading from RisuRealm...', 'info');
            resetRisuRealmState();
            const result = await searchRisuRealm({
                search: '',
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            // searchRisuRealm returns raw cards - need to transform them
            cards = (result.cards || []).map(transformRisuRealmCard);
            risuRealmApiState.hasMore = result.hasMore;
        }
        // MLPchag Live API
        else if (source === 'mlpchag') {
            showToast('Loading from MLPchag...', 'info');
            resetMlpchagState();
            // loadMlpchagLive returns array directly
            cards = await loadMlpchagLive() || [];
            if (isStale()) return;
        }
        // ===============================
        // TRENDING SOURCES
        // ===============================
        else if (source === 'chub_trending') {
            showToast('Loading Chub Trending...', 'info');
            resetChubTrendingState();
            const result = await fetchChubTrending({ nsfw: !state.settings.hideNsfw, page: 1 });
            if (isStale()) return;
            cards = (result?.nodes || []).map(transformChubTrendingCard);
        }
        else if (source === 'backyard_trending') {
            showToast('Loading Backyard Trending...', 'info');
            resetBackyardTrendingState();
            const result = await fetchBackyardTrending();
            if (isStale()) return;
            cards = (result?.characters || []).map(transformBackyardTrendingCard);
        }
        else if (source === 'wyvern_trending') {
            showToast('Loading Wyvern Trending...', 'info');
            resetWyvernTrendingState();
            const result = await fetchWyvernTrending({
                limit: state.settings.cardsPerPage || 50,
                rating: state.settings.hideNsfw ? 'none' : 'all'
            });
            if (isStale()) return;
            cards = (result?.results || []).map(transformWyvernTrendingCard);
        }
        else if (source === 'jannyai_trending') {
            showToast('Loading JannyAI Trending...', 'info');
            resetJannyTrendingState();
            const result = await fetchJannyTrending({ page: 1 });
            if (isStale()) return;
            cards = (result?.characters || []).map(transformJannyTrendingCard);
        }
        else if (source === 'character_tavern_trending') {
            showToast('Loading Character Tavern Trending...', 'info');
            const result = await fetchCharacterTavernTrending();
            if (isStale()) return;
            cards = (result?.hits || []).map(transformCharacterTavernTrendingCard);
        }
        else if (source === 'risuai_realm_trending') {
            showToast('Loading RisuRealm Trending...', 'info');
            const result = await fetchRisuRealmTrending({ nsfw: !state.settings.hideNsfw });
            if (isStale()) return;
            // Need to transform the raw cards
            cards = (result?.cards || []).map(transformRisuRealmCard);
        }
        else if (source === 'pygmalion_trending') {
            showToast('Loading Pygmalion Trending...', 'info');
            resetPygmalionApiState();
            const result = await browsePygmalionCharacters({
                orderBy: PYGMALION_SORT_TYPES.VIEWS,
                includeSensitive: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.characters || []).map(card => ({
                ...card,
                sourceService: 'pygmalion_trending',
                isTrending: true
            }));
            pygmalionApiState.hasMore = result.hasMore;
        }
        // ===============================
        // LOREBOOKS
        // ===============================
        else if (source === 'chub_lorebooks') {
            showToast('Loading Chub Lorebooks...', 'info');
            const result = await searchChubLorebooks({ nsfw: !state.settings.hideNsfw });
            if (isStale()) return;
            // API returns { data: { nodes: [...] } }
            cards = (result?.data?.nodes || result?.nodes || []).map(transformChubLorebook);
        }
        else if (source === 'wyvern_lorebooks') {
            showToast('Loading Wyvern Lorebooks...', 'info');
            resetWyvernLorebooksApiState();
            const result = await searchWyvernLorebooks({ limit: state.settings.cardsPerPage || 50, hideNsfw: state.settings.hideNsfw });
            if (isStale()) return;
            cards = (result?.results || []).map(transformWyvernLorebook);
        }
        // ===============================
        // ARCHIVE INDEXES (GitHub)
        // ===============================
        else {
            showToast(`Loading ${source}...`, 'info');
            const rawCards = await loadServiceIndex(source) || [];
            if (isStale()) return;
            // Add service markers to archive cards
            cards = rawCards.map(card => ({
                ...card,
                service: card.service || source,
                sourceService: card.sourceService || source,
                isArchive: true
            }));
        }

        if (isStale()) return;
        state.currentCards = cards;
        setActiveSourceButton(state.currentSource);
        updateSearchButtonLabels(state.currentSource);
        applyFilters();

        if (cards.length > 0) {
            showToast(`Loaded ${cards.length} cards`, 'success');
        } else {
            showToast('No cards found', 'info');
        }

    } catch (error) {
        if (isStale()) return;
        console.error('[Bot Browser Standalone] Failed to load source:', error);
        const friendly = getFriendlyLoadError(error, source);
        showToast(`Failed to load: ${friendly}`, 'error');
        state.currentCards = [];
        state.filteredCards = [];
        resetResultsUiForLoading();
        showNoResults(friendly);
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

async function loadRandomCard() {
    const randInt = (maxExclusive) => Math.floor(Math.random() * Math.max(0, maxExclusive));
    const pickFrom = (arr) => arr[randInt(arr.length)];

    // Keep this list "characters only" (no lorebooks).
    // Sources with good totals/pagination will use deep random; archives fall back to index-based random.
    const sources = ['chub', 'jannyai', 'backyard', 'pygmalion', 'character_tavern', 'catbox', 'webring', 'risuai_realm'];
    const source = pickFrom(sources);
    const sourceName = getServiceDisplayName(source);

    // Ensure random isn't accidentally filtered down to nothing by leftover UI state.
    state.isRemoteSearch = false;
    state.remoteSearchQuery = '';
    state.isCreatorFiltered = false;
    state.creatorSearchOrigin = null;
    state.sourceCards = [];
    state.sourceBeforeCreatorFilter = null;
    clearAllFilters();

    showToast(`Finding a random card from ${sourceName}...`, 'info');

    // For archive/index sources (and any live API toggled off), load the full index and pick uniformly from it.
    const isArchiveLike = (
        source === 'catbox' ||
        source === 'webring' ||
        (source === 'chub' && !state.settings.useChubLiveApi) ||
        (source === 'character_tavern' && !state.settings.useCharacterTavernLiveApi) ||
        (source === 'risuai_realm' && !state.settings.useRisuRealmLiveApi)
    );

    if (isArchiveLike) {
        await loadSource(source);
        if (state.filteredCards.length > 0) {
            showCardModal(pickFrom(state.filteredCards));
        }
        return;
    }

    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        const { textSearch } = getSourceCapabilities(source);
        searchInput.placeholder = textSearch ? 'Search (press Enter)…' : 'Search…';
    }

    state.currentSource = source;
    state.currentCards = [];
    state.filteredCards = [];
    state.currentPage = 1;

    updateSearchButtonLabels(source);
    setActiveSourceButton(source);

    hideWelcome();
    resetResultsUiForLoading();
    state.isLoading = true;
    showLoading();

    try {
        // Ensure we have the owned characters list loaded (for "already owned" indicator)
        if (state.myCharacterNames.size === 0 && source !== 'my_characters') {
            const myChars = await loadMyCharacters();
            if (isStale()) return;
            state.myCharacterNames = new Set(myChars.map(c => c.name?.toLowerCase().trim()).filter(Boolean));
        }

        let cards = [];
        let selectedId = null;

        // ------------------------------
        // Chub (deep random via gateway count + offset)
        // ------------------------------
        if (source === 'chub') {
            const pageSize = 48;

            const fetchGateway = async (params) => {
                const response = await proxiedFetch(`https://gateway.chub.ai/search?${params}`, {
                    service: 'chub_gateway',
                    fetchOptions: {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            ...getChubAuthHeaders(),
                        }
                    }
                });
                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    throw new Error(`Chub gateway error ${response.status}: ${text}`);
                }
                return response.json();
            };

            const nsfw = String(!state.settings.hideNsfw);
            const nsfl = String(!state.settings.hideNsfl);

            // 1) Get total count (cheap: first=1)
            const countParams = new URLSearchParams({
                search: '',
                first: '1',
                page: '1',
                namespace: 'characters',
                nsfw,
                nsfl,
                count: 'true',
            });

            const countData = await fetchGateway(countParams);
            if (isStale()) return;
            const total = countData?.data?.count ?? countData?.count;
            if (!Number.isFinite(total) || total <= 0) {
                throw new Error('Chub gateway did not return a total count');
            }

            // 2) Pick a uniform offset in [0, total)
            const offset = randInt(total);
            const page = Math.floor(offset / pageSize) + 1;
            const index = offset % pageSize;

            // 3) Fetch the page that contains the offset and select the index.
            const pageParams = new URLSearchParams({
                search: '',
                first: String(pageSize),
                page: String(page),
                namespace: 'characters',
                nsfw,
                nsfl,
                count: 'false',
            });

            const pageData = await fetchGateway(pageParams);
            if (isStale()) return;

            const nodes = pageData?.data?.nodes || pageData?.nodes || [];
            cards = nodes.map(transformChubCard);
            const chosen = cards[Math.min(index, Math.max(0, cards.length - 1))];
            selectedId = chosen?.id || null;
        }
        // ------------------------------
        // JannyAI (deep random via totalHits + offset)
        // ------------------------------
        else if (source === 'jannyai') {
            const pageSize = 40;
            const meta = await searchJannyCharacters({ search: '', page: 1, limit: 1, nsfw: !state.settings.hideNsfw });
            if (isStale()) return;

            const total = meta?.results?.[0]?.totalHits ?? 0;
            if (!Number.isFinite(total) || total <= 0) {
                throw new Error('JannyAI did not return totalHits');
            }

            const offset = randInt(total);
            const page = Math.floor(offset / pageSize) + 1;
            const index = offset % pageSize;

            const result = await searchJannyCharacters({ search: '', page, limit: pageSize, nsfw: !state.settings.hideNsfw });
            if (isStale()) return;

            const hits = result?.results?.[0]?.hits || [];
            cards = hits.map(transformJannyCard);
            const chosen = cards[Math.min(index, Math.max(0, cards.length - 1))];
            selectedId = chosen?.id || null;
        }
        // ------------------------------
        // Pygmalion (deep random via totalItems + offset)
        // ------------------------------
        else if (source === 'pygmalion') {
            const pageSize = 60;
            const includeSensitive = !state.settings.hideNsfw;

            const meta = await searchPygmalionCharacters({ query: '', includeSensitive, pageSize: 1, page: 1 });
            if (isStale()) return;

            const total = meta?.totalItems ?? 0;
            if (!Number.isFinite(total) || total <= 0) {
                throw new Error('Pygmalion did not return totalItems');
            }

            const offset = randInt(total);
            const page = Math.floor(offset / pageSize) + 1;
            const index = offset % pageSize;

            const result = await searchPygmalionCharacters({ query: '', includeSensitive, pageSize, page });
            if (isStale()) return;

            cards = (result.characters || []).map(transformPygmalionCard);
            const chosen = cards[Math.min(index, Math.max(0, cards.length - 1))];
            selectedId = chosen?.id || null;
        }
        // ------------------------------
        // Character Tavern (deep random via totalHits + offset)
        // ------------------------------
        else if (source === 'character_tavern') {
            const pageSize = 30;
            resetCharacterTavernState();

            // First request populates `characterTavernApiState.totalHits` reliably.
            await searchCharacterTavern({ query: '', page: 1, limit: 1 });
            if (isStale()) return;

            const total = characterTavernApiState.totalHits ?? 0;
            if (!Number.isFinite(total) || total <= 0) {
                throw new Error('Character Tavern did not return totalHits');
            }

            const offset = randInt(total);
            const page = Math.floor(offset / pageSize) + 1;
            const index = offset % pageSize;

            cards = await searchCharacterTavern({ query: '', page, limit: pageSize }) || [];
            if (isStale()) return;

            const chosen = cards[Math.min(index, Math.max(0, cards.length - 1))];
            selectedId = chosen?.id || null;
        }
        // ------------------------------
        // RisuRealm (best-effort random across pages; no reliable total count exposed)
        // ------------------------------
        else if (source === 'risuai_realm') {
            resetRisuRealmState();
            const nsfw = !state.settings.hideNsfw;

            const meta = await searchRisuRealm({ search: '', nsfw, page: 1 });
            if (isStale()) return;

            const totalPages = meta?.totalPages ?? 1;
            const page = Math.max(1, randInt(totalPages) + 1);
            const result = page === 1 ? meta : await searchRisuRealm({ search: '', nsfw, page });
            if (isStale()) return;

            cards = (result.cards || []).map(transformRisuRealmCard);
            const chosen = pickFrom(cards);
            selectedId = chosen?.id || null;
        }
        // ------------------------------
        // Backyard.ai (best-effort random walk; cursor-based, no total count)
        // ------------------------------
        else if (source === 'backyard') {
            resetBackyardApiState();
            let cursor = null;
            let pageResult = null;

            // Random-walk a few cursors forward to avoid always sampling the first page.
            const steps = randInt(6); // 0..5
            for (let i = 0; i <= steps; i++) {
                pageResult = await browseBackyardCharacters({
                    type: state.settings.hideNsfw ? 'sfw' : 'all',
                    cursor
                });
                if (isStale()) return;
                cursor = pageResult?.nextCursor || null;
                if (!cursor) break;
            }

            cards = (pageResult?.characters || []).map(transformBackyardCard);
            const chosen = pickFrom(cards);
            selectedId = chosen?.id || null;
        }

        if (!cards || cards.length === 0) {
            showNoResults('No cards found');
            return;
        }

        state.currentCards = cards;
        applyFilters();

        // Prefer the chosen card as it exists in the filtered list (so it has bookmark/owned flags).
        const chosenFromFiltered = selectedId
            ? state.filteredCards.find(c => String(c.id) === String(selectedId))
            : null;

        const fallback = state.filteredCards.length > 0 ? pickFrom(state.filteredCards) : null;
        if (chosenFromFiltered || fallback) {
            showCardModal(chosenFromFiltered || fallback);
        }
    } catch (error) {
        if (isStale()) return;
        console.error('[Bot Browser Standalone] Random card failed:', error);
        showToast(`Random failed: ${error.message}`, 'error');

        // Fallback: load the source normally and pick from the loaded page/index.
        try {
            await loadSource(source);
            if (state.filteredCards.length > 0) {
                showCardModal(pickFrom(state.filteredCards));
            }
        } catch {}
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

// ============================================
// VIEW TOGGLE
// ============================================

function setupViewToggle() {
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Reset source selection
            document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));

            switch (view) {
                case 'browse':
                    state.currentSource = null;
                    state.currentCards = [];
                    state.filteredCards = [];
                    showWelcome();
                    break;
                case 'bookmarks':
                    showBookmarksView();
                    break;
                case 'imports':
                    showImports();
                    break;
            }

            updateImportsTypeToggleVisibility();
        });
    });
}

function showBookmarksView() {
    state.currentSource = 'bookmarks';
    state.currentCards = state.bookmarks.map(b => ({ ...b, isBookmarked: true }));
    applyFilters();

    hideWelcome();
    hideLoading();

    if (state.bookmarks.length === 0) {
        showNoResults('No bookmarked cards yet. Bookmark cards to see them here!');
    }
}

function showImports() {
    state.currentSource = 'imports';
    state.currentCards = state.imports;

    // Match the in-app UX: default to imported characters unless the user switches the toggle.
    if (!state.importsTypeFilter) state.importsTypeFilter = 'characters';
    const wrap = document.getElementById('importsTypeToggle');
    if (wrap) {
        wrap.querySelectorAll('.imports-type-btn').forEach((b) => {
            b.classList.toggle('active', (b.dataset.importsType || 'characters') === state.importsTypeFilter);
        });
    }
    applyFilters();

    hideWelcome();
    hideLoading();

    if (state.imports.length === 0) {
        showNoResults('No imported cards tracked. Import cards to see them here!');
    }
}


// ============================================
// SEARCH & FILTERS
// ============================================

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');

    let debounceTimer;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);

        const value = e.target.value;
        clearBtn?.classList.toggle('hidden', !value);

        // For API-backed sources, only search remotely on Enter (no live narrowing while typing).
        // This avoids confusing "no results" flashes and keeps UX consistent across sources.
        const caps = getSourceCapabilities(state.currentSource);
        if (caps.textSearch) {
            const trimmed = value.trim();
            // Keep the draft in sync, but don't apply it until Enter.
            state.pendingSearch = value;

            // If user cleared the box, exit remote-search mode and restore the source browse view.
            if (!trimmed && state.isRemoteSearch) {
                state.isRemoteSearch = false;
                state.remoteSearchQuery = '';
                state.remoteSearchKind = null;
                const origin = state.remoteSearchOriginSource || state.currentSource;
                state.remoteSearchOriginSource = null;
                state.filters.search = '';
                state.pendingSearch = '';
                if (origin) loadSource(origin);
            }

            // If this view was produced by a creator search triggered from the main search bar,
            // clearing the search bar should also clear the creator filter and restore browsing.
            if (!trimmed && state.isCreatorFiltered && state.creatorSearchOrigin === 'searchInput') {
                state.filters.creators = [];
                state.creatorSearchOrigin = null;
                restoreCreatorFilteredViewIfNeeded();
                state.isCreatorFiltered = false;
                state.sourceCards = [];
                state.sourceBeforeCreatorFilter = null;
                updateCreatorFilterLabel();
                applyFilters();
                populateCreatorList();
            }
            return;
        }

        debounceTimer = setTimeout(() => {
            state.filters.search = e.target.value;
            state.pendingSearch = state.filters.search;
            applyFilters();
        }, 300);
    });

    // Press Enter to search the current source remotely (when supported)
    searchInput?.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const query = searchInput.value.trim();
        if (!query) return;
        e.preventDefault();

        state.pendingSearch = searchInput.value;
        state.filters.search = query;

        // Power-user prefixes (inspired by other gallery UIs, but kept lightweight)
        // - creator:Name  (or @Name) triggers creator search on source
        // - tag:TagName   (or #TagName) triggers tag search on source
        const creatorMatch = query.match(/^(?:creator:|@)(.+)$/i);
        if (creatorMatch?.[1]) {
            await searchCreatorOnSource(creatorMatch[1].trim(), { origin: 'searchInput' });
            return;
        }

        const tagMatch = query.match(/^(?:tag:|#)(.+)$/i);
        if (tagMatch?.[1]) {
            await searchTagOnSource(tagMatch[1].trim());
            return;
        }

        await searchTextOnSource(query);
    });

    clearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        state.filters.search = '';
        state.pendingSearch = '';
        clearBtn.classList.add('hidden');

        if (state.isCreatorFiltered && state.creatorSearchOrigin === 'searchInput') {
            state.filters.creators = [];
            state.creatorSearchOrigin = null;
            restoreCreatorFilteredViewIfNeeded();
            state.isCreatorFiltered = false;
            state.sourceCards = [];
            state.sourceBeforeCreatorFilter = null;
            updateCreatorFilterLabel();
            populateCreatorList();
        }
        // If we were showing remote-search results, reload the origin source's default browse list.
        if (state.isRemoteSearch && (state.remoteSearchOriginSource || state.currentSource)) {
            const origin = state.remoteSearchOriginSource || state.currentSource;
            state.remoteSearchOriginSource = null;
            state.remoteSearchKind = null;
            loadSource(origin);
            return;
        }
        applyFilters();
    });
}

function requestSillyTavernCharactersRefresh() {
    const msg = { type: 'botbrowser_refresh_characters' };

    // BroadcastChannel works even if standalone was opened without `window.opener`.
    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('botbrowser');
            bc.postMessage(msg);
            // Close immediately to avoid leaking channels.
            bc.close();
        }
    } catch {}

    // Also try postMessage to opener when available.
    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(msg, window.location.origin);
        }
    } catch {}
}

function requestSillyTavernWorldInfoRefresh() {
    const msg = { type: 'botbrowser_refresh_worldinfo' };

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('botbrowser');
            bc.postMessage(msg);
            bc.close();
        }
    } catch {}

    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(msg, window.location.origin);
        }
    } catch {}
}

function requestSillyTavernOpenCharacter({ fileName, name } = {}) {
    const msg = { type: 'botbrowser_open_character', fileName: fileName || '', name: name || '' };

    try {
        if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('botbrowser');
            bc.postMessage(msg);
            bc.close();
        }
    } catch {}

    try {
        if (window.opener && !window.opener.closed) {
            window.opener.postMessage(msg, window.location.origin);
        }
    } catch {}
}

function setupFilters() {
    // Sort select
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        applyFilters();
    });

    // Search field select
    document.getElementById('searchFieldSelect')?.addEventListener('change', (e) => {
        state.filters.searchField = e.target.value;
        if (state.filters.search) {
            applyFilters();
        }
    });

    // Favorites only toggle
    document.getElementById('favoritesOnlyBtn')?.addEventListener('click', (e) => {
        state.filters.favoritesOnly = !state.filters.favoritesOnly;
        e.currentTarget.classList.toggle('active', state.filters.favoritesOnly);
        applyFilters();
    });

    // Owned only toggle
    document.getElementById('ownedOnlyBtn')?.addEventListener('click', (e) => {
        state.filters.ownedOnly = !state.filters.ownedOnly;
        e.currentTarget.classList.toggle('active', state.filters.ownedOnly);
        applyFilters();
    });

    // Lorebook only toggle
    document.getElementById('lorebookOnlyBtn')?.addEventListener('click', (e) => {
        state.filters.lorebookOnly = !state.filters.lorebookOnly;
        e.currentTarget.classList.toggle('active', state.filters.lorebookOnly);
        applyFilters();
    });

    // Alt greetings only toggle
    document.getElementById('altGreetingsOnlyBtn')?.addEventListener('click', (e) => {
        state.filters.altGreetingsOnly = !state.filters.altGreetingsOnly;
        e.currentTarget.classList.toggle('active', state.filters.altGreetingsOnly);
        applyFilters();
    });

    // Bulk select mode toggle
    document.getElementById('bulkSelectBtn')?.addEventListener('click', (e) => {
        toggleBulkSelectMode();
        e.currentTarget.classList.toggle('active', state.bulkSelectMode);
    });

    // Group by creator toggle
    document.getElementById('groupByCreatorBtn')?.addEventListener('click', (e) => {
        state.groupByCreator = !state.groupByCreator;
        e.currentTarget.classList.toggle('active', state.groupByCreator);
        state.collapsedGroups.clear(); // Reset collapsed state
        renderCards();
    });

    // Bulk action bar buttons
    document.getElementById('bulkSelectAllBtn')?.addEventListener('click', selectAllVisibleCards);
    document.getElementById('bulkDeselectBtn')?.addEventListener('click', deselectAllCards);
    document.getElementById('bulkBookmarkBtn')?.addEventListener('click', bulkBookmarkSelected);
    document.getElementById('bulkImportBtn')?.addEventListener('click', bulkImportSelected);
    document.getElementById('closeBulkModeBtn')?.addEventListener('click', () => {
        toggleBulkSelectMode(false);
        document.getElementById('bulkSelectBtn')?.classList.remove('active');
    });

    // Clear filters
    document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);

    setupTagFilter();
    setupCreatorFilter();
}

function clearAllFilters() {
    // Restore original source cards if we were viewing creator-filtered results
    if (state.isCreatorFiltered && state.sourceCards.length > 0) {
        state.currentCards = [...state.sourceCards];
        state.isCreatorFiltered = false;
    }

    state.filters = {
        search: '',
        searchField: 'all',
        tags: [],
        mandatoryTags: [],
        facultativeTags: [],
        excludedTags: [],
        creators: [],
        favoritesOnly: false,
        ownedOnly: false,
        lorebookOnly: false,
        altGreetingsOnly: false,
        localFavoritesOnly: false
    };
    state.pendingSearch = '';
    state.sortBy = 'relevance';
    state.remoteSearchKind = null;

    // Refresh tag filter UI
    populateTagList();

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'relevance';

    const searchFieldSelect = document.getElementById('searchFieldSelect');
    if (searchFieldSelect) searchFieldSelect.value = 'all';

    // Clear all filter button active states
    document.getElementById('favoritesOnlyBtn')?.classList.remove('active');
    document.getElementById('ownedOnlyBtn')?.classList.remove('active');
    document.getElementById('lorebookOnlyBtn')?.classList.remove('active');
    document.getElementById('altGreetingsOnlyBtn')?.classList.remove('active');
    document.getElementById('tagFilterLabel').textContent = 'All Tags';
    document.getElementById('creatorFilterLabel').textContent = 'All Creators';
    document.getElementById('clearSearchBtn')?.classList.add('hidden');

    if (state.isRemoteSearch && (state.remoteSearchOriginSource || state.currentSource)) {
        const origin = state.remoteSearchOriginSource || state.currentSource;
        state.remoteSearchOriginSource = null;
        loadSource(origin);
        return;
    }
    applyFilters();
}

function setupTagFilter() {
    const btn = document.getElementById('tagFilterBtn');
    const dropdown = document.getElementById('tagFilterDropdown');
    const searchInput = document.getElementById('tagSearchInput');
    const searchBtn = document.getElementById('searchTagBtn');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('hidden');
        document.getElementById('creatorFilterDropdown')?.classList.add('hidden');
        populateTagList();
    });

    searchInput?.addEventListener('input', populateTagList);

    // Enter key to search on current source
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            e.preventDefault();
            searchTagOnSource(searchInput.value.trim());
        }
    });

    // Search button click
    searchBtn?.addEventListener('click', () => {
        const value = searchInput?.value.trim();
        if (value) {
            searchTagOnSource(value);
        } else {
            showToast('Enter a tag to search', 'warning');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tag-filter-container')) {
            dropdown?.classList.add('hidden');
        }
    });
}

function getCardTags(card) {
    const candidates = [
        card?.tags,
        card?.data?.tags,
        card?._rawData?.tags,
        card?._rawData?.data?.tags,
        card?.tag_list,
        card?.tagList,
    ];

    const out = [];
    for (const c of candidates) {
        if (!c) continue;
        if (Array.isArray(c)) out.push(...c);
        else if (typeof c === 'string') out.push(...c.split(',').map(s => s.trim()).filter(Boolean));
    }

    const normalized = out
        .map(t => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean);

    // Preserve order while deduping case-insensitively.
    const seen = new Set();
    const unique = [];
    for (const t of normalized) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(t);
    }
    return unique;
}

function renderModalTags(card) {
    const tagsContainer = document.getElementById('modalTags');
    if (!tagsContainer) return;

    const tags = getCardTags(card);
    tagsContainer.innerHTML = tags.length
        ? tags.slice(0, 20).map(tag => `<span class="modal-tag">${escapeHtml(tag)}</span>`).join('')
        : `<span class="modal-tag" style="opacity:.6;cursor:default;">No tags</span>`;

    // QoL: click a tag to search it on the current source
    tagsContainer.querySelectorAll('.modal-tag').forEach(el => {
        const text = (el.textContent || '').trim();
        if (!text || text === 'No tags') return;
        if (el.dataset.hasListener) return;
        el.dataset.hasListener = 'true';
        el.title = 'Search this tag';
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tagName = (el.textContent || '').trim();
            if (!tagName) return;
            hideCardModal();
            searchTagOnSource(tagName);
        });
    });
}

/**
 * Search for cards with a specific tag on the current source/service
 * Falls back to local filtering if API doesn't support tag search
 */
async function searchTagOnSource(tagName) {
    // Close dropdown
    document.getElementById('tagFilterDropdown')?.classList.add('hidden');

    const source = state.currentSource || 'chub';
    const serviceName = getServiceDisplayName(source);
    state.remoteSearchOriginSource = source;

    showToast(`Searching for "${tagName}" on ${serviceName}...`, 'info');

    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;
    state.isLoading = true;
    showLoading();
    resetResultsUiForLoading();

    try {
        // Treat tag searches as a remote-search mode so "Clear" restores the base view,
        // even when the API returns 0 results.
        state.isRemoteSearch = true;
        state.remoteSearchQuery = '';
        state.remoteSearchKind = 'tag';

        let cards = [];

        // Chub - supports tag search
        if (source === 'chub' || source === 'chub_trending') {
            const result = await searchChubCards({
                tags: tagName,
                limit: 200,
                nsfw: !state.settings.hideNsfw,
                nsfl: !state.settings.hideNsfl
            });
            if (isStale()) return;
            cards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
            state.currentSource = 'chub';
        }
        // Wyvern - supports tag search
        else if (source === 'wyvern' || source === 'wyvern_trending') {
            resetWyvernApiState();
            const result = await searchWyvernCharacters({
                tags: [tagName],
                limit: state.settings.cardsPerPage || 50,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.results || []).map(transformWyvernCard);
            state.currentSource = 'wyvern';
        }
        // Character Tavern - supports tag search
        else if (source === 'character_tavern' || source === 'character_tavern_trending' || source === 'character_tavern_live') {
            resetCharacterTavernState();
            // searchCharacterTavern returns array directly
            cards = await searchCharacterTavern({
                tags: [tagName],
                limit: state.settings.cardsPerPage || 50
            }) || [];
            if (isStale()) return;
            state.currentSource = 'character_tavern';
        }
        // JannyAI - search by tag name in text (no direct tag ID support here)
        else if (source === 'jannyai' || source === 'jannyai_trending') {
            const result = await searchJannyCharacters({
                search: tagName,
                limit: state.settings.cardsPerPage || 50,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result?.results?.[0]?.hits || []).map(transformJannyCard);
            state.currentSource = 'jannyai';
        }
        // For other sources, fall back to local filtering
        else {
            state.isRemoteSearch = false;
            state.remoteSearchKind = null;
            state.remoteSearchOriginSource = null;
            state.filters.mandatoryTags = [tagName.toLowerCase()];
            applyFilters();
            showToast(`Filtering by tag "${tagName}" locally`, 'info');
            return;
        }

        if (cards.length === 0) {
            showToast(`No cards found for tag "${tagName}" on ${serviceName}`, 'warning');
            state.currentCards = [];
            state.filteredCards = [];
            resetResultsUiForLoading();
            showNoResults(`No cards found for tag "${tagName}" on ${serviceName}`);
            return;
        }

        // These results replace the normal browse view; treat them like a remote-search mode so "Clear" restores browsing.
        state.isRemoteSearch = true;
        state.remoteSearchQuery = '';
        state.remoteSearchKind = 'tag';

        state.currentCards = cards;
        state.filteredCards = cards;
        state.filters.tags = [tagName.toLowerCase()];
        setActiveSourceButton(state.currentSource);
        updateSearchButtonLabels(state.currentSource);

        document.getElementById('tagFilterLabel').textContent = tagName;
        document.getElementById('tagSearchInput').value = '';

        renderCards();
        updateResultsCount();
        showToast(`Found ${cards.length} cards with tag "${tagName}" on ${serviceName}`, 'success');
    } catch (error) {
        console.error('[Bot Browser Standalone] Tag search failed:', error);
        // Fall back to local filtering
        state.isRemoteSearch = false;
        state.remoteSearchKind = null;
        state.remoteSearchOriginSource = null;
        state.filters.mandatoryTags = [tagName.toLowerCase()];
        applyFilters();
        showToast(`API search failed, filtering locally: ${error.message}`, 'warning');
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

/**
 * Source capabilities - what each source supports
 * tagSearch: Can search/filter by tags via API
 * creatorSearch: Can search/filter by creator via API
 * textSearch: Can perform text-based search (used as fallback)
 */
const SOURCE_CAPABILITIES = {
    // Chub - full support for tags and creator
    'chub': { tagSearch: true, creatorSearch: true, textSearch: true },
    'chub_trending': { tagSearch: true, creatorSearch: true, textSearch: true },
    'chub_lorebooks': { tagSearch: true, creatorSearch: true, textSearch: true },
    'chub_favorites': { tagSearch: false, creatorSearch: false, textSearch: false },
    'chub_timeline': { tagSearch: false, creatorSearch: false, textSearch: false },

    // JannyAI - text search only (no native tag/creator filtering)
    'jannyai': { tagSearch: false, creatorSearch: false, textSearch: true },
    'jannyai_trending': { tagSearch: false, creatorSearch: false, textSearch: true },

    // Backyard - creator search only
    'backyard': { tagSearch: false, creatorSearch: true, textSearch: true },
    'backyard_trending': { tagSearch: false, creatorSearch: true, textSearch: true },

    // Wyvern - tag search only
    'wyvern': { tagSearch: true, creatorSearch: false, textSearch: true },
    'wyvern_trending': { tagSearch: true, creatorSearch: false, textSearch: true },
    'wyvern_lorebooks': { tagSearch: true, creatorSearch: false, textSearch: true },

    // Character Tavern - tag search only
    'character_tavern': { tagSearch: true, creatorSearch: false, textSearch: true },
    'character_tavern_trending': { tagSearch: true, creatorSearch: false, textSearch: true },

    // Pygmalion - creator search only
    'pygmalion': { tagSearch: false, creatorSearch: true, textSearch: true },
    'pygmalion_trending': { tagSearch: false, creatorSearch: true, textSearch: true },

    // RisuRealm - text search only (no native tag/creator filtering)
    'risuai_realm': { tagSearch: false, creatorSearch: false, textSearch: true },
    'risuai_realm_trending': { tagSearch: false, creatorSearch: false, textSearch: true },

    // Archives - no API search, local filter only
    'mlpchag': { tagSearch: false, creatorSearch: false, textSearch: false },
    'catbox': { tagSearch: false, creatorSearch: false, textSearch: false },
    'anchorhold': { tagSearch: false, creatorSearch: false, textSearch: false },
    'desuarchive': { tagSearch: false, creatorSearch: false, textSearch: false },
    'webring': { tagSearch: false, creatorSearch: false, textSearch: false },
    'nyai_me': { tagSearch: false, creatorSearch: false, textSearch: false },

    // Local library - local filter only
    'my_characters': { tagSearch: false, creatorSearch: false, textSearch: false },
    'local': { tagSearch: false, creatorSearch: false, textSearch: false },

    // Default - assume local filter only
    'default': { tagSearch: false, creatorSearch: false, textSearch: false }
};

/**
 * Get capabilities for a source
 */
function getSourceCapabilities(source) {
    return SOURCE_CAPABILITIES[source] || SOURCE_CAPABILITIES['default'];
}

/**
 * Remote (API) text search on the current source.
 * Triggered by pressing Enter in the main search box.
 */
async function searchTextOnSource(query) {
    const source = state.currentSource;
    if (!source) {
        showToast('Select a source to search', 'warning');
        return;
    }

    const caps = getSourceCapabilities(source);
    if (!caps.textSearch) {
        showToast('This source does not support remote search; filtering locally', 'info');
        return;
    }

    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;

    state.isLoading = true;
    state.isRemoteSearch = true;
    state.remoteSearchQuery = query.toLowerCase().trim();
    state.remoteSearchKind = 'text';
    state.remoteSearchOriginSource = source;

    showLoading();
    hideWelcome();
    resetResultsUiForLoading();

    // Some sources return very large payloads (and certain free CORS proxies reject >1MB responses).
    // Keep a conservative default for those.
    const pageSize = (source === 'wyvern' || source === 'wyvern_trending' || source === 'wyvern_lorebooks')
        ? 10
        : 48;

    try {
        let cards = [];

        // Chub (characters)
        if (source === 'chub' || source === 'chub_trending') {
            state.currentSource = 'chub';
            state.chubPage = 1;
            const result = await searchChubCards({
                search: query,
                page: 1,
                limit: pageSize,
                nsfw: !state.settings.hideNsfw,
                nsfl: !state.settings.hideNsfl
            });
            if (isStale()) return;
            cards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
            state.chubHasMore = cards.length >= pageSize;
        }
        // Chub (lorebooks)
        else if (source === 'chub_lorebooks') {
            const result = await searchChubLorebooks({
                search: query,
                page: 1,
                limit: pageSize,
                nsfw: !state.settings.hideNsfw,
                nsfl: !state.settings.hideNsfl
            });
            if (isStale()) return;
            cards = (result?.data?.nodes || result?.nodes || []).map(transformChubLorebook);
        }
        // JannyAI
        else if (source === 'jannyai' || source === 'jannyai_trending') {
            state.currentSource = 'jannyai';
            state.jannyPage = 1;
            const result = await searchJannyCharacters({
                search: query,
                page: 1,
                limit: state.settings.cardsPerPage || 50,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            const hits = result?.results?.[0]?.hits || [];
            cards = hits.map(transformJannyCard);
        }
        // Backyard.ai
        else if (source === 'backyard' || source === 'backyard_trending') {
            state.currentSource = 'backyard';
            resetBackyardApiState();
            const result = await searchBackyardCharacters({
                search: query,
                type: state.settings.hideNsfw ? 'sfw' : 'all'
            });
            if (isStale()) return;
            cards = (result.characters || []).map(transformBackyardCard);
            backyardApiState.cursor = result.nextCursor;
            backyardApiState.hasMore = result.hasMore;
        }
        // Pygmalion
        else if (source === 'pygmalion' || source === 'pygmalion_trending') {
            state.currentSource = 'pygmalion';
            resetPygmalionApiState();
            const result = await searchPygmalionCharacters({
                query: query,
                includeSensitive: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.characters || []).map(transformPygmalionCard);
            pygmalionApiState.hasMore = result.hasMore;
        }
        // Character Tavern
        else if (source === 'character_tavern' || source === 'character_tavern_trending') {
            state.currentSource = 'character_tavern';
            resetCharacterTavernState();
            cards = await searchCharacterTavern({ query, page: 1, limit: 30 }) || [];
            if (isStale()) return;
            characterTavernApiState.page = 1;
            characterTavernApiState.hasMore = cards.length >= 30;
        }
        // Wyvern (characters)
        else if (source === 'wyvern' || source === 'wyvern_trending') {
            state.currentSource = 'wyvern';
            resetWyvernApiState();
            const result = await searchWyvernCharacters({
                search: query,
                page: 1,
                limit: pageSize,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.results || []).map(transformWyvernCard);
            wyvernApiState.hasMore = result.hasMore;
        }
        // Wyvern (lorebooks)
        else if (source === 'wyvern_lorebooks') {
            const result = await searchWyvernLorebooks({
                search: query,
                page: 1,
                limit: pageSize,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result?.results || []).map(transformWyvernLorebook);
        }
        // RisuRealm
        else if (source === 'risuai_realm' || source === 'risuai_realm_trending') {
            state.currentSource = 'risuai_realm';
            resetRisuRealmState();
            const result = await searchRisuRealm({
                search: query,
                page: 1,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.cards || []).map(transformRisuRealmCard);
            risuRealmApiState.hasMore = result.hasMore;
        } else {
            showToast('Remote search not implemented for this source', 'info');
            return;
        }

        if (isStale()) return;
        state.currentCards = cards;
        applyFilters();

        if (cards.length === 0) {
            showToast(`No results for "${query}"`, 'info');
        } else {
            showToast(`Found ${cards.length} result${cards.length !== 1 ? 's' : ''}`, 'success');
        }
    } catch (error) {
        if (isStale()) return;
        console.error('[Bot Browser Standalone] Remote search failed:', error);
        const friendly = getFriendlyLoadError(error, source);
        showToast(`Search failed: ${friendly}`, 'error');
        state.currentCards = [];
        state.filteredCards = [];
        resetResultsUiForLoading();
        showNoResults(friendly);
        state.isRemoteSearch = false;
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

/**
 * Get display name for a service
 */
function getServiceDisplayName(source) {
    const names = {
        'chub': 'Chub',
        'chub_trending': 'Chub',
        'chub_lorebooks': 'Chub',
        'chub_favorites': 'Chub Favorites',
        'chub_timeline': 'Chub Timeline',
        'jannyai': 'JannyAI',
        'jannyai_trending': 'JannyAI',
        'backyard': 'Backyard.ai',
        'backyard_trending': 'Backyard.ai',
        'wyvern': 'Wyvern',
        'wyvern_trending': 'Wyvern',
        'wyvern_lorebooks': 'Wyvern',
        'character_tavern': 'Character Tavern',
        'character_tavern_trending': 'Character Tavern',
        'risuai_realm': 'RisuRealm',
        'risuai_realm_trending': 'RisuRealm',
        'pygmalion': 'Pygmalion',
        'pygmalion_trending': 'Pygmalion',
        'mlpchag': 'MLPchag',
        'catbox': 'Catbox',
        'anchorhold': '4chan /aicg/',
        'desuarchive': 'Desuarchive',
        'webring': 'Webring',
        'nyai_me': 'Nyai.me',
        'my_characters': 'My Characters',
        'local': 'My Characters'
    };
    return names[source] || source;
}

/**
 * Update the search button labels and visibility based on source capabilities
 */
function updateSearchButtonLabels(source) {
    const displayName = getServiceDisplayName(source);
    const capabilities = getSourceCapabilities(source);

    const tagSearchBtn = document.getElementById('searchTagBtn');
    const creatorSearchBtn = document.getElementById('searchCreatorBtn');
    const tagSourceSpan = document.getElementById('tagSearchSourceName');
    const creatorSourceSpan = document.getElementById('creatorSearchSourceName');

    // Update tag search button
    if (tagSearchBtn) {
        if (capabilities.tagSearch) {
            tagSearchBtn.style.display = '';
            if (tagSourceSpan) tagSourceSpan.textContent = displayName;
        } else {
            tagSearchBtn.style.display = 'none';
        }
    }

    // Update creator search button
    if (creatorSearchBtn) {
        if (capabilities.creatorSearch) {
            creatorSearchBtn.style.display = '';
            if (creatorSourceSpan) creatorSourceSpan.textContent = displayName;
        } else {
            creatorSearchBtn.style.display = 'none';
        }
    }

    // Update sort options based on source
    updateSortOptionsVisibility(source);

    // Update feature filter buttons based on source
    updateFeatureButtonsVisibility(source);
}

/**
 * Update feature filter buttons visibility based on source
 * - Already Owned: Only for remote sources (not my_characters)
 * - Lorebook/Alt Greetings: Only for sources that provide this data
 * - Duplicate Scanner: Only for local library
 */
function updateFeatureButtonsVisibility(source) {
    const isLocal = source === 'my_characters' || source === 'local';
    const isChub = source?.startsWith('chub');
    const isBackyard = source?.startsWith('backyard');
    const isWyvern = source?.startsWith('wyvern');
    const isJannyAI = source?.startsWith('jannyai');
    const isRisuRealm = source?.startsWith('risuai_realm');
    const isPygmalion = source?.startsWith('pygmalion');
    const isCharacterTavern = source?.startsWith('character_tavern');
    const isArchive = ['catbox', 'anchorhold', 'desuarchive', 'webring', 'nyai_me', 'mlpchag'].includes(source);

    // Sources that provide lorebook info
    const hasLorebookData = isLocal || isChub || isBackyard || isWyvern || isRisuRealm;

    // Sources that provide alt greetings info
    const hasAltGreetingsData = isLocal || isChub || isBackyard || isWyvern || isRisuRealm;

    // Already Owned button - only relevant for remote sources
    const ownedOnlyBtn = document.getElementById('ownedOnlyBtn');
    if (ownedOnlyBtn) {
        ownedOnlyBtn.style.display = isLocal ? 'none' : '';
    }

    // Lorebook filter - only for sources with lorebook data
    const lorebookOnlyBtn = document.getElementById('lorebookOnlyBtn');
    if (lorebookOnlyBtn) {
        lorebookOnlyBtn.style.display = hasLorebookData ? '' : 'none';
    }

    // Alt Greetings filter - only for sources with alt greetings data
    const altGreetingsOnlyBtn = document.getElementById('altGreetingsOnlyBtn');
    if (altGreetingsOnlyBtn) {
        altGreetingsOnlyBtn.style.display = hasAltGreetingsData ? '' : 'none';
    }

    // Duplicate Scanner - only for local library
    const duplicateScannerBtn = document.getElementById('duplicateScannerBtn');
    if (duplicateScannerBtn) {
        duplicateScannerBtn.style.display = isLocal ? '' : 'none';
    }

    // Group by Creator - available for most sources
    const groupByCreatorBtn = document.getElementById('groupByCreatorBtn');
    if (groupByCreatorBtn) {
        // Always show - works with local filtering
        groupByCreatorBtn.style.display = '';
    }
}

/**
 * Update sort options visibility based on source capabilities
 * - Downloads: Only Chub, Backyard, JannyAI have download counts
 * - Stars: Only Chub has star ratings
 * - Import date: Only local library
 * - Tokens: Most sources have token counts
 */
function updateSortOptionsVisibility(source) {
    const sortSelect = document.getElementById('sortSelect');
    if (!sortSelect) return;

    const isChub = source?.startsWith('chub');
    const isLocal = source === 'my_characters' || source === 'local';
    const hasDownloads = isChub || source?.startsWith('backyard') || source?.startsWith('jannyai') || source?.startsWith('risuai_realm');
    const hasStars = isChub;

    // Get all options
    const options = sortSelect.querySelectorAll('option');
    options.forEach(opt => {
        const value = opt.value;

        // Downloads sort - only for sources with download counts
        if (value === 'downloads_desc') {
            opt.style.display = hasDownloads ? '' : 'none';
        }
        // Stars sort - only for Chub
        else if (value === 'stars_desc') {
            opt.style.display = hasStars ? '' : 'none';
        }
        // Import date - only for local library
        else if (value === 'import_desc' || value === 'import_asc') {
            opt.style.display = isLocal ? '' : 'none';
        }
    });

    // If current selection is now hidden, reset to default
    const currentOption = sortSelect.querySelector(`option[value="${sortSelect.value}"]`);
    if (currentOption && currentOption.style.display === 'none') {
        sortSelect.value = 'relevance';
        // Trigger change event to re-sort
        sortSelect.dispatchEvent(new Event('change'));
    }
}

function populateTagList() {
    const tagList = document.getElementById('tagList');
    const searchInput = document.getElementById('tagSearchInput');
    const mandatoryContainer = document.getElementById('mandatoryTags');
    const facultativeContainer = document.getElementById('facultativeTags');
    const excludedContainer = document.getElementById('excludedTags');

    if (!tagList) return;

    const allTags = getAllTags(state.currentCards);
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const filteredTags = allTags.filter(tag => tag.toLowerCase().includes(searchTerm));

    // Update tag chip containers
    updateTagChips(mandatoryContainer, state.filters.mandatoryTags, 'mandatory');
    updateTagChips(facultativeContainer, state.filters.facultativeTags, 'facultative');
    updateTagChips(excludedContainer, state.filters.excludedTags, 'excluded');

    // Update counts
    document.getElementById('mandatoryCount').textContent = state.filters.mandatoryTags.length;
    document.getElementById('facultativeCount').textContent = state.filters.facultativeTags.length;
    document.getElementById('excludedCount').textContent = state.filters.excludedTags.length;

    // Get tags already used in any filter
    const usedTags = new Set([
        ...state.filters.mandatoryTags,
        ...state.filters.facultativeTags,
        ...state.filters.excludedTags
    ].map(t => t.toLowerCase()));

    // Available tags (not already used)
    const availableTags = filteredTags.filter(tag => !usedTags.has(tag.toLowerCase()));

    // Render available tag list with action buttons
    tagList.innerHTML = availableTags.slice(0, 50).map(tag => `
        <div class="tag-item-advanced" data-tag="${escapeHtml(tag)}">
            <span class="tag-name">${escapeHtml(tag)}</span>
            <div class="tag-actions">
                <button class="tag-action-btn add-mandatory" title="Must have (ALL)">
                    <i class="fa-solid fa-check-double"></i>
                </button>
                <button class="tag-action-btn add-facultative" title="Any of (OR)">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="tag-action-btn add-excluded" title="Exclude">
                    <i class="fa-solid fa-ban"></i>
                </button>
            </div>
        </div>
    `).join('') || '<div class="filter-empty">No tags available</div>';

    // Add click handlers for tag action buttons
    tagList.querySelectorAll('.tag-item-advanced').forEach(item => {
        const tag = item.dataset.tag;

        item.querySelector('.add-mandatory')?.addEventListener('click', (e) => {
            e.stopPropagation();
            addTagToFilter(tag, 'mandatory');
        });

        item.querySelector('.add-facultative')?.addEventListener('click', (e) => {
            e.stopPropagation();
            addTagToFilter(tag, 'facultative');
        });

        item.querySelector('.add-excluded')?.addEventListener('click', (e) => {
            e.stopPropagation();
            addTagToFilter(tag, 'excluded');
        });
    });
}

function updateTagChips(container, tags, type) {
    if (!container) return;

    container.innerHTML = tags.map(tag => `
        <span class="tag-chip" data-tag="${escapeHtml(tag)}" data-type="${type}">
            ${escapeHtml(tag)}
            <i class="fa-solid fa-times remove-tag"></i>
        </span>
    `).join('');

    // Add remove handlers
    container.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const tag = chip.dataset.tag;
            removeTagFromFilter(tag, type);
        });
    });
}

function addTagToFilter(tag, type) {
    const filterKey = type === 'mandatory' ? 'mandatoryTags' :
                      type === 'facultative' ? 'facultativeTags' : 'excludedTags';

    if (!state.filters[filterKey].includes(tag.toLowerCase())) {
        state.filters[filterKey].push(tag.toLowerCase());
        updateTagFilterLabel();
        applyFilters();
        populateTagList();
    }
}

function removeTagFromFilter(tag, type) {
    const filterKey = type === 'mandatory' ? 'mandatoryTags' :
                      type === 'facultative' ? 'facultativeTags' : 'excludedTags';

    const index = state.filters[filterKey].indexOf(tag.toLowerCase());
    if (index > -1) {
        state.filters[filterKey].splice(index, 1);
        updateTagFilterLabel();
        applyFilters();
        populateTagList();
    }
}

function updateTagFilterLabel() {
    const label = document.getElementById('tagFilterLabel');
    if (label) {
        const totalTags = state.filters.mandatoryTags.length +
                          state.filters.facultativeTags.length +
                          state.filters.excludedTags.length +
                          state.filters.tags.length;
        label.textContent = totalTags > 0
            ? `${totalTags} tag${totalTags > 1 ? 's' : ''}`
            : 'All Tags';
    }
}

function setupCreatorFilter() {
    const btn = document.getElementById('creatorFilterBtn');
    const dropdown = document.getElementById('creatorFilterDropdown');
    const searchInput = document.getElementById('creatorSearchInput');
    const searchBtn = document.getElementById('searchCreatorBtn');

    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown?.classList.toggle('hidden');
        document.getElementById('tagFilterDropdown')?.classList.add('hidden');
        populateCreatorList();
    });

    searchInput?.addEventListener('input', populateCreatorList);

    // Enter key to search on current source
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            e.preventDefault();
            searchCreatorOnSource(searchInput.value.trim(), { origin: 'creatorFilter' });
        }
    });

    // Search button click
    searchBtn?.addEventListener('click', () => {
        const value = searchInput?.value.trim();
        if (value) {
            searchCreatorOnSource(value, { origin: 'creatorFilter' });
        } else {
            showToast('Enter a creator name to search', 'warning');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.creator-filter-container')) {
            dropdown?.classList.add('hidden');
        }
    });
}

/**
 * Search for cards by a specific creator on the current source/service
 * Falls back to local filtering if API doesn't support creator search
 */
async function searchCreatorOnSource(creatorName, options = {}) {
    // Close dropdown
    document.getElementById('creatorFilterDropdown')?.classList.add('hidden');
    state.creatorSearchOrigin = options.origin || 'creatorFilter';

    const source = state.currentSource || 'chub';
    const serviceName = getServiceDisplayName(source);
    state.remoteSearchOriginSource = source;

    showToast(`Searching for cards by ${creatorName} on ${serviceName}...`, 'info');

    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;
    state.isLoading = true;
    showLoading();
    resetResultsUiForLoading();

    try {
        // Treat creator searches as a remote-search mode so "Clear" restores the base view,
        // even when the API returns 0 results.
        state.isRemoteSearch = true;
        state.remoteSearchQuery = '';
        state.remoteSearchKind = 'creator';

        let cards = [];

        // Chub - supports username search
        if (source === 'chub' || source === 'chub_trending') {
            const result = await searchChubCards({
                username: creatorName,
                limit: 200,
                nsfw: !state.settings.hideNsfw,
                nsfl: !state.settings.hideNsfl
            });
            if (isStale()) return;
            cards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
            state.currentSource = 'chub';
        }
        // Backyard - supports user profile
        else if (source === 'backyard' || source === 'backyard_trending') {
            const result = await getBackyardUserProfile(creatorName);
            if (isStale()) return;
            cards = (result.characters || []).map(transformBackyardCard);
            state.currentSource = 'backyard';
        }
        // Pygmalion - search by creator name in text
        else if (source === 'pygmalion' || source === 'pygmalion_trending') {
            resetPygmalionApiState();
            // Use searchPygmalionCharacters with query to search by creator name
            const result = await searchPygmalionCharacters({
                query: creatorName,
                includeSensitive: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.characters || []).map(transformPygmalionCard);
            state.currentSource = 'pygmalion';
        }
        // Wyvern - search by creator name in text
        else if (source === 'wyvern' || source === 'wyvern_trending' || source === 'wyvern_live') {
            resetWyvernApiState();
            const result = await searchWyvernCharacters({
                search: creatorName,
                limit: state.settings.cardsPerPage || 50,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.results || []).map(transformWyvernCard);
            state.currentSource = 'wyvern';
        }
        // Character Tavern - search by creator name in text
        else if (source === 'character_tavern' || source === 'character_tavern_trending' || source === 'character_tavern_live') {
            resetCharacterTavernState();
            // searchCharacterTavern returns array directly
            cards = await searchCharacterTavern({
                query: creatorName,
                limit: state.settings.cardsPerPage || 50
            }) || [];
            if (isStale()) return;
            state.currentSource = 'character_tavern';
        }
        // JannyAI - search by creator name in text
        else if (source === 'jannyai' || source === 'jannyai_trending') {
            const result = await searchJannyCharacters({
                search: creatorName,
                limit: state.settings.cardsPerPage || 50,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result?.results?.[0]?.hits || []).map(transformJannyCard);
            state.currentSource = 'jannyai';
        }
        // RisuRealm - search by creator name in text
        else if (source === 'risuai_realm' || source === 'risuai_realm_trending') {
            resetRisuRealmState();
            const result = await searchRisuRealm({
                search: creatorName,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.cards || []).map(transformRisuRealmCard);
            state.currentSource = 'risuai_realm';
        }
        // For other sources (archives, local), fall back to local filtering
        else {
            state.isRemoteSearch = false;
            state.remoteSearchKind = null;
            state.remoteSearchOriginSource = null;
            state.filters.creators = [creatorName];
            state.isCreatorFiltered = true;
            updateCreatorFilterLabel();
            applyFilters();
            showToast(`Filtering by creator "${creatorName}" locally`, 'info');
            return;
        }

        if (cards.length === 0) {
            showToast(`No cards found for creator "${creatorName}" on ${serviceName}`, 'warning');
            state.currentCards = [];
            state.filteredCards = [];
            resetResultsUiForLoading();
            showNoResults(`No cards found for creator "${creatorName}" on ${serviceName}`);
            return;
        }

        // Store original source cards before replacing
        if (!state.isCreatorFiltered && state.currentCards.length > 0) {
            state.sourceCards = [...state.currentCards];
            state.sourceBeforeCreatorFilter = source;
        }

        // These results replace the normal browse view; treat them like a remote-search mode so "Clear" restores browsing.
        state.isRemoteSearch = true;
        state.remoteSearchQuery = '';
        state.remoteSearchKind = 'creator';

        state.currentCards = cards;
        state.filteredCards = cards;
        state.filters.creators = [creatorName];
        state.isCreatorFiltered = true;
        setActiveSourceButton(state.currentSource);
        updateSearchButtonLabels(state.currentSource);

        updateCreatorFilterLabel();
        document.getElementById('creatorSearchInput').value = '';

        renderCards();
        updateResultsCount();
        showToast(`Found ${cards.length} cards by ${creatorName} on ${serviceName}`, 'success');
    } catch (error) {
        console.error('[Bot Browser Standalone] Creator search failed:', error);
        // Fall back to local filtering
        state.isRemoteSearch = false;
        state.remoteSearchKind = null;
        state.remoteSearchOriginSource = null;
        state.filters.creators = [creatorName];
        state.isCreatorFiltered = true;
        updateCreatorFilterLabel();
        applyFilters();
        showToast(`API search failed, filtering locally: ${error.message}`, 'warning');
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

async function loadCreatorCards(creatorName, service) {
    if (!creatorName) return;

    const serviceName = getServiceDisplayName(service || 'chub');
    showToast(`Loading cards by ${creatorName} on ${serviceName}...`, 'info');

    const requestId = ++state.activeRequestId;
    const isStale = () => requestId !== state.activeRequestId;
    state.isLoading = true;
    showLoading();
    resetResultsUiForLoading();

    try {
        let cards = [];
        let targetSource = service || 'chub';

        // Chub - supports username search
        if (service === 'chub' || !service) {
            const result = await searchChubCards({
                username: creatorName,
                limit: 200,
                nsfw: !state.settings.hideNsfw,
                nsfl: !state.settings.hideNsfl
            });
            if (isStale()) return;
            cards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
            targetSource = 'chub';
        }
        // Backyard - supports user profile (handle all variants)
        else if (service === 'backyard' || service === 'backyard_trending') {
            const result = await getBackyardUserProfile(creatorName);
            if (isStale()) return;
            cards = (result.characters || []).map(transformBackyardCard);
            targetSource = 'backyard';
        }
        // Pygmalion - search by creator name (handle all variants)
        else if (service === 'pygmalion' || service === 'pygmalion_trending') {
            resetPygmalionApiState();
            // Use searchPygmalionCharacters with query to search by creator name
            const result = await searchPygmalionCharacters({
                query: creatorName,
                includeSensitive: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.characters || []).map(transformPygmalionCard);
            targetSource = 'pygmalion';
        }
        // Wyvern - search by creator name (handle all variants)
        else if (service === 'wyvern' || service === 'wyvern_trending' || service === 'wyvern_live') {
            resetWyvernApiState();
            const result = await searchWyvernCharacters({
                search: creatorName,
                limit: state.settings.cardsPerPage || 50,
                hideNsfw: state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.results || []).map(transformWyvernCard);
            targetSource = 'wyvern';
        }
        // Character Tavern - search by creator name (handle all variants)
        else if (service === 'character_tavern' || service === 'character_tavern_live' || service === 'character_tavern_trending') {
            resetCharacterTavernState();
            // searchCharacterTavern returns array directly
            cards = await searchCharacterTavern({
                query: creatorName,
                limit: state.settings.cardsPerPage || 50
            }) || [];
            if (isStale()) return;
            targetSource = 'character_tavern';
        }
        // JannyAI - search by creator name
        else if (service === 'jannyai') {
            const result = await searchJannyCharacters({
                search: creatorName,
                limit: state.settings.cardsPerPage || 50,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result?.results?.[0]?.hits || []).map(transformJannyCard);
            targetSource = 'jannyai';
        }
        // RisuRealm - search by creator name
        else if (service === 'risuai_realm') {
            resetRisuRealmState();
            const result = await searchRisuRealm({
                search: creatorName,
                nsfw: !state.settings.hideNsfw
            });
            if (isStale()) return;
            cards = (result.cards || []).map(transformRisuRealmCard);
            targetSource = 'risuai_realm';
        }
        // For other services (archives, local), fall back to local filter
        else {
            state.filters.creators = [creatorName];
            state.isCreatorFiltered = true;
            updateCreatorFilterLabel();
            applyFilters();
            showToast(`Filtered to cards by ${creatorName}`, 'info');
            return;
        }

        if (cards.length === 0) {
            showToast(`No cards found for "${creatorName}" on ${serviceName}`, 'warning');
            state.currentCards = [];
            state.filteredCards = [];
            resetResultsUiForLoading();
            showNoResults(`No cards found for "${creatorName}" on ${serviceName}`);
            return;
        }

        // Store original source cards before replacing
        if (!state.isCreatorFiltered && state.currentCards.length > 0) {
            state.sourceCards = [...state.currentCards];
        }

        state.currentCards = cards;
        state.filteredCards = cards;
        state.currentSource = targetSource;
        state.filters.creators = [creatorName];
        state.isCreatorFiltered = true;
        setActiveSourceButton(state.currentSource);
        updateSearchButtonLabels(state.currentSource);

        updateCreatorFilterLabel();
        renderCards();
        updateResultsCount();
        showToast(`Found ${cards.length} cards by ${creatorName} on ${serviceName}`, 'success');
    } catch (error) {
        console.error('[Bot Browser Standalone] Creator load failed:', error);
        // Fall back to local filter
        state.filters.creators = [creatorName];
        state.isCreatorFiltered = true;
        updateCreatorFilterLabel();
        applyFilters();
        showToast(`Filtered locally to ${creatorName}`, 'info');
    } finally {
        if (!isStale()) {
            state.isLoading = false;
            hideLoading();
        }
    }
}

function restoreCreatorFilteredViewIfNeeded() {
    if (!state.isCreatorFiltered) return false;
    if (!state.sourceCards || state.sourceCards.length === 0) return false;

    const restoreSource = state.sourceBeforeCreatorFilter || state.currentSource;
    state.currentSource = restoreSource;
    state.currentCards = [...state.sourceCards];
    state.sourceCards = [];
    state.isCreatorFiltered = false;
    state.sourceBeforeCreatorFilter = null;

    setActiveSourceButton(restoreSource);
    updateSearchButtonLabels(restoreSource);
    return true;
}

function populateCreatorList() {
    const creatorList = document.getElementById('creatorList');
    const searchInput = document.getElementById('creatorSearchInput');
    if (!creatorList) return;

    const allCreators = getAllCreators(state.currentCards);
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const filteredCreators = allCreators.filter(c => c.toLowerCase().includes(searchTerm));

    // Add clear button if creators are selected
    const clearBtn = state.filters.creators.length > 0
        ? `<button class="filter-item clear-filter" data-action="clear">
            <span><i class="fa-solid fa-times"></i> Clear All (${state.filters.creators.length})</span>
           </button>`
        : '';

    creatorList.innerHTML = clearBtn + filteredCreators.slice(0, 50).map(creator => {
        const isSelected = state.filters.creators.includes(creator);
        return `
            <button class="filter-item ${isSelected ? 'selected' : ''}" data-value="${escapeHtml(creator)}">
                <span>${escapeHtml(creator)}</span>
                ${isSelected ? '<i class="fa-solid fa-check"></i>' : ''}
            </button>
        `;
    }).join('') || '<div class="filter-empty">No creators found</div>';

    // Clear button
    creatorList.querySelector('.clear-filter')?.addEventListener('click', () => {
        state.filters.creators = [];
        updateCreatorFilterLabel();
        restoreCreatorFilteredViewIfNeeded();
        applyFilters();
        populateCreatorList();
    });

    creatorList.querySelectorAll('.filter-item:not(.clear-filter)').forEach(item => {
        item.addEventListener('click', () => {
            const creator = item.dataset.value;
            const index = state.filters.creators.indexOf(creator);
            if (index > -1) {
                state.filters.creators.splice(index, 1);
            } else {
                state.filters.creators.push(creator);
            }
            updateCreatorFilterLabel();
            if (state.filters.creators.length === 0) {
                restoreCreatorFilteredViewIfNeeded();
            }
            applyFilters();
            populateCreatorList();
        });
    });
}

function updateCreatorFilterLabel() {
    const label = document.getElementById('creatorFilterLabel');
    if (label) {
        label.textContent = state.filters.creators.length > 0
            ? `${state.filters.creators.length} creator${state.filters.creators.length > 1 ? 's' : ''}`
            : 'All Creators';
    }
}

function applyFilters() {
    let cards = [...state.currentCards];
    const bookmarkIds = new Set(state.bookmarks.map(b => b.id));

    // Mark bookmarked cards and owned cards
    cards = cards.map(c => ({
        ...c,
        isBookmarked: bookmarkIds.has(c.id),
        isOwned: state.myCharacterNames.has(c.name?.toLowerCase().trim())
    }));

    // Favorites filter
    if (state.filters.favoritesOnly) {
        cards = cards.filter(c => c.isBookmarked);
    }

    // My Imports: match in-app tabs behavior (hide lorebooks by default)
    if (state.currentSource === 'imports') {
        const mode = state.importsTypeFilter || 'characters';
        if (mode === 'characters') {
            cards = cards.filter(c => !isLorebookImportRecord(c));
        } else if (mode === 'lorebooks') {
            cards = cards.filter(c => isLorebookImportRecord(c));
        }
    }

    // Text search with field selector and special syntax support
    const normalizedSearch = (state.filters.search || '').toLowerCase().trim();
    const shouldSkipTextFilter = (
        // For API sources, only search remotely on Enter (no local narrowing while typing).
        (getSourceCapabilities(state.currentSource).textSearch && !state.isRemoteSearch) ||
        // Remote-search results should not be locally narrowed by the same query.
        (state.isRemoteSearch && state.remoteSearchQuery && normalizedSearch === state.remoteSearchQuery) ||
        // While editing a new query after a remote search, don't narrow the old results.
        (state.isRemoteSearch && normalizedSearch && state.remoteSearchQuery && normalizedSearch !== state.remoteSearchQuery)
    );

    if (normalizedSearch && !shouldSkipTextFilter) {
        let search = normalizedSearch;
        const field = state.filters.searchField || 'all';

        // Check for creator:Name syntax (quick creator filter)
        const creatorMatch = search.match(/^creator:\s*(.+)$/i);
        if (creatorMatch) {
            const creatorSearch = creatorMatch[1].trim();
            cards = cards.filter(c => (c.creator || '').toLowerCase().includes(creatorSearch));
        }
        // Check for tag:Name syntax
        else if (search.match(/^tag:\s*(.+)$/i)) {
            const tagSearch = search.match(/^tag:\s*(.+)$/i)[1].trim();
            cards = cards.filter(c => (c.tags || []).some(t => t.toLowerCase().includes(tagSearch)));
        }
        // Check for owned: filter (show only owned or not owned)
        else if (search === 'owned:yes' || search === 'owned:true') {
            cards = cards.filter(c => c.isOwned);
        }
        else if (search === 'owned:no' || search === 'owned:false') {
            cards = cards.filter(c => !c.isOwned);
        }
        // Normal search with field selector
        else {
            cards = cards.filter(c => {
                switch (field) {
                    case 'name':
                        return (c.name || '').toLowerCase().includes(search);
                    case 'creator':
                        return (c.creator || '').toLowerCase().includes(search);
                    case 'tags':
                        return (c.tags || []).some(t => t.toLowerCase().includes(search));
                    case 'description':
                        return (c.description || c.desc_preview || '').toLowerCase().includes(search);
                    case 'all':
                    default:
                        return (c.name || '').toLowerCase().includes(search) ||
                               (c.creator || '').toLowerCase().includes(search) ||
                               (c.description || c.desc_preview || '').toLowerCase().includes(search) ||
                               (c.tags || []).some(t => t.toLowerCase().includes(search));
                }
            });
        }
    }

    // Advanced Tag filter
    // Excluded tags - must NOT have any of these
    if (state.filters.excludedTags.length > 0) {
        cards = cards.filter(c => {
            if (!c.tags) return true; // No tags = not excluded
            const cardTags = c.tags.map(t => t.toLowerCase());
            return !state.filters.excludedTags.some(t => cardTags.includes(t));
        });
    }

    // Mandatory tags - must have ALL of these
    if (state.filters.mandatoryTags.length > 0) {
        cards = cards.filter(c => {
            if (!c.tags) return false;
            const cardTags = c.tags.map(t => t.toLowerCase());
            return state.filters.mandatoryTags.every(t => cardTags.includes(t));
        });
    }

    // Facultative tags - must have at least ONE of these
    if (state.filters.facultativeTags.length > 0) {
        cards = cards.filter(c => {
            if (!c.tags) return false;
            const cardTags = c.tags.map(t => t.toLowerCase());
            return state.filters.facultativeTags.some(t => cardTags.includes(t));
        });
    }

    // Legacy tag filter (for backwards compatibility)
    if (state.filters.tags.length > 0) {
        cards = cards.filter(c => {
            if (!c.tags) return false;
            const cardTags = c.tags.map(t => t.toLowerCase());
            return state.filters.tags.every(t => cardTags.includes(t));
        });
    }

    // Creator filter (match ANY selected creator)
    if (state.filters.creators.length > 0) {
        cards = cards.filter(c => state.filters.creators.includes(c.creator));
    }

    // Feature filters
    if (state.filters.ownedOnly) {
        cards = cards.filter(c => c.isOwned);
    }
    if (state.filters.lorebookOnly) {
        cards = cards.filter(c => c.embeddedLorebook || c.character_book || (c.relatedLorebooks?.length > 0));
    }
    if (state.filters.altGreetingsOnly) {
        cards = cards.filter(c => c.alternate_greetings?.length > 0);
    }
    // Local favorites filter
    if (state.filters.localFavoritesOnly) {
        const favorites = loadLocalFavorites();
        cards = cards.filter(c => favorites.includes(c.id));
    }

    // NSFW filter
    if (state.settings.hideNsfw) {
        cards = cards.filter(c => !c.possibleNsfw);
    }

    // Blocklist
    if (state.settings.tagBlocklist?.length > 0) {
        const blocklist = state.settings.tagBlocklist.map(t => t.toLowerCase());
        cards = cards.filter(c => {
            const cardTags = (c.tags || []).map(t => t.toLowerCase());
            return !blocklist.some(b => cardTags.includes(b));
        });
    }

    // Sort
    cards = sortCards(cards, state.sortBy);

    state.filteredCards = cards;
    state.currentPage = 1;

    renderCards();
    updateResultsCount();
}

function updateResultsCount() {
    const countEl = document.getElementById('resultsCount');
    if (countEl) {
        countEl.textContent = `${state.filteredCards.length} card${state.filteredCards.length !== 1 ? 's' : ''}`;
    }
}

// ============================================
// CARD RENDERING
// ============================================

function renderCards() {
    // Delegate to the page-based renderer
    renderCardsForPage();
}

function updatePagination() {
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    if (!pagination || !prevBtn || !nextBtn) return;

    const source = state.currentSource;

    // Determine pagination style based on source
    // Page-replace sources: fetch page N directly from API
    const isPageReplaceSource = ['wyvern', 'risuai_realm', 'jannyai', 'character_tavern', 'pygmalion', 'pygmalion_trending', 'chub_trending', 'wyvern_trending', 'jannyai_trending'].includes(source);
    // Accumulate sources: load more and add to existing cards
    const isAccumulateSource = ['chub', 'chub_timeline', 'chub_favorites', 'backyard', 'backyard_trending'].includes(source);
    // Local-only sources: paginate through already-loaded cards
    const isLocalOnly = !isPageReplaceSource && !isAccumulateSource;

    const cardsPerPage = state.settings.cardsPerPage || 50;
    const totalCards = state.filteredCards.length;
    const totalLocalPages = Math.max(1, Math.ceil(totalCards / cardsPerPage));

    // For page-replace sources, use API page tracking
    let apiPage = 1;
    let apiHasMore = false;
    if (source === 'wyvern') { apiPage = wyvernApiState.page || 1; apiHasMore = wyvernApiState.hasMore; }
    else if (source === 'wyvern_trending') { apiPage = wyvernTrendingState.page || 1; apiHasMore = wyvernTrendingState.hasMore; }
    else if (source === 'risuai_realm') { apiPage = risuRealmApiState.page || 1; apiHasMore = risuRealmApiState.hasMore; }
    else if (source === 'jannyai') { apiPage = state.jannyPage || 1; apiHasMore = totalCards >= 40; }
    else if (source === 'jannyai_trending') { apiPage = jannyTrendingState.page || 1; apiHasMore = jannyTrendingState.hasMore; }
    else if (source === 'character_tavern') { apiPage = characterTavernApiState.page || 1; apiHasMore = characterTavernApiState.hasMore; }
    else if (source === 'pygmalion' || source === 'pygmalion_trending') { apiPage = pygmalionApiState.page || 1; apiHasMore = pygmalionApiState.hasMore; }
    else if (source === 'chub_trending') { apiPage = chubTrendingState.page || 1; apiHasMore = chubTrendingState.hasMore; }
    else if (source === 'backyard') { apiHasMore = backyardApiState.hasMore; }
    else if (source === 'backyard_trending') { apiHasMore = backyardTrendingState.hasMore; }
    else if (source === 'chub') { apiHasMore = !!state.chubHasMore; }
    else if (source === 'chub_timeline') { apiHasMore = !!state.chubTimelineHasMore; }
    else if (source === 'chub_favorites') { apiHasMore = !!state.chubFavoritesHasMore; }

    // Hide pagination if no need
    if (isLocalOnly && totalLocalPages <= 1) {
        pagination.classList.add('hidden');
        return;
    }
    if (isPageReplaceSource && apiPage === 1 && !apiHasMore) {
        pagination.classList.add('hidden');
        return;
    }

    pagination.classList.remove('hidden');

    // Update page info and button states based on pagination type
    if (isPageReplaceSource) {
        pageInfo.textContent = `Page ${apiPage}`;
        prevBtn.disabled = apiPage <= 1;
        nextBtn.disabled = !apiHasMore;
    } else if (isAccumulateSource) {
        pageInfo.textContent = `Page ${state.currentPage}`;
        prevBtn.disabled = state.currentPage <= 1;
        nextBtn.disabled = state.currentPage >= totalLocalPages && !apiHasMore;
    } else {
        pageInfo.textContent = `Page ${state.currentPage} of ${totalLocalPages}`;
        prevBtn.disabled = state.currentPage <= 1;
        nextBtn.disabled = state.currentPage >= totalLocalPages;
    }

    // Prev button handler
    prevBtn.onclick = async () => {
        if (isPageReplaceSource && apiPage > 1) {
            await fetchApiPage(apiPage - 1);
        } else if (state.currentPage > 1) {
            state.currentPage--;
            renderCardsForPage();
            scrollToTop();
        }
    };

    // Next button handler
    nextBtn.onclick = async () => {
        if (isPageReplaceSource && apiHasMore) {
            await fetchApiPage(apiPage + 1);
        } else if (isAccumulateSource) {
            const atLastLocalPage = state.currentPage >= totalLocalPages;
            if (!atLastLocalPage) {
                state.currentPage++;
                renderCardsForPage();
                scrollToTop();
            } else if (apiHasMore) {
                nextBtn.disabled = true;
                nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
                try {
                    const prevTotalLocalPages = Math.max(1, Math.ceil(state.filteredCards.length / cardsPerPage));
                    await loadMoreFromApi();
                    const newTotalLocalPages = Math.max(1, Math.ceil(state.filteredCards.length / cardsPerPage));
                    // Only advance page if loading more actually created a new local page.
                    if (newTotalLocalPages > prevTotalLocalPages) {
                        state.currentPage++;
                    }
                    renderCardsForPage();
                    scrollToTop();
                } catch (e) {
                    showToast('Failed to load more', 'error');
                } finally {
                    nextBtn.innerHTML = 'Next <i class="fa-solid fa-angle-right"></i>';
                }
            }
        } else if (state.currentPage < totalLocalPages) {
            state.currentPage++;
            renderCardsForPage();
            scrollToTop();
        }
    };
}

// Fetch a specific page from API (page-replace style)
async function fetchApiPage(pageNum) {
    const source = state.currentSource;
    const nextBtn = document.getElementById('nextPageBtn');
    const prevBtn = document.getElementById('prevPageBtn');

    // Disable both buttons during load
    if (nextBtn) { nextBtn.disabled = true; nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
    if (prevBtn) { prevBtn.disabled = true; }

    try {
        let cards = [];

        if (source === 'wyvern') {
            const result = await searchWyvernCharacters({
                page: pageNum,
                limit: state.settings.cardsPerPage || 50,
                hideNsfw: state.settings.hideNsfw
            });
            cards = (result.results || []).map(transformWyvernCard);
            wyvernApiState.page = pageNum;
            wyvernApiState.hasMore = result.hasMore;
        }
        else if (source === 'risuai_realm') {
            const result = await searchRisuRealm({
                page: pageNum,
                nsfw: !state.settings.hideNsfw
            });
            cards = (result.cards || []).map(transformRisuRealmCard);
            risuRealmApiState.page = pageNum;
            risuRealmApiState.hasMore = result.hasMore;
        }
        else if (source === 'jannyai') {
            const result = await searchJannyCharacters({
                page: pageNum,
                nsfw: !state.settings.hideNsfw
            });
            const hits = result?.results?.[0]?.hits || [];
            cards = hits.map(transformJannyCard);
            state.jannyPage = pageNum;
        }
        else if (source === 'character_tavern') {
            const result = await searchCharacterTavern({ page: pageNum });
            cards = result || [];
            characterTavernApiState.page = pageNum;
            characterTavernApiState.hasMore = cards.length >= 30;
        }
        else if (source === 'pygmalion') {
            const result = await browsePygmalionCharacters({
                page: pageNum,
                includeSensitive: !state.settings.hideNsfw
            });
            cards = result.characters || [];
            pygmalionApiState.page = pageNum;
            pygmalionApiState.hasMore = result.hasMore;
        }
        else if (source === 'chub_trending') {
            const result = await fetchChubTrending({
                page: pageNum,
                nsfw: !state.settings.hideNsfw
            });
            cards = (result?.nodes || []).map(transformChubTrendingCard);
        }
        else if (source === 'wyvern_trending') {
            const result = await fetchWyvernTrending({
                page: pageNum,
                limit: state.settings.cardsPerPage || 50,
                rating: state.settings.hideNsfw ? 'none' : 'all'
            });
            cards = (result?.results || []).map(transformWyvernTrendingCard);
            wyvernTrendingState.page = pageNum;
            wyvernTrendingState.hasMore = result.hasMore;
        }
        else if (source === 'jannyai_trending') {
            const result = await fetchJannyTrending({ page: pageNum });
            cards = (result?.characters || []).map(transformJannyTrendingCard);
            jannyTrendingState.page = pageNum;
            jannyTrendingState.hasMore = result.hasMore;
        }
        else if (source === 'pygmalion_trending') {
            const result = await browsePygmalionCharacters({
                page: pageNum,
                orderBy: PYGMALION_SORT_TYPES.VIEWS,
                includeSensitive: !state.settings.hideNsfw
            });
            cards = (result.characters || []).map(card => ({
                ...card,
                sourceService: 'pygmalion_trending',
                isTrending: true
            }));
            pygmalionApiState.page = pageNum;
            pygmalionApiState.hasMore = result.hasMore;
        }

        // REPLACE cards (not accumulate)
        state.currentCards = cards;
        state.currentPage = 1;
        applyFilters();
        scrollToTop();

        if (cards.length === 0) {
            showToast('No cards on this page', 'info');
        }
    } catch (e) {
        console.error('[Bot Browser Standalone] Failed to fetch page:', e);
        showToast('Failed to load page', 'error');
    } finally {
        if (nextBtn) { nextBtn.innerHTML = 'Next <i class="fa-solid fa-angle-right"></i>'; }
        updatePagination();
    }
}

// Helper to generate HTML for a single card
function renderCardHtml(card) {
    const isNsfw = card.possibleNsfw;
    const originalAvatarUrlRaw = card.avatar_url || card.image_url || '';
    const originalAvatarUrl = unwrapProxyUrl(originalAvatarUrlRaw);
    let avatarUrl = originalAvatarUrl;
    const serviceName = String(card.service || card.sourceService || '');

    // Build stats line
    const stats = [];
    if (card.nTokens || card.tokens) {
        const tokens = card.nTokens || card.tokens;
        stats.push(`<span title="${tokens.toLocaleString()} tokens"><i class="fa-solid fa-text-width"></i> ${formatNumber(tokens)}</span>`);
    }
    if (card.rating) {
        const ratingNum = typeof card.rating === 'number' ? card.rating.toFixed(1) : card.rating;
        stats.push(`<span title="Rating"><i class="fa-solid fa-star"></i> ${ratingNum}</span>`);
    }
    if (card.starCount) {
        stats.push(`<span title="Favorites"><i class="fa-solid fa-heart"></i> ${formatNumber(card.starCount)}</span>`);
    }
    if (card.downloadCount) {
        stats.push(`<span title="Downloads"><i class="fa-solid fa-download"></i> ${formatNumber(card.downloadCount)}</span>`);
    }
    const tagCount = card.tags?.length || 0;
    if (tagCount > 0) {
        stats.push(`<span title="${tagCount} tags"><i class="fa-solid fa-tags"></i> ${tagCount}</span>`);
    }
    const statsHtml = stats.length > 0 ? `<div class="card-stats">${stats.join('')}</div>` : '';

    // Import timestamp
    let importTimeHtml = '';
    if (state.currentSource === 'imports' && card.importedAt) {
        const relTime = formatRelativeTime(card.importedAt);
        const fullDate = new Date(card.importedAt).toLocaleString();
        importTimeHtml = `<div class="card-import-time" title="Imported ${fullDate}"><i class="fa-solid fa-clock"></i> ${relTime}</div>`;
    }

    // Imports-only description line (when available)
    let importDescHtml = '';
    if (state.currentSource === 'imports' && card.desc_preview) {
        const plain = toPlainTextForTitle(String(card.desc_preview)).trim().replace(/\s+/g, ' ');
        if (plain) importDescHtml = `<div class="card-desc" title="${escapeHtml(plain)}">${escapeHtml(plain)}</div>`;
    }

    // Imports-only quick actions (match in-app UX: open imported character in SillyTavern)
    let importActionsHtml = '';
    if (state.currentSource === 'imports' && !isLorebookImportRecord(card)) {
        const fileName = escapeHtml(card.st_file_name || '');
        const name = escapeHtml(card.name || '');
        importActionsHtml = `
            <button class="card-open-st-btn" type="button" title="Open in SillyTavern" data-file="${fileName}" data-name="${name}">
                <i class="fa-solid fa-comments"></i>
            </button>
        `;
    }

    // Feature badges
    const altGreetingsCount = card.alternate_greetings?.length || 0;
    const hasLorebook = card.character_book || card.embeddedLorebook || (card.relatedLorebooks?.length > 0);
    const lorebookCount = card.character_book?.entries?.length ||
                         (typeof card.embeddedLorebook === 'object' ? Object.keys(card.embeddedLorebook.entries || {}).length : 0) ||
                         0;

    const tooltipRaw = card.tagline || card.desc_preview || (card.description ? card.description.substring(0, 200) : '');
    const tooltip = toPlainTextForTitle(tooltipRaw);
    const tooltipAttr = tooltip ? `title="${escapeHtml(tooltip.replace(/\n/g, ' '))}"` : '';

    return `
        <div class="card ${isNsfw ? 'nsfw' : ''}" data-card-id="${escapeHtml(card.id || '')}" data-service="${escapeHtml(serviceName)}" ${tooltipAttr}>
            <div class="card-image-wrapper">
                <img class="card-image"
                     src="${escapeHtml(avatarUrl)}"
                     data-original-url="${escapeHtml(originalAvatarUrl)}"
                     data-service="${escapeHtml(serviceName)}"
                     alt="${escapeHtml(card.name || '')}"
                     loading="lazy"
                     decoding="async"
                     referrerpolicy="no-referrer">
            </div>
            <div class="card-badges">
                ${isNsfw ? '<span class="card-badge nsfw" title="NSFW"><i class="fa-solid fa-fire"></i></span>' : ''}
                ${card.isBookmarked ? '<span class="card-badge bookmark" title="Bookmarked"><i class="fa-solid fa-bookmark"></i></span>' : ''}
                ${card.isOwned && !card.isLocal ? '<span class="card-badge owned" title="Already in library"><i class="fa-solid fa-check-circle"></i></span>' : ''}
                ${altGreetingsCount > 0 ? `<span class="card-badge greetings" title="${altGreetingsCount} alternate greeting${altGreetingsCount > 1 ? 's' : ''}"><i class="fa-solid fa-comment-dots"></i> ${altGreetingsCount}</span>` : ''}
                ${hasLorebook ? `<span class="card-badge lorebook" title="${lorebookCount > 0 ? lorebookCount + ' lorebook entries' : 'Has lorebook'}"><i class="fa-solid fa-book"></i>${lorebookCount > 0 ? ' ' + lorebookCount : ''}</span>` : ''}
            </div>
            <div class="card-overlay">
                ${importActionsHtml ? `<div class="card-import-actions">${importActionsHtml}</div>` : ''}
                <div class="card-name">${escapeHtml(card.name || 'Unknown')}</div>
                <div class="card-creator clickable-creator" data-creator="${escapeHtml(card.creator || '')}" data-service="${escapeHtml(card.service || card.sourceService || '')}">${escapeHtml(card.creator || 'Unknown')}</div>
                ${importDescHtml}
                ${statsHtml}
                ${importTimeHtml}
            </div>
        </div>
    `;
}

function renderCardsForPage() {
    const grid = document.getElementById('cardsGrid');
    const noResults = document.getElementById('noResults');

    if (!grid) return;

    if (state.filteredCards.length === 0) {
        grid.classList.add('hidden');
        grid.innerHTML = '';
        if (state.currentSource) {
            showNoResults();
        }
        updatePagination();
        return;
    }

    noResults?.classList.add('hidden');
    grid.classList.remove('hidden');

    const cardsPerPage = state.settings.cardsPerPage || 50;
    const start = (state.currentPage - 1) * cardsPerPage;
    const end = start + cardsPerPage;
    const visibleCards = state.filteredCards.slice(start, end);

    // Group by creator mode
    if (state.groupByCreator) {
        // Group cards by creator
        const groups = new Map();
        visibleCards.forEach(card => {
            const creator = card.creator || 'Unknown';
            if (!groups.has(creator)) {
                groups.set(creator, []);
            }
            groups.get(creator).push(card);
        });

        // Sort groups by card count (descending)
        const sortedGroups = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

        // Render grouped view
        grid.innerHTML = sortedGroups.map(([creator, cards]) => {
            const isCollapsed = state.collapsedGroups.has(creator);
            const cardsHtml = isCollapsed ? '' : cards.map(renderCardHtml).join('');

            return `
                <div class="creator-group" data-creator="${escapeHtml(creator)}">
                    <div class="creator-group-header ${isCollapsed ? 'collapsed' : ''}">
                        <i class="fa-solid fa-chevron-${isCollapsed ? 'right' : 'down'} toggle-icon"></i>
                        <span class="creator-group-name">${escapeHtml(creator)}</span>
                        <span class="creator-group-count">${cards.length} card${cards.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="creator-group-cards ${isCollapsed ? 'hidden' : ''}">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }).join('');

        // Group header click handlers
        grid.querySelectorAll('.creator-group-header').forEach(header => {
            header.addEventListener('click', () => {
                const group = header.closest('.creator-group');
                const creator = group.dataset.creator;
                const cardsContainer = group.querySelector('.creator-group-cards');
                const icon = header.querySelector('.toggle-icon');

                if (state.collapsedGroups.has(creator)) {
                    state.collapsedGroups.delete(creator);
                    header.classList.remove('collapsed');
                    cardsContainer.classList.remove('hidden');
                    icon.classList.replace('fa-chevron-right', 'fa-chevron-down');
                    // Render cards if they weren't rendered before
                    if (!cardsContainer.innerHTML.trim()) {
                        const groupCards = visibleCards.filter(c => (c.creator || 'Unknown') === creator);
                        cardsContainer.innerHTML = groupCards.map(renderCardHtml).join('');
                        attachCardListeners(cardsContainer);
                    }
                } else {
                    state.collapsedGroups.add(creator);
                    header.classList.add('collapsed');
                    cardsContainer.classList.add('hidden');
                    icon.classList.replace('fa-chevron-down', 'fa-chevron-right');
                }
            });
        });
    } else {
        // Normal flat view
        grid.innerHTML = visibleCards.map(renderCardHtml).join('');
    }

    // Attach card event listeners
    attachCardListeners(grid);

    updatePagination();
}

function attachCardListeners(container) {
    // Click handlers for cards
    container.querySelectorAll('.card').forEach(cardEl => {
        // Skip if already has listener
        if (cardEl.dataset.hasListener) return;
        cardEl.dataset.hasListener = 'true';

        cardEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('clickable-creator')) return;
            if (e.target.closest?.('.card-open-st-btn')) return;

            const cardId = cardEl.dataset.cardId;

            if (state.bulkSelectMode) {
                toggleCardSelection(cardId);
                return;
            }

            const card = state.filteredCards.find(c => String(c.id) === cardId);
            if (card) showCardModal(card);
        });
    });

    // Imports-only: Open in SillyTavern (chat) button
    container.querySelectorAll('.card-open-st-btn').forEach(btn => {
        if (btn.dataset.hasListener) return;
        btn.dataset.hasListener = 'true';

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const fileName = btn.dataset.file || '';
            const name = btn.dataset.name || '';
            requestSillyTavernOpenCharacter({ fileName, name });
            showToast('Opening in SillyTavern…', 'info');
        });
    });

    // Click handlers for creator names
    container.querySelectorAll('.clickable-creator').forEach(creatorEl => {
        if (creatorEl.dataset.hasListener) return;
        creatorEl.dataset.hasListener = 'true';

        creatorEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const creator = creatorEl.dataset.creator;
            const service = creatorEl.dataset.service;
            if (creator) loadCreatorCards(creator, service);
        });
    });

    // Thumbnail image fallback (handles ORB/CORS/hotlink failures)
    container.querySelectorAll('img.card-image').forEach(img => {
        if (img.dataset.hasImageListener) return;
        img.dataset.hasImageListener = 'true';

        img.addEventListener('load', () => {
            img.closest('.card-image-wrapper')?.classList.remove('no-image');
        });

        img.addEventListener('error', () => {
            handleCardImageError(img).catch(() => {
                // If our fallback handler itself throws, fail gracefully.
                img.closest('.card-image-wrapper')?.classList.add('no-image');
            });
        });
    });
}

function getCardImageProxyChain(service) {
    const s = String(service || '').toLowerCase();
    // Janny is Cloudflare-ish and frequently needs Puter.
    if (s.includes('janny') || s.includes('janitor')) {
        return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER, PROXY_TYPES.CORS_LOL];
    }

    // Character Tavern image host often blocks proxy URLs; Puter as a last-resort thumbnail fallback.
    if (s.includes('character_tavern') || s.includes('character tavern') || s.includes('ct')) {
        return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER];
    }

    // Wyvern can be strict about cross-origin access.
    if (s.includes('wyvern')) {
        return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER];
    }

    // Default: try cheap proxies first. If <img> loads are blocked (ORB/hotlink), we'll fall back to blob fetching.
    return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER];
}

function revokeObjectUrlIfAny(img) {
    const objectUrl = img.dataset.objectUrl;
    if (!objectUrl) return;
    try { URL.revokeObjectURL(objectUrl); } catch {}
    delete img.dataset.objectUrl;
}

async function handleCardImageError(img) {
    const wrapper = img.closest('.card-image-wrapper');
    const originalUrl = unwrapProxyUrl((img.dataset.originalUrl || '').trim());
    if (!originalUrl || originalUrl.startsWith('data:')) {
        wrapper?.classList.add('no-image');
        return;
    }
    if (!(originalUrl.startsWith('http://') || originalUrl.startsWith('https://'))) {
        // Proxies won't help for same-origin relative paths.
        wrapper?.classList.add('no-image');
        return;
    }

    // Prevent infinite retry loops
    const proxyChain = getCardImageProxyChain(img.dataset.service);
    const attempt = Number.parseInt(img.dataset.proxyAttempt || '0', 10) || 0;
    if (attempt >= proxyChain.length) {
        wrapper?.classList.add('no-image');
        return;
    }

    wrapper?.classList.remove('no-image');

    const proxyType = proxyChain[attempt];
    img.dataset.proxyAttempt = String(attempt + 1);

    if (proxyType === PROXY_TYPES.PUTER) {
        // Puter can't be represented as a URL; fetch as a blob and use an object URL.
        const resp = await proxiedFetch(originalUrl, {
            proxyChain: [PROXY_TYPES.PUTER],
            fetchOptions: { method: 'GET' },
            timeoutMs: 15000,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        revokeObjectUrlIfAny(img);
        const objectUrl = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
        return;
    }

    // cors.lol is often usable as an <img src> proxy but may not be usable via fetch() (CORS),
    // so handle it as a URL assignment.
    if (proxyType === PROXY_TYPES.CORS_LOL) {
        const proxiedUrl = buildProxyUrl(proxyType, originalUrl);
        const currentSrc = img.currentSrc || img.src || '';
        if (!proxiedUrl || proxiedUrl === currentSrc) return handleCardImageError(img);
        revokeObjectUrlIfAny(img);
        img.src = proxiedUrl;
        return;
    }

    // For corsproxy.io (and any other fetchable proxy types), fetch as a blob and use an object URL.
    try {
        const resp = await proxiedFetch(originalUrl, {
            proxyChain: [proxyType],
            fetchOptions: { method: 'GET' },
            timeoutMs: 15000,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const type = (blob.type || '').toLowerCase();
        if (type && !type.startsWith('image/')) throw new Error(`Not an image (${type})`);
        revokeObjectUrlIfAny(img);
        const objectUrl = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
        return;
    } catch {
        return handleCardImageError(img);
    }
}

function installProxyFallbackForImg(img, originalUrl, service) {
    if (!img) return;
    const clean = unwrapProxyUrl((originalUrl || '').trim());
    if (!clean) return;

    img.dataset.originalUrl = clean;
    img.dataset.service = service || '';
    img.dataset.proxyAttempt = '0';

    if (img.dataset.hasProxyFallbackListener) return;
    img.dataset.hasProxyFallbackListener = 'true';

    img.addEventListener('error', () => {
        handleAnyImageError(img).catch(() => {});
    });
}

async function handleAnyImageError(img) {
    const originalUrl = unwrapProxyUrl((img.dataset.originalUrl || img.src || '').trim());
    if (!originalUrl || originalUrl.startsWith('data:')) return;
    if (!(originalUrl.startsWith('http://') || originalUrl.startsWith('https://'))) return;

    const proxyChain = getCardImageProxyChain(img.dataset.service);
    const attempt = Number.parseInt(img.dataset.proxyAttempt || '0', 10) || 0;
    if (attempt >= proxyChain.length) return;

    const proxyType = proxyChain[attempt];
    img.dataset.proxyAttempt = String(attempt + 1);

    if (proxyType === PROXY_TYPES.PUTER) {
        const resp = await proxiedFetch(originalUrl, {
            proxyChain: [PROXY_TYPES.PUTER],
            fetchOptions: { method: 'GET' },
            timeoutMs: 15000,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        revokeObjectUrlIfAny(img);
        const objectUrl = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
        return;
    }

    if (proxyType === PROXY_TYPES.CORS_LOL) {
        const proxiedUrl = buildProxyUrl(proxyType, originalUrl);
        const currentSrc = img.currentSrc || img.src || '';
        if (!proxiedUrl || proxiedUrl === currentSrc) return handleAnyImageError(img);
        revokeObjectUrlIfAny(img);
        img.src = proxiedUrl;
        return;
    }

    try {
        const resp = await proxiedFetch(originalUrl, {
            proxyChain: [proxyType],
            fetchOptions: { method: 'GET' },
            timeoutMs: 15000,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const blob = await resp.blob();
        const type = (blob.type || '').toLowerCase();
        if (type && !type.startsWith('image/')) throw new Error(`Not an image (${type})`);
        revokeObjectUrlIfAny(img);
        const objectUrl = URL.createObjectURL(blob);
        img.dataset.objectUrl = objectUrl;
        img.src = objectUrl;
        return;
    } catch {
        return handleAnyImageError(img);
    }
}

function scrollToTop() {
    document.querySelector('.content-area')?.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load more cards for ACCUMULATE sources (Chub, Backyard)
async function loadMoreFromApi() {
    const source = state.currentSource;
    if (!source || state.isLoading) return;

    let newCards = [];

    if (source === 'chub') {
        const currentPage = (state.chubPage || 1) + 1;
        const limit = state.settings.cardsPerPage || 50;
        state.chubPage = currentPage;
        const result = await searchChubCards({
            page: currentPage,
            limit: limit,
            nsfw: !state.settings.hideNsfw
        });
        newCards = (result.data?.nodes || result.nodes || []).map(transformChubCard);
        state.chubHasMore = newCards.length >= limit;
    }
    else if (source === 'chub_timeline') {
        const currentPage = (state.chubTimelinePage || 1) + 1;
        state.chubTimelinePage = currentPage;
        const result = await fetchChubTimeline(currentPage);
        newCards = (result.nodes || []).map(transformChubCard);
        // Timeline endpoint appears to return fixed-size pages (20); treat "full page" as "has more"
        state.chubTimelineHasMore = !!result.hasMore;
    }
    else if (source === 'chub_favorites') {
        const currentPage = (state.chubFavoritesPage || 1) + 1;
        state.chubFavoritesPage = currentPage;
        const result = await fetchChubFavorites(currentPage, 48);
        newCards = (result.nodes || []).map(transformChubCard);
        state.chubFavoritesHasMore = !!result.hasMore;
    }
    else if (source === 'backyard' && backyardApiState.hasMore) {
        const result = await browseBackyardCharacters({
            cursor: backyardApiState.cursor,
            type: state.settings.hideNsfw ? 'sfw' : 'all'
        });
        newCards = (result.characters || []).map(transformBackyardCard);
        backyardApiState.cursor = result.nextCursor;
        backyardApiState.hasMore = result.hasMore;
    }
    else if (source === 'backyard_trending' && backyardTrendingState.hasMore) {
        const result = await loadMoreBackyardTrending();
        newCards = (result.characters || []).map(transformBackyardTrendingCard);
    }

    if (newCards.length > 0) {
        // Append to current cards
        state.currentCards = [...state.currentCards, ...newCards];
        // Re-apply filters
        applyFiltersWithoutReset();
        updateResultsCount();
        populateTagList();
        populateCreatorList();
        showToast(`Loaded ${newCards.length} more cards`, 'success');
    } else {
        showToast('No more cards available', 'info');
    }
}

// Apply filters without resetting page number
function applyFiltersWithoutReset() {
    const bookmarkIds = new Set(state.bookmarks.map(b => b.id));
    let cards = [...state.currentCards].map(c => ({
        ...c,
        isBookmarked: bookmarkIds.has(c.id),
        isOwned: state.myCharacterNames.has(c.name?.toLowerCase().trim())
    }));

    if (state.filters.favoritesOnly) cards = cards.filter(c => c.isBookmarked);

    const normalizedSearch = (state.filters.search || '').toLowerCase().trim();
    const shouldSkipTextFilter = (
        // For API sources, only search remotely on Enter (no local narrowing while typing).
        (getSourceCapabilities(state.currentSource).textSearch && !state.isRemoteSearch) ||
        // Remote-search results should not be locally narrowed by the same query.
        (state.isRemoteSearch && state.remoteSearchQuery && normalizedSearch === state.remoteSearchQuery) ||
        // While editing a new query after a remote search, don't narrow the old results.
        (state.isRemoteSearch && normalizedSearch && state.remoteSearchQuery && normalizedSearch !== state.remoteSearchQuery)
    );

    if (normalizedSearch && !shouldSkipTextFilter) {
        let search = normalizedSearch;
        const field = state.filters.searchField || 'all';

        // Check for special syntax
        const creatorMatch = search.match(/^creator:\s*(.+)$/i);
        if (creatorMatch) {
            const creatorSearch = creatorMatch[1].trim();
            cards = cards.filter(c => (c.creator || '').toLowerCase().includes(creatorSearch));
        } else if (search.match(/^tag:\s*(.+)$/i)) {
            const tagSearch = search.match(/^tag:\s*(.+)$/i)[1].trim();
            cards = cards.filter(c => (c.tags || []).some(t => t.toLowerCase().includes(tagSearch)));
        } else if (search === 'owned:yes' || search === 'owned:true') {
            cards = cards.filter(c => c.isOwned);
        } else if (search === 'owned:no' || search === 'owned:false') {
            cards = cards.filter(c => !c.isOwned);
        } else {
            cards = cards.filter(c => {
                switch (field) {
                    case 'name': return (c.name || '').toLowerCase().includes(search);
                    case 'creator': return (c.creator || '').toLowerCase().includes(search);
                    case 'tags': return (c.tags || []).some(t => t.toLowerCase().includes(search));
                    case 'description': return (c.description || c.desc_preview || '').toLowerCase().includes(search);
                    default: return (c.name || '').toLowerCase().includes(search) ||
                                   (c.creator || '').toLowerCase().includes(search) ||
                                   (c.description || c.desc_preview || '').toLowerCase().includes(search) ||
                                   (c.tags || []).some(t => t.toLowerCase().includes(search));
                }
            });
        }
    }
    if (state.filters.tags.length > 0) {
        cards = cards.filter(c => {
            if (!c.tags) return false;
            const cardTags = c.tags.map(t => t.toLowerCase());
            return state.filters.tags.every(t => cardTags.includes(t));
        });
    }
    if (state.filters.creators.length > 0) {
        cards = cards.filter(c => state.filters.creators.includes(c.creator));
    }
    // Feature filters
    if (state.filters.ownedOnly) cards = cards.filter(c => c.isOwned);
    if (state.filters.lorebookOnly) cards = cards.filter(c => c.embeddedLorebook || c.character_book || (c.relatedLorebooks?.length > 0));
    if (state.filters.altGreetingsOnly) cards = cards.filter(c => c.alternate_greetings?.length > 0);
    if (state.settings.hideNsfw) cards = cards.filter(c => !c.possibleNsfw);
    if (state.settings.tagBlocklist?.length > 0) {
        const blocklist = state.settings.tagBlocklist.map(t => t.toLowerCase());
        cards = cards.filter(c => {
            const cardTags = (c.tags || []).map(t => t.toLowerCase());
            return !blocklist.some(b => cardTags.includes(b));
        });
    }
    state.filteredCards = sortCards(cards, state.sortBy);
}

// ============================================
// CARD MODAL
// ============================================

function setupModals() {
    // Card modal
    document.getElementById('modalClose')?.addEventListener('click', hideCardModal);
    document.getElementById('cardModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'cardModal') hideCardModal();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Escape closes modal
        if (e.key === 'Escape') {
            const modal = document.getElementById('cardModal');
            if (modal && !modal.classList.contains('hidden')) {
                hideCardModal();
                e.preventDefault();
            }
        }
        // Ctrl+F focuses search
        if (e.ctrlKey && e.key === 'f') {
            const searchInput = document.getElementById('searchInput');
            if (searchInput && document.activeElement !== searchInput) {
                searchInput.focus();
                searchInput.select();
                e.preventDefault();
            }
        }

        // Grid navigation (only when not in input/textarea)
        const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        if (!isTyping) {
            const grid = document.getElementById('cardsGrid');
            const container = document.querySelector('.cards-container');
            if (grid && container) {
                switch (e.key) {
                    case 'PageDown':
                        container.scrollBy({ top: container.clientHeight * 0.8, behavior: 'smooth' });
                        e.preventDefault();
                        break;
                    case 'PageUp':
                        container.scrollBy({ top: -container.clientHeight * 0.8, behavior: 'smooth' });
                        e.preventDefault();
                        break;
                    case 'Home':
                        container.scrollTo({ top: 0, behavior: 'smooth' });
                        e.preventDefault();
                        break;
                    case 'End':
                        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                        e.preventDefault();
                        break;
                }
            }
        }
    });

    // Modal tabs (main and mini)
    document.querySelectorAll('.content-tab, .content-tab-mini').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            // Remove active from all tabs (both main and mini)
            document.querySelectorAll('.content-tab, .content-tab-mini').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.tab-content[data-content="${tabName}"]`)?.classList.add('active');
        });
    });

    // Bookmark button
    document.getElementById('modalBookmarkBtn')?.addEventListener('click', toggleBookmark);

    // Import button
    document.getElementById('modalImportBtn')?.addEventListener('click', importCurrentCard);

    // Download button
    document.getElementById('modalDownloadBtn')?.addEventListener('click', downloadCurrentCard);

    updateImportButtonUi();

    // Creator link click
    document.getElementById('modalCreator')?.addEventListener('click', (e) => {
        e.preventDefault();
        const card = state.selectedCard;
        if (card?.creator) {
            hideCardModal();
            loadCreatorCards(card.creator, card.service || card.sourceService);
        }
    });

    // Settings modal
    document.getElementById('settingsBtn')?.addEventListener('click', showSettingsModal);
    document.getElementById('settingsClose')?.addEventListener('click', hideSettingsModal);
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') hideSettingsModal();
    });

    // Batch import modal
    document.getElementById('batchImportBtn')?.addEventListener('click', showBatchImportModal);
    document.getElementById('batchImportClose')?.addEventListener('click', hideBatchImportModal);
    document.getElementById('batchImportModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'batchImportModal') hideBatchImportModal();
    });
    document.getElementById('startBatchImportBtn')?.addEventListener('click', startBatchImport);

    // Image lightbox
    document.getElementById('enlargeImage')?.addEventListener('click', () => {
        const imgSrc = document.getElementById('modalImage')?.src;
        if (imgSrc) {
            document.getElementById('lightboxImage').src = imgSrc;
            document.getElementById('imageLightbox').classList.remove('hidden');
        }
    });
    document.getElementById('lightboxClose')?.addEventListener('click', hideLightbox);
    document.getElementById('imageLightbox')?.addEventListener('click', (e) => {
        if (e.target.id === 'imageLightbox') hideLightbox();
    });

    // Escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideCardModal();
            hideSettingsModal();
            hideBatchImportModal();
            hideLightbox();
        }
    });
}

function canImportToSillyTavern() {
    return !!csrfToken;
}

function updateImportButtonUi() {
    const btn = document.getElementById('modalImportBtn');
    if (!btn) return;

    const enabled = canImportToSillyTavern();
    btn.disabled = !enabled;
    btn.title = enabled
        ? 'Import into SillyTavern'
        : 'Direct import requires SillyTavern (CSRF token unavailable). Use Download to save a file.';
}

function hideLightbox() {
    document.getElementById('imageLightbox')?.classList.add('hidden');
}

async function showCardModal(card) {
    state.selectedCard = card;
    const modal = document.getElementById('cardModal');
    if (!modal) return;

    // Clear all content immediately to prevent old content flashing
    const loadingSpinner = '<span class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</span>';
    document.getElementById('modalOverview').innerHTML = loadingSpinner;
    document.getElementById('modalDescription').innerHTML = loadingSpinner;
    document.getElementById('modalPersonality').innerHTML = loadingSpinner;
    document.getElementById('modalScenario').innerHTML = loadingSpinner;
    document.getElementById('modalFirstMessage').innerHTML = loadingSpinner;
    document.getElementById('modalCreatorNotes').innerHTML = loadingSpinner;
    document.getElementById('modalSystemPrompt').innerHTML = loadingSpinner;
    document.getElementById('modalExampleMessages').innerHTML = loadingSpinner;

    // Reset to first tab and show all tabs (will be hidden later if empty)
    document.querySelectorAll('.content-tab, .content-tab-mini').forEach(t => {
        t.classList.remove('active', 'empty-tab');
        t.style.display = '';
    });
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.content-tab[data-tab="overview"]')?.classList.add('active');
    document.querySelector('.tab-content[data-content="overview"]')?.classList.add('active');

    // Basic info
    const avatarUrl = unwrapProxyUrl(card.avatar_url || card.image_url || '');
    const modalAvatar = document.getElementById('modalAvatar');
    if (modalAvatar) {
        modalAvatar.src = avatarUrl;
        installProxyFallbackForImg(modalAvatar, avatarUrl, card.service || card.sourceService);
    }
    document.getElementById('modalName').textContent = card.name || 'Unknown';
    document.getElementById('modalCreator').textContent = card.creator || 'Unknown';
    const modalImage = document.getElementById('modalImage');
    if (modalImage) {
        modalImage.src = avatarUrl;
        installProxyFallbackForImg(modalImage, avatarUrl, card.service || card.sourceService);
    }

    // Set blurred background image
    const bgImage = document.getElementById('modalBgImage');
    if (bgImage) {
        bgImage.style.backgroundImage = avatarUrl ? `url('${avatarUrl}')` : 'none';
    }

    // Show/hide secondary tabs based on card type (local cards show edit/chats/media)
    const localOnlyTabs = document.getElementById('localOnlyTabs');
    if (localOnlyTabs) {
        localOnlyTabs.style.display = card.isLocal ? 'flex' : 'none';
    }

    // Stats with new format
    const statsContainer = document.getElementById('modalStats');
    const statsHtml = [];
    if (card.nTokens) statsHtml.push(`<span class="stat"><i class="fa-solid fa-font"></i> ${card.nTokens.toLocaleString()}</span>`);
    const downloads = card.downloadCount || card.download_count;
    if (downloads) statsHtml.push(`<span class="stat"><i class="fa-solid fa-download"></i> ${downloads.toLocaleString()}</span>`);
    if (card.starCount) statsHtml.push(`<span class="stat"><i class="fa-solid fa-star"></i> ${card.starCount.toLocaleString()}</span>`);
    if (card.views) statsHtml.push(`<span class="stat"><i class="fa-solid fa-eye"></i> ${card.views.toLocaleString()}</span>`);
    if (card.likes) statsHtml.push(`<span class="stat"><i class="fa-solid fa-heart"></i> ${card.likes.toLocaleString()}</span>`);
    statsContainer.innerHTML = statsHtml.join('');

    // Bookmark state
    const isBookmarked = state.bookmarks.some(b => b.id === card.id);
    updateBookmarkButton(isBookmarked);

    // External link - construct proper source page URLs
    const externalBtn = document.getElementById('modalExternalBtn');
    let externalUrl = '';
    if (card.isWyvern && card.id) {
        externalUrl = `https://wyvernchat.com/chat/${card.id}`;
    } else if (card.isCharacterTavern && card.fullPath) {
        externalUrl = `https://character-tavern.com/character/${card.fullPath}`;
    } else if (card.isChub && card.fullPath) {
        externalUrl = `https://chub.ai/characters/${card.fullPath}`;
    } else if (card.isPygmalion && card.id) {
        externalUrl = `https://pygmalion.chat/character/${card.id}`;
    } else if (card.isRisuRealm && card.id) {
        externalUrl = `https://realm.risuai.net/character/${card.id}`;
    } else if (card.isJannyAI && card.id) {
        externalUrl = `https://jannyai.com/characters/${card.id}`;
    } else if (card.isBackyard && card.id) {
        externalUrl = `https://backyard.ai/hub/character/${card.id}`;
    } else {
        const rawUrl = card.url || card.image_url || '';
        externalUrl = unwrapProxyUrl(rawUrl);
    }
    if (externalUrl && externalUrl.startsWith('http')) {
        externalBtn.href = externalUrl;
        externalBtn.style.display = '';
    } else {
        externalBtn.style.display = 'none';
    }

    // Tags (initial render from preview; refreshed after full data loads)
    renderModalTags(card);

    // Helper to get field from card - handles both direct and nested data structures
    const getField = (fieldName) => {
        return card[fieldName] || card.data?.[fieldName] || card._rawData?.data?.[fieldName] || '';
    };

    // Check if card has character definition data (not just preview data)
    const description = getField('description');
    const personality = getField('personality');
    const scenario = getField('scenario');
    const first_mes = getField('first_mes') || getField('first_message');
    const mes_example = getField('mes_example');
    const system_prompt = getField('system_prompt');
    const creator_notes = getField('creator_notes');
    const tagline = card.tagline || card.desc_preview || '';

    // Has full data if description exists and is substantial
    const hasFullData = description && description.length > 50;

    // Archive cards with chunk ALWAYS need to load - index only has preview data
    // Local cards have full data already
    // API cards (Chub, Backyard, etc.) need to fetch from API
    const needsDataLoad = (card.isArchive && card.chunk) ||
                          (card.isLiveChub || card.isChub) ||
                          card.isJannyAI || card.isBackyard ||
                          card.isPygmalion || card.isRisuRealm;

    if (card.isLocal) {
        // Display all fields
        const overview = creator_notes || tagline || '';
        document.getElementById('modalOverview').innerHTML = formatRichText(overview) || '';
        document.getElementById('modalDescription').innerHTML = formatRichText(description) || '';
        document.getElementById('modalPersonality').innerHTML = formatRichText(personality) || '';
        document.getElementById('modalScenario').innerHTML = formatRichText(scenario) || '';
        document.getElementById('modalFirstMessage').innerHTML = formatRichText(first_mes) || '';
        document.getElementById('modalCreatorNotes').innerHTML = formatRichText(tagline || creator_notes) || '';
        document.getElementById('modalSystemPrompt').innerHTML = formatRichText(system_prompt) || '';
        document.getElementById('modalExampleMessages').innerHTML = formatRichText(mes_example) || '';

        // Render alternate greetings for local cards
        const alternate_greetings = card.alternate_greetings || [];
        const altGreetingsContainer = document.getElementById('modalAltGreetings');
        if (altGreetingsContainer) {
            if (alternate_greetings.length > 0) {
                altGreetingsContainer.innerHTML = alternate_greetings.map((greeting, index) => `
                    <div class="alt-greeting-item">
                        <div class="alt-greeting-header">
                            <i class="fa-solid fa-comment"></i> Greeting ${index + 1}
                        </div>
                        <div class="alt-greeting-text">${formatRichText(greeting)}</div>
                    </div>
                `).join('');
            } else {
                altGreetingsContainer.innerHTML = '<div class="alt-greetings-empty">No alternate greetings</div>';
            }
        }

        // Render lorebook entries for local cards
        const entries = card.entries || card.character_book?.entries || {};
        const lorebookEntriesContainer = document.getElementById('modalLorebookEntries');
        if (lorebookEntriesContainer) {
            const entriesArray = Object.values(entries);
            if (entriesArray.length > 0) {
                lorebookEntriesContainer.innerHTML = entriesArray.map((entry, index) => {
                    const keywords = entry.key || entry.keys || [];
                    const keywordsArray = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()) : []);
                    const content = entry.content || '';
                    const name = entry.comment || entry.name || `Entry ${index + 1}`;
                    return `
                        <div class="lorebook-entry-item">
                            <div class="lorebook-entry-header">
                                <i class="fa-solid fa-bookmark"></i>
                                <span>${escapeHtml(name)}</span>
                                <span class="lorebook-entry-count">#${index + 1}</span>
                            </div>
                            ${keywordsArray.length > 0 ? `
                                <div class="lorebook-entry-keywords">
                                    ${keywordsArray.map(kw => `<span class="lorebook-keyword">${escapeHtml(kw)}</span>`).join('')}
                                </div>
                            ` : ''}
                            <div class="lorebook-entry-content">${formatRichText(content)}</div>
                        </div>
                    `;
                }).join('');
            } else {
                lorebookEntriesContainer.innerHTML = '<div class="lorebook-entries-empty">No lorebook entries</div>';
            }
        }

        // Hide empty tabs for local cards
        updateTabVisibility({
            description, personality, scenario, first_mes,
            creator_notes: tagline || creator_notes,
            system_prompt, mes_example, alternate_greetings,
            entries: entries
        }, false, '', card.isLorebook || false);
    } else {
        // Show loading spinners - full data will be fetched from API or chunk
        document.getElementById('modalOverview').innerHTML = loadingSpinner;
        document.getElementById('modalDescription').innerHTML = loadingSpinner;
        document.getElementById('modalPersonality').innerHTML = loadingSpinner;
        document.getElementById('modalScenario').innerHTML = loadingSpinner;
        document.getElementById('modalFirstMessage').innerHTML = loadingSpinner;
        document.getElementById('modalCreatorNotes').innerHTML = loadingSpinner;
        document.getElementById('modalSystemPrompt').innerHTML = loadingSpinner;
        document.getElementById('modalExampleMessages').innerHTML = loadingSpinner;
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Load full data in background
    loadFullCardData(card);
}

async function loadFullCardData(card) {
    try {
        // Helper to get field from any card structure
        const getField = (obj, fieldName) => {
            return obj[fieldName] || obj.data?.[fieldName] || obj._rawData?.data?.[fieldName] || '';
        };

        // Local cards already have full data
        if (card.isLocal) {
            return;
        }

        let fullCard = null;

        // Archive cards - load full data from chunk file
        if (card.isArchive && card.chunk) {
            const chunkService = card.sourceService || card.service;
            if (chunkService) {
                console.log(`[Bot Browser] Loading chunk for archive card: ${chunkService}/${card.chunk}`);
                const chunkData = await loadCardChunk(chunkService, card.chunk);

                if (chunkData && chunkData.length > 0) {
                    // Find the card in the chunk by ID or name
                    let chunkCard = chunkData.find(c =>
                        c.id === card.id ||
                        (c.image_url && c.image_url === card.id) ||
                        (c.image_url && c.image_url === card.image_url)
                    );

                    if (!chunkCard) {
                        chunkCard = chunkData.find(c => c.name === card.name);
                    }

                    if (!chunkCard && card.chunk_idx !== undefined) {
                        chunkCard = chunkData[card.chunk_idx];
                    }

                    if (chunkCard) {
                        fullCard = { ...chunkCard, ...card };
                        console.log(`[Bot Browser] Found full card data in chunk:`, fullCard.name);
                    }
                }
            }
        }
        // Chub Lorebook - fetch full lorebook data with entries
        else if (card.isLorebook && card.isLiveChub && card.nodeId) {
            try {
                console.log('[Bot Browser] Fetching Chub lorebook:', card.nodeId);
                const lorebookData = await getChubLorebook(card.nodeId);
                if (lorebookData) {
                    fullCard = { ...card, ...lorebookData, isLorebook: true };
                    console.log('[Bot Browser] Loaded lorebook entries:', Object.keys(lorebookData.entries || {}).length);
                } else {
                    fullCard = { ...card, _noDetailApi: true, isLorebook: true };
                }
            } catch (error) {
                console.error('[Bot Browser] Failed to load lorebook:', error);
                fullCard = { ...card, _noDetailApi: true, isLorebook: true };
            }
        }
        // Chub live API (characters)
        else if ((card.isLiveChub || card.isChub) && card.fullPath && !card.isLorebook) {
            const data = await getChubCharacter(card.fullPath);
            fullCard = transformFullChubCharacter(data);
        }
        // JannyAI
        else if (card.isJannyAI && card.id) {
            const data = await fetchJannyCharacterDetails(card.id, card.slug);
            fullCard = transformFullJannyCharacter(data);
        }
        // Backyard.ai - characterConfigId is stored as 'id'
        else if (card.isBackyard && (card.characterConfigId || card.id)) {
            const configId = card.characterConfigId || card.id;
            const data = await getBackyardCharacter(configId);
            fullCard = transformFullBackyardCharacter(data);
        }
        // Pygmalion
        else if (card.isPygmalion && card.id) {
            const data = await getPygmalionCharacter(card.id);
            fullCard = transformFullPygmalionCharacter(data);
        }
        // RisuRealm
        else if (card.isRisuRealm && card.id) {
            const data = await fetchRisuRealmCharacter(card.id);
            fullCard = transformFullRisuRealmCharacter(data);
        }
        // Wyvern - no detail API, use existing data
        else if (card.isWyvern || card.service === 'wyvern') {
            fullCard = { ...card, _noDetailApi: true };
        }
        // Character Tavern - no detail API, use existing data
        else if (card.isCharacterTavern || card.service === 'character_tavern') {
            fullCard = { ...card, _noDetailApi: true };
        }
        // MLPchag - no detail API
        else if (card.isMlpchag || card.service === 'mlpchag') {
            fullCard = { ...card, _noDetailApi: true };
        }
        // Fallback for any other card type - use existing card data
        else {
            fullCard = { ...card, _noDetailApi: true };
        }

        if (fullCard && state.selectedCard?.id === card.id) {
            Object.assign(card, fullCard);
            // Tags often only exist in the full detail response; refresh the ribbon now.
            renderModalTags(card);

            // Get fields with fallbacks
            const description = getField(fullCard, 'description');
            const personality = getField(fullCard, 'personality');
            const scenario = getField(fullCard, 'scenario');
            const first_mes = getField(fullCard, 'first_mes') || getField(fullCard, 'first_message');
            const mes_example = getField(fullCard, 'mes_example');
            const system_prompt = getField(fullCard, 'system_prompt');
            const creator_notes = getField(fullCard, 'creator_notes');
            const tagline = fullCard.tagline || card.desc_preview || '';

            // Only RisuRealm shows "not available from API" message - others just hide empty tabs
            const isRisuRealm = card.isRisuRealm || card.service === 'risuai_realm';
            const apiLimitedMsg = '<span class="api-limited-field"><i class="fa-solid fa-circle-info"></i> Not available from API - import to view</span>';

            // Update modal with full data
            const overview = creator_notes || tagline || '';
            document.getElementById('modalOverview').innerHTML = formatRichText(overview || 'No overview available');
            document.getElementById('modalDescription').innerHTML = formatRichText(description) || '';
            document.getElementById('modalPersonality').innerHTML = formatRichText(personality) || '';
            document.getElementById('modalScenario').innerHTML = formatRichText(scenario) || '';
            document.getElementById('modalFirstMessage').innerHTML = formatRichText(first_mes) || '';
            document.getElementById('modalCreatorNotes').innerHTML = formatRichText(tagline || creator_notes) || '';
            document.getElementById('modalSystemPrompt').innerHTML = formatRichText(system_prompt) || '';
            document.getElementById('modalExampleMessages').innerHTML = formatRichText(mes_example) || '';

            // Render alternate greetings
            const alternate_greetings = fullCard.alternate_greetings || [];
            const altGreetingsContainer = document.getElementById('modalAltGreetings');
            if (altGreetingsContainer) {
                if (alternate_greetings.length > 0) {
                    altGreetingsContainer.innerHTML = alternate_greetings.map((greeting, index) => `
                        <div class="alt-greeting-item">
                            <div class="alt-greeting-header">
                                <i class="fa-solid fa-comment"></i> Greeting ${index + 1}
                            </div>
                            <div class="alt-greeting-text">${formatRichText(greeting)}</div>
                        </div>
                    `).join('');
                } else {
                    altGreetingsContainer.innerHTML = '<div class="alt-greetings-empty">No alternate greetings</div>';
                }
            }

            // Render lorebook entries
            const lorebookEntriesContainer = document.getElementById('modalLorebookEntries');
            if (lorebookEntriesContainer) {
                const entries = fullCard.entries || {};
                const entriesArray = Object.values(entries);
                if (entriesArray.length > 0) {
                    lorebookEntriesContainer.innerHTML = entriesArray.map((entry, index) => {
                        const keywords = entry.key || entry.keys || [];
                        const keywordsArray = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split(',').map(k => k.trim()) : []);
                        const content = entry.content || '';
                        const name = entry.comment || entry.name || `Entry ${index + 1}`;
                        return `
                            <div class="lorebook-entry-item">
                                <div class="lorebook-entry-header">
                                    <i class="fa-solid fa-bookmark"></i>
                                    <span>${escapeHtml(name)}</span>
                                    <span class="lorebook-entry-count">#${index + 1}</span>
                                </div>
                                ${keywordsArray.length > 0 ? `
                                    <div class="lorebook-entry-keywords">
                                        ${keywordsArray.map(kw => `<span class="lorebook-keyword">${escapeHtml(kw)}</span>`).join('')}
                                    </div>
                                ` : ''}
                                <div class="lorebook-entry-content">${formatRichText(content)}</div>
                            </div>
                        `;
                    }).join('');
                } else {
                    lorebookEntriesContainer.innerHTML = '<div class="lorebook-entries-empty">No lorebook entries available</div>';
                }
            }

            // Hide empty tabs, show API message only for RisuRealm
            // For lorebooks, show entries tab and hide character tabs
            const isLorebook = fullCard.isLorebook || false;
            updateTabVisibility({
                description, personality, scenario, first_mes,
                creator_notes: tagline || creator_notes,
                system_prompt, mes_example, alternate_greetings,
                entries: fullCard.entries
            }, isRisuRealm, apiLimitedMsg, isLorebook);
        }
    } catch (e) {
        console.warn('[Bot Browser Standalone] Could not load full card data:', e);
    }
}

// Hide tabs with no content, show API limitation message only for RisuRealm
function updateTabVisibility(fields, isRisuRealm, apiLimitedMsg, isLorebook = false) {
    // Character-specific tabs
    const characterTabMapping = {
        description: 'description',
        personality: 'personality',
        scenario: 'scenario',
        first_mes: 'greeting',
        creator_notes: 'notes',
        system_prompt: 'system',
        mes_example: 'examples',
        alternate_greetings: 'altgreetings'
    };

    // Lorebook entries tab
    const entriesTab = document.querySelector('.content-tab[data-tab="entries"]');
    const entriesContent = document.querySelector('.tab-content[data-content="entries"]');

    if (isLorebook) {
        // For lorebooks: hide character tabs, show entries tab
        Object.values(characterTabMapping).forEach(tabName => {
            const tab = document.querySelector(`.content-tab[data-tab="${tabName}"]`);
            if (tab) tab.style.display = 'none';
        });

        // Show entries tab if there are entries
        if (entriesTab && entriesContent) {
            const entries = fields.entries;
            const hasEntries = entries && typeof entries === 'object' && Object.keys(entries).length > 0;
            entriesTab.style.display = hasEntries ? '' : 'none';
            entriesTab.classList.remove('empty-tab');
        }
    } else {
        // For characters: hide entries tab, show character tabs based on content
        if (entriesTab) entriesTab.style.display = 'none';

        Object.entries(characterTabMapping).forEach(([field, tabName]) => {
            const tab = document.querySelector(`.content-tab[data-tab="${tabName}"]`);
            const content = document.querySelector(`.tab-content[data-content="${tabName}"]`);
            if (!tab || !content) return;

            const val = fields[field];
            // Handle arrays (like alternate_greetings) and strings differently
            const hasContent = Array.isArray(val) ? val.length > 0 : (val && typeof val === 'string' && val.trim().length > 0);

            // Also check rendered content in case formatting produces something
            const container = content.querySelector('.scrolling-text') || content.querySelector('.alt-greetings-container');
            const renderedContent = container?.textContent?.trim() || '';
            const actuallyHasContent = hasContent || (renderedContent.length > 0 && !renderedContent.includes('Not available from API') && !renderedContent.includes('No alternate greetings'));

            if (actuallyHasContent) {
                tab.style.display = '';
                tab.classList.remove('empty-tab');
            } else if (isRisuRealm) {
                // Show tab with API limitation message (only for RisuRealm)
                tab.style.display = '';
                tab.classList.add('empty-tab');
                if (container) container.innerHTML = apiLimitedMsg;
            } else {
                // Hide completely if empty and not RisuRealm
                tab.style.display = 'none';
            }
        });
    }
}

function hideCardModal() {
    document.getElementById('cardModal')?.classList.add('hidden');
    document.body.style.overflow = '';
    state.selectedCard = null;
}

function updateBookmarkButton(isBookmarked) {
    const btn = document.getElementById('modalBookmarkBtn');
    if (!btn) return;

    btn.classList.toggle('active', isBookmarked);
    btn.querySelector('i').className = isBookmarked ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark';
    btn.title = isBookmarked ? 'Remove bookmark' : 'Add bookmark';
}

function toggleBookmark() {
    if (!state.selectedCard) return;

    const isCurrentlyBookmarked = state.bookmarks.some(b => b.id === state.selectedCard.id);

    if (isCurrentlyBookmarked) {
        state.bookmarks = removeBookmark(state.selectedCard.id);
        showToast('Removed from bookmarks', 'info');
    } else {
        state.bookmarks = addBookmark(state.selectedCard);
        showToast('Added to bookmarks', 'success');
    }

    updateBookmarkButton(!isCurrentlyBookmarked);
    state.selectedCard.isBookmarked = !isCurrentlyBookmarked;
    renderCards();
}

function encodeChubFullPath(fullPath) {
    return String(fullPath || '')
        .split('/')
        .map(seg => encodeURIComponent(seg))
        .join('/');
}

function toSafeBaseName(name, fallback) {
    return (name || fallback || 'download')
        .toString()
        .trim()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 80) || (fallback || 'download');
}

function getBlobFetchProxyChainForUrl(url) {
    const lower = String(url || '').toLowerCase();

    // Chub card PNGs are hosted on avatars.charhub.io, which corsproxy.io frequently blocks (403).
    if (lower.includes('avatars.charhub.io') || lower.includes('charhub.io') || lower.includes('characterhub.org')) {
        return [PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER];
    }

    // Cloudflare-ish sources often need Puter or corsproxy.io
    if (lower.includes('janny') || lower.includes('janitor') || lower.includes('wyvern') || lower.includes('character-tavern')) {
        return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER, PROXY_TYPES.CORS_LOL];
    }

    // Default: try cheap proxies first, Puter last to reduce noise
    return [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.CORS_LOL, PROXY_TYPES.PUTER];
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function unwrapProxyUrl(url) {
    if (!url || typeof url !== 'string') return url;
    const trimmed = url.trim();

    const candidates = [
        'https://corsproxy.io/?url=',
        'http://corsproxy.io/?url=',
        'https://api.cors.lol/?url=',
        'http://api.cors.lol/?url=',
    ];

    for (const prefix of candidates) {
        if (trimmed.startsWith(prefix)) {
            const encoded = trimmed.slice(prefix.length);
            try {
                return decodeURIComponent(encoded);
            } catch {
                return encoded;
            }
        }
    }

    return url;
}

async function downloadFromUrl(url, preservedName = null) {
    const unwrappedUrl = unwrapProxyUrl(url);
    const proxyChain = getBlobFetchProxyChainForUrl(unwrappedUrl);
    const resp = await fetchOkWithProxyChain(unwrappedUrl, proxyChain, 30000);

    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `HTTP ${resp.status}`);
    }

    const blob = await resp.blob();
    const contentType = (resp.headers.get('content-type') || blob.type || '').toLowerCase();
    const lowerUrl = String(unwrappedUrl).toLowerCase();

    let fileType = 'png';
    if (contentType.includes('application/json') || contentType.includes('text/json') || lowerUrl.endsWith('.json')) {
        fileType = 'json';
    } else if (contentType.includes('image/png') || lowerUrl.endsWith('.png')) {
        fileType = 'png';
    }

    const safeBaseName = toSafeBaseName(preservedName, 'download');
    downloadBlob(blob, `${safeBaseName}.${fileType}`);
}

async function buildEmbeddedCharacterPngBlob(card) {
    const characterData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: card.name || '',
            description: card.description || '',
            personality: card.personality || '',
            scenario: card.scenario || '',
            first_mes: card.first_message || card.first_mes || '',
            mes_example: card.mes_example || card.example_messages || '',
            creator_notes: card.creator_notes || card.website_description || '',
            system_prompt: card.system_prompt || '',
            post_history_instructions: card.post_history_instructions || '',
            creator: card.creator || '',
            character_version: card.character_version || '1.0',
            tags: card.tags || [],
            alternate_greetings: card.alternate_greetings || [],
            character_book: card.character_book || undefined,
            extensions: { talkativeness: '0.5', fav: false, world: '', depth_prompt: { prompt: '', depth: 4 } }
        }
    };

    let imageBlob = await fetchImageWithProxy(card.avatar_url || card.image_url);
    if (!imageBlob) imageBlob = await createDefaultAvatar();

    const jsonString = JSON.stringify(characterData);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
    return createCharacterPNG(imageBlob, base64Data);
}

async function downloadCurrentCard() {
    if (!state.selectedCard) return;

    const card = state.selectedCard;
    const downloadBtn = document.getElementById('modalDownloadBtn');
    const isLorebook = card.isLorebook === true;

    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Downloading...</span>';
    }

    try {
        if (isLorebook) {
            let worldInfo = null;
            if (card.isLiveChub && card.nodeId) {
                if (card.entries && (typeof card.entries === 'object' || Array.isArray(card.entries))) {
                    worldInfo = card;
                } else {
                    worldInfo = await getChubLorebook(card.nodeId);
                }
            } else {
                worldInfo = card;
            }

            if (!worldInfo || !('entries' in worldInfo)) {
                throw new Error('Lorebook has no entries to download');
            }

            if (Array.isArray(worldInfo.entries)) {
                const entriesObj = {};
                worldInfo.entries.forEach((entry, idx) => { entriesObj[String(idx)] = entry; });
                worldInfo = { ...worldInfo, entries: entriesObj };
            }

            const safeBaseName = toSafeBaseName(card.name, 'lorebook');
            const json = JSON.stringify(worldInfo, null, 2);
            downloadBlob(new Blob([json], { type: 'application/json' }), `${safeBaseName}.json`);
            showToast(`Downloaded lorebook: ${card.name}!`, 'success');
            return;
        }

        // Sources that need embedded data: produce a proper v2 PNG and download it
        if (card.isCharacterTavern) {
            const ctUrl = unwrapProxyUrl(card.avatar_url || card.image_url || card.url || '');
            if (ctUrl) {
                await downloadFromUrl(ctUrl, card.name);
                showToast(`Downloaded ${card.name}!`, 'success');
                return;
            }
        }

        if (card.isJannyAI || card.isBackyard || card.isWyvern) {
            const pngBlob = await buildEmbeddedCharacterPngBlob(card);
            const safeBaseName = toSafeBaseName(card.name, 'character');
            downloadBlob(pngBlob, `${safeBaseName}.png`);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        // Direct-download sources
        if ((card.isLiveChub || card.isChub) && card.fullPath) {
            const preferredUrl = card.avatar_url && card.avatar_url.endsWith('.png') ? card.avatar_url : null;
            const fallbackUrl = `https://api.chub.ai/api/characters/download/${encodeChubFullPath(card.fullPath)}?fullExport=false&format=png`;
            await downloadFromUrl(preferredUrl || fallbackUrl, card.name);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        if (card.downloadUrl) {
            await downloadFromUrl(card.downloadUrl, card.name);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        if (card.url && (card.url.includes('catbox') || card.url.endsWith('.png') || card.url.endsWith('.json'))) {
            await downloadFromUrl(card.url, card.name);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        if (card.image_url && (card.image_url.includes('catbox') || card.image_url.endsWith('.png') || card.image_url.endsWith('.json'))) {
            await downloadFromUrl(card.image_url, card.name);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        if (card.avatar_url && (card.avatar_url.includes('catbox') || card.avatar_url.endsWith('.png') || card.avatar_url.endsWith('.json'))) {
            await downloadFromUrl(card.avatar_url, card.name);
            showToast(`Downloaded ${card.name}!`, 'success');
            return;
        }

        showToast('Download not available for this source', 'error');
    } catch (error) {
        console.error('[Bot Browser Standalone] Download failed:', error);
        showToast(`Download failed: ${error.message}`, 'error');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fa-solid fa-file-arrow-down"></i><span>Download</span>';
        }
    }
}

async function importCurrentCard() {
    if (!state.selectedCard) return;

    const card = state.selectedCard;
    const importBtn = document.getElementById('modalImportBtn');
    const isLorebook = card.isLorebook === true;
    let imported = false;

    if (!canImportToSillyTavern()) {
        showToast('Direct import is unavailable here. Use Download to save a card file instead.', 'warning');
        updateImportButtonUi();
        return;
    }

    // Pre-import duplicate detection
    if (!isLorebook) {
        const cardNameLower = card.name?.toLowerCase().trim();
        if (cardNameLower && state.myCharacterNames.has(cardNameLower)) {
            const proceed = confirm(`"${card.name}" already exists in your library.\n\nImport anyway? This will create a duplicate.`);
            if (!proceed) {
                showToast('Import cancelled', 'info');
                return;
            }
        }
    }

    importBtn.disabled = true;
    importBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

    try {
        if (isLorebook) {
            await importLorebookToSillyTavern(card);
            showToast(`Imported lorebook: ${card.name}!`, 'success');
            trackImport(card);
            requestSillyTavernWorldInfoRefresh();
            hideCardModal();
            return;
        }

        // Services that have direct download URLs - use URL import
        if ((card.isLiveChub || card.isChub) && card.fullPath) {
            const preferredUrl = card.avatar_url && card.avatar_url.endsWith('.png') ? card.avatar_url : null;
            const fallbackUrl = `https://api.chub.ai/api/characters/download/${encodeChubFullPath(card.fullPath)}?fullExport=false&format=png`;
            const res = await importCharacterFromUrl(preferredUrl || fallbackUrl, card.name);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else if (card.isPygmalion && card.id) {
            // Fetch full character data from Pygmalion API
            try {
                const pygmalionData = await getPygmalionCharacter(card.id);
                const fullData = transformFullPygmalionCharacter(pygmalionData);
                // Merge into card
                card.description = fullData.description || card.description || '';
                card.personality = fullData.personality || card.personality || '';
                card.scenario = fullData.scenario || card.scenario || '';
                card.first_mes = fullData.first_mes || fullData.first_message || '';
                card.first_message = card.first_mes;
                card.mes_example = fullData.mes_example || '';
                card.system_prompt = fullData.system_prompt || '';
                card.creator_notes = fullData.creator_notes || '';
                card.alternate_greetings = fullData.alternate_greetings || [];
                card.character_book = fullData.character_book;
            } catch (e) {
                console.log('[Bot Browser Standalone] Failed to fetch Pygmalion data:', e);
            }
            const res = await importCardWithEmbeddedData(card);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else if (card.isRisuRealm && card.id) {
            // Fetch full character data and import with embedded PNG
            let cardData = null;
            try {
                const jsonUrl = `https://realm.risuai.net/api/v1/download/json-v3/${card.id}?non_commercial=true&cors=true`;
                const resp = await fetch(jsonUrl);
                if (resp.ok) {
                    cardData = await resp.json();
                }
            } catch (e) {
                console.log('[Bot Browser Standalone] json-v3 failed, trying charx-v3...');
            }
            if (!cardData) {
                // Try charx-v3
                const charxUrl = `https://realm.risuai.net/api/v1/download/charx-v3/${card.id}?non_commercial=true&cors=true`;
                const resp = await fetch(charxUrl);
                if (resp.ok) {
                    const blob = await resp.blob();
                    if (typeof JSZip === 'undefined') {
                        await import('../../../../../../lib/jszip.min.js').catch(() => {
                            const script = document.createElement('script');
                            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                            document.head.appendChild(script);
                            return new Promise(resolve => script.onload = resolve);
                        });
                    }
                    const zip = await JSZip.loadAsync(blob);
                    const cardJsonFile = zip.file('card.json');
                    if (cardJsonFile) {
                        cardData = JSON.parse(await cardJsonFile.async('text'));
                    }
                }
            }
            if (cardData) {
                // Merge RisuRealm data into card (convert field names)
                card.description = cardData.description || cardData.data?.description || card.description || '';
                card.personality = cardData.personality || cardData.data?.personality || card.personality || '';
                card.scenario = cardData.scenario || cardData.data?.scenario || card.scenario || '';
                card.first_mes = cardData.firstMessage || cardData.first_mes || cardData.data?.first_mes || '';
                card.first_message = card.first_mes;
                card.mes_example = cardData.exampleMessage || cardData.mes_example || cardData.data?.mes_example || '';
                card.system_prompt = cardData.systemPrompt || cardData.system_prompt || cardData.data?.system_prompt || '';
                card.post_history_instructions = cardData.postHistoryInstructions || cardData.post_history_instructions || cardData.data?.post_history_instructions || '';
                card.creator_notes = cardData.creatorNotes || cardData.creator_notes || cardData.data?.creator_notes || '';
                card.alternate_greetings = cardData.alternateGreetings || cardData.alternate_greetings || cardData.data?.alternate_greetings || [];
                card.character_book = cardData.characterBook || cardData.character_book || cardData.data?.character_book;
            }
            // Use embedded data import (creates PNG with avatar)
            const res = await importCardWithEmbeddedData(card);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        // Character Tavern ships cards as downloadable PNGs; prefer direct import to preserve full fidelity.
        else if (card.isCharacterTavern) {
            const ctUrl = unwrapProxyUrl(card.avatar_url || card.image_url || card.url || '');
            if (ctUrl) {
                const res = await importCharacterFromUrl(ctUrl, card.name);
                if (res?.file_name) card.st_file_name = res.file_name;
            } else {
                // Fallback to embedded build if we somehow don't have a URL.
                const res = await importCardWithEmbeddedData(card);
                if (res?.file_name) card.st_file_name = res.file_name;
            }
        }
        // Services that need embedded data - create a proper V2 PNG with embedded JSON
        else if (card.isJannyAI || card.isBackyard || card.isWyvern) {
            const res = await importCardWithEmbeddedData(card);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        // Archive cards with catbox/png URLs
        else if (card.downloadUrl) {
            const res = await importCharacterFromUrl(card.downloadUrl, card.name);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else if (card.url && (card.url.includes('catbox') || card.url.endsWith('.png'))) {
            const res = await importCharacterFromUrl(card.url, card.name);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else if (card.image_url && (card.image_url.includes('catbox') || card.image_url.endsWith('.png'))) {
            const res = await importCharacterFromUrl(card.image_url, card.name);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else if (card.avatar_url && (card.avatar_url.includes('catbox') || card.avatar_url.endsWith('.png'))) {
            const res = await importCharacterFromUrl(card.avatar_url, card.name);
            if (res?.file_name) card.st_file_name = res.file_name;
        }
        else {
            showToast('Direct import not available for this source', 'error');
            importBtn.disabled = false;
            importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import';
            return;
        }

        imported = true;
        showToast(`Imported ${card.name}!`, 'success');
        trackImport(card);
        requestSillyTavernCharactersRefresh();

        // Add to owned characters list
        if (imported && card.name) {
            state.myCharacterNames.add(card.name.toLowerCase().trim());
            // Update card's owned status and re-render
            card.isOwned = true;
            renderCards();
        }

        hideCardModal();

    } catch (error) {
        console.error('[Bot Browser Standalone] Import failed:', error);
        showToast(`Import failed: ${error.message}`, 'error');
    } finally {
        importBtn.disabled = false;
        importBtn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import';
        updateImportButtonUi();
    }
}

async function parseSillyTavernImportResponse(response) {
    let data;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!data) {
        throw new Error('SillyTavern returned an invalid response');
    }

    if (data.error) {
        throw new Error('SillyTavern rejected the import (invalid/corrupted file)');
    }

    if (!data.file_name) {
        throw new Error('SillyTavern did not return a file name');
    }

    return data;
}

function canImportViaOpener() {
    if (!canImportToSillyTavern()) return false;
    if (!window.opener || window.opener.closed) return false;
    try {
        // Ensure same-origin access (avoid leaking files cross-origin)
        // Accessing location on a cross-origin opener throws.
        // eslint-disable-next-line no-unused-expressions
        window.opener.location.origin;
        return window.opener.location.origin === window.location.origin;
    } catch {
        return false;
    }
}

async function tryImportFileViaOpener({ kind, file, preservedName }) {
    if (!canImportToSillyTavern()) return false;
    if (!(file instanceof File)) return false;

    const requestId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

    return await new Promise((resolve) => {
        let bc = null;
        let settled = false;

        const finalize = (ok) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(Boolean(ok));
        };

        const cleanup = () => {
            window.removeEventListener('message', onWindowMessage);
            try { bc?.removeEventListener?.('message', onBroadcastMessage); } catch {}
            try { bc?.close?.(); } catch {}
        };

        const timeoutId = setTimeout(() => {
            finalize(false);
        }, 45000);

        function onWindowMessage(event) {
            if (event.origin !== window.location.origin) return;
            const msg = event.data;
            if (!msg || msg.type !== 'botbrowser_import_result' || msg.requestId !== requestId) return;

            clearTimeout(timeoutId);
            finalize(Boolean(msg.ok));
        }

        function onBroadcastMessage(event) {
            const msg = event?.data;
            if (!msg || msg.type !== 'botbrowser_import_result' || msg.requestId !== requestId) return;
            clearTimeout(timeoutId);
            finalize(Boolean(msg.ok));
        }

        window.addEventListener('message', onWindowMessage);

        try {
            if (typeof BroadcastChannel !== 'undefined') {
                bc = new BroadcastChannel('botbrowser');
                bc.addEventListener('message', onBroadcastMessage);
            }
        } catch {
            bc = null;
        }

        const payload = { type: 'botbrowser_import_request', requestId, kind, file, preservedName };
        const origin = window.location.origin;

        let sent = false;

        // Preferred: opener relationship from "Open in New Tab"
        if (canImportViaOpener()) {
            try {
                window.opener.postMessage(payload, origin);
                sent = true;
            } catch {}
        }

        // Fallback: cross-tab BroadcastChannel (works even without an opener)
        if (!sent && bc) {
            try {
                bc.postMessage(payload);
                sent = true;
            } catch {}
        }

        if (!sent) {
            clearTimeout(timeoutId);
            finalize(false);
        }
    });
}

async function importCardWithEmbeddedData(card) {
    // Build Character Card V2 format
    const characterData = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: card.name || '',
            description: card.description || '',
            personality: card.personality || '',
            scenario: card.scenario || '',
            first_mes: card.first_message || card.first_mes || '',
            mes_example: card.mes_example || card.example_messages || '',
            creator_notes: card.creator_notes || card.website_description || '',
            system_prompt: card.system_prompt || '',
            post_history_instructions: card.post_history_instructions || '',
            creator: card.creator || '',
            character_version: card.character_version || '1.0',
            tags: card.tags || [],
            alternate_greetings: card.alternate_greetings || [],
            character_book: card.character_book || undefined,
            extensions: { talkativeness: '0.5', fav: false, world: '', depth_prompt: { prompt: '', depth: 4 } }
        }
    };

    // Fetch avatar image
    let imageBlob = await fetchImageWithProxy(card.avatar_url || card.image_url);
    if (!imageBlob) {
        console.log('[Bot Browser Standalone] Using default avatar');
        imageBlob = await createDefaultAvatar();
    }

    // Encode character data and embed in PNG
    const jsonString = JSON.stringify(characterData);
    const base64Data = btoa(unescape(encodeURIComponent(jsonString)));
    const pngBlob = await createCharacterPNG(imageBlob, base64Data);

    // Create file and upload
    const fileName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.png';
    const file = new File([pngBlob], fileName, { type: 'image/png' });

    // Best UX: import via the main SillyTavern tab (updates UI + selects the imported card)
    if (await tryImportFileViaOpener({ kind: 'character', file, preservedName: fileName })) {
        console.log('[Bot Browser Standalone] Imported via opener bridge:', card.name);
        return { file_name: fileName, imported_via: 'bridge' };
    }

    // Upload to SillyTavern
    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file_type', 'png');

    const response = await fetch('/api/characters/import', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }

    const parsed = await parseSillyTavernImportResponse(response);
    console.log('[Bot Browser Standalone] Card imported with embedded data:', card.name);
    return parsed;
}

async function importCharacterFromUrl(url, preservedName = null) {
    const unwrappedUrl = unwrapProxyUrl(url);
    const lowerUrl = String(unwrappedUrl).toLowerCase();
    const proxyChain = getBlobFetchProxyChainForUrl(unwrappedUrl);
    const resp = await fetchOkWithProxyChain(unwrappedUrl, proxyChain, 30000);

    if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `HTTP ${resp.status}`);
    }

    const blob = await resp.blob();
    const contentType = (resp.headers.get('content-type') || blob.type || '').toLowerCase();

    let fileType = 'png';
    let processedBlob = blob;

    if (contentType.includes('application/json') || contentType.includes('text/json') || lowerUrl.endsWith('.json')) {
        fileType = 'json';
        // If this is a RisuRealm JSON, convert to V2 format
        if (lowerUrl.includes('risuai') || lowerUrl.includes('realm.risuai.net')) {
            console.log('[Bot Browser Standalone] Converting RisuRealm JSON to V2 format...');
            const jsonText = await blob.text();
            const cardData = JSON.parse(jsonText);
            const v2CardData = convertToV2Format(cardData);
            processedBlob = new Blob([JSON.stringify(v2CardData)], { type: 'application/json' });
        }
    } else if (contentType.includes('image/png')) {
        fileType = 'png';
    } else if (
        (contentType.includes('application/octet-stream') || contentType === '') &&
        lowerUrl.endsWith('.png')
    ) {
        fileType = 'png';
    } else if (contentType.includes('application/charx') || contentType.includes('application/zip') || lowerUrl.includes('charx')) {
        // Handle charx format (ZIP containing card.json)
        console.log('[Bot Browser Standalone] Processing charx format...');
        if (typeof JSZip === 'undefined') {
            // Try to load JSZip dynamically
            await import('../../../../../../lib/jszip.min.js').catch(() => {
                // If relative path fails, try from CDN
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                document.head.appendChild(script);
                return new Promise(resolve => script.onload = resolve);
            });
        }
        const zip = await JSZip.loadAsync(blob);
        const cardJsonFile = zip.file('card.json');
        if (!cardJsonFile) {
            throw new Error('card.json not found in charx ZIP');
        }
        const cardJsonText = await cardJsonFile.async('text');
        // Convert RisuRealm format to SillyTavern V2 format
        const cardData = JSON.parse(cardJsonText);
        const v2CardData = convertToV2Format(cardData);
        processedBlob = new Blob([JSON.stringify(v2CardData)], { type: 'application/json' });
        fileType = 'json';
        console.log('[Bot Browser Standalone] Extracted and converted card.json from charx');
    } else {
        throw new Error(`URL did not return a card file (got "${contentType || 'unknown'}")`);
    }

    const safeBaseName = (preservedName || 'imported_character')
        .toString()
        .trim()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 80) || 'imported_character';

    const fileName = `${safeBaseName}.${fileType}`;
    const file = new File([processedBlob], fileName, { type: fileType === 'png' ? 'image/png' : 'application/json' });

    // Best UX: import via the main SillyTavern tab (updates UI + selects the imported card)
    if (await tryImportFileViaOpener({ kind: 'character', file, preservedName: fileName })) {
        return { file_name: fileName, imported_via: 'opener' };
    }

    const formData = new FormData();
    formData.append('avatar', file);
    formData.append('file_type', fileType);
    formData.append('preserved_name', fileName);

    const upload = await fetch('/api/characters/import', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
    });

    if (!upload.ok) {
        const text = await upload.text().catch(() => '');
        throw new Error(text || `HTTP ${upload.status}`);
    }

    return parseSillyTavernImportResponse(upload);
}

async function fetchOkWithProxyChain(url, proxyChain, timeoutMs) {
    let lastError = null;

    // Try direct fetch first (some hosts allow CORS and proxies may block them)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const directResp = await fetch(url, { method: 'GET', signal: controller.signal });
            if (directResp && directResp.ok) return directResp;
            lastError = new Error(`HTTP ${directResp?.status || 0}`);
        } finally {
            clearTimeout(timeoutId);
        }
    } catch (e) {
        lastError = e;
    }

    for (const proxyType of proxyChain) {
        try {
            let resp;
            if (proxyType === PROXY_TYPES.PUTER) {
                resp = await proxiedFetch(url, {
                    proxyChain: [PROXY_TYPES.PUTER],
                    fetchOptions: { method: 'GET' },
                    timeoutMs,
                });
            } else {
                const proxiedUrl = buildProxyUrl(proxyType, url);
                if (!proxiedUrl) continue;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    resp = await fetch(proxiedUrl, { method: 'GET', signal: controller.signal });
                } finally {
                    clearTimeout(timeoutId);
                }
            }

            if (resp && resp.ok) return resp;
            lastError = new Error(`HTTP ${resp?.status || 0}`);
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('All proxies failed');
}

async function importLorebookToSillyTavern(card) {
    let worldInfo = null;

    // Chub lorebooks: fetch SillyTavern-format JSON from the gateway repository
    if (card.isLiveChub && card.nodeId) {
        // Prefer already-loaded entries (modal fetch) to avoid re-downloading.
        if (card.entries && (typeof card.entries === 'object' || Array.isArray(card.entries))) {
            worldInfo = card;
        } else {
            worldInfo = await getChubLorebook(card.nodeId);
        }
    } else {
        // Best-effort: use what we already have on the card
        worldInfo = card;
    }

    if (!worldInfo || !('entries' in worldInfo)) {
        throw new Error('Lorebook has no entries to import');
    }

    // Normalize entries to object form (ST expects an object keyed by index/uid in most flows)
    if (Array.isArray(worldInfo.entries)) {
        const entriesObj = {};
        worldInfo.entries.forEach((entry, idx) => { entriesObj[String(idx)] = entry; });
        worldInfo = { ...worldInfo, entries: entriesObj };
    }

    const safeBaseName = (card.name || 'imported_lorebook')
        .toString()
        .trim()
        .replace(/[^\w\- ]+/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 80) || 'imported_lorebook';

    const fileName = `${safeBaseName}.json`;
    const json = JSON.stringify(worldInfo, null, 2);
    const file = new File([json], fileName, { type: 'application/json' });

    // Best UX: import via the main SillyTavern tab (updates UI without refresh)
    if (await tryImportFileViaOpener({ kind: 'lorebook', file, preservedName: fileName })) {
        return { ok: true, imported_via: 'opener' };
    }

    const formData = new FormData();
    formData.append('avatar', file);

    const upload = await fetch('/api/worldinfo/import', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: formData,
    });

    if (!upload.ok) {
        const text = await upload.text().catch(() => '');
        throw new Error(text || `HTTP ${upload.status}`);
    }

    return upload.json();
}

function trackImport(card) {
    try {
        const imports = loadImportedCards();
        const isLorebook = isLorebookImportRecord(card);
        const type = isLorebook ? 'lorebook' : 'character';
        const importedAt = new Date().toISOString();

        imports.unshift({
            id: card.id,
            name: card.name,
            creator: card.creator,
            avatar_url: card.avatar_url || card.image_url,
            desc_preview: (card.desc_preview || card.tagline || card.description || '').toString().slice(0, 500),
            tags: Array.isArray(card.tags) ? card.tags.slice(0, 50) : [],
            possibleNsfw: Boolean(card.possibleNsfw),
            isLorebook,
            type,
            st_file_name: card.st_file_name || '',
            service: card.service || card.sourceService,
            importedAt,
            imported_at: importedAt
        });

        // Keep only last 100
        if (imports.length > 100) imports.length = 100;

        localStorage.setItem('botBrowser_importedCards', JSON.stringify(imports));
        state.imports = imports;
    } catch (e) {
        console.warn('[Bot Browser Standalone] Failed to track import:', e);
    }
}

// ============================================
// PNG CREATION UTILITIES (for embedding character data)
// ============================================

function calculateCRC32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = crc ^ data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function insertPngTextChunk(pngBytes, keyword, text) {
    const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) throw new Error('Not a valid PNG file');
    }

    let insertPos = 8;
    let foundIHDR = false;
    while (insertPos < pngBytes.length) {
        const chunkLength = (pngBytes[insertPos] << 24) | (pngBytes[insertPos + 1] << 16) | (pngBytes[insertPos + 2] << 8) | pngBytes[insertPos + 3];
        const chunkType = String.fromCharCode(...pngBytes.slice(insertPos + 4, insertPos + 8));
        if (chunkType === 'IHDR') { foundIHDR = true; insertPos += 12 + chunkLength; }
        else if (foundIHDR && chunkType === 'IDAT') break;
        else insertPos += 12 + chunkLength;
    }

    const keywordBytes = new TextEncoder().encode(keyword);
    const textBytes = new TextEncoder().encode(text);
    const chunkData = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    chunkData.set(keywordBytes, 0);
    chunkData[keywordBytes.length] = 0;
    chunkData.set(textBytes, keywordBytes.length + 1);

    const chunkType = new TextEncoder().encode('tEXt');
    const crcData = new Uint8Array(chunkType.length + chunkData.length);
    crcData.set(chunkType, 0);
    crcData.set(chunkData, chunkType.length);
    const crc = calculateCRC32(crcData);

    const chunk = new Uint8Array(12 + chunkData.length);
    chunk[0] = (chunkData.length >> 24) & 0xFF;
    chunk[1] = (chunkData.length >> 16) & 0xFF;
    chunk[2] = (chunkData.length >> 8) & 0xFF;
    chunk[3] = chunkData.length & 0xFF;
    chunk.set(chunkType, 4);
    chunk.set(chunkData, 8);
    chunk[8 + chunkData.length] = (crc >> 24) & 0xFF;
    chunk[9 + chunkData.length] = (crc >> 16) & 0xFF;
    chunk[10 + chunkData.length] = (crc >> 8) & 0xFF;
    chunk[11 + chunkData.length] = crc & 0xFF;

    const result = new Uint8Array(pngBytes.length + chunk.length);
    result.set(pngBytes.slice(0, insertPos), 0);
    result.set(chunk, insertPos);
    result.set(pngBytes.slice(insertPos), insertPos + chunk.length);
    return result;
}

async function convertImageToPNG(imageBlob) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const url = URL.createObjectURL(imageBlob);
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width || 400;
                canvas.height = img.height || 400;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob(async (blob) => {
                    URL.revokeObjectURL(url);
                    resolve(new Uint8Array(await blob.arrayBuffer()));
                }, 'image/png');
            } catch (e) { URL.revokeObjectURL(url); reject(e); }
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
    });
}

async function createCharacterPNG(imageBlob, base64Data) {
    const pngBytes = await convertImageToPNG(imageBlob);
    const pngWithData = insertPngTextChunk(pngBytes, 'chara', base64Data);
    return new Blob([pngWithData], { type: 'image/png' });
}

async function fetchImageWithProxy(imageUrl) {
    if (!imageUrl) return null;
    // Try direct first
    try {
        const r = await fetch(imageUrl);
        if (r.ok) return await r.blob();
    } catch {}

    // Try proxy chain (corsproxy.io -> Puter -> cors.lol)
    const proxyChain = [PROXY_TYPES.CORSPROXY_IO, PROXY_TYPES.PUTER, PROXY_TYPES.CORS_LOL];
    for (const proxyType of proxyChain) {
        try {
            const resp = await proxiedFetch(imageUrl, {
                service: 'default',
                proxyChain: [proxyType],
                fetchOptions: {},
            });
            if (resp?.ok) return await resp.blob();
        } catch {}
    }
    return null;
}

function createDefaultAvatar() {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#666';
    ctx.font = '120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 200, 200);
    return new Promise(r => canvas.toBlob(r, 'image/png'));
}

// ============================================
// SETTINGS
// ============================================

function setupSettings() {
    // Prevent token form submit from navigating/reloading the page
    document.getElementById('chubTokenForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
    });

    // Settings tabs
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.settings-content[data-content="${tabName}"]`)?.classList.add('active');
        });
    });

    // Save settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => {
        const authHeadersRaw = (document.getElementById('settingAuthHeadersJson')?.value || '').toString().trim();
        if (authHeadersRaw) {
            try {
                const parsed = JSON.parse(authHeadersRaw);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    showToast('Auth headers JSON must be an object', 'error');
                    return;
                }
                state.settings.authHeadersJson = authHeadersRaw;
            } catch (e) {
                showToast(`Invalid auth headers JSON: ${e.message}`, 'error');
                return;
            }
        } else {
            state.settings.authHeadersJson = '';
        }

        state.settings.tagBlocklist = (document.getElementById('settingBlocklist')?.value || '')
            .split('\n')
            .map(t => t.trim())
            .filter(t => t);
        state.settings.hideNsfw = document.getElementById('settingHideNsfw')?.checked || false;
        state.settings.blurCards = document.getElementById('settingBlurCards')?.checked || false;
        state.settings.blurNsfw = document.getElementById('settingBlurNsfw')?.checked || false;
        state.settings.cardsPerPage = parseInt(document.getElementById('settingCardsPerPage')?.value) || 50;
        state.settings.useChubLiveApi = document.getElementById('settingChubLive')?.checked ?? true;
        state.settings.useCharacterTavernLiveApi = document.getElementById('settingCTLive')?.checked || false;
        state.settings.useWyvernLiveApi = document.getElementById('settingWyvernLive')?.checked ?? true;
        state.settings.useRisuRealmLiveApi = document.getElementById('settingRisuRealmLive')?.checked ?? true;

        saveSettings();
        applySettings();
        applyFilters();
        hideSettingsModal();
        showToast('Settings saved!', 'success');
    });

    // Cards per page slider
    document.getElementById('settingCardsPerPage')?.addEventListener('input', (e) => {
        document.getElementById('cardsPerPageValue').textContent = e.target.value;
    });

    // Data management - Export bookmarks
    document.getElementById('exportBookmarksBtn')?.addEventListener('click', exportBookmarks);

    // Data management - Import bookmarks
    document.getElementById('importBookmarksBtn')?.addEventListener('click', () => {
        document.getElementById('importBookmarksFile')?.click();
    });
    document.getElementById('importBookmarksFile')?.addEventListener('change', importBookmarks);

    // Data management - Clear recently viewed
    document.getElementById('clearRecentlyViewedBtn')?.addEventListener('click', () => {
        if (confirm('Clear all recently viewed cards?')) {
            localStorage.removeItem('botBrowser_recentlyViewed');
            showToast('Recently viewed history cleared', 'success');
        }
    });

    // Data management - Clear cache
    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        if (confirm('Clear all cached index data? This will require reloading sources.')) {
            Object.keys(serviceIndexes).forEach(k => delete serviceIndexes[k]);
            Object.keys(loadedChunks).forEach(k => delete loadedChunks[k]);
            showToast('Cache cleared', 'success');
        }
    });
}

function showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    // Populate current values
    document.getElementById('settingBlocklist').value = (state.settings.tagBlocklist || []).join('\n');
    document.getElementById('settingHideNsfw').checked = state.settings.hideNsfw || false;
    document.getElementById('settingBlurCards').checked = state.settings.blurCards || false;
    document.getElementById('settingBlurNsfw').checked = state.settings.blurNsfw ?? true;
    document.getElementById('settingCardsPerPage').value = state.settings.cardsPerPage || 50;
    document.getElementById('cardsPerPageValue').textContent = state.settings.cardsPerPage || 50;
    document.getElementById('settingChubLive').checked = state.settings.useChubLiveApi ?? true;
    document.getElementById('settingCTLive').checked = state.settings.useCharacterTavernLiveApi || false;
    document.getElementById('settingWyvernLive').checked = state.settings.useWyvernLiveApi ?? true;
    document.getElementById('settingRisuRealmLive').checked = state.settings.useRisuRealmLiveApi ?? true;
    document.getElementById('settingAuthHeadersJson').value = state.settings.authHeadersJson || '';

    // ChubAI Token
    const chubTokenInput = document.getElementById('settingChubToken');
    const chubTokenStatus = document.getElementById('chubTokenStatus');
    if (chubTokenInput) {
        chubTokenInput.value = state.settings.chubToken || '';
        // Update status indicator
        if (chubTokenStatus) {
            if (state.settings.chubToken) {
                chubTokenStatus.className = 'token-status valid';
                chubTokenStatus.innerHTML = '<i class="fa-solid fa-check-circle"></i> Token configured';
            } else {
                chubTokenStatus.className = 'token-status';
                chubTokenStatus.innerHTML = '';
            }
        }
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideSettingsModal() {
    document.getElementById('settingsModal')?.classList.add('hidden');
    document.body.style.overflow = '';
}

// ============================================
// BATCH IMPORT
// ============================================

function showBatchImportModal() {
    const modal = document.getElementById('batchImportModal');
    if (!modal) return;

    // Reset state
    document.getElementById('batchImportUrls').value = '';
    document.getElementById('batchImportProgress')?.classList.add('hidden');
    document.getElementById('batchImportLog')?.classList.add('hidden');
    document.getElementById('batchImportLog').innerHTML = '';
    document.getElementById('startBatchImportBtn').disabled = false;
    document.getElementById('startBatchImportBtn').innerHTML = '<i class="fa-solid fa-play"></i> Start Import';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideBatchImportModal() {
    document.getElementById('batchImportModal')?.classList.add('hidden');
    document.body.style.overflow = '';
}

async function startBatchImport() {
    const urlsText = document.getElementById('batchImportUrls')?.value?.trim();
    if (!urlsText) {
        showToast('Please paste some URLs first', 'error');
        return;
    }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u && u.startsWith('http'));
    if (urls.length === 0) {
        showToast('No valid URLs found', 'error');
        return;
    }

    const btn = document.getElementById('startBatchImportBtn');
    const progress = document.getElementById('batchImportProgress');
    const progressFill = document.getElementById('batchProgressFill');
    const progressText = document.getElementById('batchProgressText');
    const log = document.getElementById('batchImportLog');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';
    progress.classList.remove('hidden');
    log.classList.remove('hidden');
    log.innerHTML = '';

    let success = 0, failed = 0;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const percent = ((i + 1) / urls.length) * 100;
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${i + 1} / ${urls.length}`;

        // Add log entry
        const logEntry = document.createElement('div');
        logEntry.className = 'batch-log-item info';
        logEntry.textContent = `Importing: ${url.substring(0, 50)}...`;
        log.appendChild(logEntry);
        log.scrollTop = log.scrollHeight;

        try {
            // Parse URL and determine how to import
            let importUrl = url;

            // Chub character URLs
            if (url.includes('chub.ai/characters/')) {
                const match = url.match(/chub\.ai\/characters\/(.+)/);
                if (match) {
                    const path = match[1].replace(/\?.*$/, ''); // Remove query params
                    importUrl = `https://avatars.charhub.io/avatars/${encodeChubFullPath(path)}/chara_card_v2.png`;
                }
            }
            // Pygmalion URLs
            else if (url.includes('pygmalion.chat')) {
                const match = url.match(/\/([a-f0-9-]{36})/);
                if (match) {
                    importUrl = `https://server.pygmalion.chat/api/export/character/${match[1]}/v2`;
                }
            }
            // RisuRealm URLs - try json-v3 first, fall back to charx-v3
            else if (url.includes('realm.risuai.net')) {
                const match = url.match(/character\/([^\/\?]+)/);
                if (match) {
                    const risuId = match[1];
                    try {
                        await importCharacterFromUrl(`https://realm.risuai.net/api/v1/download/json-v3/${risuId}?non_commercial=true&cors=true`);
                    } catch (e) {
                        console.log('[Bot Browser Standalone] json-v3 failed, trying charx-v3...');
                        await importCharacterFromUrl(`https://realm.risuai.net/api/v1/download/charx-v3/${risuId}?non_commercial=true&cors=true`);
                    }
                    success++;
                    logEntry.className = 'batch-log-item success';
                    logEntry.textContent = `OK: ${url.substring(0, 50)}...`;
                    continue;
                }
            }
            // Direct PNG/catbox URLs - use as is
            else if (url.endsWith('.png') || url.includes('catbox.moe')) {
                importUrl = url;
            }

            await importCharacterFromUrl(importUrl);
            success++;
            logEntry.className = 'batch-log-item success';
            logEntry.textContent = `OK: ${url.substring(0, 50)}...`;

            // Update owned characters
            // (We don't know the name here, but the next refresh will catch it)

        } catch (error) {
            failed++;
            logEntry.className = 'batch-log-item error';
            logEntry.textContent = `FAIL: ${url.substring(0, 40)}... - ${error.message}`;
        }

        // Small delay between imports to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Start Import';

    showToast(`Batch import complete: ${success} succeeded, ${failed} failed`, success > 0 ? 'success' : 'error');

    // Refresh owned characters list
    const myChars = await loadMyCharacters();
    state.myCharacterNames = new Set(myChars.map(c => c.name?.toLowerCase().trim()).filter(Boolean));
}

// ============================================
// UI HELPERS
// ============================================

function showLoading() {
    document.getElementById('loadingSpinner')?.classList.remove('hidden');
    document.getElementById('cardsGrid')?.classList.add('hidden');
    document.getElementById('noResults')?.classList.add('hidden');
    document.getElementById('welcomeMessage')?.classList.add('hidden');
}

function hideLoading() {
    document.getElementById('loadingSpinner')?.classList.add('hidden');
}

function showWelcome() {
    document.getElementById('welcomeMessage')?.classList.remove('hidden');
    document.getElementById('cardsGrid')?.classList.add('hidden');
    document.getElementById('noResults')?.classList.add('hidden');
    document.getElementById('loadingSpinner')?.classList.add('hidden');

    // Reset visible state so the UI doesn't show stale counts/pagination from a previous source
    state.currentCards = [];
    state.filteredCards = [];
    state.currentPage = 1;
    updateResultsCount();
    document.getElementById('pagination')?.classList.add('hidden');
}

function hideWelcome() {
    document.getElementById('welcomeMessage')?.classList.add('hidden');
}

function showNoResults(message = 'No cards found matching your filters') {
    const noResults = document.getElementById('noResults');
    if (noResults) {
        noResults.classList.remove('hidden');
        noResults.querySelector('p').textContent = message;
    }
    document.getElementById('cardsGrid')?.classList.add('hidden');
}

// ============================================
// DATA MANAGEMENT - EXPORT/IMPORT BOOKMARKS
// ============================================

function exportBookmarks() {
    if (state.bookmarks.length === 0) {
        showToast('No bookmarks to export', 'warning');
        return;
    }

    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        bookmarks: state.bookmarks
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `botbrowser-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(`Exported ${state.bookmarks.length} bookmarks`, 'success');
}

function importBookmarks(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const bookmarks = data.bookmarks || data; // Support old format

            if (!Array.isArray(bookmarks)) {
                throw new Error('Invalid bookmark data format');
            }

            let imported = 0;
            bookmarks.forEach(bookmark => {
                if (bookmark.id && !state.bookmarks.some(b => b.id === bookmark.id)) {
                    state.bookmarks.push(bookmark);
                    imported++;
                }
            });

            // Save to localStorage
            localStorage.setItem('botBrowser_bookmarks', JSON.stringify(state.bookmarks));

            showToast(`Imported ${imported} new bookmarks (${bookmarks.length - imported} duplicates skipped)`, 'success');

            // Clear file input
            e.target.value = '';

        } catch (error) {
            console.error('[Bot Browser] Import failed:', error);
            showToast('Failed to import bookmarks: Invalid file format', 'error');
        }
    };
    reader.readAsText(file);
}

// ============================================
// BULK SELECTION MODE
// ============================================

function toggleBulkSelectMode(forceState) {
    state.bulkSelectMode = forceState !== undefined ? forceState : !state.bulkSelectMode;
    const grid = document.getElementById('cardsGrid');
    const actionBar = document.getElementById('bulkActionBar');

    if (state.bulkSelectMode) {
        grid?.classList.add('bulk-select-mode');
        actionBar?.classList.remove('hidden');
    } else {
        grid?.classList.remove('bulk-select-mode');
        actionBar?.classList.add('hidden');
        state.selectedCards.clear();
        updateBulkSelection();
    }
}

function toggleCardSelection(cardId) {
    if (state.selectedCards.has(cardId)) {
        state.selectedCards.delete(cardId);
    } else {
        state.selectedCards.add(cardId);
    }
    updateBulkSelection();
}

function selectAllVisibleCards() {
    const cardsPerPage = state.settings.cardsPerPage || 50;
    const start = (state.currentPage - 1) * cardsPerPage;
    const end = start + cardsPerPage;
    const visibleCards = state.filteredCards.slice(start, end);

    visibleCards.forEach(card => {
        if (card.id) state.selectedCards.add(String(card.id));
    });
    updateBulkSelection();
}

function deselectAllCards() {
    state.selectedCards.clear();
    updateBulkSelection();
}

function updateBulkSelection() {
    const count = state.selectedCards.size;
    document.getElementById('bulkCount').textContent = count;

    // Update card visual states
    document.querySelectorAll('#cardsGrid .card').forEach(cardEl => {
        const cardId = cardEl.dataset.cardId;
        cardEl.classList.toggle('selected', state.selectedCards.has(cardId));
    });
}

async function bulkBookmarkSelected() {
    const count = state.selectedCards.size;
    if (count === 0) {
        showToast('No cards selected', 'warning');
        return;
    }

    let added = 0;
    state.selectedCards.forEach(cardId => {
        const card = state.filteredCards.find(c => String(c.id) === cardId);
        if (card && !state.bookmarks.some(b => b.id === card.id)) {
            state.bookmarks = addBookmark(card);
            added++;
        }
    });

    showToast(`Added ${added} cards to bookmarks`, 'success');
    deselectAllCards();
    renderCards();
}

async function bulkImportSelected() {
    const count = state.selectedCards.size;
    if (count === 0) {
        showToast('No cards selected', 'warning');
        return;
    }

    const confirmed = confirm(`Import ${count} cards?\n\nThis will import all selected cards to your library.`);
    if (!confirmed) return;

    const btn = document.getElementById('bulkImportBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importing...';

    let imported = 0;
    let failed = 0;

    for (const cardId of state.selectedCards) {
        const card = state.filteredCards.find(c => String(c.id) === cardId);
        if (!card) continue;

        try {
            // Use the import function - simplified version
            await importSingleCard(card);
            imported++;
            trackImport(card);
            if (!card.isLorebook && card.name) {
                state.myCharacterNames.add(card.name.toLowerCase().trim());
                card.isOwned = true;
            }
            showToast(`Imported: ${card.name}`, 'success');
        } catch (error) {
            console.error(`[Bot Browser] Failed to import ${card.name}:`, error);
            failed++;
        }

        // Small delay to prevent overwhelming the server
        await new Promise(r => setTimeout(r, 500));
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Import All';

    showToast(`Imported ${imported} cards${failed > 0 ? `, ${failed} failed` : ''}`, imported > 0 ? 'success' : 'error');
    deselectAllCards();
    toggleBulkSelectMode(false);
    document.getElementById('bulkSelectBtn')?.classList.remove('active');
}

async function importSingleCard(card) {
    if (card.isLorebook) {
        await importLorebookToSillyTavern(card);
        return;
    }

    if ((card.isLiveChub || card.isChub) && card.fullPath) {
        const preferredUrl = card.avatar_url && card.avatar_url.endsWith('.png') ? card.avatar_url : null;
        const fallbackUrl = `https://api.chub.ai/api/characters/download/${encodeChubFullPath(card.fullPath)}?fullExport=false&format=png`;
        await importCharacterFromUrl(preferredUrl || fallbackUrl, card.name);
        return;
    }

    if (card.isPygmalion && card.id) {
        // Fetch full character data from Pygmalion API
        try {
            const pygmalionData = await getPygmalionCharacter(card.id);
            const fullData = transformFullPygmalionCharacter(pygmalionData);
            card.description = fullData.description || card.description || '';
            card.personality = fullData.personality || card.personality || '';
            card.scenario = fullData.scenario || card.scenario || '';
            card.first_mes = fullData.first_mes || fullData.first_message || '';
            card.first_message = card.first_mes;
            card.mes_example = fullData.mes_example || '';
            card.system_prompt = fullData.system_prompt || '';
            card.alternate_greetings = fullData.alternate_greetings || [];
            card.character_book = fullData.character_book;
        } catch (e) {
            console.log('[Bot Browser Standalone] Failed to fetch Pygmalion data:', e);
        }
        await importCardWithEmbeddedData(card);
        return;
    }

    if (card.isRisuRealm && card.id) {
        // Fetch full character data and import with embedded PNG
        let cardData = null;
        try {
            const jsonUrl = `https://realm.risuai.net/api/v1/download/json-v3/${card.id}?non_commercial=true&cors=true`;
            const resp = await fetch(jsonUrl);
            if (resp.ok) cardData = await resp.json();
        } catch (e) {
            console.log('[Bot Browser Standalone] json-v3 failed, trying charx-v3...');
        }
        if (!cardData) {
            const charxUrl = `https://realm.risuai.net/api/v1/download/charx-v3/${card.id}?non_commercial=true&cors=true`;
            const resp = await fetch(charxUrl);
            if (resp.ok) {
                const blob = await resp.blob();
                if (typeof JSZip !== 'undefined') {
                    const zip = await JSZip.loadAsync(blob);
                    const cardJsonFile = zip.file('card.json');
                    if (cardJsonFile) cardData = JSON.parse(await cardJsonFile.async('text'));
                }
            }
        }
        if (cardData) {
            card.description = cardData.description || cardData.data?.description || card.description || '';
            card.personality = cardData.personality || cardData.data?.personality || card.personality || '';
            card.scenario = cardData.scenario || cardData.data?.scenario || card.scenario || '';
            card.first_mes = cardData.firstMessage || cardData.first_mes || cardData.data?.first_mes || '';
            card.first_message = card.first_mes;
            card.mes_example = cardData.exampleMessage || cardData.mes_example || cardData.data?.mes_example || '';
            card.system_prompt = cardData.systemPrompt || cardData.system_prompt || cardData.data?.system_prompt || '';
            card.alternate_greetings = cardData.alternateGreetings || cardData.alternate_greetings || cardData.data?.alternate_greetings || [];
            card.character_book = cardData.characterBook || cardData.character_book || cardData.data?.character_book;
        }
        await importCardWithEmbeddedData(card);
        return;
    }

    if (card.downloadUrl) {
        await importCharacterFromUrl(card.downloadUrl, card.name);
        return;
    }

    if (card.url && (card.url.includes('catbox') || card.url.endsWith('.png') || card.url.endsWith('.json'))) {
        await importCharacterFromUrl(card.url, card.name);
        return;
    }

    if (card.image_url && (card.image_url.includes('catbox') || card.image_url.endsWith('.png') || card.image_url.endsWith('.json'))) {
        await importCharacterFromUrl(card.image_url, card.name);
        return;
    }

    if (card.avatar_url && (card.avatar_url.includes('catbox') || card.avatar_url.endsWith('.png') || card.avatar_url.endsWith('.json'))) {
        await importCharacterFromUrl(card.avatar_url, card.name);
        return;
    }

    if (card.isJannyAI || card.isBackyard || card.isWyvern || card.isCharacterTavern) {
        await importCardWithEmbeddedData(card);
        return;
    }

    throw new Error('No import method available for this card');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${icons[type] || icons.info}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toPlainTextForTitle(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Format text with markdown images, links, and basic formatting
 */
function formatRichText(text) {
    if (!text) return '';

    let result = text;

    // SECURITY: Sanitize dangerous HTML that can leak styles or run scripts
    // Remove <style> tags and their contents (these leak CSS into the page)
    result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Remove @import statements (can import external stylesheets)
    result = result.replace(/@import\s+[^;]+;?/gi, '');
    // Remove <script> tags and their contents
    result = result.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    // Remove <link> tags (can import stylesheets)
    result = result.replace(/<link[^>]*>/gi, '');
    // Remove on* event handlers (onclick, onerror, etc.)
    result = result.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    result = result.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

    // Convert markdown images: ![alt](url)
    result = result.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s*=[^)]*)?(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
        if (!src.match(/^https?:\/\//i)) return match;
        const altAttr = alt ? ` alt="${escapeHtml(alt)}"` : '';
        return `<img src="${src}"${altAttr} class="embedded-image" loading="lazy" style="max-width:100%;border-radius:8px;margin:8px 0;">`;
    });

    // Convert markdown links: [text](url)
    result = result.replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (match, linkText, href) => {
        return `<a href="${href}" target="_blank" rel="noopener" style="color:var(--accent);">${escapeHtml(linkText)}</a>`;
    });

    // Convert standalone URLs to clickable links
    result = result.replace(/(?<!")(?<!')\b(https?:\/\/[^\s<>"')\]]+)/gi, (match, url) => {
        // Don't convert if it's already in an img src or href
        return `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all;">${url}</a>`;
    });

    // Bold: **text** or __text__
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

    // Convert newlines to <br>
    result = result.replace(/\n/g, '<br>');

    return result;
}

function formatNumber(num) {
    if (!num && num !== 0) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return String(num);
}

function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    if (diffWeek < 4) return `${diffWeek}w ago`;
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    return date.toLocaleDateString();
}

// ============================================
// LOCAL FAVORITES SYSTEM
// ============================================

function loadLocalFavorites() {
    try {
        return JSON.parse(localStorage.getItem('botBrowser_localFavorites') || '[]');
    } catch {
        return [];
    }
}

function saveLocalFavorites(favorites) {
    try {
        localStorage.setItem('botBrowser_localFavorites', JSON.stringify(favorites));
    } catch {}
}

function toggleLocalFavorite(cardId) {
    const favorites = loadLocalFavorites();
    const index = favorites.indexOf(cardId);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(cardId);
    }
    saveLocalFavorites(favorites);
    return favorites.includes(cardId);
}

function isLocalFavorite(cardId) {
    return loadLocalFavorites().includes(cardId);
}

// ============================================
// CHARACTER EDITING SYSTEM
// ============================================

// Original values for change tracking
let originalCardData = null;
let editLocked = true;

function initEditTab(card) {
    if (!card?.isLocal) {
        // Non-local cards - edit tab container already hidden in showCardModal
        return;
    }

    // Store original values for change tracking
    originalCardData = {
        name: card.name || '',
        description: card.description || card.data?.description || card._rawData?.data?.description || '',
        personality: card.personality || card.data?.personality || card._rawData?.data?.personality || '',
        scenario: card.scenario || card.data?.scenario || card._rawData?.data?.scenario || '',
        first_mes: card.first_mes || card.first_message || card.data?.first_mes || card._rawData?.data?.first_mes || '',
        mes_example: card.mes_example || card.data?.mes_example || card._rawData?.data?.mes_example || '',
        system_prompt: card.system_prompt || card.data?.system_prompt || card._rawData?.data?.system_prompt || '',
        creator_notes: card.creator_notes || card.data?.creator_notes || card._rawData?.data?.creator_notes || '',
        tags: [...(card.tags || card.data?.tags || card._rawData?.data?.tags || [])],
        creator: card.creator || card.data?.creator || card._rawData?.data?.creator || ''
    };

    // Populate edit form
    populateEditForm(originalCardData);

    // Setup edit lock toggle
    editLocked = true;
    updateEditLockState();

    const editLockCheckbox = document.getElementById('editLockToggle');
    if (editLockCheckbox) {
        editLockCheckbox.checked = false;
        editLockCheckbox.onchange = () => {
            editLocked = !editLockCheckbox.checked;
            updateEditLockState();
        };
    }
}

function populateEditForm(data) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    setVal('editName', data.name);
    setVal('editDescription', data.description);
    setVal('editPersonality', data.personality);
    setVal('editScenario', data.scenario);
    setVal('editFirstMessage', data.first_mes);
    setVal('editMesExample', data.mes_example);
    setVal('editSystemPrompt', data.system_prompt);
    setVal('editCreatorNotes', data.creator_notes);
    setVal('editCreator', data.creator);

    // Populate tags
    const tagsContainer = document.getElementById('editTagsContainer');
    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        (data.tags || []).forEach(tag => addTagPill(tagsContainer, tag));

        // Add input for new tags
        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.placeholder = 'Add tag...';
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                e.preventDefault();
                addTagPill(tagsContainer, e.target.value.trim());
                e.target.value = '';
            }
        });
        tagsContainer.appendChild(tagInput);
    }
}

function addTagPill(container, tag) {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${escapeHtml(tag)}<i class="fa-solid fa-times remove-tag"></i>`;
    pill.querySelector('.remove-tag').addEventListener('click', () => pill.remove());

    const input = container.querySelector('input');
    if (input) {
        container.insertBefore(pill, input);
    } else {
        container.appendChild(pill);
    }
}

function updateEditLockState() {
    const form = document.getElementById('characterEditForm');
    if (form) {
        form.classList.toggle('locked', editLocked);
        // Disable/enable all inputs
        form.querySelectorAll('input, textarea').forEach(el => {
            el.disabled = editLocked;
        });
    }
}

function getEditFormData() {
    const tagsContainer = document.getElementById('editTagsContainer');
    const tags = tagsContainer
        ? Array.from(tagsContainer.querySelectorAll('.tag-pill'))
            .map(p => p.textContent.replace(/\s*$/, '').trim())
        : [];

    return {
        name: document.getElementById('editName')?.value || '',
        description: document.getElementById('editDescription')?.value || '',
        personality: document.getElementById('editPersonality')?.value || '',
        scenario: document.getElementById('editScenario')?.value || '',
        first_mes: document.getElementById('editFirstMessage')?.value || '',
        mes_example: document.getElementById('editMesExample')?.value || '',
        system_prompt: document.getElementById('editSystemPrompt')?.value || '',
        creator_notes: document.getElementById('editCreatorNotes')?.value || '',
        creator: document.getElementById('editCreator')?.value || '',
        tags
    };
}

function getChangedFields() {
    const current = getEditFormData();
    const changes = {};

    for (const [key, value] of Object.entries(current)) {
        const original = originalCardData?.[key];
        if (key === 'tags') {
            if (JSON.stringify(value) !== JSON.stringify(original)) {
                changes[key] = { old: original, new: value };
            }
        } else if (value !== original) {
            changes[key] = { old: original, new: value };
        }
    }

    return changes;
}

function showDiffPreview() {
    const changes = getChangedFields();
    const diffContent = document.getElementById('diffContent');
    const diffModal = document.getElementById('diffPreviewModal');

    if (Object.keys(changes).length === 0) {
        showToast('No changes to preview', 'info');
        return;
    }

    let html = '';
    for (const [field, { old, new: newVal }] of Object.entries(changes)) {
        const displayField = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const oldDisplay = Array.isArray(old) ? old.join(', ') : (old || '(empty)');
        const newDisplay = Array.isArray(newVal) ? newVal.join(', ') : (newVal || '(empty)');

        html += `
            <div class="diff-field">
                <div class="diff-field-name"><i class="fa-solid fa-pen"></i> ${escapeHtml(displayField)}</div>
                <div class="diff-values">
                    <div class="diff-old">${escapeHtml(oldDisplay.substring(0, 500))}${oldDisplay.length > 500 ? '...' : ''}</div>
                    <div class="diff-new">${escapeHtml(newDisplay.substring(0, 500))}${newDisplay.length > 500 ? '...' : ''}</div>
                </div>
            </div>
        `;
    }

    diffContent.innerHTML = html;
    diffModal.classList.remove('hidden');
}

function hideDiffPreview() {
    document.getElementById('diffPreviewModal')?.classList.add('hidden');
}

async function saveCharacterEdits() {
    if (editLocked) {
        showToast('Unlock editing first', 'warning');
        return;
    }

    const changes = getChangedFields();
    if (Object.keys(changes).length === 0) {
        showToast('No changes to save', 'info');
        return;
    }

    const card = state.selectedCard;
    if (!card?.isLocal) {
        showToast('Can only edit local characters', 'error');
        return;
    }

    const current = getEditFormData();
    const saveBtn = document.getElementById('saveCharacterBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const response = await fetch('/api/characters/edit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                avatar: card.id || card._rawData?.avatar,
                name: current.name,
                data: {
                    name: current.name,
                    description: current.description,
                    personality: current.personality,
                    scenario: current.scenario,
                    first_mes: current.first_mes,
                    mes_example: current.mes_example,
                    system_prompt: current.system_prompt,
                    creator_notes: current.creator_notes,
                    creator: current.creator,
                    tags: current.tags
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Save failed: ${response.status}`);
        }

        // Update original data to current values
        originalCardData = { ...current };
        showToast('Character saved successfully!', 'success');

        // Refresh the card in state
        if (state.currentSource === 'my_characters') {
            loadSource('my_characters');
        }

    } catch (error) {
        console.error('[Bot Browser] Save error:', error);
        showToast(`Failed to save: ${error.message}`, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fa-solid fa-save"></i> Save Changes';
        }
    }
}

function resetCharacterEdits() {
    if (originalCardData) {
        populateEditForm(originalCardData);
        showToast('Changes reset', 'info');
    }
}

// ============================================
// CHATS TAB
// ============================================

async function loadChatsTab(card) {
    const chatList = document.getElementById('chatList');
    if (!chatList) return;

    if (!card?.isLocal) {
        chatList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comments"></i><p>Chats only available for local characters</p></div>';
        return;
    }

    chatList.innerHTML = '<div class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Loading chats...</div>';

    try {
        const avatarUrl = card.avatar_url || card.id || card._rawData?.avatar;
        const response = await fetch('/api/chats/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                avatar_url: avatarUrl
            })
        });

        if (!response.ok) throw new Error(`Failed to load chats: ${response.status}`);

        const chats = await response.json();

        if (!chats || chats.length === 0) {
            chatList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-comments"></i><p>No chats yet. Start chatting with this character!</p></div>';
            return;
        }

        // Sort by date (newest first)
        const sortedChats = chats.sort((a, b) => new Date(b.last_mes || 0) - new Date(a.last_mes || 0));

        chatList.innerHTML = sortedChats.map(chat => `
            <div class="chat-item" data-file="${escapeHtml(chat.file_name)}">
                <div class="chat-icon"><i class="fa-solid fa-message"></i></div>
                <div class="chat-info">
                    <div class="chat-name">${escapeHtml(chat.file_name?.replace('.jsonl', '') || 'Chat')}</div>
                    <div class="chat-preview">${escapeHtml((chat.preview || 'No preview').substring(0, 50))}...</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-date">${formatRelativeTime(chat.last_mes)}</div>
                    <div class="chat-count">${chat.mes || 0} msgs</div>
                </div>
                <button class="glass-btn chat-resume-btn" data-file="${escapeHtml(chat.file_name)}">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>
        `).join('');

        // Add click handlers for resume
        chatList.querySelectorAll('.chat-resume-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const fileName = btn.dataset.file;
                showToast('Opening chat in SillyTavern...', 'info');
                // Open main ST page - user will need to manually select the chat
                window.open('/', '_blank');
            });
        });

    } catch (error) {
        console.error('[Bot Browser] Failed to load chats:', error);
        chatList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-exclamation-circle"></i><p>Failed to load chats</p></div>';
    }
}

// ============================================
// MEDIA TAB
// ============================================

async function loadMediaTab(card) {
    const audioList = document.getElementById('audioGrid');
    const imageGrid = document.getElementById('mediaGrid');
    const audioCount = document.getElementById('audioCount');
    const imageCount = document.getElementById('imageCount');

    if (!audioList || !imageGrid) return;

    if (!card?.isLocal) {
        audioList.innerHTML = '<div class="empty-state" style="padding:16px;"><p style="font-size:0.8rem;">Media only available for local characters</p></div>';
        imageGrid.innerHTML = '';
        return;
    }

    audioList.innerHTML = '<div class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    imageGrid.innerHTML = '<div class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const characterName = card.name || '';
        const response = await fetch('/api/images/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                folder: characterName
            })
        });

        if (!response.ok) throw new Error(`Failed to load media: ${response.status}`);

        const files = await response.json();

        // Separate images and audio
        const images = (files || []).filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));
        const audio = (files || []).filter(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));

        // Update counts
        if (audioCount) audioCount.textContent = `${audio.length} files`;
        if (imageCount) imageCount.textContent = `${images.length} files`;

        // Render audio
        if (audio.length === 0) {
            audioList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.8rem;">No audio files</div>';
        } else {
            audioList.innerHTML = audio.map(file => {
                const fileName = file.split(/[\/\\]/).pop();
                return `
                    <div class="audio-item">
                        <i class="fa-solid fa-music"></i>
                        <div class="audio-info">
                            <div class="audio-name">${escapeHtml(fileName)}</div>
                        </div>
                        <audio controls src="/api/images/view?path=${encodeURIComponent(file)}"></audio>
                    </div>
                `;
            }).join('');
        }

        // Render images
        if (images.length === 0) {
            imageGrid.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.8rem;">No images</div>';
        } else {
            imageGrid.innerHTML = images.map(file => `
                <div class="media-image" data-src="/api/images/view?path=${encodeURIComponent(file)}">
                    <img src="/api/images/view?path=${encodeURIComponent(file)}" alt="" loading="lazy">
                </div>
            `).join('');

            // Add lightbox click handlers
            imageGrid.querySelectorAll('.media-image').forEach(img => {
                img.addEventListener('click', () => {
                    const src = img.dataset.src;
                    if (src) {
                        document.getElementById('lightboxImage').src = src;
                        document.getElementById('imageLightbox').classList.remove('hidden');
                    }
                });
            });
        }

    } catch (error) {
        console.error('[Bot Browser] Failed to load media:', error);
        audioList.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:0.8rem;">Failed to load</div>';
        imageGrid.innerHTML = '';
    }
}

// ============================================
// RELATED CHARACTERS DISCOVERY
// ============================================

// Tag frequency map for rarity scoring
let tagFrequencyMap = null;

function buildTagFrequencyMap(cards) {
    const freq = {};
    cards.forEach(card => {
        (card.tags || []).forEach(tag => {
            const normalized = tag.toLowerCase().trim();
            freq[normalized] = (freq[normalized] || 0) + 1;
        });
    });
    return freq;
}

function getTagRarityScore(tag, totalCards) {
    if (!tagFrequencyMap) return 1;
    const freq = tagFrequencyMap[tag.toLowerCase().trim()] || 1;
    return Math.log(totalCards / freq) + 1;
}

function calculateRelatednessScore(card, targetCard, allCards) {
    let score = 0;
    const reasons = [];

    if (!tagFrequencyMap) {
        tagFrequencyMap = buildTagFrequencyMap(allCards);
    }

    const totalCards = allCards.length;
    const targetTags = new Set((targetCard.tags || []).map(t => t.toLowerCase().trim()));
    const cardTags = new Set((card.tags || []).map(t => t.toLowerCase().trim()));

    // Shared tags with rarity weighting
    const sharedTags = [];
    cardTags.forEach(tag => {
        if (targetTags.has(tag)) {
            const rarityScore = getTagRarityScore(tag, totalCards);
            score += rarityScore * 10;
            sharedTags.push(tag);
        }
    });
    if (sharedTags.length > 0) {
        reasons.push(`${sharedTags.length} shared tags`);
    }

    // Same creator bonus
    if (card.creator && targetCard.creator &&
        card.creator.toLowerCase() === targetCard.creator.toLowerCase()) {
        score += 50;
        reasons.push('Same creator');
    }

    // Name similarity
    const targetName = (targetCard.name || '').toLowerCase();
    const cardName = (card.name || '').toLowerCase();
    if (targetName && cardName) {
        const targetWords = targetName.split(/\s+/).filter(w => w.length > 2);
        const cardWords = cardName.split(/\s+/).filter(w => w.length > 2);
        const commonWords = targetWords.filter(w => cardWords.includes(w));
        if (commonWords.length > 0) {
            score += commonWords.length * 15;
            reasons.push('Name similarity');
        }
    }

    return { score, reasons };
}

async function loadRelatedTab(card) {
    const relatedResults = document.getElementById('relatedResults');
    if (!relatedResults) return;

    relatedResults.innerHTML = '<div class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Finding related characters...</div>';

    // Get all local characters for comparison
    let allCards = [];
    try {
        allCards = await loadMyCharacters();
    } catch (e) {
        allCards = [];
    }

    if (allCards.length < 2) {
        relatedResults.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users"></i><p>Need more characters in library to find related cards</p></div>';
        return;
    }

    // Build frequency map
    tagFrequencyMap = buildTagFrequencyMap(allCards);

    // Calculate scores
    const scored = allCards
        .filter(c => c.id !== card.id && c.name !== card.name)
        .map(c => ({
            card: c,
            ...calculateRelatednessScore(c, card, allCards)
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    if (scored.length === 0) {
        relatedResults.innerHTML = '<div class="empty-state"><i class="fa-solid fa-users"></i><p>No related characters found</p></div>';
        return;
    }

    relatedResults.innerHTML = scored.map(({ card: c, score, reasons }) => `
        <div class="related-item" data-id="${escapeHtml(c.id)}">
            <div class="related-avatar">
                <img src="${c.avatar_url || c.image_url || ''}" alt="" onerror="this.style.display='none'">
            </div>
            <div class="related-info">
                <div class="related-name">${escapeHtml(c.name || 'Unknown')}</div>
                <div class="related-creator">by ${escapeHtml(c.creator || 'Unknown')}</div>
                <div class="related-reason">
                    ${reasons.map(r => `<span class="reason-tag">${escapeHtml(r)}</span>`).join('')}
                </div>
            </div>
            <div class="related-score">
                <div class="score-value">${Math.round(score)}</div>
                <div class="score-label">score</div>
            </div>
        </div>
    `).join('');

    // Add click handlers
    relatedResults.querySelectorAll('.related-item').forEach(item => {
        item.addEventListener('click', () => {
            const cardId = item.dataset.id;
            const relatedCard = allCards.find(c => c.id === cardId);
            if (relatedCard) {
                showCardModal(relatedCard);
            }
        });
    });
}

// ============================================
// DUPLICATE DETECTION SYSTEM
// ============================================

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

function nameSimilarity(name1, name2) {
    if (!name1 || !name2) return 0;
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    if (n1 === n2) return 1;

    const maxLen = Math.max(n1.length, n2.length);
    if (maxLen === 0) return 1;

    const distance = levenshteinDistance(n1, n2);
    return 1 - (distance / maxLen);
}

function jaccardSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    words1.forEach(w => { if (words2.has(w)) intersection++; });

    const union = words1.size + words2.size - intersection;
    return intersection / union;
}

function calculateDuplicateScore(card1, card2) {
    let score = 0;
    const reasons = [];

    // Name similarity (40% weight)
    const nameScore = nameSimilarity(card1.name, card2.name);
    if (nameScore > 0.8) {
        score += nameScore * 40;
        if (nameScore === 1) reasons.push('Exact name');
        else reasons.push('Similar name');
    }

    // Creator match (20% weight)
    if (card1.creator && card2.creator &&
        card1.creator.toLowerCase().trim() === card2.creator.toLowerCase().trim()) {
        score += 20;
        reasons.push('Same creator');
    }

    // Description similarity (20% weight)
    const desc1 = card1.description || card1.data?.description || '';
    const desc2 = card2.description || card2.data?.description || '';
    const descScore = jaccardSimilarity(desc1, desc2);
    if (descScore > 0.5) {
        score += descScore * 20;
        reasons.push('Similar description');
    }

    // Personality similarity (10% weight)
    const pers1 = card1.personality || card1.data?.personality || '';
    const pers2 = card2.personality || card2.data?.personality || '';
    const persScore = jaccardSimilarity(pers1, pers2);
    if (persScore > 0.5) {
        score += persScore * 10;
        reasons.push('Similar personality');
    }

    // Scenario similarity (10% weight)
    const scen1 = card1.scenario || card1.data?.scenario || '';
    const scen2 = card2.scenario || card2.data?.scenario || '';
    const scenScore = jaccardSimilarity(scen1, scen2);
    if (scenScore > 0.5) {
        score += scenScore * 10;
        reasons.push('Similar scenario');
    }

    return { score, reasons };
}

async function scanForDuplicates(threshold = 60) {
    const scannerResults = document.getElementById('scannerResults');
    const scannerProgress = document.getElementById('scannerProgress');
    const scannerStatus = document.getElementById('scannerStatus');
    const progressBar = document.getElementById('scannerProgressFill');

    if (!scannerResults || !scannerProgress) return;

    scannerProgress.classList.remove('hidden');
    scannerResults.classList.add('hidden');
    scannerResults.innerHTML = '';

    scannerStatus.textContent = 'Loading characters...';
    const cards = await loadMyCharacters();

    if (cards.length < 2) {
        scannerStatus.textContent = 'Need at least 2 characters to scan';
        return;
    }

    const duplicateGroups = [];
    const processed = new Set();
    const total = cards.length;

    for (let i = 0; i < cards.length; i++) {
        const card1 = cards[i];
        if (processed.has(card1.id)) continue;

        const group = [card1];

        for (let j = i + 1; j < cards.length; j++) {
            const card2 = cards[j];
            if (processed.has(card2.id)) continue;

            const { score, reasons } = calculateDuplicateScore(card1, card2);

            if (score >= threshold) {
                group.push({ ...card2, duplicateScore: score, duplicateReasons: reasons });
                processed.add(card2.id);
            }
        }

        if (group.length > 1) {
            processed.add(card1.id);
            duplicateGroups.push(group);
        }

        const percent = ((i + 1) / total) * 100;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (scannerStatus) scannerStatus.textContent = `Scanning ${i + 1} of ${total}...`;

        if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
    }

    scannerProgress.classList.add('hidden');
    scannerResults.classList.remove('hidden');

    if (duplicateGroups.length === 0) {
        scannerResults.innerHTML = '<div class="empty-state"><i class="fa-solid fa-check-circle" style="color:var(--success);"></i><p>No duplicates found!</p></div>';
        return;
    }

    scannerResults.innerHTML = duplicateGroups.map((group) => {
        const avgScore = group.slice(1).reduce((sum, c) => sum + (c.duplicateScore || 0), 0) / (group.length - 1);
        const confidence = avgScore >= 80 ? 'high' : avgScore >= 60 ? 'medium' : 'low';

        return `
            <div class="duplicate-group">
                <div class="duplicate-group-header">
                    <div class="duplicate-group-title">${escapeHtml(group[0].name)} (${group.length} copies)</div>
                    <div class="duplicate-confidence ${confidence}">${Math.round(avgScore)}% match</div>
                </div>
                <div class="duplicate-items">
                    ${group.map((card, ci) => `
                        <div class="duplicate-item" data-id="${escapeHtml(card.id)}">
                            <div class="duplicate-item-avatar">
                                <img src="${card.avatar_url || ''}" alt="" onerror="this.style.display='none'">
                            </div>
                            <div class="duplicate-item-info">
                                <div class="duplicate-item-name">${escapeHtml(card.name)}</div>
                                <div class="duplicate-item-meta">
                                    ${ci === 0 ? 'Original' : `${Math.round(card.duplicateScore)}% - ${card.duplicateReasons?.join(', ') || ''}`}
                                </div>
                            </div>
                            <div class="duplicate-item-actions">
                                <button class="action-btn secondary view-dup-btn" data-id="${escapeHtml(card.id)}" title="View">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                                ${ci > 0 ? `<button class="action-btn danger delete-dup-btn" data-id="${escapeHtml(card.id)}" data-name="${escapeHtml(card.name)}" title="Delete">
                                    <i class="fa-solid fa-trash"></i>
                                </button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Add event handlers
    scannerResults.querySelectorAll('.view-dup-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cards = await loadMyCharacters();
            const card = cards.find(c => c.id === btn.dataset.id);
            if (card) {
                hideDuplicateScannerModal();
                showCardModal(card);
            }
        });
    });

    scannerResults.querySelectorAll('.delete-dup-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm(`Delete "${btn.dataset.name}"? This cannot be undone.`)) {
                await deleteCharacter(btn.dataset.id);
                btn.closest('.duplicate-item').remove();
            }
        });
    });
}

async function deleteCharacter(avatarId) {
    try {
        const response = await fetch('/api/characters/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ avatar_url: avatarId })
        });

        if (!response.ok) throw new Error('Delete failed');
        showToast('Character deleted', 'success');

        const myChars = await loadMyCharacters();
        state.myCharacterNames = new Set(myChars.map(c => c.name?.toLowerCase().trim()).filter(Boolean));

    } catch (error) {
        console.error('[Bot Browser] Delete error:', error);
        showToast('Failed to delete character', 'error');
    }
}

function showDuplicateScannerModal() {
    const modal = document.getElementById('duplicateScannerModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('scannerProgress')?.classList.add('hidden');
        document.getElementById('scannerResults')?.classList.add('hidden');
    }
}

function hideDuplicateScannerModal() {
    document.getElementById('duplicateScannerModal')?.classList.add('hidden');
}

// ============================================
// BATCH DOWNLOAD EMBEDDED MEDIA
// ============================================

function extractMediaUrls(text) {
    if (!text) return [];
    const urls = [];

    // Markdown images: ![alt](url)
    const mdImages = text.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)/g);
    for (const match of mdImages) {
        urls.push(match[1]);
    }

    // HTML img tags: <img src="url">
    const htmlImages = text.matchAll(/<img[^>]+src=["']?(https?:\/\/[^\s"'>]+)/gi);
    for (const match of htmlImages) {
        urls.push(match[1]);
    }

    // Direct image URLs
    const directUrls = text.matchAll(/(?<!")(?<!')\b(https?:\/\/[^\s<>"']+\.(?:png|jpg|jpeg|gif|webp|mp3|wav|ogg|m4a))\b/gi);
    for (const match of directUrls) {
        urls.push(match[1]);
    }

    // Deduplicate
    return [...new Set(urls)];
}

async function downloadEmbeddedMedia(card) {
    if (!card?.isLocal) {
        showToast('Only available for local characters', 'error');
        return;
    }

    const btn = document.getElementById('downloadEmbeddedBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
    }

    try {
        // Collect all text fields to scan
        const fields = [
            card.description || card.data?.description || card._rawData?.data?.description || '',
            card.creator_notes || card.data?.creator_notes || card._rawData?.data?.creator_notes || '',
            card.first_mes || card.first_message || card.data?.first_mes || card._rawData?.data?.first_mes || '',
            card.mes_example || card.data?.mes_example || card._rawData?.data?.mes_example || '',
            card.personality || card.data?.personality || card._rawData?.data?.personality || '',
            card.scenario || card.data?.scenario || card._rawData?.data?.scenario || ''
        ];

        const allUrls = [];
        for (const field of fields) {
            allUrls.push(...extractMediaUrls(field));
        }

        // Deduplicate
        const uniqueUrls = [...new Set(allUrls)];

        if (uniqueUrls.length === 0) {
            showToast('No embedded media URLs found', 'info');
            return;
        }

        const confirmed = confirm(`Found ${uniqueUrls.length} media URLs. Download them to character gallery?`);
        if (!confirmed) return;

        if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 0/${uniqueUrls.length}`;

        let success = 0;
        let failed = 0;

        for (let i = 0; i < uniqueUrls.length; i++) {
            const url = uniqueUrls[i];
            if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${i + 1}/${uniqueUrls.length}`;

            try {
                // Use SillyTavern's image upload endpoint
                const response = await fetch('/api/images/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({
                        url: url,
                        folder: card.name
                    })
                });

                if (response.ok) {
                    success++;
                } else {
                    failed++;
                }
            } catch (e) {
                failed++;
                console.error('[Bot Browser] Failed to download:', url, e);
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        }

        showToast(`Downloaded ${success} files, ${failed} failed`, success > 0 ? 'success' : 'warning');

        // Refresh media tab
        if (state.selectedCard) {
            loadMediaTab(state.selectedCard);
        }

    } catch (error) {
        console.error('[Bot Browser] Batch download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Download Embedded Media';
        }
    }
}

// ============================================
// CHUBAI TOKEN HANDLING & AUTHENTICATED ENDPOINTS
// ============================================

function getChubToken() {
    return state.settings.chubToken || '';
}

function setChubToken(token) {
    state.settings.chubToken = token;
    saveSettings();
}

function getChubAuthHeaders() {
    const token = getChubToken().toString().trim();
    if (!token) return {};
    return {
        samwise: token,
        'CH-API-KEY': token,
        'private-token': token,
    };
}

/**
 * Fetch Chub timeline (global timeline endpoint).
 * If a token is present, include it for maximum access.
 */
async function fetchChubTimeline(page = 1) {
    try {
        const response = await proxiedFetch(`https://gateway.chub.ai/api/timeline/v1?page=${page}&count=false`, {
            service: 'chub_gateway',
            fetchOptions: {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...getChubAuthHeaders(),
                }
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const nodes = data?.data?.nodes || data?.nodes || [];
        return {
            nodes,
            // Timeline appears to return fixed-size pages of 20
            hasMore: Array.isArray(nodes) && nodes.length >= 20,
        };
    } catch (error) {
        console.error('[Bot Browser] Chub timeline error:', error);
        showToast('Failed to load timeline: ' + error.message, 'error');
        return { nodes: [], hasMore: false };
    }
}

/**
 * Fetch user's Chub favorites
 * Requires Chub token to return non-empty results
 */
async function fetchChubFavorites(page = 1, perPage = 48) {
    const token = getChubToken().toString().trim();
    if (!token) {
        showToast('Chub token required to load favorites (Settings → API)', 'error');
        return { nodes: [], hasMore: false };
    }

    try {
        const params = new URLSearchParams({
            search: '',
            first: String(perPage),
            page: String(page),
            namespace: 'characters',
            my_favorites: 'true',
            nsfw: String(!state.settings.hideNsfw),
            nsfl: 'true',
            count: 'false',
        });

        const response = await proxiedFetch(`https://gateway.chub.ai/search?${params}`, {
            service: 'chub_gateway',
            fetchOptions: {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    ...getChubAuthHeaders(),
                }
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const nodes = data?.data?.nodes || data?.nodes || [];
        return {
            nodes,
            hasMore: Array.isArray(nodes) && nodes.length >= perPage,
        };
    } catch (error) {
        console.error('[Bot Browser] Chub favorites error:', error);
        showToast('Failed to load favorites: ' + error.message, 'error');
        return { nodes: [], hasMore: false };
    }
}

// ============================================
// DUPLICATE MEDIA DETECTION
// ============================================

/**
 * Compute SHA-256 hash of a file/blob using crypto.subtle
 * @param {Blob} blob - File data
 * @returns {Promise<string>} Hex hash string
 */
async function computeFileHash(blob) {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Scan gallery for duplicate media files
 * @param {string} characterName - Character to scan (optional, scans all if not provided)
 */
async function scanForDuplicateMedia(characterName = null) {
    const modal = document.getElementById('duplicateMediaModal');
    const resultsList = document.getElementById('duplicateMediaResults');
    const progressBar = document.getElementById('mediaHashProgress');
    const statusText = document.getElementById('mediaHashStatus');

    if (!modal || !resultsList) {
        showToast('Duplicate media scanner not available', 'error');
        return;
    }

    // Show modal
    modal.style.display = 'flex';
    resultsList.innerHTML = '<div class="duplicate-loading"><i class="fa-solid fa-spinner fa-spin"></i> Scanning media files...</div>';

    try {
        // Get list of all images
        const response = await fetch('/api/images/list', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(characterName ? { folder: characterName } : {})
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const images = await response.json();

        if (!images || images.length === 0) {
            resultsList.innerHTML = '<div class="no-duplicates"><i class="fa-solid fa-check-circle"></i> No media files found to scan</div>';
            return;
        }

        // Hash all files
        const fileHashes = new Map(); // hash -> [file paths]
        const hashToFirst = new Map(); // hash -> first file info
        let processed = 0;

        if (statusText) statusText.textContent = `Hashing 0/${images.length} files...`;
        if (progressBar) progressBar.style.width = '0%';

        for (const img of images) {
            try {
                // Fetch the image
                const imgResponse = await fetch(img.url || img.path || `/user/images/${img.name}`);
                if (!imgResponse.ok) continue;

                const blob = await imgResponse.blob();
                const hash = await computeFileHash(blob);

                if (!fileHashes.has(hash)) {
                    fileHashes.set(hash, []);
                    hashToFirst.set(hash, { name: img.name, size: blob.size, url: img.url || img.path });
                }
                fileHashes.get(hash).push({
                    name: img.name,
                    folder: img.folder || '',
                    path: img.path || img.url,
                    size: blob.size
                });
            } catch (e) {
                console.warn('[Bot Browser] Failed to hash file:', img.name, e);
            }

            processed++;
            const percent = Math.round((processed / images.length) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (statusText) statusText.textContent = `Hashing ${processed}/${images.length} files...`;

            // Yield to UI
            if (processed % 10 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }

        // Find duplicates (hashes with more than one file)
        const duplicates = [];
        for (const [hash, files] of fileHashes) {
            if (files.length > 1) {
                duplicates.push({
                    hash: hash.substring(0, 16),
                    files: files,
                    totalSize: files.reduce((s, f) => s + f.size, 0),
                    wastedSize: files.slice(1).reduce((s, f) => s + f.size, 0)
                });
            }
        }

        if (duplicates.length === 0) {
            resultsList.innerHTML = '<div class="no-duplicates"><i class="fa-solid fa-check-circle"></i> No duplicate media files found</div>';
            if (statusText) statusText.textContent = `Scanned ${images.length} files - no duplicates`;
            return;
        }

        // Sort by wasted size (largest first)
        duplicates.sort((a, b) => b.wastedSize - a.wastedSize);

        // Calculate totals
        const totalWasted = duplicates.reduce((s, d) => s + d.wastedSize, 0);
        const totalDupes = duplicates.reduce((s, d) => s + d.files.length - 1, 0);

        if (statusText) statusText.textContent = `Found ${totalDupes} duplicates wasting ${formatFileSize(totalWasted)}`;

        // Render results
        resultsList.innerHTML = duplicates.map(dup => `
            <div class="duplicate-group" data-hash="${dup.hash}">
                <div class="duplicate-group-header">
                    <span class="duplicate-hash">${dup.hash}...</span>
                    <span class="duplicate-count">${dup.files.length} copies</span>
                    <span class="duplicate-wasted">${formatFileSize(dup.wastedSize)} wasted</span>
                </div>
                <div class="duplicate-files">
                    ${dup.files.map((f, i) => `
                        <div class="duplicate-file ${i === 0 ? 'original' : ''}">
                            <img src="${f.path}" class="duplicate-thumb" alt="" loading="lazy">
                            <div class="duplicate-file-info">
                                <span class="duplicate-file-name">${escapeHtml(f.name)}</span>
                                ${f.folder ? `<span class="duplicate-file-folder">${escapeHtml(f.folder)}</span>` : ''}
                                <span class="duplicate-file-size">${formatFileSize(f.size)}</span>
                            </div>
                            ${i > 0 ? `<button class="delete-duplicate-btn" data-path="${escapeHtml(f.path)}" title="Delete duplicate"><i class="fa-solid fa-trash"></i></button>` : '<span class="original-badge">Keep</span>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Add delete handlers
        resultsList.querySelectorAll('.delete-duplicate-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const path = btn.dataset.path;
                if (!confirm(`Delete this duplicate file?\n${path}`)) return;

                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                try {
                    const delResponse = await fetch('/api/images/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify({ path: path })
                    });

                    if (delResponse.ok) {
                        btn.closest('.duplicate-file').remove();
                        showToast('Duplicate deleted', 'success');
                    } else {
                        throw new Error('Delete failed');
                    }
                } catch (e) {
                    showToast('Failed to delete: ' + e.message, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                }
            });
        });

    } catch (error) {
        console.error('[Bot Browser] Duplicate media scan error:', error);
        resultsList.innerHTML = `<div class="scan-error"><i class="fa-solid fa-exclamation-triangle"></i> Scan failed: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function showDuplicateMediaModal() {
    const modal = document.getElementById('duplicateMediaModal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset UI
        const resultsList = document.getElementById('duplicateMediaResults');
        const progressBar = document.getElementById('mediaHashProgress');
        const statusText = document.getElementById('mediaHashStatus');
        if (resultsList) resultsList.innerHTML = '<div class="scan-prompt">Click "Start Scan" to find duplicate media files</div>';
        if (progressBar) progressBar.style.width = '0%';
        if (statusText) statusText.textContent = 'Ready to scan';
    }
}

function hideDuplicateMediaModal() {
    const modal = document.getElementById('duplicateMediaModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// SETUP NEW FEATURES
// ============================================

function setupNewFeatures() {
    // Local favorites filter
    document.getElementById('localFavoritesOnlyBtn')?.addEventListener('click', (e) => {
        state.filters.localFavoritesOnly = !state.filters.localFavoritesOnly;
        e.currentTarget.classList.toggle('active', state.filters.localFavoritesOnly);
        applyFilters();
    });

    // Duplicate scanner
    document.getElementById('duplicateScannerBtn')?.addEventListener('click', showDuplicateScannerModal);
    document.getElementById('duplicateScannerClose')?.addEventListener('click', hideDuplicateScannerModal);
    document.getElementById('duplicateScannerModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'duplicateScannerModal') hideDuplicateScannerModal();
    });
    document.getElementById('startScanBtn')?.addEventListener('click', () => {
        const threshold = parseInt(document.getElementById('duplicateThreshold')?.value || '60');
        scanForDuplicates(threshold);
    });

    // Diff preview modal
    document.getElementById('diffPreviewClose')?.addEventListener('click', hideDiffPreview);
    document.getElementById('diffPreviewModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'diffPreviewModal') hideDiffPreview();
    });
    document.getElementById('confirmSaveBtn')?.addEventListener('click', () => {
        hideDiffPreview();
        saveCharacterEdits();
    });

    // Save/Reset/Preview buttons
    document.getElementById('saveCharacterBtn')?.addEventListener('click', saveCharacterEdits);
    document.getElementById('resetCharacterBtn')?.addEventListener('click', resetCharacterEdits);
    document.getElementById('previewDiffBtn')?.addEventListener('click', showDiffPreview);

    // Tab switching for tabs - lazy loading (handles both main and mini tabs)
    document.querySelectorAll('.content-tab, .content-tab-mini').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (!tabName || !state.selectedCard) return;

            if (tabName === 'chats') {
                loadChatsTab(state.selectedCard);
            } else if (tabName === 'media') {
                loadMediaTab(state.selectedCard);
            } else if (tabName === 'related') {
                loadRelatedTab(state.selectedCard);
            } else if (tabName === 'edit') {
                initEditTab(state.selectedCard);
            }
        });
    });

    // Download embedded media button
    document.getElementById('downloadEmbeddedBtn')?.addEventListener('click', () => {
        if (state.selectedCard) {
            downloadEmbeddedMedia(state.selectedCard);
        }
    });

    // ChubAI token save
    document.getElementById('settingChubToken')?.addEventListener('change', (e) => {
        const token = e.target.value.trim();
        setChubToken(token);
        applySettings();
        updateChubTokenHint();

        // Update status indicator
        const status = document.getElementById('chubTokenStatus');
        if (status) {
            if (token) {
                status.className = 'token-status valid';
                status.innerHTML = '<i class="fa-solid fa-check-circle"></i> Token saved';
            } else {
                status.className = 'token-status';
                status.innerHTML = '';
            }
        }

        showToast(token ? 'ChubAI token saved' : 'ChubAI token cleared', 'success');
    });

    // Threshold slider
    document.getElementById('duplicateThreshold')?.addEventListener('input', (e) => {
        const value = e.target.value;
        const display = document.getElementById('thresholdValue');
        if (display) display.textContent = `${value}%`;
    });

    // Duplicate Media Scanner
    document.getElementById('duplicateMediaBtn')?.addEventListener('click', showDuplicateMediaModal);
    document.getElementById('duplicateMediaClose')?.addEventListener('click', hideDuplicateMediaModal);
    document.getElementById('duplicateMediaModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'duplicateMediaModal') hideDuplicateMediaModal();
    });
    document.getElementById('startMediaScanBtn')?.addEventListener('click', () => {
        const charName = state.selectedCard?.isLocal ? state.selectedCard.name : null;
        scanForDuplicateMedia(charName);
    });
    document.getElementById('scanAllMediaBtn')?.addEventListener('click', () => {
        scanForDuplicateMedia(null);
    });

    // Media tab buttons
    document.getElementById('findDuplicateMediaBtn')?.addEventListener('click', showDuplicateMediaModal);
    document.getElementById('downloadEmbeddedMediaBtn')?.addEventListener('click', () => {
        if (state.selectedCard) {
            downloadEmbeddedMedia(state.selectedCard);
        }
    });

    // Token visibility toggle
    document.getElementById('toggleTokenVisibility')?.addEventListener('click', () => {
        const input = document.getElementById('settingChubToken');
        const icon = document.querySelector('#toggleTokenVisibility i');
        if (input && icon) {
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.replace('fa-eye-slash', 'fa-eye');
            }
        }
    });

    // Open settings for token link
    document.getElementById('openSettingsForToken')?.addEventListener('click', (e) => {
        e.preventDefault();
        // Open settings modal
        document.getElementById('settingsModal')?.classList.remove('hidden');
        // Switch to API tab
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
        document.querySelector('.settings-tab[data-tab="api"]')?.classList.add('active');
        document.querySelector('.settings-content[data-content="api"]')?.classList.add('active');
        // Focus the token input
        setTimeout(() => document.getElementById('settingChubToken')?.focus(), 100);
    });

    // Update sidebar hint based on token presence
    updateChubTokenHint();

    console.log('[Bot Browser Standalone] New features initialized');
}

// Update the Chub token hint in sidebar
function updateChubTokenHint() {
    const hint = document.getElementById('chubTokenHint');
    const token = getChubToken();
    const favBtn = document.querySelector('[data-source="chub_favorites"]');
    if (favBtn) {
        favBtn.disabled = !token;
        favBtn.title = token ? '' : 'Add your Chub token in Settings → API to load your favorites';
    }
    if (hint) {
        if (token) {
            hint.classList.add('has-token');
            hint.innerHTML = '<i class="fa-solid fa-check"></i><span>Token configured</span>';
        } else {
            hint.classList.remove('has-token');
            hint.innerHTML = '<i class="fa-solid fa-lock"></i><span>Add token in <a href="#" id="openSettingsForToken">Settings</a></span>';
            // Re-attach listener
            document.getElementById('openSettingsForToken')?.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('settingsModal')?.classList.remove('hidden');
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.settings-content').forEach(c => c.classList.remove('active'));
                document.querySelector('.settings-tab[data-tab="api"]')?.classList.add('active');
                document.querySelector('.settings-content[data-content="api"]')?.classList.add('active');
                setTimeout(() => document.getElementById('settingChubToken')?.focus(), 100);
            });
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(setupNewFeatures, 100);
});
