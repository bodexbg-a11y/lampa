'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const TPDB_API_BASE = String(process.env.TPDB_API_BASE || 'https://api.theporndb.net').replace(/\/$/, '');
const TPDB_API_TOKEN = String(process.env.TPDB_API_TOKEN || '');
const PEERTUBE_BASE = String(process.env.PEERTUBE_BASE || 'https://peertube.boooks.lol').replace(/\/$/, '');
const ARCHIVE_BASE = 'https://archive.org';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 200;
const RATE_LIMIT = 90;
const cache = new Map();
const rates = new Map();
const PLUGIN_FILE = path.join(__dirname, 'adult-core.js');

function json(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': status === 200 ? 'public, max-age=120' : 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(payload);
}

function javascript(res) {
    let payload;
    try {
        payload = fs.readFileSync(PLUGIN_FILE);
    } catch (error) {
        return json(res, 500, { error: 'Plugin file is unavailable' });
    }
    res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': payload.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(payload);
}

function clientIp(req) {
    return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function allowed(req) {
    const key = clientIp(req);
    const now = Date.now();
    const current = rates.get(key);
    if (!current || now - current.started > 60000) {
        rates.set(key, { started: now, count: 1 });
        return true;
    }
    current.count += 1;
    return current.count <= RATE_LIMIT;
}

function cleanText(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function cleanPage(value) {
    const page = Number.parseInt(value || '1', 10);
    return Number.isFinite(page) ? Math.max(1, Math.min(page, 5000)) : 1;
}

function cleanYear(value) {
    const year = Number.parseInt(value || '', 10);
    const maximum = new Date().getUTCFullYear() + 1;
    return Number.isFinite(year) && year >= 1900 && year <= maximum ? String(year) : '';
}

function normalized(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9а-яё]+/gi, ' ')
        .trim();
}

function matchScore(title, query) {
    const candidate = normalized(title);
    const wanted = normalized(query);
    if (!candidate || !wanted) return 0;
    if (candidate === wanted) return 1000;
    if (candidate.includes(wanted) || wanted.includes(candidate)) return 600;
    const words = wanted.split(' ').filter((word) => word.length > 2);
    if (!words.length) return 0;
    const matched = words.filter((word) => candidate.includes(word)).length;
    return Math.round(matched / words.length * 500);
}

function relevantTitle(title, query) {
    const candidate = normalized(title);
    const wanted = normalized(query);
    if (!candidate || !wanted) return false;
    if (candidate.includes(wanted) || wanted.includes(candidate)) return true;
    const words = wanted.split(' ').filter((word) => word.length > 2);
    if (!words.length) return false;
    const matched = words.filter((word) => candidate.includes(word)).length;
    if (words.length <= 2) return matched === words.length;
    return matched >= 2 && matched / words.length >= 0.4;
}

function imageUrl(item) {
    if (typeof item.poster === 'string' && item.poster) return item.poster;
    if (typeof item.image === 'string' && item.image) return item.image;
    if (item.background && typeof item.background === 'object') {
        return item.background.medium || item.background.large || item.background.full || '';
    }
    return '';
}

function backgroundUrl(item) {
    if (item.background && typeof item.background === 'object') {
        return item.background.large || item.background.full || item.background.medium || '';
    }
    return typeof item.back_image === 'string' ? item.back_image : imageUrl(item);
}

function mapMovie(item) {
    const date = cleanText(item.date, 10);
    const sources = [];
    const seenSources = new Set();

    function addSource(title, url, kind) {
        if (!/^https?:\/\//i.test(url || '') || seenSources.has(url)) return;
        seenSources.add(url);
        sources.push({ title: cleanText(title, 160), url, kind });
    }

    addSource('Официальная страница' + (item.site && item.site.name ? ' — ' + item.site.name : ''), item.url, 'page');
    addSource('Официальное превью', item.trailer, 'preview');
    (Array.isArray(item.links) ? item.links : []).forEach((link, index) => {
        if (typeof link === 'string') addSource(`Дополнительная ссылка ${index + 1}`, link, 'page');
        else if (link && typeof link === 'object') {
            addSource(link.title || link.name || `Дополнительная ссылка ${index + 1}`, link.url || link.href, 'page');
        }
    });

    return {
        id: cleanText(item.id || item._id, 100),
        title: cleanText(item.title, 300) || 'Без названия',
        date,
        year: /^\d{4}/.test(date) ? date.slice(0, 4) : '',
        description: cleanText(item.description, 4000),
        poster: imageUrl(item),
        background: backgroundUrl(item),
        rating: Number(item.rating || 0),
        duration: Number(item.duration || 0),
        studio: cleanText(item.site && item.site.name, 200),
        directors: Array.isArray(item.directors) ? item.directors.slice(0, 20).map((director) => cleanText(director.name, 150)).filter(Boolean) : [],
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 50).map((tag) => cleanText(tag.name, 100)).filter(Boolean) : [],
        performers: Array.isArray(item.performers) ? item.performers.slice(0, 50).map((person) => cleanText(person.name, 150)).filter(Boolean) : [],
        source_url: /^https?:\/\//i.test(item.url || '') ? item.url : '',
        preview_url: /^https?:\/\//i.test(item.trailer || '') ? item.trailer : '',
        sources
    };
}

