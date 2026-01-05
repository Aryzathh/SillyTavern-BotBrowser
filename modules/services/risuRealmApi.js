// RisuRealm API Service
// Live API for searching characters from realm.risuai.net

import { proxiedFetch } from './corsProxy.js';

const RISU_BASE_URL = 'https://realm.risuai.net';
const RISU_DATA_URL = `${RISU_BASE_URL}/__data.json`;
const RISU_IMAGE_BASE = 'https://sv.risuai.xyz/resource/';

// API state for pagination
export let risuRealmApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    totalPages: 1,
    lastSearch: '',
    lastSort: 'recommended'
};

export function resetRisuRealmState() {
    risuRealmApiState = {
        page: 1,
        hasMore: true,
        isLoading: false,
        totalPages: 1,
        lastSearch: '',
        lastSort: 'recommended'
    };
}

export function getRisuRealmApiState() {
    return risuRealmApiState;
}

/**
 * Parse SvelteKit devalue format data
 * @param {Array} data - Raw data array from __data.json
 * @returns {Array} Parsed character objects
 */
function parseDevalueData(data) {
    const cards = [];

    if (!data || !Array.isArray(data) || data.length < 3) {
        return cards;
    }

    // data[0] = metadata object with indexes
    // data[1] = array of card indexes
    // data[2] onwards = schema and card data

    const cardIndexes = data[1];
    if (!Array.isArray(cardIndexes)) {
        return cards;
    }

    // Helper to resolve a value - if it's an array of indices, resolve each one
    const resolveValue = (value) => {
        if (Array.isArray(value)) {
            // Array of indices - resolve each element
            return value.map(idx => {
                if (typeof idx === 'number' && data[idx] !== undefined) {
                    return data[idx];
                }
                return idx;
            });
        }
        return value;
    };

    // Each card starts with a schema object followed by values
    // Schema looks like: {name:3, desc:4, download:5, id:6, img:7, tags:8, ...}

    for (const startIndex of cardIndexes) {
        try {
            const schema = data[startIndex];
            if (!schema || typeof schema !== 'object') continue;

            const card = {};

            // Extract values using schema indexes
            for (const [key, valueIndex] of Object.entries(schema)) {
                if (typeof valueIndex === 'number' && data[valueIndex] !== undefined) {
                    card[key] = resolveValue(data[valueIndex]);
                } else {
                    card[key] = valueIndex; // Direct value (like booleans)
                }
            }

            if (card.id && card.name) {
                cards.push(card);
            }
        } catch (e) {
            console.warn('[Bot Browser] Failed to parse RisuRealm card:', e);
        }
    }

    return cards;
}

/**
 * Search RisuRealm characters
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with cards array
 */
