import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, execFileSync as run } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appJsPath = path.join(repoRoot, 'src', 'js', 'app.js');
const databasePath = path.join(repoRoot, 'database.db');

function extractDocumentsObject(source) {
  const startMarker = '// IMPORTANT: Populate documents data and expose to window';
  const endMarker = '// Expose documents globally immediately after definition';
  const markerIndex = source.indexOf(startMarker);
  const startIndex = source.indexOf('documents = {', markerIndex);
  const endIndex = source.indexOf(endMarker);

  if (markerIndex === -1 || startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error('Could not locate documents object in app.js');
  }

  const objectSource = source.slice(startIndex + 'documents = '.length, endIndex).trim().replace(/;\s*$/, '');
  return vm.runInNewContext(`(${objectSource})`, {});
}

function flattenDocuments(node, pathSegments = [], rows = []) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      flattenDocuments(value, [...pathSegments, key], rows);
    }
    return rows;
  }

  if (pathSegments.length === 0) {
    return rows;
  }

  const [year = null, className = null, term = null] = pathSegments;
  const subject = pathSegments[pathSegments.length - 1] ?? null;
  rows.push({
    year,
    className,
    term,
    subject,
    filePath: String(node),
    pathJson: JSON.stringify(pathSegments),
    pathDepth: pathSegments.length
  });
  return rows;
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

const source = run('git', ['show', 'HEAD:src/js/app.js'], { cwd: repoRoot, encoding: 'utf8' });
const documents = extractDocumentsObject(source);
const rows = flattenDocuments(documents);

const schema = `
DROP TABLE IF EXISTS papers;
CREATE TABLE papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year TEXT NOT NULL,
  class_name TEXT,
  term TEXT,
  subject TEXT,
  file_path TEXT NOT NULL,
  path_json TEXT NOT NULL,
  path_depth INTEGER NOT NULL
);
CREATE INDEX idx_papers_year ON papers(year);
CREATE INDEX idx_papers_term ON papers(term);
CREATE INDEX idx_papers_subject ON papers(subject);
CREATE INDEX idx_papers_path ON papers(path_json);
BEGIN TRANSACTION;
`;

const inserts = rows.map((row) => {
  const values = [
    row.year,
    row.className,
    row.term,
    row.subject,
    row.filePath,
    row.pathJson,
    row.pathDepth
  ].map((value) => value === null || value === undefined ? 'NULL' : `'${escapeSql(value)}'`);

  return `INSERT INTO papers (year, class_name, term, subject, file_path, path_json, path_depth) VALUES (${values.join(', ')});`;
});

const footer = '\nCOMMIT;\n';

fs.rmSync(databasePath, { force: true });
execFileSync('sqlite3', [databasePath], {
  input: schema + inserts.join('\n') + footer,
  stdio: ['pipe', 'inherit', 'inherit']
});

fs.writeFileSync(path.join(repoRoot, 'src', 'documents.json'), JSON.stringify(documents, null, 2));

console.log(`Created ${databasePath} with ${rows.length} records.`);