async function tpdb(path) {
    if (!TPDB_API_TOKEN) throw new Error('TPDB_API_TOKEN is not configured');
    const cached = cache.get(path);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return cached.value;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(TPDB_API_BASE + path, {
            headers: {
                Authorization: `Bearer ${TPDB_API_TOKEN}`,
                Accept: 'application/json',
                'User-Agent': 'LampaAdultCatalog/1.0'
            },
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) throw new Error(`ThePornDB returned HTTP ${response.status}`);
    const value = await response.json();
    cache.set(path, { time: Date.now(), value });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return value;
}

async function movies(url, res) {
    const page = cleanPage(url.searchParams.get('page'));
    const year = cleanYear(url.searchParams.get('year'));
    const query = cleanText(url.searchParams.get('q'), 120);
    const mode = cleanText(url.searchParams.get('mode'), 20);
    const fallback = cleanText(url.searchParams.get('fallback'), 20);
    const genre = cleanText(url.searchParams.get('genre'), 30).toLowerCase();
    const validGenre = Object.prototype.hasOwnProperty.call(PEERTUBE_GENRES, genre) ? genre : '';
    const params = new URLSearchParams({ page: String(page), limit: '40' });
    if (year) params.set('year', year);
    if (query) params.set('parse', query);

    const upstream = await tpdb(`/movies?${params.toString()}`);
    let results = (Array.isArray(upstream.data) ? upstream.data : []).map(mapMovie);
    results.forEach((item) => {
        item.genres = peerTubeGenres({ name: item.title, description: item.description }, item.year, item.tags);
        item.catalog_type = 'tpdb';
    });
    if (year) results = results.filter((item) => !item.year || item.year === year);
    if (validGenre) results = results.filter((item) => item.genres.includes(validGenre));
    if (mode === 'rating') results.sort((a, b) => b.rating - a.rating);
    if (mode === 'new') results.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    json(res, 200, {
        results,
        page: upstream.meta && upstream.meta.current_page || page,
        total_pages: upstream.meta && upstream.meta.last_page || 1,
        total: validGenre ? results.length : (upstream.meta && upstream.meta.total || results.length),
        fallback: fallback === 'peertube' || fallback === 'archive' ? 'tpdb' : ''
    });
}

async function movie(url, res) {
    const id = cleanText(url.searchParams.get('id'), 100);
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return json(res, 400, { error: 'Invalid id' });
    const upstream = await tpdb(`/movies/${encodeURIComponent(id)}`);
    const item = upstream && upstream.data;
    if (!item) return json(res, 404, { error: 'Not found' });
    json(res, 200, { result: mapMovie(item) });
}

function decodeHtml(value) {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    let decoded = String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
        if (code[0] === '#') {
            const hex = code[1].toLowerCase() === 'x';
            const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
            return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
        }
        return named[code.toLowerCase()] || entity;
    });
    if (/[ÃÂ]/.test(decoded)) {
        try { decoded = Buffer.from(decoded, 'latin1').toString('utf8'); } catch (error) {}
    }
    return decoded;
}

function parseNextFlightStrings(html) {
    const chunks = [];
    const pattern = /<script>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
    let match;
    while ((match = pattern.exec(html))) {
        try {
            const payload = JSON.parse(match[1]);
            if (typeof payload[1] === 'string') chunks.push(payload[1]);
        } catch (error) {}
    }
    return chunks.join('\n');
}

function parseScatgoonVideos(html, latestOnly) {
    let flight = parseNextFlightStrings(html);
    if (latestOnly) {
        const marker = flight.indexOf('Latest Videos');
        if (marker >= 0) flight = flight.slice(marker);
    }

    const objectPattern = /\{"id":\d+,"slug":"(?:\\.|[^"])*","title":"(?:\\.|[^"])*","thumbnailPath":"(?:\\.|[^"])*","durationSeconds":\d+,"creators":\[(?:\\.|[^\]])*\],"categories":\[(?:\\.|[^\]])*\]\}/g;
    const seen = new Set();
    const results = [];
    let match;
    while ((match = objectPattern.exec(flight))) {
        let item;
        try { item = JSON.parse(match[0]); } catch (error) { continue; }
        const id = cleanText(item.id, 30);
        const slug = cleanText(item.slug, 240);
        if (!id || !slug || seen.has(id)) continue;
        seen.add(id);
        const creators = Array.isArray(item.creators) ? item.creators.map((name) => cleanText(name, 150)).filter(Boolean) : [];
        const categories = Array.isArray(item.categories) ? item.categories.map((name) => cleanText(name, 100)).filter(Boolean) : [];
        const duration = Number(item.durationSeconds || 0);
        results.push({
            id: `sg-${id}`,
            title: cleanText(item.title, 300) || 'Без названия',
            date: '',
            year: '',
            description: [
                creators.length ? `Автор: ${creators.join(', ')}` : '',
                categories.length ? `Категории: ${categories.join(', ')}` : '',
                duration ? `Продолжительность: ${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}` : '',
                'Воспроизведение пока не подключено.'
            ].filter(Boolean).join('\n'),
            poster: new URL(cleanText(item.thumbnailPath, 500), 'https://scatgoon.com').href,
            background: new URL(cleanText(item.thumbnailPath, 500), 'https://scatgoon.com').href,
            rating: 0,
            duration,
            studio: 'ScatGoon',
            directors: [],
            tags: categories,
            performers: creators,
            source_url: `https://scatgoon.com/video/${encodeURIComponent(slug)}`,
            preview_url: '',
            sources: [],
            catalog_type: 'scatgoon'
        });
    }
    return results;
}

