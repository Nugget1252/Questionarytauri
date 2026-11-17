const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1';
const ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '4100', 10);
const STUDENT_SITE_URL = process.env.STUDENT_SITE_URL || 'http://localhost:3000';
const ADMIN_PASSPHRASE = process.env.ADMIN_PASSPHRASE || 'sayandps2014';

app.disable('x-powered-by');

// Security headers & strict framing protections
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob:",
            "connect-src 'self' blob:",
            "frame-src 'self' blob:",
            "frame-ancestors 'none'",
            "object-src 'self'",
            "base-uri 'self'"
        ].join('; ')
    );
    next();
});

app.use(express.json({ limit: '65mb' }));

// ================================================================
// IP BRUTE-FORCE RATE LIMITER & HTTP-ONLY SESSION AUTH
// ================================================================
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_COOKIE = 'q_admin_session';

const loginAttempts = new Map(); // ip -> { count, firstAttemptAt, lockedUntil }
const activeSessions = new Map(); // token -> { createdAt, expiresAt, ip }

function getClientIp(req) {
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function parseCookies(req) {
    const out = {};
    const raw = req.headers.cookie || '';
    raw.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    });
    return out;
}

function safeComparePassphrase(candidate, expected) {
    if (typeof candidate !== 'string' || typeof expected !== 'string' || !expected) return false;
    const a = crypto.createHash('sha256').update(candidate).digest();
    const b = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

function getValidSession(req) {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    const sess = activeSessions.get(token);
    if (!sess) return null;
    if (Date.now() > sess.expiresAt) {
        activeSessions.delete(token);
        return null;
    }
    return { token, ...sess };
}

function requireAdminAuth(req, res, next) {
    const sess = getValidSession(req);
    if (!sess) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    req.adminSession = sess;
    next();
}

// Periodic cleanup of expired sessions & stale rate limit records
setInterval(() => {
    const now = Date.now();
    for (const [token, sess] of activeSessions.entries()) {
        if (now > sess.expiresAt) activeSessions.delete(token);
    }
    for (const [ip, rec] of loginAttempts.entries()) {
        if (rec.lockedUntil && now > rec.lockedUntil && now - rec.firstAttemptAt > WINDOW_MS) {
            loginAttempts.delete(ip);
        }
    }
}, 5 * 60 * 1000).unref();

// ================================================================
// DOCUMENT CATALOG INDEXER (SHARED METADATA FORMAT)
// ================================================================
function cleanSubjectName(raw) {
    if (!raw) return 'General';
    let s = raw.replace(/\.pdf$/i, '').trim();
    s = s.replace(/\s*\(SET-?[A-Z]\)/i, '');
    s = s.replace(/\s*\(ET-?[A-Z]\)/i, '');
    s = s.replace(/\s*\(L2\)/i, '');
    s = s.replace(/\s*\(1\)/i, '');
    s = s.replace(/\s*\(3\)/i, '');
    s = s.replace(/\.DOCX.*/i, '');
    s = s.replace(/--.*/i, '');
    s = s.replace(/_CLASS\s*10.*/i, '');
    s = s.replace(/_CL-?\s*10.*/i, '');
    s = s.replace(/_202[0-9].*/i, '');
    s = s.replace(/_HY_202[0-9].*/i, '');
    s = s.replace(/_PB_SET.*/i, '');
    s = s.replace(/_PB_202[0-9].*/i, '');
    s = s.replace(/_PRE_?BOARD.*/i, '');
    s = s.replace(/_25$/, '');
    s = s.replace(/_2025$/, '');
    s = s.replace(/_2026$/, '');
    s = s.replace(/_2023$/, '');
    s = s.replace(/_SET_A.*/i, '');
    s = s.replace(/-\(Q-PAPER\).*/i, '');
    s = s.replace(/_/g, ' ').trim();

    const upper = s.toUpperCase();
    if (upper.includes('MATH')) return 'Mathematics';
    if (upper.includes('PHYSIC')) return 'Physics';
    if (upper.includes('CHEM')) return 'Chemistry';
    if (upper.includes('BIOLOG')) return 'Biology';
    if (upper.includes('COMPUTER') || upper.includes('CA_') || upper === 'CA' || (upper.includes('COMMERCE') && upper.includes('APP'))) return 'Computer Applications';
    if (upper.includes('COMMERC')) return 'Commercial Studies';
    if (upper.includes('ECONOMIC') || upper.includes('ECON') || upper.includes('ECO APP')) return 'Economics';
    if (upper.includes('ENG LANG') || upper.includes('LANGUAGE')) return 'English Language';
    if (upper.includes('ENG LIT') || upper.includes('LITERATURE')) return 'English Literature';
    if (upper.includes('HISTORY') || upper.includes('HIST')) return 'History & Civics';
    if (upper.includes('GEOG')) return 'Geography';
    if (upper.includes('EVA')) return 'Environmental Applications (EVA)';
    if (upper.includes('EVS')) return 'Environmental Science (EVS)';
    if (upper.includes('HINDI')) return 'Hindi';
    if (upper.includes('BENGALI')) return 'Bengali';
    if (upper.includes('FRENCH')) return 'French';
    if (upper.includes('GERMAN')) return 'German';
    if (upper.includes('HOME SC')) return 'Home Science';
    if (upper.includes('PHYSICAL ED') || upper === 'PE' || upper.includes('PE ') || upper.endsWith(' PE') || upper.includes('PHYSCAL ED')) return 'Physical Education';
    if (upper.includes('ROBOTIC') || upper.includes('RAI')) return 'Robotics & AI';
    return s || 'General Studies';
}

function parseDoc(filename) {
    let year = 'Unknown';
    let classNum = '9';
    let examType = 'Other';
    let examName = 'Examination';

    const yearMatch = filename.match(/^(20\d{2}-\d{2})/);
    if (yearMatch) {
        year = yearMatch[1];
    } else if (filename.startsWith('Study_Material')) {
        year = 'Study Material';
        examType = 'Study Material';
        examName = 'Study Material & Notes';
    }

    if (filename.includes('CL_10') || filename.includes('CLASS 10') || filename.includes('CLASS.10') || filename.includes('CLASS X') || filename.includes('GRADE X') || filename.includes('CL- 10') || filename.includes('CL.10') || filename.includes('10 EVS') || filename.includes('10EVA')) {
        classNum = '10';
    }

    if (year !== 'Study Material') {
        const upper = filename.toUpperCase();
        if (upper.includes('PREBOARD') || upper.includes('PRE BOARD') || upper.includes('PRE_BOARD') || upper.includes('PREBOARDS') || upper.includes('_PB_') || upper.includes('_PB.')) {
            examType = 'Pre-Board';
            examName = 'Pre-Board Examination';
        } else if (upper.includes('_FT_') || upper.includes('_FT.') || upper.includes('FINAL TERM')) {
            examType = 'Final Term';
            examName = 'Final Term Examination (FT)';
        } else if (upper.includes('_HY_') || upper.includes('_HY.') || upper.includes('HALF YEARLY') || upper.includes('HY EXAM') || upper.includes('HYE')) {
            examType = 'Half Yearly';
            examName = 'Half Yearly Examination (HY)';
        } else if (upper.includes('MT_1') || upper.includes('MT1') || upper.includes('MT 1') || upper.includes('M-1')) {
            examType = 'Mid Term 1';
            examName = 'Mid Term 1 (MT-1)';
        } else if (upper.includes('MT_2') || upper.includes('MT2') || upper.includes('MT 2') || upper.includes('M-2')) {
            examType = 'Mid Term 2';
            examName = 'Mid Term 2 (MT-2)';
        } else {
            examType = 'Assessment';
            examName = 'Internal Assessment';
        }
    }

    let subRaw = filename.replace(/\.pdf$/i, '');
    subRaw = subRaw.replace(/^20\d{2}-\d{2}_CL_\d+_[A-Za-z0-9_]+_/, '');
    subRaw = subRaw.replace(/^Study_Material_Class_\d+_/, '');
    subRaw = subRaw.replace(/^[0-9A-Za-z_-]+_(HY|FT|MT_1|MT_2|MT1|MT2|PREBOARD)_/i, '');
    subRaw = subRaw.replace(/^HY EXAM_/i, '');
    subRaw = subRaw.replace(/^PRE BOARD_/i, '');
    subRaw = subRaw.replace(/^MT 1_/i, '');
    subRaw = subRaw.replace(/^MT 2_/i, '');

    const subject = cleanSubjectName(subRaw || filename);
    let title = `${subject} - Class ${classNum} (${examType})`;
    if (year !== 'Unknown' && year !== 'Study Material') {
        title += ` [${year}]`;
    }

    return {
        id: Buffer.from(filename).toString('base64url'),
        filename,
        title,
        subject,
        classNum,
        year,
        examType,
        examName,
        path: `/documents/${encodeURIComponent(filename)}`,
        hdPath: `/documentshd/${encodeURIComponent(filename)}`
    };
}

function getCleanPaperName(filename) {
    if (filename.startsWith('Study_Material')) {
        let name = filename.replace(/^Study_Material_/, '').replace(/\.pdf$/i, '');
        return name.replace(/Class_\d+_/g, '').replace(/_/g, ' ');
    }
    let name = filename.replace(/\.pdf$/i, '');
    name = name.replace(/^(20\d{2}-\d{2})_(?:CL_?|CLASS_?)\d+_(?:HY|FT|MT_1|MT_2|MT1|MT2|PREBOARD|PRE_BOARD|PB)_?/i, '');
    name = name.replace(/^(?:HY EXAM_|PRE BOARD_|MT 1_|MT 2_|CLASS\.?10_MT1_|CLASS X_|CL\.?10_HY EXAM |CL- ?10 PB_SET -A-- |CLASS10 _HY_2025|CLASS 10_HY_2025|CLASS10_HY_2025)/i, '');
    name = name.replace(/_(?:202[0-9]|2025_26|CLASS ?10|CL-?10).*$/i, '');
    name = name.replace(/_/g, ' ').trim();
    return name || filename.replace(/\.pdf$/i, '');
}

let cachedDocs = [];
function indexDocuments() {
    const docsDir = path.join(__dirname, 'documents');
    const hdDir = path.join(__dirname, 'documentshd');
    const hdSet = new Set();

    if (fs.existsSync(hdDir)) {
        for (const f of fs.readdirSync(hdDir)) {
            if (f.toLowerCase().endsWith('.pdf')) hdSet.add(f);
        }
    }

    if (fs.existsSync(docsDir)) {
        const files = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith('.pdf'));
        cachedDocs = files.map(file => {
            const doc = parseDoc(file);
            doc.hasHD = hdSet.has(file);
            doc.paperName = getCleanPaperName(file);
            try {
                doc.size = fs.statSync(path.join(docsDir, file)).size;
            } catch {
                doc.size = 0;
            }
            return doc;
        });
        cachedDocs.sort((a, b) => {
            if (b.year !== a.year) return b.year.localeCompare(a.year);
            if (a.classNum !== b.classNum) return a.classNum.localeCompare(b.classNum);
            return a.paperName.localeCompare(b.paperName);
        });
    } else {
        cachedDocs = [];
    }
    return cachedDocs;
}

