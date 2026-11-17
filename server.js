const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.disable('x-powered-by');

// Security headers & clickjacking protection
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob: https: http:",
            "media-src 'self' data: blob: mediastream:",
            "connect-src 'self' https: http: wss: ws: data: blob:",
            "worker-src 'self' blob:",
            "frame-src 'self' blob:",
            "frame-ancestors 'self'",
            "object-src 'none'",
            "base-uri 'self'"
        ].join('; ')
    );
    next();
});

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Block admin panel, admin APIs, and server-internal files from the student site
app.use((req, res, next) => {
    const reqPath = (req.path || '').toLowerCase();
    if (
        reqPath === '/admin' ||
        reqPath.startsWith('/admin/') ||
        reqPath === '/admin.html' ||
        reqPath === '/admin-server.js' ||
        reqPath === '/js/admin.js' ||
        reqPath.startsWith('/api/admin') ||
        reqPath.startsWith('/.env') ||
        reqPath.startsWith('/.git')
    ) {
        return res.status(404).type('text/plain').send('Not found');
    }
    next();
});

// RFC 9116 security.txt
app.get('/.well-known/security.txt', (req, res) => {
    const secPath = path.join(__dirname, '.well-known', 'security.txt');
    if (fs.existsSync(secPath)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.sendFile(secPath);
    }
    return res.status(404).type('text/plain').send('Not found');
});

// Subject name normalizer
function cleanSubjectName(raw) {
    if (!raw) return 'General';
    let s = raw.replace(/\.pdf$/i, '').trim();
    // Remove SET info
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
    if (upper.includes('COMPUTER') || upper.includes('CA_') || upper === 'CA' || upper.includes('COMMERCE') && upper.includes('APP')) return 'Computer Applications';
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

// Parse document metadata from filename
function parseDoc(filename) {
    let year = 'Unknown';
    let classNum = '9';
    let examType = 'Other';
    let examName = 'Examination';
    let rawSubject = '';

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
    } else {
        classNum = '9';
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

    // Extract subject portion
    let subRaw = filename.replace(/\.pdf$/i, '');
    // Remove prefixes
    subRaw = subRaw.replace(/^20\d{2}-\d{2}_CL_\d+_[A-Za-z0-9_]+_/, '');
    subRaw = subRaw.replace(/^Study_Material_Class_\d+_/, '');
    subRaw = subRaw.replace(/^[0-9A-Za-z_-]+_(HY|FT|MT_1|MT_2|MT1|MT2|PREBOARD)_/i, '');
    subRaw = subRaw.replace(/^HY EXAM_/i, '');
    subRaw = subRaw.replace(/^PRE BOARD_/i, '');
    subRaw = subRaw.replace(/^MT 1_/i, '');
    subRaw = subRaw.replace(/^MT 2_/i, '');

    const subject = cleanSubjectName(subRaw || filename);

    // Friendly title
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
        name = name.replace(/Class_\d+_/g, '').replace(/_/g, ' ');
        return name;
    }
    let name = filename.replace(/\.pdf$/i, '');
    name = name.replace(/^(20\d{2}-\d{2})_(?:CL_?|CLASS_?)\d+_(?:HY|FT|MT_1|MT_2|MT1|MT2|PREBOARD|PRE_BOARD|PB)_?/i, '');
    name = name.replace(/^(?:HY EXAM_|PRE BOARD_|MT 1_|MT 2_|CLASS\.?10_MT1_|CLASS X_|CL\.?10_HY EXAM |CL- ?10 PB_SET -A-- |CLASS10 _HY_2025|CLASS 10_HY_2025|CLASS10_HY_2025)/i, '');
    name = name.replace(/_(?:202[0-9]|2025_26|CLASS ?10|CL-?10).*$/i, '');
    name = name.replace(/_/g, ' ').trim();
    return name || filename.replace(/\.pdf$/i, '');
}

let cachedDocs = [];
let cachedStats = null;
let cachedTree = {};