async function scatgoon(url, res) {
    const page = Math.max(1, Math.min(cleanPage(url.searchParams.get('page')), 100));
    const query = cleanText(url.searchParams.get('q'), 120);
    const target = query
        ? new URL(`https://scatgoon.com/search?q=${encodeURIComponent(query)}`)
        : new URL(`https://scatgoon.com/?latestPage=${page}`);
    const cacheKey = `scatgoon:v1:${page}:${query}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);

    const response = await fetchPage(target);
    const html = (await response.text()).slice(0, 3000000);
    const results = parseScatgoonVideos(html, !query);
    const payload = { results, page, total_pages: results.length ? page + 1 : page, total: results.length };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

function peerTubeImage(value) {
    const path = cleanText(value, 600);
    if (!path) return '';
    try { return new URL(path, PEERTUBE_BASE).href; } catch (error) { return ''; }
}

const PEERTUBE_GENRES = {
    classic: ['classic', 'vintage', 'retro'],
    comedy: ['comedy', 'comic', 'funny', 'satire'],
    drama: ['drama', 'dramatic'],
    thriller: ['thriller', 'crime', 'detective', 'murder', 'mystery'],
    horror: ['horror', 'supernatural', 'vampire', 'satan', 'occult'],
    adventure: ['adventure', 'pirate', 'fantasy', 'historical'],
    documentary: ['documentary', 'interview', 'behind the scenes'],
    lesbian: ['lesbian', 'girl girl', 'sapphic'],
    gay: ['gay', 'male male'],
    bdsm: ['bdsm', 'bondage', 'dominatrix', 'fetish'],
    parody: ['parody', 'spoof']
};

function peerTubeMovieYear(item) {
    const title = cleanText(item.name || item.title, 300);
    const description = cleanText(item.description || item.truncatedDescription, 4000);
    const titleMatch = title.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
    if (titleMatch) return titleMatch[1];
    const descriptionMatch = description.slice(0, 500).match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
    return descriptionMatch ? descriptionMatch[1] : '';
}

function peerTubeGenres(item, year, tags) {
    const haystack = normalized([
        item.name,
        item.title,
        item.description,
        item.truncatedDescription,
        ...(tags || [])
    ].filter(Boolean).join(' '));
    const genres = [];
    if (year && Number(year) < 2000) genres.push('classic');
    Object.keys(PEERTUBE_GENRES).forEach((genre) => {
        if (genre === 'classic' && genres.includes(genre)) return;
        if (PEERTUBE_GENRES[genre].some((term) => haystack.includes(normalized(term)))) genres.push(genre);
    });
    return genres;
}

function archiveId(identifier) {
    return `ia-${Buffer.from(String(identifier || ''), 'utf8').toString('base64url')}`;
}

function archiveIdentifier(id) {
    const value = cleanText(id, 500).replace(/^ia-/, '');
    if (!/^[a-zA-Z0-9_-]{2,400}$/.test(value)) return '';
    try {
        const decoded = Buffer.from(value, 'base64url').toString('utf8');
        return /^[^/\\\u0000-\u001f]{1,200}$/.test(decoded) ? decoded : '';
    } catch (error) {
        return '';
    }
}

function archiveValues(value) {
    return (Array.isArray(value) ? value : [value]).map((item) => cleanText(item, 300)).filter(Boolean);
}

function archiveText(value, max) {
    return cleanText((Array.isArray(value) ? value.join(' ') : value), max)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function archiveYear(item) {
    const explicit = cleanYear(Array.isArray(item.year) ? item.year[0] : item.year);
    if (explicit) return explicit;
    const date = archiveText(item.date, 40);
    const match = date.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/);
    return match ? match[1] : '';
}

function archiveRuntime(value) {
    const text = archiveText(value, 80).toLowerCase().replace(/[.,]/g, ' ');
    if (!text) return 0;
    const words = text.match(/(?:(\d+)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?\s*(?:(\d+)\s*(?:s|sec|secs|second|seconds))?/i);
    if (words && (words[1] || words[2] || words[3])) {
        return Number(words[1] || 0) * 3600 + Number(words[2] || 0) * 60 + Number(words[3] || 0);
    }
    const parts = text.split(':').map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
    if (parts.length === 3 && parts.every(Number.isFinite)) {
        // Some Archive encoders store MM:SS:frames instead of HH:MM:SS.
        return parts[0] >= 10 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return Number.isFinite(Number(text)) ? Math.round(Number(text)) : 0;
}

function archiveDurationGroup(item, duration) {
    const tags = archiveValues(item.subject);
    const haystack = normalized([item.title, item.description, ...tags].filter(Boolean).join(' '));
    if (/(^| )(collection|compilation|anthology|complete series|film pack)( |$)/.test(haystack)) return 'collection';
    if (/(^| )(amateur|homemade|home video|home movie|webcam|camgirl|user generated)( |$)/.test(haystack)) return 'amateur';
    if (duration > 0) {
        if (duration < 20 * 60) return 'short';
        if (duration < 60 * 60) return 'medium';
        return 'feature';
    }
    if (/(^| )(adult film|erotic film|feature film|full movie)( |$)/.test(haystack)) return 'feature';
    const size = Number(item.item_size || 0);
    if (size > 0 && size < 200000000) return 'short';
    if (size > 0 && size < 800000000) return 'medium';
    return 'feature';
}

function mapArchiveItem(item) {
    const identifier = cleanText(item.identifier, 200);
    const year = archiveYear(item);
    const tags = archiveValues(item.subject).slice(0, 50);
    const creators = archiveValues(item.creator).slice(0, 20);
    const image = `${ARCHIVE_BASE}/services/img/${encodeURIComponent(identifier)}`;
    const duration = archiveRuntime(item.runtime);
    const durationGroup = archiveDurationGroup(item, duration);
    return {
        id: archiveId(identifier),
        archive_identifier: identifier,
        title: archiveText(item.title, 300) || 'Без названия',
        date: year ? `${year}-01-01` : archiveText(item.date, 10),
        year,
        description: archiveText(item.description, 4000),
        poster: image,
        background: image,
        rating: 0,
        duration,
        duration_group: durationGroup,
        duration_estimated: !duration,
        studio: creators[0] || 'Internet Archive',
        directors: creators,
        tags,
        genres: peerTubeGenres({ title: item.title, description: item.description }, year, tags),
        performers: [],
        source_url: `${ARCHIVE_BASE}/details/${encodeURIComponent(identifier)}`,
        preview_url: '',
        sources: [],
        catalog_type: 'archive'
    };
}

function archivePhrase(value) {
    const safe = cleanText(value, 120).replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
    return safe ? `"${safe}"` : '';
}

function archiveQuery(query, year, genre, duration) {
    const clauses = [
        'mediatype:movies',
        'format:MPEG4',
        '(subject:erotic OR subject:erotica OR subject:"adult film" OR subject:"adult films" OR subject:pornography)'
    ];
    const phrase = archivePhrase(query);
    if (phrase) clauses.push(`(title:${phrase} OR description:${phrase} OR subject:${phrase})`);
    if (year) clauses.push(`year:${year}`);
    if (genre && PEERTUBE_GENRES[genre]) {
        clauses.push(`subject:(${PEERTUBE_GENRES[genre].map(archivePhrase).filter(Boolean).join(' OR ')})`);
    }
    if (duration === 'amateur') clauses.push('(subject:amateur OR subject:"amateur porn" OR subject:homemade OR subject:webcam)');
    if (duration === 'collection') clauses.push('(title:collection OR title:compilation OR title:anthology OR title:"complete series")');
    if (duration === 'short') clauses.push('(item_size:[0 TO 199999999] OR runtime:[* TO *] OR subject:"short film" OR subject:clip OR subject:scene)');
    if (duration === 'medium') clauses.push('(item_size:[200000000 TO 799999999] OR runtime:[* TO *])');
    if (duration === 'feature') clauses.push('(item_size:[800000000 TO *] OR runtime:[* TO *] OR subject:"adult film" OR subject:"erotic film" OR title:"full movie")');
    return clauses.join(' AND ');
}

function archiveIsAdult(item) {
    const subjects = archiveValues(item.subject).map(normalized);
    const explicitTags = new Set([
        'porn', 'pornography', 'erotica', 'erotic', 'adult film', 'adult films',
        'erotic film', 'erotic films', 'vintage porn', 'vintage erotica'
    ]);
    if (!subjects.some((subject) => explicitTags.has(subject))) return false;
    const safetyText = normalized([item.title, item.description, ...subjects].filter(Boolean).join(' '));
    return !/(^| )(child|children|underage|minor|preteen|schoolgirl)( |$)/.test(safetyText);
}

async function archiveCatalog(url, res) {
    const page = Math.max(1, Math.min(cleanPage(url.searchParams.get('page')), 100));
    const query = cleanText(url.searchParams.get('q'), 120);
    const year = cleanYear(url.searchParams.get('year'));
    const genre = cleanText(url.searchParams.get('genre'), 30).toLowerCase();
    const validGenre = Object.prototype.hasOwnProperty.call(PEERTUBE_GENRES, genre) ? genre : '';
    const duration = cleanText(url.searchParams.get('duration'), 20).toLowerCase();
    const validDuration = ['short', 'medium', 'feature', 'amateur', 'collection'].includes(duration) ? duration : '';
    const sort = cleanText(url.searchParams.get('sort'), 20).toLowerCase();
    const validSort = ['popular', 'added', 'newest', 'oldest', 'title'].includes(sort) ? sort : 'popular';
    const sortFields = {
        popular: 'downloads desc',
        added: 'publicdate desc',
        newest: 'date desc',
        oldest: 'date asc',
        title: 'titleSorter asc'
    };
    const count = 60;
    const upstreamCount = 160;
    const target = new URL('/advancedsearch.php', ARCHIVE_BASE);
    target.searchParams.set('q', archiveQuery(query, year, validGenre, validDuration));
    ['identifier', 'title', 'description', 'date', 'year', 'subject', 'creator', 'downloads', 'runtime', 'item_size', 'publicdate'].forEach((field) => {
        target.searchParams.append('fl[]', field);
    });
    target.searchParams.set('rows', String(upstreamCount));
    target.searchParams.set('page', String(page));
    target.searchParams.append('sort[]', sortFields[validSort]);
    target.searchParams.set('output', 'json');

    const cacheKey = `archive:v2:${page}:${query}:${year}:${validGenre}:${validDuration}:${validSort}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    const docs = upstream && upstream.response && Array.isArray(upstream.response.docs) ? upstream.response.docs : [];
    let results = docs.filter((item) => item && item.identifier && archiveIsAdult(item)).map(mapArchiveItem);
    if (validDuration) results = results.filter((item) => item.duration_group === validDuration);
    results = results.slice(0, count);
    const total = Number(upstream && upstream.response && upstream.response.numFound || results.length);
    const payload = {
        results,
        page,
        total_pages: Math.max(1, Math.ceil(total / upstreamCount)),
        total,
        fallback: 'archive',
        duration_filter: validDuration,
        sort: validSort
    };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

function archiveFileUrl(identifier, name) {
    const filePath = String(name || '').split('/').map(encodeURIComponent).join('/');
    return `${ARCHIVE_BASE}/download/${encodeURIComponent(identifier)}/${filePath}`;
}

function archiveQuality(file) {
    const name = cleanText(file.name, 500);
    const explicit = name.match(/(?:^|[^0-9])(2160|1440|1080|720|576|540|480|360|240)p?(?:[^0-9]|$)/i);
    const height = Number(file.height || 0);
    const value = explicit ? explicit[1] : (height ? String(height) : '');
    return value ? `${value}p` : 'MP4';
}

function archiveDuration(value) {
    if (Number.isFinite(Number(value))) return Math.round(Number(value));
    const parts = String(value || '').split(':').map(Number);
    if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0;
    return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

async function archiveVideo(url, res) {
    const identifier = archiveIdentifier(url.searchParams.get('id'));
    if (!identifier) return json(res, 400, { error: 'Invalid Internet Archive id' });
    const cacheKey = `archive-video:v1:${identifier}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);
    const target = new URL(`/metadata/${encodeURIComponent(identifier)}`, ARCHIVE_BASE);
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    if (!upstream || !upstream.metadata || upstream.is_dark === true) return json(res, 404, { error: 'Video is unavailable' });

    const files = (Array.isArray(upstream.files) ? upstream.files : []).filter((file) => {
        const name = cleanText(file && file.name, 500);
        return file && file.private !== true && file.private !== 'true' && /\.mp4$/i.test(name) &&
            !/(sample|preview|thumb|trailer)/i.test(name) && Number(file.size || 0) > 1000000;
    }).sort((a, b) => {
        const original = (value) => value.source === 'original' ? 1 : 0;
        return original(b) - original(a) || Number(b.height || 0) - Number(a.height || 0) || Number(b.size || 0) - Number(a.size || 0);
    }).slice(0, 20);
    if (!files.length) return json(res, 404, { error: 'Direct MP4 is unavailable' });

    const metadata = upstream.metadata;
    const result = mapArchiveItem(metadata);
    result.archive_identifier = identifier;
    result.sources = files.map((file) => ({
        title: `Internet Archive MP4 — ${archiveQuality(file)}`,
        url: archiveFileUrl(identifier, file.name),
        kind: 'direct'
    }));
    result.duration = Math.max(0, ...files.map((file) => archiveDuration(file.length)));
    result.duration_group = archiveDurationGroup(metadata, result.duration);
    result.duration_estimated = false;
    const payload = { result };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

function mapPeerTubeVideo(item, detailed = false) {
    const uuid = cleanText(item.uuid || item.shortUUID, 80);
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => cleanText(tag, 100)).filter(Boolean) : [];
    const account = cleanText(item.account && (item.account.displayName || item.account.name), 150);
    const category = cleanText(item.category && item.category.label, 100);
    if (category && !tags.includes(category)) tags.push(category);
    const duration = Number(item.duration || 0);
    const published = cleanText(item.publishedAt || item.createdAt, 30);
    const year = peerTubeMovieYear(item);
    const genres = peerTubeGenres(item, year, tags);
    const sources = [];

    if (detailed) {
        (Array.isArray(item.streamingPlaylists) ? item.streamingPlaylists : []).forEach((playlist) => {
            const playlistUrl = cleanText(playlist.playlistUrl, 1000);
            if (/^https?:\/\/.*\.m3u8(?:[?#]|$)/i.test(playlistUrl)) {
                sources.push({ title: 'PeerTube HLS', url: playlistUrl, kind: 'direct' });
            }
            (Array.isArray(playlist.files) ? playlist.files : []).forEach((file) => {
                const fileUrl = cleanText(file.fileUrl, 1000);
                const label = cleanText(file.resolution && file.resolution.label, 40);
                if (label.toLowerCase().includes('audio')) return;
                if (/^https?:\/\/.*\.mp4(?:[?#]|$)/i.test(fileUrl)) {
                    sources.push({ title: `PeerTube MP4${label ? ` — ${label}` : ''}`, url: fileUrl, kind: 'direct' });
                }
            });
        });
        (Array.isArray(item.files) ? item.files : []).forEach((file) => {
            const fileUrl = cleanText(file.fileUrl, 1000);
            const label = cleanText(file.resolution && file.resolution.label, 40);
            if (label.toLowerCase().includes('audio')) return;
            if (/^https?:\/\/.*\.mp4(?:[?#]|$)/i.test(fileUrl)) {
                sources.push({ title: `PeerTube MP4${label ? ` — ${label}` : ''}`, url: fileUrl, kind: 'direct' });
            }
        });
    }

    return {
        id: `pt-${uuid}`,
        peer_uuid: uuid,
        title: cleanText(item.name || item.title, 300) || 'Без названия',
        date: year ? `${year}-01-01` : (/^\d{4}-\d{2}-\d{2}/.test(published) ? published.slice(0, 10) : ''),
        year,
        description: cleanText(item.description || item.truncatedDescription, 4000),
        poster: peerTubeImage(item.thumbnailPath || item.previewPath),
        background: peerTubeImage(item.previewPath || item.thumbnailPath),
        rating: 0,
        duration,
        studio: account || 'PeerTube',
        directors: [],
        tags: tags.slice(0, 30),
        genres,
        performers: account ? [account] : [],
        source_url: uuid ? `${PEERTUBE_BASE}/w/${encodeURIComponent(uuid)}` : '',
        preview_url: '',
        sources,
        catalog_type: 'peertube'
    };
}

async function peerTubeCatalog(url, res) {
    const page = Math.max(1, Math.min(cleanPage(url.searchParams.get('page')), 100));
    const query = cleanText(url.searchParams.get('q'), 120);
    const year = cleanYear(url.searchParams.get('year'));
    const genre = cleanText(url.searchParams.get('genre'), 30).toLowerCase();
    const validGenre = Object.prototype.hasOwnProperty.call(PEERTUBE_GENRES, genre) ? genre : '';
    const count = 24;
    const target = new URL(query ? '/api/v1/search/videos' : '/api/v1/videos', PEERTUBE_BASE);
    const locallyFiltered = Boolean(year || validGenre);
    target.searchParams.set('start', locallyFiltered ? '0' : String((page - 1) * count));
    target.searchParams.set('count', locallyFiltered ? '100' : String(count));
    target.searchParams.set('sort', '-publishedAt');
    target.searchParams.set('nsfw', 'true');
    target.searchParams.set('isLocal', 'true');
    target.searchParams.set('hasHLSFiles', 'true');
    if (query) target.searchParams.set('search', query);

    const cacheKey = `peertube:v2:${page}:${query}:${year}:${validGenre}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    let results = (Array.isArray(upstream.data) ? upstream.data : [])
        .filter((item) => item && item.nsfw === true)
        .map((item) => mapPeerTubeVideo(item));
    if (year) results = results.filter((item) => item.year === year);
    if (validGenre) results = results.filter((item) => item.genres.includes(validGenre));
    const filteredTotal = results.length;
    if (locallyFiltered) results = results.slice((page - 1) * count, page * count);
    const total = locallyFiltered ? filteredTotal : Number(upstream.total || results.length);
    const payload = { results, page, total_pages: Math.max(1, Math.ceil(total / count)), total };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

async function peerTubeVideo(url, res) {
    const uuid = cleanText(url.searchParams.get('id'), 80).replace(/^pt-/, '');
    if (!/^[a-f0-9-]{20,80}$/i.test(uuid)) return json(res, 400, { error: 'Invalid PeerTube id' });
    const cacheKey = `peertube-video:v1:${uuid}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);
    const target = new URL(`/api/v1/videos/${encodeURIComponent(uuid)}`, PEERTUBE_BASE);
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    if (!upstream || upstream.nsfw !== true) return json(res, 404, { error: 'Video is unavailable' });
    const result = mapPeerTubeVideo(upstream, true);
    if (!result.sources.length) return json(res, 404, { error: 'Direct stream is unavailable' });
    const payload = { result };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

async function fetchPage(target, accept = 'text/html') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
        response = await fetch(target, {
            headers: {
                Accept: accept,
                'Accept-Language': 'en-US,en;q=0.8',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36'
            },
            redirect: 'follow',
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`${target.hostname} returned HTTP ${response.status}`);
    return response;
}

async function searchPornhub(query, year) {
    const target = new URL('https://www.pornhub.com/webmasters/search');
    target.searchParams.set('search', query);
    target.searchParams.set('page', '1');
    target.searchParams.set('thumbsize', 'small');
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    return (Array.isArray(upstream.videos) ? upstream.videos : []).map((item) => {
        const id = cleanText(item.video_id, 100);
        const published = cleanText(item.publish_date, 30);
        let score = matchScore(item.title, query);
        if (year && published.includes(year)) score += 40;
        return {
            id,
            title: cleanText(item.title, 300),
            provider: 'Pornhub',
            kind: 'embed',
            embed_url: /^[a-zA-Z0-9]+$/.test(id) ? `https://www.pornhub.com/embed/${id}` : '',
            thumbnail: /^https?:\/\//i.test(item.default_thumb || '') ? item.default_thumb : '',
            duration: cleanText(item.duration, 30),
            rating: Number(item.rating || 0),
            published,
            score
        };
    }).filter((item) => item.embed_url && relevantTitle(item.title, query))
        .sort((a, b) => b.score - a.score || b.rating - a.rating)
        .slice(0, 10);
}

