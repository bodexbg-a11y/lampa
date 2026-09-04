'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const TPDB_API_BASE = String(process.env.TPDB_API_BASE || 'https://api.theporndb.net').replace(/\/$/, '');
const TPDB_API_TOKEN = String(process.env.TPDB_API_TOKEN || '');
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
    const params = new URLSearchParams({ page: String(page), limit: '40' });
    if (year) params.set('year', year);
    if (query) params.set('parse', query);

    const upstream = await tpdb(`/movies?${params.toString()}`);
    let results = (Array.isArray(upstream.data) ? upstream.data : []).map(mapMovie);
    if (year) results = results.filter((item) => !item.year || item.year === year);
    if (mode === 'rating') results.sort((a, b) => b.rating - a.rating);
    if (mode === 'new') results.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    json(res, 200, {
        results,
        page: upstream.meta && upstream.meta.current_page || page,
        total_pages: upstream.meta && upstream.meta.last_page || 1,
        total: upstream.meta && upstream.meta.total || results.length
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