export async function searchRisuRealm(options = {}) {
    const {
        search = '',
        page = 1,
        sort = 'recommended', // recommended, download, date
        nsfw = true
    } = options;

    risuRealmApiState.isLoading = true;

    try {
        const params = new URLSearchParams();

        // Sort parameter - empty string for 'recommended' default
        if (sort && sort !== 'recommended') {
            params.set('sort', sort);
        } else {
            params.set('sort', '');
        }

        // Page parameter - SvelteKit uses 1-indexed pages
        params.set('page', page.toString());

        if (search) {
            params.set('q', search);
        }

        if (!nsfw) {
            params.set('nsfw', 'false');
        }

        // Add cache-busting timestamp to force fresh data
        params.set('_t', Date.now().toString());

        const url = `${RISU_DATA_URL}?${params}`;
        console.log('[Bot Browser] RisuRealm API request:', url);

        const response = await proxiedFetch(url, {
            service: 'risuai_realm',
            fetchOptions: {
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            }
        });

        if (!response.ok) {
            throw new Error(`RisuRealm API error: ${response.status}`);
        }

        const json = await response.json();
        console.log('[Bot Browser] RisuRealm raw response structure:', Object.keys(json));

        // Navigate to the data array - try multiple paths
        // SvelteKit response format can vary
        let nodeData = null;

        // Try nodes[1].data first (initial page load format)
        if (json?.nodes?.[1]?.data) {
            nodeData = json.nodes[1].data;
            console.log('[Bot Browser] Found data at nodes[1].data');
        }
        // Try nodes[0].data (alternative format)
        else if (json?.nodes?.[0]?.data) {
            nodeData = json.nodes[0].data;
            console.log('[Bot Browser] Found data at nodes[0].data');
        }
        // Try direct data property
        else if (json?.data) {
            nodeData = json.data;
            console.log('[Bot Browser] Found data at root data property');
        }
        // Try nodes array directly
        else if (Array.isArray(json?.nodes)) {
            // Find the node with character data
            for (let i = 0; i < json.nodes.length; i++) {
                if (json.nodes[i]?.data && Array.isArray(json.nodes[i].data)) {
                    nodeData = json.nodes[i].data;
                    console.log(`[Bot Browser] Found data at nodes[${i}].data`);
                    break;
                }
            }
        }

        if (!nodeData) {
            console.error('[Bot Browser] RisuRealm response structure:', JSON.stringify(json).substring(0, 1000));
            throw new Error('Invalid RisuRealm response format - could not find data array');
        }

        const cards = parseDevalueData(nodeData);

        // Log card names to verify different data
        const firstCards = cards.slice(0, 3).map(c => c.name);
        const lastCards = cards.slice(-3).map(c => c.name);
        console.log(`[Bot Browser] RisuRealm page ${page} cards: first=[${firstCards.join(', ')}] last=[${lastCards.join(', ')}]`);

        // Get pagination info from metadata
        // The metadata structure varies - look for totalPages, pages, or page count
        const metadata = nodeData[0];
        let totalPages = 1;

        // Try different possible field names for total pages
        if (typeof metadata?.totalPages === 'number') {
            totalPages = metadata.totalPages;
        } else if (typeof metadata?.pages === 'number') {
            totalPages = metadata.pages;
        } else if (typeof metadata?.page === 'number' && metadata.page > 1) {
            // 'page' in metadata might be total pages, not current page
            totalPages = metadata.page;
        }

        // If we got a full page of results, assume there's more
        const pageSize = 30; // RisuRealm default page size
        const hasMore = cards.length >= pageSize;

        // Update state
        risuRealmApiState.page = page;
        risuRealmApiState.totalPages = Math.max(totalPages, page + (hasMore ? 1 : 0));
        risuRealmApiState.hasMore = hasMore;
        risuRealmApiState.lastSearch = search;
        risuRealmApiState.lastSort = sort;

        console.log(`[Bot Browser] RisuRealm API returned ${cards.length} cards (page ${page}, hasMore: ${hasMore})`);
        console.log('[Bot Browser] RisuRealm metadata:', JSON.stringify(metadata));

        return {
            cards,
            page,
            totalPages: risuRealmApiState.totalPages,
            hasMore
        };
    } catch (error) {
        console.error('[Bot Browser] RisuRealm API error:', error);
        throw error;
    } finally {
        risuRealmApiState.isLoading = false;
    }
}

/**
 * Load more RisuRealm cards (pagination)
 */
export async function loadMoreRisuRealm(options = {}) {
    if (risuRealmApiState.isLoading || !risuRealmApiState.hasMore) {
        return { cards: [], hasMore: false };
    }

    const nextPage = risuRealmApiState.page + 1;
    return searchRisuRealm({
        ...options,
        search: options.search ?? risuRealmApiState.lastSearch,
        sort: options.sort ?? risuRealmApiState.lastSort,
        page: nextPage
    });
}

/**
 * Fetch RisuRealm trending (recommended) cards
 * @param {Object} options - Options
 * @returns {Promise<Object>} Results with cards array
 */
export async function fetchRisuRealmTrending(options = {}) {
    const { page = 1, nsfw = true } = options;

    return searchRisuRealm({
        search: '',
        page,
        sort: 'recommended',
        nsfw
    });
}