async function searchXvideos(query, year) {
    const target = new URL('https://www.xvideos.com/');
    target.searchParams.set('k', query);
    target.searchParams.set('p', '0');
    const response = await fetchPage(target);
    const html = (await response.text()).slice(0, 1500000);
    const results = [];
    const seen = new Set();
    const pattern = /<div\s+id="video_([a-z0-9]+)"[\s\S]*?<p\s+class="title"><a[^>]+title="([^"]+)"[\s\S]*?<span\s+class="duration">([^<]*)<\/span>/gi;
    let match;
    while ((match = pattern.exec(html)) && results.length < 10) {
        const id = cleanText(match[1], 100);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const title = cleanText(decodeHtml(match[2]), 300);
        const thumbMatch = match[0].match(/data-src="(https?:\/\/[^"]+)"/i);
        let score = matchScore(title, query);
        if (year && title.includes(year)) score += 40;
        if (!relevantTitle(title, query)) continue;
        results.push({
            id,
            title,
            provider: 'XVideos',
            kind: 'embed',
            embed_url: `https://www.xvideos.com/embedframe/${id}`,
            thumbnail: thumbMatch ? decodeHtml(thumbMatch[1]) : '',
            duration: cleanText(match[3], 30),
            rating: 0,
            published: '',
            score
        });
    }
    return results;
}

