import { logger } from './logger.js';
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function decodeUTF8(text) {
    if (!text) return '';
    try {
        if (text.includes('\\x')) {
            text = text.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
                return String.fromCharCode(parseInt(hex, 16));
            });
        }
        return decodeURIComponent(escape(text));
    } catch (e) {
        return text;
    }
}

export function escapeHTML(text) {
    if (!text) return '';
    text = decodeUTF8(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Safely sanitizes HTML content to prevent XSS.
 * Tries to use DOMPurify if available globally (SillyTavern environment),
 * otherwise falls back to a restrictive regex-based sanitizer.
 */
export function safeHTML(htmlContent) {
    if (!htmlContent) return '';
    
    // Check if DOMPurify is available globally (SillyTavern imports it)
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(htmlContent, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'hr', 'div', 'span', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'button', 'i', 'label', 'input'],
            ALLOWED_ATTR: ['href', 'target', 'class', 'id', 'src', 'alt', 'title', 'data-action', 'data-url', 'data-id', 'style', 'type', 'checked']
        });
    }

    // Fallback: Remove script tags and on* attributes if DOMPurify isn't loaded
    logger.warn('DOMPurify not found, using fallback HTML sanitization.');
    let sanitized = String(htmlContent);
    // Remove <script> tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Remove inline event handlers (onerror, onclick, etc)
    sanitized = sanitized.replace(/ on\w+="[^"]*"/g, '').replace(/ on\w+='[^']*'/g, '').replace(/ on\w+=\w+/g, '');
    // Remove javascript: links
    sanitized = sanitized.replace(/href="javascript:[^"]*"/gi, 'href="#"').replace(/href='javascript:[^']*'/gi, 'href="#"');
    
    return sanitized;
}

const FORBIDDEN_URL_SCHEMES = /^\s*(javascript|data|vbscript|file|blob):/i;

export function sanitizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let trimmed = url.trim();

    // Reject dangerous schemes (XSS / local file access)
    if (FORBIDDEN_URL_SCHEMES.test(trimmed)) return '';

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Strip any existing CORS proxy wrappers to get the original URL
        if (trimmed.includes('corsproxy.io/?url=')) {
            const match = trimmed.match(/corsproxy\.io\/\?url=(.+)/);
            if (match) {
                try {
                    trimmed = decodeURIComponent(match[1]);
                } catch {
                    return '';
                }
            }
        } else if (trimmed.includes('corsproxy.io/?')) {
            const afterProxy = trimmed.split('corsproxy.io/?')[1];
            if (afterProxy) {
                trimmed = afterProxy.replace(/^url=/, '');
            }
        } else if (trimmed.includes('cors.workers.dev/?')) {
            const afterProxy = trimmed.split('cors.workers.dev/?')[1];
            if (afterProxy) {
                trimmed = afterProxy;
            }
        }
        // Re-validate after decoding: only allow http(s)
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return '';
        if (FORBIDDEN_URL_SCHEMES.test(trimmed)) return '';
        return escapeHTML(trimmed);
    }
    return '';
}

export function safeString(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
}

export function safeKeywords(kw) {
    if (!kw) return [];
    if (typeof kw === 'string') return [kw];
    if (Array.isArray(kw)) return kw.map(k => safeString(k));
    return [];
}

export function extractCardProperties(fullCard) {
    const tags = fullCard.tags || [];
    const alternateGreetings = fullCard.alternate_greetings || [];
    const exampleMessages = fullCard.example_messages || fullCard.mes_example || '';

    let imageUrl = fullCard.avatar_url || fullCard.image_url || '';
    if (imageUrl.includes('realm.risuai.net') && fullCard.avatar_url) {
        imageUrl = fullCard.avatar_url;
    }

    return {
        imageUrl,
        tags,
        alternateGreetings,
        exampleMessages,
        metadata: fullCard.metadata || null,
        id: fullCard.id || null,
        service: fullCard.service || null,
        possibleNsfw: fullCard.possibleNsfw || false
    };
}

export function getLorebookInfo(fullCard, isLorebook) {
    const entries = fullCard.entries || null;
    const entriesCount = isLorebook && entries ? Object.keys(entries).length : 0;
    return { entries, entriesCount };
}

/**
 * Get the source website URL for a card based on its service/source
 * Returns null for archive sources or if URL cannot be determined
 * @param {Object} card - The card object
 * @returns {{url: string, serviceName: string}|null} - URL and display name, or null
 */
export function getSourceUrl(card) {
    if (!card) return null;

    // Check service flags and construct appropriate URL
    const service = card.service || card.sourceService || '';
    const isLorebook = card.isLorebook || false;

    // Character Tavern - check BEFORE Chub (CT cards may have fullPath with /)
    if (card.isCharacterTavern || service === 'character_tavern' || service.includes('character_tavern')) {
        const path = card.path || card.fullPath || card.id;
        if (path) {
            return { url: `https://character-tavern.com/character/${path}`, serviceName: 'Character Tavern' };
        }
    }

    // JannyAI
    if (card.isJannyAI || service === 'jannyai' || service.includes('jannyai')) {
        if (card.id && card.slug) {
            return { url: `https://jannyai.com/characters/${card.id}_${card.slug}`, serviceName: 'JannyAI' };
        }
    }

    // Backyard
    if (card.isBackyard || service === 'backyard' || service.includes('backyard')) {
        if (card.id) {
            return { url: `https://backyard.ai/hub/character/${card.id}`, serviceName: 'Backyard' };
        }
    }

    // Pygmalion
    if (card.isPygmalion || service === 'pygmalion' || service.includes('pygmalion')) {
        if (card.id) {
            return { url: `https://pygmalion.chat/character/${card.id}`, serviceName: 'Pygmalion' };
        }
    }

    // RisuRealm
    if (card.isRisuRealm || service === 'risuai_realm' || service.includes('risuai_realm')) {
        if (card.id) {
            return { url: `https://realm.risuai.net/character/${card.id}`, serviceName: 'RisuRealm' };
        }
    }

    // Wyvern
    if (card.isWyvern || service === 'wyvern' || service.includes('wyvern')) {
        // Wyvern uses _id for the character ID
        const wyvernId = card._id || card.id;
        if (wyvernId && !isLorebook) {
            return { url: `https://app.wyvern.chat/characters/${wyvernId}`, serviceName: 'Wyvern' };
        }
    }

    // Chub - check last since fullPath check is broad
    if (card.isLiveChub || service === 'chub') {
        const fullPath = card.fullPath || card.id;
        if (fullPath && typeof fullPath === 'string' && fullPath.includes('/')) {
            const baseUrl = isLorebook ? 'https://chub.ai/lorebooks/' : 'https://chub.ai/characters/';
            return { url: baseUrl + fullPath, serviceName: 'Chub' };
        }
    }

    // No valid source URL found (archive sources, local imports, etc.)
    return null;
}