indexDocuments();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const announcementsFile = path.join(dataDir, 'announcements.json');

// ================================================================
// AUTH ROUTES
// ================================================================
app.get('/api/admin/session', (req, res) => {
    const sess = getValidSession(req);
    res.json({
        authenticated: Boolean(sess),
        studentUrl: STUDENT_SITE_URL,
        adminPort: ADMIN_PORT
    });
});

app.post('/api/admin/login', (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = loginAttempts.get(ip);

    if (record && record.lockedUntil && now < record.lockedUntil) {
        const retryAfter = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({
            success: false,
            error: `Too many failed attempts. Locked out for ${Math.ceil(retryAfter / 60)} minute(s).`,
            retryAfter
        });
    }

    const passphrase = typeof req.body?.passphrase === 'string' ? req.body.passphrase.trim() : '';
    if (!passphrase || !safeComparePassphrase(passphrase, ADMIN_PASSPHRASE)) {
        const freshWindow = !record || (now - record.firstAttemptAt > WINDOW_MS);
        const nextCount = freshWindow ? 1 : (record.count + 1);
        const firstAttemptAt = freshWindow ? now : record.firstAttemptAt;
        const lockedUntil = nextCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;

        loginAttempts.set(ip, { count: nextCount, firstAttemptAt, lockedUntil });

        if (lockedUntil) {
            return res.status(429).json({
                success: false,
                error: 'Too many failed attempts. Access temporarily locked for 15 minutes.',
                retryAfter: Math.ceil(LOCKOUT_MS / 1000)
            });
        }
        return res.status(401).json({
            success: false,
            error: `Invalid admin passphrase (${MAX_ATTEMPTS - nextCount} attempts remaining).`
        });
    }

    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions.set(token, {
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS,
        ip
    });

    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    );

    return res.json({
        success: true,
        studentUrl: STUDENT_SITE_URL
    });
});