async function searchRedtube(query, year) {
    const target = new URL('https://api.redtube.com/');
    target.searchParams.set('data', 'redtube.Videos.searchVideos');
    target.searchParams.set('output', 'json');
    target.searchParams.set('search', query);
    target.searchParams.set('page', '1');
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    return (Array.isArray(upstream.videos) ? upstream.videos : []).map((entry) => entry && entry.video || {})
        .map((item) => {
            const id = cleanText(item.video_id, 100);
            const title = cleanText(decodeHtml(item.title), 300);
            const published = cleanText(item.publish_date, 30);
            let score = matchScore(title, query);
            if (year && published.includes(year)) score += 40;
            return {
                id,
                title,
                provider: 'RedTube',
                kind: 'embed',
                embed_url: /^https:\/\/embed\.redtube\.com\/\?id=[0-9]+$/i.test(item.embed_url || '') ? item.embed_url : '',
                thumbnail: /^https?:\/\//i.test(item.default_thumb || '') ? item.default_thumb : '',
                duration: cleanText(item.duration, 30),
                rating: Number(item.rating || 0),
                published,
                score
            };
        }).filter((item) => item.embed_url && relevantTitle(item.title, query))
        .sort((a, b) => b.score - a.score || b.rating - a.rating)
        .slice(0, 10);
}