function indexDocuments() {
    try {
        const docsDir = path.join(__dirname, 'documents');
        const hdDir = path.join(__dirname, 'documentshd');
        const hdSet = new Set();

        if (fs.existsSync(hdDir)) {
            const hdFiles = fs.readdirSync(hdDir);
            for (const f of hdFiles) {
                if (f.endsWith('.pdf')) hdSet.add(f);
            }
        }

        if (fs.existsSync(docsDir)) {
            const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.pdf'));
            cachedDocs = files.map(file => {
                const doc = parseDoc(file);
                doc.hasHD = hdSet.has(file);
                doc.paperName = getCleanPaperName(file);
                try {
                    const st = fs.statSync(path.join(docsDir, file));
                    doc.size = st.size;
                } catch {
                    doc.size = 0;
                }
                return doc;
            });
            // Sort by year descending, class ascending, subject ascending
            cachedDocs.sort((a, b) => {
                if (b.year !== a.year) return b.year.localeCompare(a.year);
                if (a.classNum !== b.classNum) return a.classNum.localeCompare(b.classNum);
                return a.paperName.localeCompare(b.paperName);
            });
        }

        // Build hierarchical folder tree: Year -> Class -> Exam -> Files
        const treeObj = {};
        for (const doc of cachedDocs) {
            const y = doc.year;
            const c = `Class ${doc.classNum}`;
            const e = doc.examType;

            if (!treeObj[y]) treeObj[y] = {};
            if (!treeObj[y][c]) treeObj[y][c] = {};
            if (!treeObj[y][c][e]) treeObj[y][c][e] = [];

            treeObj[y][c][e].push(doc);
        }
        cachedTree = treeObj;

        // Compute stats
        const subjectCounts = {};
        const yearCounts = {};
        const classCounts = { '9': 0, '10': 0 };
        const examCounts = {};

        for (const doc of cachedDocs) {
            subjectCounts[doc.subject] = (subjectCounts[doc.subject] || 0) + 1;
            yearCounts[doc.year] = (yearCounts[doc.year] || 0) + 1;
            classCounts[doc.classNum] = (classCounts[doc.classNum] || 0) + 1;
            examCounts[doc.examType] = (examCounts[doc.examType] || 0) + 1;
        }

        cachedStats = {
            totalPapers: cachedDocs.length,
            classCounts,
            yearCounts,
            examCounts,
            subjectCounts,
            years: Object.keys(yearCounts).sort().reverse(),
            subjects: Object.keys(subjectCounts).sort(),
            examTypes: Object.keys(examCounts).sort()
        };

        console.log(`[Questionary] Successfully indexed ${cachedDocs.length} question papers into folder hierarchy.`);
    } catch (err) {
        console.error('[Questionary] Indexing failed:', err);
    }
}

// Initial index
indexDocuments();

// API Endpoints
app.get('/api/tree', (req, res) => {
    res.json({
        tree: cachedTree,
        total: cachedDocs.length
    });
});

app.get('/api/documents', (req, res) => {
    let results = cachedDocs;
    const { classNum, year, examType, subject, q } = req.query;

    if (classNum) {
        results = results.filter(d => d.classNum === classNum);
    }
    if (year) {
        results = results.filter(d => d.year === year);
    }
    if (examType) {
        results = results.filter(d => d.examType === examType);
    }
    if (subject) {
        results = results.filter(d => d.subject.toLowerCase() === subject.toLowerCase());
    }
    if (q) {
        const query = q.toLowerCase().trim();
        results = results.filter(d => 
            d.title.toLowerCase().includes(query) ||
            d.subject.toLowerCase().includes(query) ||
            d.filename.toLowerCase().includes(query) ||
            d.year.toLowerCase().includes(query) ||
            d.examType.toLowerCase().includes(query)
        );
    }

    res.json({
        total: results.length,
        documents: results,
        metadata: cachedStats,
        tree: cachedTree
    });
});

app.get('/api/stats', (req, res) => {
    res.json(cachedStats || {});
});