/**
 * Fetch full character details from RisuRealm
 * @param {string} characterId - Character UUID
 * @returns {Promise<Object>} Full character data
 */
export async function fetchRisuRealmCharacter(characterId) {
    const url = `${RISU_BASE_URL}/character/${characterId}/__data.json`;
    console.log('[Bot Browser] RisuRealm Character API request:', url);

    const response = await proxiedFetch(url, {
        service: 'risuai_realm',
        fetchOptions: {
            headers: {
                'Accept': 'application/json'
            }
        }
    });

    if (!response.ok) {
        throw new Error(`RisuRealm Character API error: ${response.status}`);
    }

    const json = await response.json();

    // Navigate to the data array
    const nodeData = json?.nodes?.[1]?.data;
    if (!nodeData || !Array.isArray(nodeData)) {
        throw new Error('Invalid RisuRealm character response format');
    }

    // Parse the devalue format - first element is metadata, second is card schema
    const cardSchema = nodeData[1];
    if (!cardSchema || typeof cardSchema !== 'object') {
        throw new Error('Invalid RisuRealm character schema');
    }

    const card = {};
    for (const [key, valueIndex] of Object.entries(cardSchema)) {
        if (typeof valueIndex === 'number' && nodeData[valueIndex] !== undefined) {
            let value = nodeData[valueIndex];
            // Resolve nested arrays (like tags)
            if (Array.isArray(value)) {
                value = value.map(idx => {
                    if (typeof idx === 'number' && nodeData[idx] !== undefined) {
                        return nodeData[idx];
                    }
                    return idx;
                });
            }
            card[key] = value;
        } else {
            card[key] = valueIndex;
        }
    }

    console.log('[Bot Browser] RisuRealm Character loaded:', card.name);
    return card;
}

/**
 * Transform full RisuRealm character to BotBrowser format
 * @param {Object} card - Full RisuRealm character data
 * @returns {Object} Full BotBrowser card format
 */
export function transformFullRisuRealmCharacter(card) {
    const baseCard = transformRisuRealmCard(card);

    // Add any additional fields from full character data
    return {
        ...baseCard,
        // Full description (may be longer than search results)
        description: card.desc || baseCard.description,
        license: card.license || '',
        isShared: card.shared || false,
        creatorId: card.creator || '',
        // Mark as having full data
        hasFullData: true
    };
}

/**
 * Transform RisuRealm card to BotBrowser format
 * @param {Object} card - RisuRealm card object
 * @returns {Object} BotBrowser card format
 */
export function transformRisuRealmCard(card) {
    const tags = Array.isArray(card.tags) ? card.tags : [];

    // Parse download count (e.g., "33k" -> 33000)
    let downloads = 0;
    if (typeof card.download === 'string') {
        const match = card.download.match(/^([\d.]+)k?$/i);
        if (match) {
            downloads = parseFloat(match[1]) * (card.download.toLowerCase().includes('k') ? 1000 : 1);
        }
    } else if (typeof card.download === 'number') {
        downloads = card.download;
    }

    return {
        id: card.id,
        name: card.name || 'Unnamed',
        creator: card.authorname || '',
        avatar_url: card.img ? `${RISU_IMAGE_BASE}${card.img}` : '',
        image_url: `${RISU_BASE_URL}/character/${card.id}`,
        tags: tags,
        description: card.desc || '',
        desc_preview: (card.desc || '').substring(0, 150),
        desc_search: `${card.name || ''} ${card.desc || ''} ${tags.join(' ')}`,
        downloads: downloads,
        downloadCount: downloads,
        possibleNsfw: false, // RisuRealm doesn't seem to flag NSFW in the data
        service: 'risuai_realm',
        sourceService: 'risuai_realm',
        isLiveApi: true,
        isRisuRealm: true,
        hasLorebook: card.haslore || false,
        hasEmotion: card.hasEmotion || false,
        hasAsset: card.hasAsset || false,
        type: card.type || 'normal',
        created_at: card.date ? new Date(card.date * 1000).toISOString() : null
    };
}