async function searchEporner(query, year) {
    const target = new URL('https://www.eporner.com/api/v2/video/search/');
    target.searchParams.set('query', query);
    target.searchParams.set('per_page', '20');
    target.searchParams.set('page', '1');
    target.searchParams.set('thumbsize', 'medium');
    target.searchParams.set('order', 'best');
    const response = await fetchPage(target, 'application/json');
    const upstream = await response.json();
    return (Array.isArray(upstream.videos) ? upstream.videos : []).map((item) => {
        const id = cleanText(item.id, 100);
        const title = cleanText(decodeHtml(item.title), 300);
        const searchable = `${title} ${cleanText(decodeHtml(item.keywords), 1000)}`;
        const published = cleanText(item.added, 30);
        let score = Math.max(matchScore(title, query), matchScore(searchable, query));
        if (year && (title.includes(year) || published.includes(year))) score += 40;
        return {
            id,
            title,
            provider: 'Eporner',
            kind: 'embed',
            embed_url: /^https:\/\/www\.eporner\.com\/embed\/[a-zA-Z0-9]+\/$/i.test(item.embed || '') ? item.embed : '',
            thumbnail: item.default_thumb && /^https?:\/\//i.test(item.default_thumb.src || '') ? item.default_thumb.src : '',
            duration: cleanText(item.length_min, 30),
            rating: Number(item.rate || 0),
            published,
            score,
            relevant: relevantTitle(searchable, query)
        };
    }).filter((item) => item.embed_url && item.relevant)
        .sort((a, b) => b.score - a.score || b.rating - a.rating)
        .slice(0, 10);
}