// Real-time Study Room Relay Hub + Session Store
const studyRooms = new Map();

function sanitizeStudySession(session) {
    if (!session) return null;
    const participants = Array.from(session.participants.values()).map(p => ({
        peerId: p.peerId,
        nickname: p.nickname,
        isHost: Boolean(p.isHost),
        handRaised: Boolean(p.handRaised),
        goal: p.goal || '',
        elapsed: p.elapsed || 0,
        joinedAt: p.joinedAt
    }));
    return {
        code: session.code,
        host: session.host,
        hostPeerId: session.hostPeerId,
        hasPassword: Boolean(session.passwordHash),
        title: session.title,
        createdAt: session.createdAt,
        participantCount: Math.max(1, participants.length),
        participants,
        members: session.members,
        messages: session.messages.slice(-100),
        questions: session.questions,
        wbHistory: session.wbHistory.slice(-500),
        timer: session.timer
    };
}

function broadcastRoomEvent(session, payload, excludePeerId = null, targetPeerId = null) {
    if (!session || !session.clients) return;
    const serialized = `data: ${JSON.stringify(payload)}\n\n`;
    for (const [clientId, resSet] of session.clients.entries()) {
        if (excludePeerId && clientId === excludePeerId) continue;
        if (targetPeerId && clientId !== targetPeerId) continue;
        for (const res of resSet) {
            try {
                res.write(serialized);
            } catch (_) {
                resSet.delete(res);
            }
        }
    }
}

// Periodic cleanup of stale rooms (>6 hours inactive with 0 SSE clients)
setInterval(() => {
    const now = Date.now();
    for (const [code, session] of studyRooms.entries()) {
        let activeStreams = 0;
        if (session.clients) {
            for (const set of session.clients.values()) activeStreams += set.size;
        }
        if (activeStreams === 0 && now - (session.updatedAt || session.createdAt) > 1000 * 60 * 30) {
            studyRooms.delete(code);
        }
    }
}, 60 * 1000).unref?.();

// List active Study Rooms on this server
app.get('/api/studyroom/rooms', (req, res) => {
    const list = [];
    for (const session of studyRooms.values()) {
        list.push({
            code: session.code,
            host: session.host,
            hasPassword: Boolean(session.passwordHash),
            title: session.title,
            participantCount: Math.max(1, session.participants ? session.participants.size : 1),
            createdAt: session.createdAt
        });
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, rooms: list.slice(0, 25) });
});

// Create or register a Study Room on the server
app.post('/api/studyroom/create', (req, res) => {
    const rawCode = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    let code = rawCode;
    if (!code || code.length < 4) {
        const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        const bytes = crypto.randomBytes(10);
        code = '';
        for (let i = 0; i < 10; i++) code += alphabet[bytes[i] % alphabet.length];
    }
    const hostName = String(req.body?.nickname || req.body?.username || 'Host').trim().slice(0, 32) || 'Host';
    const hostPeerId = String(req.body?.peerId || `host_${code}`).trim().slice(0, 80);
    const rawPass = typeof req.body?.password === 'string' && req.body.password.trim().length > 0
        ? req.body.password.trim()
        : null;
    const passwordHash = rawPass
        ? crypto.createHash('sha256').update(`${code}:${rawPass}`).digest('hex')
        : null;

    const participants = new Map();
    participants.set(hostPeerId, {
        peerId: hostPeerId,
        nickname: hostName,
        isHost: true,
        handRaised: false,
        goal: '',
        elapsed: 0,
        joinedAt: Date.now()
    });

    const session = {
        code,
        host: hostName,
        hostPeerId,
        passwordHash,
        title: String(req.body?.title || `${hostName}'s Study Room`).slice(0, 80),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        participants,
        clients: new Map(),
        members: [{ id: hostPeerId, name: hostName, role: 'Host' }],
        messages: [],
        questions: [],
        wbHistory: [],
        timer: {
            mode: 'focus',
            secondsLeft: 25 * 60,
            running: false,
            updatedAt: Date.now()
        }
    };
    studyRooms.set(code, session);
    res.json({ success: true, session: sanitizeStudySession(session) });
});

