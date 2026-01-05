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

export function sanitizeImageUrl(url) {
    if (!url) return '';
    let trimmed = url.trim();

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        // Strip any existing CORS proxy wrappers to get the original URL
        // Then let the image loader handle CORS issues with its proxy chain
        if (trimmed.includes('corsproxy.io/?url=')) {
            const match = trimmed.match(/corsproxy\.io\/\?url=(.+)/);
            if (match) {
                trimmed = decodeURIComponent(match[1]);
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
