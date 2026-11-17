const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

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

function classifyDoc(f) {
    let year = 'Other';
    const ym = f.match(/^(20\d{2}-\d{2})/);
    if (ym) year = ym[1];
    else if (f.startsWith('Study_Material')) year = 'Study Material';

    let cls = 'Class 9';
    if (f.includes('CL_10') || f.includes('CLASS 10') || f.includes('CLASS.10') || f.includes('CLASS X') || f.includes('GRADE X') || f.includes('CL- 10') || f.includes('CL.10') || f.includes('10 EVS') || f.includes('10EVA') || f.includes('Class_10')) {
        cls = 'Class 10';
    }

    let exam = 'General';
    const u = f.toUpperCase();
    if (year === 'Study Material') {
        exam = 'Notes & Reference';
    } else if (u.includes('PREBOARD') || u.includes('PRE BOARD') || u.includes('PRE_BOARD') || u.includes('PREBOARDS') || u.includes('_PB_') || u.includes('_PB.')) {
        exam = 'Pre-Board';
    } else if (u.includes('_FT_') || u.includes('_FT.') || u.includes('FINAL TERM')) {
        exam = 'Final Term';
    } else if (u.includes('_HY_') || u.includes('_HY.') || u.includes('HALF YEARLY') || u.includes('HY EXAM') || u.includes('HYE')) {
        exam = 'Half Yearly';
    } else if (u.includes('MT_1') || u.includes('MT1') || u.includes('MT 1') || u.includes('M-1')) {
        exam = 'Mid Term 1';
    } else if (u.includes('MT_2') || u.includes('MT2') || u.includes('MT 2') || u.includes('M-2')) {
        exam = 'Mid Term 2';
    }

    // Extract raw subject name
    let subRaw = f.replace(/\.pdf$/i, '');
    subRaw = subRaw.replace(/^20\d{2}-\d{2}_CL_\d+_[A-Za-z0-9_]+_/, '');
    subRaw = subRaw.replace(/^Study_Material_Class_\d+_/, '');
    subRaw = subRaw.replace(/^[0-9A-Za-z_-]+_(HY|FT|MT_1|MT_2|MT1|MT2|PREBOARD)_/i, '');
    subRaw = subRaw.replace(/^HY EXAM_/i, '');
    subRaw = subRaw.replace(/^PRE BOARD_/i, '');
    subRaw = subRaw.replace(/^MT 1_/i, '');
    subRaw = subRaw.replace(/^MT 2_/i, '');

    const name = cleanSubjectName(subRaw || f);
    return { year, cls, exam, name, file_path: `documents/${f}` };
}

async function buildDatabase() {
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    db.run(`
        CREATE TABLE nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            is_folder INTEGER DEFAULT 1,
            file_path TEXT DEFAULT '#'
        );
    `);

    const files = fs.readdirSync('documents').filter(f => f.endsWith('.pdf'));
    console.log(`Processing ${files.length} documents...`);

    const yearFolderIds = {};
    const classFolderIds = {};
    const examFolderIds = {};

    // Explicit order for year folders
    const rootYears = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', 'Study Material'];
    for (const y of rootYears) {
        db.run("INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (NULL, ?, 1, '#')", [y]);
        const res = db.exec("SELECT last_insert_rowid()");
        yearFolderIds[y] = res[0].values[0][0];
    }

    // For each document, ensure class and exam folders exist under the year
    for (const file of files) {
        const item = classifyDoc(file);
        const yId = yearFolderIds[item.year] || yearFolderIds['2025-26'];

        const classKey = `${item.year}|${item.cls}`;
        if (!classFolderIds[classKey]) {
            db.run("INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, 1, '#')", [yId, item.cls]);
            const res = db.exec("SELECT last_insert_rowid()");
            classFolderIds[classKey] = res[0].values[0][0];
        }
        const cId = classFolderIds[classKey];

        const examKey = `${classKey}|${item.exam}`;
        if (!examFolderIds[examKey]) {
            db.run("INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, 1, '#')", [cId, item.exam]);
            const res = db.exec("SELECT last_insert_rowid()");
            examFolderIds[examKey] = res[0].values[0][0];
        }
        const eId = examFolderIds[examKey];

        // Insert document leaf
        db.run("INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, 0, ?)", [eId, item.name, item.file_path]);
    }

    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync('questionary.db', buffer);
    console.log('Saved questionary.db, size:', buffer.length);
}

buildDatabase().catch(err => {
    console.error('Error building database:', err);
    process.exit(1);
});