// Join an existing Study Room on the server
app.post('/api/studyroom/join', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const session = studyRooms.get(code);
    if (!session) {
        return res.status(404).json({ success: false, error: 'Room not found on this server.' });
    }
    if (session.passwordHash) {
        const rawPass = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
        const candidateHash = crypto.createHash('sha256').update(`${code}:${rawPass}`).digest('hex');
        if (!rawPass || candidateHash !== session.passwordHash) {
            return res.status(403).json({
                success: false,
                code: 'INVALID_PASSWORD',
                error: rawPass ? 'Incorrect room password.' : 'This room requires a password.'
            });
        }
    }

    const peerId = String(req.body?.peerId || `peer_${crypto.randomBytes(6).toString('hex')}`).trim().slice(0, 80);
    const nickname = String(req.body?.nickname || 'Student').trim().slice(0, 32) || 'Student';

    session.participants.set(peerId, {
        peerId,
        nickname,
        isHost: peerId === session.hostPeerId,
        handRaised: false,
        goal: '',
        elapsed: 0,
        joinedAt: Date.now()
    });
    session.updatedAt = Date.now();

    broadcastRoomEvent(session, {
        action: 'introduce',
        from: peerId,
        nickname,
        isHost: peerId === session.hostPeerId,
        _msgId: `srv_join_${peerId}_${Date.now()}`
    }, peerId);

    res.json({
        success: true,
        peerId,
        session: sanitizeStudySession(session)
    });
});

