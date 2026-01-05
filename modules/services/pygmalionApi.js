// Pygmalion.chat API Module
// Uses Connect RPC protocol at server.pygmalion.chat

import { proxiedFetch } from './corsProxy.js';

const PYGMALION_API_BASE = 'https://server.pygmalion.chat/galatea.v1.PublicCharacterService';

/**
 * Sort type options for Pygmalion
 */
export const PYGMALION_SORT_TYPES = {
    NEWEST: 'approved_at',
    TOKEN_COUNT: 'token_count',
    STARS: 'stars',
    NAME: 'display_name',
    DOWNLOADS: 'downloads',
    VIEWS: 'views'
};

/**
 * Fetch from Pygmalion Connect RPC API
 * @param {string} method - RPC method name
 * @param {Object} input - Request body
 * @returns {Promise<Object>} API response data
 */
async function fetchPygmalionApi(method, input) {
    const url = `${PYGMALION_API_BASE}/${method}`;

    const response = await proxiedFetch(url, {
        service: 'pygmalion',
        fetchOptions: {
            method: 'POST',
            headers: {
                'Accept': '*/*',
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1'
            },
            body: JSON.stringify(input)
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Pygmalion API error: ${response.status} - ${text}`);
    }

    return response.json();
}

/**
 * Search/browse characters on Pygmalion
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with characters and pagination
 */
export async function searchPygmalionCharacters(options = {}) {
    const {
        query = '',
        orderBy = PYGMALION_SORT_TYPES.NEWEST,
        orderDescending = true,
        includeSensitive = true,
        pageSize = 60,
        page = 1
    } = options;

    const input = {
        orderBy,
        orderDescending,
        includeSensitive,
        pageSize
    };

    if (query.trim()) {
        input.query = query.trim();
    }

    // API uses 0-indexed pages, our state uses 1-indexed
    if (page > 1) {
        input.page = page - 1;
    }

    const result = await fetchPygmalionApi('CharacterSearch', input);

    return {
        characters: result.characters || [],
        totalItems: parseInt(result.totalItems) || 0,
        page,
        pageSize,
        hasMore: (result.characters?.length || 0) >= pageSize
    };
}

/**
 * Get full character data by ID
 * @param {string} characterId - Character meta ID
 * @param {string} versionId - Optional version ID (empty for default)
 * @returns {Promise<Object>} Full character data
 */
export async function getPygmalionCharacter(characterId, versionId = '') {
    const result = await fetchPygmalionApi('Character', {
        characterMetaId: characterId,
        characterVersionId: versionId
    });

    return result.character || result;
}

/**
 * Get characters by owner/creator ID
 * @param {string} userId - Owner's user ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Characters and pagination info
 */
export async function getPygmalionCharactersByOwner(userId, options = {}) {
    const {
        orderBy = 'created_at',
        page = 0
    } = options;

    const result = await fetchPygmalionApi('CharactersByOwnerID', {
        userId,
        orderBy,
        page
    });

    return {
        characters: result.characters || [],
        totalItems: parseInt(result.totalItems) || 0,
        page,
        hasMore: (result.characters?.length || 0) > 0
    };
}

/**
 * Transform Pygmalion character to BotBrowser card format
 * @param {Object} char - Pygmalion character object from search
 * @returns {Object} Card in BotBrowser format
 */
export function transformPygmalionCard(char) {
    const tags = char.tags || [];

    return {
        id: char.id,
        name: char.displayName || 'Unnamed',
        creator: char.owner?.displayName || char.owner?.username || 'Unknown',
        creatorId: char.owner?.id || '',
        creatorUsername: char.owner?.username || '',
        avatar_url: char.avatarUrl || '',
        image_url: `https://pygmalion.chat/chat/${char.id}`,
        tags: tags,
        description: char.description || '',
        desc_preview: char.description ? char.description.substring(0, 200) : '',
        desc_search: char.description || '',
        created_at: char.createdAt ? new Date(parseInt(char.createdAt) * 1000).toISOString() : null,
        updated_at: char.updatedAt ? new Date(parseInt(char.updatedAt) * 1000).toISOString() : null,
        approved_at: char.approvedAt ? new Date(parseInt(char.approvedAt) * 1000).toISOString() : null,
        possibleNsfw: false, // Determined by includeSensitive filter
        service: 'pygmalion',
        sourceService: 'pygmalion',
        isPygmalion: true,
        isLiveApi: true,
        // Stats
        stars: char.stars || 0,
        views: char.views || 0,
        downloads: char.downloads || 0,
        chatCount: char.chatCount || 0,
        tokenCount: char.personalityTokenCount || 0,
        // Source info
        source: char.source || '',
        versionId: char.versionId || '',
        // Alt images
        altAvatars: char.altAvatars || [],
        // Store for detail fetch
        _rawData: char
    };
}

/**
 * Transform full Pygmalion character for import
 * @param {Object} char - Full character data from Character endpoint
 * @returns {Object} Character data ready for import
 */
export function transformFullPygmalionCharacter(char) {
    const personality = char.personality || {};

    return {
        name: personality.name || char.displayName || 'Unnamed',
        description: personality.persona || char.description || '',
        personality: '',
        scenario: '',
        first_mes: personality.greeting || '',
        first_message: personality.greeting || '',
        mes_example: '',
        creator_notes: char.description || '',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        character_book: undefined,
        tags: char.tags || [],
        creator: personality.creator || char.owner?.displayName || char.owner?.username || 'Unknown',
        character_version: char.versionLabel || '1.0',
        avatar_url: char.avatarUrl || '',
        tokenCount: char.personalityTokenCount || 0,
        extensions: {
            pygmalion: {
                id: char.id,
                versionId: char.versionId,
                source: char.source,
                stars: char.stars,
                views: char.views,
                downloads: char.downloads,
                chatCount: char.chatCount
            }
        }
    };
}

// Pagination state for load more
export let pygmalionApiState = {
    page: 1,
    hasMore: true,
    isLoading: false,
    lastSort: PYGMALION_SORT_TYPES.NEWEST,
    lastSearch: '',
    totalItems: 0
};

export function resetPygmalionApiState() {
    pygmalionApiState = {
        page: 1,
        hasMore: true,
        isLoading: false,
        lastSort: PYGMALION_SORT_TYPES.NEWEST,
        lastSearch: '',
        totalItems: 0
    };
}

/**
 * Load more Pygmalion characters (pagination)
 * @param {Object} options - Options to maintain search/filter state
 * @returns {Promise<Array>} Additional characters
 */
export async function loadMorePygmalionCharacters(options = {}) {
    if (pygmalionApiState.isLoading || !pygmalionApiState.hasMore) {
        return [];
    }

    pygmalionApiState.isLoading = true;

    try {
        pygmalionApiState.page++;

        const result = await searchPygmalionCharacters({
            query: options.search || pygmalionApiState.lastSearch,
            orderBy: options.orderBy || pygmalionApiState.lastSort,
            page: pygmalionApiState.page,
            includeSensitive: options.includeSensitive !== false
        });

        pygmalionApiState.hasMore = result.hasMore;
        pygmalionApiState.totalItems = result.totalItems;

        return result.characters.map(transformPygmalionCard);
    } finally {
        pygmalionApiState.isLoading = false;
    }
}

/**
 * Browse Pygmalion characters with specific sort
 * @param {Object} options - Browse options
 * @returns {Promise<Object>} Characters and pagination info
 */
export async function browsePygmalionCharacters(options = {}) {
    const {
        orderBy = PYGMALION_SORT_TYPES.NEWEST,
        includeSensitive = true,
        page = 1
    } = options;

    // Reset state for new browse
    resetPygmalionApiState();
    pygmalionApiState.lastSort = orderBy;
    pygmalionApiState.page = page;

    const result = await searchPygmalionCharacters({
        orderBy,
        includeSensitive,
        page
    });

    pygmalionApiState.hasMore = result.hasMore;
    pygmalionApiState.totalItems = result.totalItems;

    return {
        characters: result.characters.map(transformPygmalionCard),
        totalItems: result.totalItems,
        hasMore: result.hasMore
    };
}
