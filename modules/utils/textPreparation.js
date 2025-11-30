import { escapeHTML, safeString, safeKeywords } from './utils.js';

export function escapeCardTextFields(fullCard, tags, alternateGreetings, exampleMessages) {
    return {
        cardName: escapeHTML(fullCard.name),
        cardCreator: escapeHTML(fullCard.creator || ''),
        websiteDesc: escapeHTML(fullCard.website_description || ''),
        description: escapeHTML(fullCard.description || ''),
        descPreview: escapeHTML(fullCard.desc_preview || ''),
        personality: escapeHTML(fullCard.personality || ''),
        scenario: escapeHTML(fullCard.scenario || ''),
        firstMessage: escapeHTML(fullCard.first_message || ''),
        exampleMsg: escapeHTML(exampleMessages),
        tags: tags.map(tag => escapeHTML(tag)),
        creator: escapeHTML(fullCard.creator || ''),
        alternateGreetings: alternateGreetings.map(greeting => escapeHTML(greeting)),
    };
}

export function processLorebookEntries(entries) {
    if (!entries || typeof entries !== 'object') {
        return null;
    }

    if (Array.isArray(entries)) {
        return entries.map((entry, index) => ({
            name: escapeHTML(safeString(entry.name) || `Entry ${index}`),
            keywords: safeKeywords(entry.keys || entry.keywords).map(kw => escapeHTML(kw)),
            content: escapeHTML(safeString(entry.content || entry.description))
        }));
    }

    return Object.entries(entries).map(([key, entry]) => ({
        name: escapeHTML(safeString(entry.name || entry.comment) || `Entry ${key}`),
        keywords: safeKeywords(entry.keys || entry.keywords || entry.key).map(kw => escapeHTML(kw)),
        content: escapeHTML(safeString(entry.content || entry.description))
    }));
}