// Real-time Server-Sent Events stream for a Study Room participant
app.get('/api/studyroom/events', (req, res) => {
    const code = String(req.query?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const peerId = String(req.query?.peerId || '').trim().slice(0, 80);
    const session = studyRooms.get(code);
    if (!session || !peerId) {
        return res.status(404).json({ error: 'Room or peer not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    if (!session.clients.has(peerId)) {
        session.clients.set(peerId, new Set());
    }
    const peerClients = session.clients.get(peerId);
    peerClients.add(res);
    session.updatedAt = Date.now();

    res.write(`data: ${JSON.stringify({ action: 'srv-connected', code, peerId })}\n\n`);

    const keepAlive = setInterval(() => {
        try {
            res.write(': ping\n\n');
        } catch (_) {
            clearInterval(keepAlive);
        }
    }, 20000);

    req.on('close', () => {
        clearInterval(keepAlive);
        peerClients.delete(res);
        if (peerClients.size === 0) {
            session.clients.delete(peerId);
        }
    });
});

// Relay a real-time message/action to room participants and update room state
app.post('/api/studyroom/message', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const from = String(req.body?.from || '').trim().slice(0, 80);
    const target = req.body?.target ? String(req.body.target).trim().slice(0, 80) : null;
    const payload = req.body?.payload;
    const session = studyRooms.get(code);
    if (!session || !payload || typeof payload !== 'object') {
        return res.status(404).json({ success: false, error: 'Room or payload invalid' });
    }

    session.updatedAt = Date.now();
    const msg = { ...payload, from: payload.from || from };

    // Keep server room state in sync for new/late joiners
    switch (msg.action) {
        case 'introduce': {
            const existing = session.participants.get(from) || {};
            session.participants.set(from, {
                ...existing,
                peerId: from,
                nickname: String(msg.nickname || existing.nickname || 'Student').slice(0, 32),
                isHost: Boolean(msg.isHost || from === session.hostPeerId),
                joinedAt: existing.joinedAt || Date.now()
            });
            break;
        }
        case 'chat': {
            session.messages.push({
                sender: String(msg.sender || 'Student').slice(0, 32),
                text: String(msg.text || '').slice(0, 1000),
                time: msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
            if (session.messages.length > 150) session.messages.shift();
            break;
        }
        case 'wb-draw': {
            if (msg.stroke) {
                session.wbHistory.push(msg.stroke);
                if (session.wbHistory.length > 800) session.wbHistory.shift();
            }
            break;
        }
        case 'wb-clear': {
            session.wbHistory = [];
            break;
        }
        case 'wb-undo': {
            session.wbHistory.pop();
            break;
        }
        case 'wb-sync': {
            if (Array.isArray(msg.history)) session.wbHistory = msg.history.slice(-800);
            if (Array.isArray(msg.questions)) session.questions = msg.questions.slice(0, 100);
            break;
        }
        case 'wb-questions': {
            if (Array.isArray(msg.questions)) session.questions = msg.questions.slice(0, 100);
            break;
        }
        case 'timer-sync': {
            session.timer = {
                mode: msg.timerMode || 'focus',
                secondsLeft: Number(msg.timerSecondsLeft) || 1500,
                running: Boolean(msg.timerRunning),
                updatedAt: Date.now()
            };
            break;
        }
        case 'progress': {
            const p = session.participants.get(from);
            if (p) {
                p.goal = String(msg.goal || '').slice(0, 100);
                p.elapsed = Number(msg.elapsed) || 0;
            }
            break;
        }
        case 'hand-raise': {
            const p = session.participants.get(from);
            if (p) p.handRaised = Boolean(msg.raised);
            break;
        }
    }

    broadcastRoomEvent(session, msg, from, target);
    res.json({ success: true });
});

// Leave a Study Room
app.post('/api/studyroom/leave', (req, res) => {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const peerId = String(req.body?.peerId || '').trim().slice(0, 80);
    const session = studyRooms.get(code);
    if (!session) return res.json({ success: true });

    session.participants.delete(peerId);
    session.clients.delete(peerId);
    session.updatedAt = Date.now();

    if (peerId === session.hostPeerId || session.participants.size === 0) {
        broadcastRoomEvent(session, {
            action: 'room-closed',
            from: peerId,
            _msgId: `srv_close_${Date.now()}`
        }, peerId);
        studyRooms.delete(code);
    } else {
        broadcastRoomEvent(session, {
            action: 'peer-left',
            from: peerId,
            peerId,
            _msgId: `srv_leave_${peerId}_${Date.now()}`
        }, peerId);
    }
    res.json({ success: true });
});

// Legacy endpoints preserved for backwards compatibility
app.post('/api/study-room/create', (req, res) => {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += alphabet[bytes[i] % alphabet.length];
    }
    const rawPass = typeof req.body?.password === 'string' && req.body.password.length > 0 ? req.body.password : null;
    const passwordHash = rawPass ? crypto.createHash('sha256').update(rawPass).digest('hex') : null;
    const hostName = String(req.body?.username || 'Anonymous').slice(0, 32);
    const participants = new Map();
    participants.set('host-1', { peerId: 'host-1', nickname: hostName, isHost: true, joinedAt: Date.now() });
    const session = {
        code,
        host: hostName,
        hostPeerId: 'host-1',
        passwordHash,
        title: String(req.body?.title || `Study Group #${code}`).slice(0, 80),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        participants,
        clients: new Map(),
        members: [{ id: 'host-1', name: hostName, role: 'Host' }],
        messages: [{ sender: 'System', text: 'Room created. Welcome!', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }],
        questions: [],
        wbHistory: [],
        timer: { mode: 'focus', secondsLeft: 1500, running: false, updatedAt: Date.now() }
    };
    studyRooms.set(code, session);
    res.json({ success: true, session: sanitizeStudySession(session) });
});

app.get('/api/study-room/:code', (req, res) => {
    const session = studyRooms.get(String(req.params.code || '').toUpperCase());
    if (!session) return res.status(404).json({ error: 'Room not found' });
    res.json({ success: true, session: sanitizeStudySession(session) });
});

app.post('/api/study-room/:code/message', (req, res) => {
    const session = studyRooms.get(String(req.params.code || '').toUpperCase());
    if (!session) return res.status(404).json({ error: 'Room not found' });
    const msg = {
        sender: String(req.body?.sender || 'Member').slice(0, 32),
        text: String(req.body?.text || '').slice(0, 2000),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    session.messages.push(msg);
    res.json({ success: true, message: msg });
});

// Explicit header settings for static PDF serving
app.use('/documents', (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    next();
}, express.static(path.join(__dirname, 'documents')));

app.use('/documentshd', (req, res, next) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    next();
}, express.static(path.join(__dirname, 'documentshd')));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.sendFile(path.join(__dirname, 'manifest.json'));
});
app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'sw.js'));
});
app.use('/app-icon.png', express.static(path.join(__dirname, 'app-icon.png')));
app.use('/questionary.db', express.static(path.join(__dirname, 'questionary.db')));
app.get('/database.db', (req, res) => {
    const dbAlias = path.join(__dirname, 'database.db');
    const dbPrimary = path.join(__dirname, 'questionary.db');
    if (fs.existsSync(dbAlias)) return res.sendFile(dbAlias);
    if (fs.existsSync(dbPrimary)) return res.sendFile(dbPrimary);
    return res.status(404).type('text/plain').send('Not found');
});
app.use(express.static(__dirname));