app.post('/api/admin/logout', (req, res) => {
    const sess = getValidSession(req);
    if (sess) activeSessions.delete(sess.token);
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    res.json({ success: true });
});

// ================================================================
// AUTHENTICATED ADMIN DATA & FILE ENDPOINTS
// ================================================================
app.get('/api/admin/system-stats', requireAdminAuth, (req, res) => {
    let dbSize = 0;
    try {
        dbSize = fs.statSync(path.join(__dirname, 'questionary.db')).size;
    } catch {}

    let announcementsCount = 0;
    try {
        if (fs.existsSync(announcementsFile)) {
            announcementsCount = JSON.parse(fs.readFileSync(announcementsFile, 'utf8')).length;
        }
    } catch {}

    res.json({
        totalPapers: cachedDocs.length,
        dbSize,
        announcementsCount,
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
        studentUrl: STUDENT_SITE_URL,
        adminOrigin: `http://${ADMIN_HOST}:${ADMIN_PORT}`
    });
});

app.get('/api/admin/documents', requireAdminAuth, (req, res) => {
    indexDocuments();
    res.json({ total: cachedDocs.length, documents: cachedDocs });
});

app.get('/api/admin/announcements', requireAdminAuth, (req, res) => {
    try {
        if (fs.existsSync(announcementsFile)) {
            return res.json(JSON.parse(fs.readFileSync(announcementsFile, 'utf8')));
        }
    } catch {}
    res.json([]);
});