async function sourceSearch(url, res) {
    const query = cleanText(url.searchParams.get('q'), 160);
    const year = cleanYear(url.searchParams.get('year'));
    if (query.length < 2) return json(res, 400, { error: 'Search query is too short' });

    const cacheKey = `sources:v5:${query}:${year}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) return json(res, 200, cached.value);

    const providers = [
        ['Eporner', searchEporner],
        ['RedTube', searchRedtube],
        ['Pornhub', searchPornhub],
        ['XVideos', searchXvideos]
    ];
    const settled = await Promise.allSettled(providers.map((provider) => provider[1](query, year)));
    const availability = {};
    let results = [];
    settled.forEach((result, index) => {
        const name = providers[index][0];
        availability[name] = result.status === 'fulfilled';
        if (result.status === 'fulfilled') results = results.concat(result.value);
        else console.warn(`${name} source search failed: ${result.reason && result.reason.message || result.reason}`);
    });
    results.sort((a, b) => b.score - a.score || b.rating - a.rating || a.provider.localeCompare(b.provider));

    const payload = { results: results.slice(0, 30), providers: availability };
    cache.set(cacheKey, { time: Date.now(), value: payload });
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return json(res, 200, payload);
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    if (!allowed(req)) return json(res, 429, { error: 'Too many requests' });

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
        if (url.pathname === '/' || url.pathname === '/health') {
            return json(res, 200, { ok: true, service: 'lampa-adult-catalog', configured: Boolean(TPDB_API_TOKEN) });
        }
        if (url.pathname === '/plugin.js' || url.pathname === '/a18.js') return javascript(res);
        if (url.pathname === '/api/movies') return await movies(url, res);
        if (url.pathname === '/api/movie') return await movie(url, res);
        if (url.pathname === '/api/scatgoon') return await scatgoon(url, res);
        if (url.pathname === '/api/archive') {
            try {
                return await archiveCatalog(url, res);
            } catch (error) {
                console.warn(`Internet Archive catalog failed, using TPDB fallback: ${error && error.message || error}`);
                url.searchParams.set('fallback', 'archive');
                if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'new');
                return await movies(url, res);
            }
        }
        if (url.pathname === '/api/peertube') {
            try {
                return await peerTubeCatalog(url, res);
            } catch (error) {
                console.warn(`PeerTube catalog failed, using Internet Archive fallback: ${error && error.message || error}`);
                try {
                    return await archiveCatalog(url, res);
                } catch (archiveError) {
                    console.warn(`Internet Archive catalog failed, using TPDB fallback: ${archiveError && archiveError.message || archiveError}`);
                    url.searchParams.set('fallback', 'peertube');
                    if (!url.searchParams.get('mode')) url.searchParams.set('mode', 'new');
                    return await movies(url, res);
                }
            }
        }
        if (url.pathname === '/api/peertube/video') return await peerTubeVideo(url, res);
        if (url.pathname === '/api/archive/video') return await archiveVideo(url, res);
        if (url.pathname === '/api/sources') return await sourceSearch(url, res);
        return json(res, 404, { error: 'Not found' });
    } catch (error) {
        console.error(error && error.message ? error.message : error);
        return json(res, 502, { error: 'Metadata source is temporarily unavailable' });
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Lampa adult catalog API listening on ${PORT}`);
});