// Announcements & Updates Persistent Store
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
const announcementsFile = path.join(dataDir, 'announcements.json');

const INITIAL_ANNOUNCEMENTS = [
    {
        id: 'update_v240_launch',
        title: 'Questionary v2.4.0: Major Academic Overhaul!',
        category: 'Feature Update',
        version: 'v2.4.0',
        author: 'Sayan',
        date: Date.now() - 3600000 * 4,
        excerpt: 'Massive study upgrades: 3D Flashcards with ICSE decks, Rich Markdown Notes with split preview, Lo-Fi Study Room soundscapes, and Accessibility tools.',
        content: `### Welcome to Questionary v2.4.0!

We are excited to deliver this comprehensive overhaul designed for high performance:

1. **Interactive 3D Flashcards**:
   - Modern 3D flip card animations with keyboard shortcuts (Space to flip, 1-4 for Spaced Repetition SRS).
   - Pre-loaded with official high-yield ICSE Class 10 study decks (Physics, Chemistry, Biology, Java OOPs).
   - Audio text-to-speech speaker to listen to definitions and formulas out loud.
   - Interactive Quiz mode with instant multiple choice scoring!

2. **Advanced Notes with Markdown & Split Preview**:
   - Full Markdown editor with live formatting toolbar (Bold, Italic, Code, Formulas, Quotes, Lists).
   - Split preview toggle, pin to top for favorite notes, and one-click markdown (.md) export.

3. **Study Room & Focus Workstation**:
   - Circular Pomodoro focus timer with custom work/break intervals and gentle audio chimes.
   - Procedural Web Audio Lo-Fi soundscape mixer: Gentle Rain, Ocean Waves, Cafe chatter, Campfire, and 10Hz Alpha Binaural Beats (100% offline).
   - Real-time study goals checklist and daily focus stats.

4. **Universal Accessibility**:
   - High-contrast visual modes, dyslexia-friendly typography, customizable text sizing, and focus ruler.`
    }
];

if (!fs.existsSync(announcementsFile)) {
    fs.writeFileSync(announcementsFile, JSON.stringify(INITIAL_ANNOUNCEMENTS, null, 2));
}

app.get('/api/announcements', (req, res) => {
    try {
        if (fs.existsSync(announcementsFile)) {
            const raw = fs.readFileSync(announcementsFile, 'utf8');
            return res.json(JSON.parse(raw));
        }
        res.json(INITIAL_ANNOUNCEMENTS);
    } catch (e) {
        res.json(INITIAL_ANNOUNCEMENTS);
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all
app.get('*', (req, res) => {
    const safeRel = String(req.path || '').replace(/^\/+/, '');
    const resolved = path.resolve(__dirname, safeRel);
    if (safeRel && resolved.startsWith(__dirname + path.sep) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        return res.sendFile(resolved);
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
    console.log(` Questionary Server running on http://${HOST}:${PORT}`);
});
