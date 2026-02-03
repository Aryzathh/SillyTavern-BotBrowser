const CHUB_API_BASE = 'https://api.chub.ai';
import { proxiedFetch } from './corsProxy.js';

const DEBUG = typeof window !== 'undefined' && window.__BOT_BROWSER_DEBUG === true;

function getChubAuthHeaders() {
    try {
        if (typeof window === 'undefined') return {};
        const map = window.__BOT_BROWSER_AUTH_HEADERS;
        const headers = map?.chub;
        if (!headers || typeof headers !== 'object') return {};
        return { ...headers };
    } catch {
        return {};
    }
}

/**
 * Search Chub cards using the live API (no authentication required)
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with nodes array
 */
export async function searchChubCards(options = {}) {
    const params = new URLSearchParams({
        search: options.search || '',
        first: String(options.limit || 200),
        page: String(options.page || 1),
        sort: options.sort || 'download_count',
        asc: String(options.asc ?? false),
        nsfw: String(options.nsfw ?? true),
        nsfl: String(options.nsfl ?? true),
    });

    if (options.namespace) {
        params.append('namespace', options.namespace);
    }

    if (options.myFavorites) {
        params.append('my_favorites', 'true');
    }

    if (options.specialMode) {
        params.append('special_mode', String(options.specialMode));
    }

    // Tag filters
    if (options.tags) {
        params.append('tags', options.tags);
    }
    if (options.excludeTags) {
        params.append('exclude_tags', options.excludeTags);
    }

    // Advanced filters
    if (options.minTokens) params.append('min_tokens', String(options.minTokens));
    if (options.maxTokens) params.append('max_tokens', String(options.maxTokens));
    if (options.username) params.append('username', options.username);
    if (options.maxDaysAgo) params.append('max_days_ago', String(options.maxDaysAgo));
    if (options.minAiRating) params.append('min_ai_rating', String(options.minAiRating));
    if (options.requireExamples) params.append('require_example_dialogues', 'true');
    if (options.requireLore) params.append('require_lore', 'true');
    if (options.requireGreetings) params.append('require_alternate_greetings', 'true');

    const response = await proxiedFetch(`${CHUB_API_BASE}/search?${params}`, {
        service: 'chub',
        fetchOptions: {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                ...getChubAuthHeaders(),
            },
        },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Chub API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    if (DEBUG) console.log('[Bot Browser] Chub API response data:', data);
    return data;
}

/**
 * Get full character data from Chub Gateway API
 * @param {string} fullPath - Character path (e.g., "username/character-name")
 * @returns {Promise<Object>} Full character data
 */
export async function getChubCharacter(fullPath) {
    // Use the gateway API which has the full definition data
    // Add cache-busting parameter to always get the latest version
    const nocache = Math.random().toString().substring(2);
    const response = await proxiedFetch(`https://gateway.chub.ai/api/characters/${fullPath}?full=true&nocache=${nocache}`, {
        service: 'chub_gateway',
        fetchOptions: {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache',
                ...getChubAuthHeaders(),
            },
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch character ${fullPath}: ${response.status}`);
    }

    const data = await response.json();
    if (DEBUG) console.log('[Bot Browser] Gateway API response for', fullPath, data);
    return data;
}

/**
 * Transform Chub API search result node to BotBrowser card format
 * @param {Object} node - Chub API node object
 * @returns {Object} Card in BotBrowser format
 */
export function transformChubCard(node) {
    const fullPath = node.fullPath || `${node.name}`;
    const creator = fullPath.includes('/') ? fullPath.split('/')[0] : 'Unknown';

    // Check for NSFW - API uses nsfw_image field, also check topics for "NSFW" tag
    const hasNsfwTag = (node.topics || []).some(t => t.toLowerCase() === 'nsfw');
    const isNsfw = node.nsfw_image || node.nsfw || hasNsfwTag;

    return {
        id: fullPath,
        name: node.name || 'Unnamed',
        creator: creator,
        // avatar_url is the actual PNG card for importing
        avatar_url: `https://avatars.charhub.io/avatars/${fullPath}/chara_card_v2.png`,
        // image_url is the Chub page URL
        image_url: `https://chub.ai/characters/${fullPath}`,
        tags: node.topics || [],
        // tagline = website/page description (shown on Chub with images) - for Overview tab
        tagline: node.tagline || '',
        // desc_preview = short preview for card display
        desc_preview: node.tagline || '',
        desc_search: (node.tagline || '') + ' ' + (node.description || ''),
        created_at: node.createdAt,
        possibleNsfw: isNsfw,
        // Mark as live Chub card for special handling during import
        isLiveChub: true,
        fullPath: fullPath,
        service: 'chub',
        // Store additional metadata
        starCount: node.starCount || 0,
        downloadCount: node.nChats || 0,
        rating: node.rating || 0,
        ratingCount: node.ratingCount || 0,
        nTokens: node.nTokens || 0
    };
}

/**
 * Transform full character data for import
 * @param {Object} charData - Full character data from getChubCharacter (gateway API)
 * @returns {Object} Card data ready for import
 */
export function transformFullChubCharacter(charData) {
    const node = charData.node || charData;
    const def = node.definition || {};

    // CHUB FIELD MAPPING (matches Character Library):
    // Chub definition.personality → SillyTavern description (main AI character text)
    // Chub definition.description → SillyTavern creator_notes (website/page description)
    // Chub definition.first_message → SillyTavern first_mes
    // Chub definition.example_dialogs → SillyTavern mes_example
    // Chub definition.scenario → SillyTavern scenario
    // Chub node.tagline → Overview display (short website tagline)

    // Get related lorebooks (valid ones, excluding -1)
    const relatedLorebooks = (node.related_lorebooks || []).filter(id => id > 0);

    // Character name
    const cardName = def.name || node.name || 'Unknown';

    if (DEBUG) console.log('[Bot Browser] Chub field extraction:', {
        cardName,
        tagline: node.tagline?.substring(0, 100),
        personalityLength: (def.personality || '').length,
        descriptionLength: (def.description || '').length,
        firstMessageLength: (def.first_message || '').length,
        relatedLorebooks: relatedLorebooks,
        embeddedLorebook: !!(def.embedded_lorebook || node.embedded_lorebook)
    });

    return {
        name: cardName,
        // Chub's "personality" field is the main character description for AI
        description: def.personality || '',
        // ST personality field is empty (Chub doesn't use it this way)
        personality: '',
        scenario: def.scenario || '',
        first_message: def.first_message || '',
        first_mes: def.first_message || '',
        mes_example: def.example_dialogs || '',
        // Chub's "description" field is actually creator notes / page description
        creator_notes: def.description || node.description || '',
        system_prompt: def.system_prompt || '',
        post_history_instructions: def.post_history_instructions || '',
        alternate_greetings: def.alternate_greetings || [],
        // Include embedded lorebook if present and has entries
        character_book: (def.embedded_lorebook?.entries && Object.keys(def.embedded_lorebook.entries).length > 0)
            ? def.embedded_lorebook
            : undefined,
        // Include related lorebook IDs for fetching if no embedded lorebook
        related_lorebooks: relatedLorebooks.length > 0 ? relatedLorebooks : undefined,
        tags: node.topics || [],
        creator: node.fullPath?.split('/')[0] || 'Unknown',
        character_version: '',
        // Store tagline for Overview tab display (short website tagline)
        tagline: node.tagline || '',
        extensions: {
            chub: {
                full_path: node.fullPath,
                id: node.id
            }
        }
    };
}

/**
 * Convert SillyTavern World Info format to character_book format
 * @param {Object} worldInfo - World info data with entries as object
 * @param {string} name - Name for the character book
 * @returns {Object} Character book with entries as array
 */
export function convertWorldInfoToCharacterBook(worldInfo, name) {
    const entries = [];

    // Convert entries object to array
    if (worldInfo.entries && typeof worldInfo.entries === 'object') {
        for (const [key, entry] of Object.entries(worldInfo.entries)) {
            entries.push({
                id: entry.uid || parseInt(key) || entries.length,
                keys: entry.key || [],
                secondary_keys: entry.keysecondary || [],
                comment: entry.comment || entry.name || '',
                content: entry.content || '',
                constant: entry.constant || false,
                selective: entry.selective !== false,
                insertion_order: entry.order || entry.insertion_order || 100,
                enabled: entry.enabled !== false,
                position: entry.position || 'before_char',
                extensions: entry.extensions || {},
                priority: entry.priority || 10,
                name: entry.name || '',
                probability: entry.probability || 100,
                case_sensitive: entry.case_sensitive || false,
            });
        }
    }

    return {
        name: name || 'Imported Lorebook',
        entries: entries
    };
}

// ==================== LOREBOOKS API ====================

const CHUB_GATEWAY_BASE = 'https://gateway.chub.ai';

/**
 * Search Chub lorebooks using the Gateway API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with nodes array
 */
export async function searchChubLorebooks(options = {}) {
    const params = new URLSearchParams({
        search: options.search || '',
        first: String(options.limit || 48),
        page: String(options.page || 1),
        namespace: 'lorebooks',
        include_forks: 'true',
        nsfw: String(options.nsfw ?? true),
        nsfw_only: 'false',
        nsfl: String(options.nsfl ?? true),
        asc: String(options.asc ?? false),
        sort: options.sort || 'star_count',
        count: 'false'
    });

    // Tag filters
    if (options.tags) {
        params.append('topics', options.tags);
    }
    if (options.excludeTags) {
        params.append('excludetopics', options.excludeTags);
    }

    // Username filter
    if (options.username) {
        params.append('username', options.username);
    }

    console.log('[Bot Browser] Fetching Chub lorebooks:', `${CHUB_GATEWAY_BASE}/search?${params}`);

    const response = await proxiedFetch(`${CHUB_GATEWAY_BASE}/search?${params}`, {
        service: 'chub_gateway',
        fetchOptions: {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                ...getChubAuthHeaders(),
            },
        },
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Chub Lorebooks API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('[Bot Browser] Chub Lorebooks API response:', data);
    return data;
}

/**
 * Get full lorebook data from Chub Gateway repository API
 * @param {string|number} nodeId - The lorebook node ID
 * @returns {Promise<Object|null>} Full lorebook data or null if unavailable
 */
export async function getChubLorebook(nodeId) {
    const nocache = Math.random().toString().substring(2);
    const repoUrl = `${CHUB_GATEWAY_BASE}/api/v4/projects/${nodeId}/repository/files/raw%252Fsillytavern_raw.json/raw?ref=main&response_type=blob&nocache=0.${nocache}`;

    try {
        const response = await proxiedFetch(repoUrl, {
            service: 'chub_gateway',
            fetchOptions: {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    ...getChubAuthHeaders(),
                },
            },
        });

        // 404 or 500 means private/deleted/not processed
        if (response.status === 404 || response.status === 500) {
            return null;
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch lorebook ${nodeId}: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.warn('[Bot Browser] Lorebook fetch error:', nodeId);
        throw error;
    }
}

/**
 * Transform Chub lorebook search result node to BotBrowser card format
 * @param {Object} node - Chub API lorebook node object
 * @returns {Object} Card in BotBrowser format
 */
export function transformChubLorebook(node) {
    let fullPath = node.fullPath || `${node.name}`;

    // Strip "lorebooks/" prefix if present (API sometimes includes it)
    if (fullPath.startsWith('lorebooks/')) {
        fullPath = fullPath.substring('lorebooks/'.length);
    }

    // Extract creator from full_path (format: creator/name)
    let creator = 'Unknown';
    if (fullPath) {
        const parts = fullPath.split('/');
        if (parts.length >= 2) {
            creator = parts[0];
        }
    }

    // Check for NSFW
    const hasNsfwTag = (node.topics || []).some(t => t.toLowerCase() === 'nsfw');
    const isNsfw = node.nsfw || hasNsfwTag;

    return {
        id: `https://chub.ai/lorebooks/${fullPath}`,
        name: node.name || 'Unnamed Lorebook',
        creator: creator,
        avatar_url: `https://avatars.charhub.io/avatars/lorebooks/${fullPath}/avatar.webp`,
        image_url: `https://chub.ai/lorebooks/${fullPath}`,
        tags: node.topics || [],
        description: node.tagline || node.description || '',
        desc_preview: node.tagline || '',
        desc_search: (node.tagline || '') + ' ' + (node.description || ''),
        created_at: node.createdAt,
        possibleNsfw: isNsfw,
        // Mark as live Chub lorebook for special handling
        isLiveChub: true,
        isLorebook: true,
        fullPath: fullPath,
        nodeId: node.id,
        service: 'chub_lorebooks',
        // Store additional metadata
        starCount: node.starCount || 0,
        downloadCount: node.nChats || 0
    };
}