app.post('/api/admin/announcements', requireAdminAuth, (req, res) => {
    try {
        const list = req.body;
        if (!Array.isArray(list)) {
            return res.status(400).json({ success: false, error: 'Expected array of announcements' });
        }
        fs.writeFileSync(announcementsFile, JSON.stringify(list, null, 2));
        res.json({ success: true, count: list.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/save-db', requireAdminAuth, express.raw({ type: 'application/octet-stream', limit: '100mb' }), (req, res) => {
    try {
        const buf = req.body;
        if (!buf || buf.length < 16) {
            return res.status(400).json({ success: false, error: 'Empty or invalid database payload' });
        }
        const header = buf.subarray(0, 16).toString('utf8');
        if (header !== 'SQLite format 3\0') {
            return res.status(400).json({ success: false, error: 'Payload is not a valid SQLite 3 database' });
        }
        const targetPrimary = path.join(__dirname, 'questionary.db');
        const tmpPrimary = path.join(__dirname, `.questionary.db.${process.pid}.tmp`);
        fs.writeFileSync(tmpPrimary, buf);
        fs.renameSync(tmpPrimary, targetPrimary);

        console.log(`[AdminServer] Saved questionary.db (${buf.length} bytes)`);
        res.json({ success: true, size: buf.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/admin/upload-pdf', requireAdminAuth, (req, res) => {
    try {
        const rawName = String(req.body?.filename || '').trim();
        const base64Data = String(req.body?.base64 || '');
        const quality = req.body?.quality === 'hd' ? 'hd' : 'sd';

        if (!rawName || !base64Data) {
            return res.status(400).json({ success: false, error: 'Filename and PDF content are required' });
        }

        let safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._()\-\s]/g, '_').replace(/\s+/g, '_');
        if (!safeName.toLowerCase().endsWith('.pdf')) {
            safeName += '.pdf';
        }

        const cleanBase64 = base64Data.replace(/^data:application\/pdf;base64,/, '');
        const pdfBuffer = Buffer.from(cleanBase64, 'base64');
        if (pdfBuffer.length < 16 || pdfBuffer.subarray(0, 4).toString('utf8') !== '%PDF') {
            return res.status(400).json({ success: false, error: 'Uploaded file is not a valid PDF document' });
        }

        const docsDir = path.join(__dirname, 'documents');
        if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
        fs.writeFileSync(path.join(docsDir, safeName), pdfBuffer);

        if (quality === 'hd') {
            const hdDir = path.join(__dirname, 'documentshd');
            if (!fs.existsSync(hdDir)) fs.mkdirSync(hdDir, { recursive: true });
            fs.writeFileSync(path.join(hdDir, safeName), pdfBuffer);
        }

        indexDocuments();
        const doc = parseDoc(safeName);
        doc.hasHD = quality === 'hd';
        doc.size = pdfBuffer.length;

        console.log(`[AdminServer] Uploaded PDF: ${safeName} (${pdfBuffer.length} bytes, ${quality.toUpperCase()})`);
        res.json({ success: true, filename: safeName, doc });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Authenticated database download / fetch & document preview
app.get(['/questionary.db', '/database.db'], requireAdminAuth, (req, res) => {
    const dbPath = path.join(__dirname, 'questionary.db');
    if (fs.existsSync(dbPath)) {
        return res.sendFile(dbPath);
    }
    return res.status(404).type('text/plain').send('Database not found');
});

app.use('/documents', requireAdminAuth, (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    next();
}, express.static(path.join(__dirname, 'documents')));

app.use('/documentshd', requireAdminAuth, (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    next();
}, express.static(path.join(__dirname, 'documentshd')));

// ================================================================
// STATIC ASSETS STRICTLY NEEDED BY ADMIN PORTAL
// ================================================================
app.use('/css/vendor', express.static(path.join(__dirname, 'css', 'vendor')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.get('/app-icon.png', (req, res) => res.sendFile(path.join(__dirname, 'app-icon.png')));
app.get('/js/admin.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'admin.js')));
app.get('/js/sql-wasm.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'sql-wasm.js')));
app.get('/js/sql-wasm.wasm', (req, res) => res.sendFile(path.join(__dirname, 'js', 'sql-wasm.wasm')));
app.get('/js/vendor/purify.min.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'vendor', 'purify.min.js')));

app.get(['/', '/admin', '/admin.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use((req, res) => {
    res.status(404).type('text/plain').send('Not found');
});

if (require.main === module) {
    app.listen(ADMIN_PORT, ADMIN_HOST, () => {
        console.log(`[Questionary Admin] Dedicated Admin Portal running on http://${ADMIN_HOST}:${ADMIN_PORT}`);
        console.log(`[Questionary Admin] Student site link target: ${STUDENT_SITE_URL}`);
    });
}

module.exports = app;
