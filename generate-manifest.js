

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, 'src', 'documents');
const CODE_DIR = path.join(__dirname, 'src');
const CONTENT_OUTPUT = path.join(__dirname, 'content-manifest.json');
const CODE_OUTPUT = path.join(__dirname, 'code-manifest.json');
const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/Nugget1252/Questionarytauri/main/';

const CODE_FILES = [
    'js/app.js',
    'js/contentUpdater.js',
    'js/hotUpdater.js',
    'css/styles.css'
];


function parseFilename(filename) {
  
    const match = filename.match(/^(\d{4}-\d{2})_CL_(\d+)_([^_]+)_(.+)\.pdf$/i);
    if (match) {
        return {
            year: match[1],
            class: `Class ${match[2]}`,
            exam: match[3].replace(/_/g, ' ').toUpperCase(),
            subject: match[4].replace(/_/g, ' ')
        };
    }
    
   
    const studyMatch = filename.match(/^Study_Material_Class_(\d+)_(.+)\.pdf$/i);
    if (studyMatch) {
        return {
            type: 'study_material',
            class: `Class ${studyMatch[1]}`,
            name: studyMatch[2].replace(/_/g, ' ')
        };
    }
    
    return null;
}


function calculateHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
}


function getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size;
}


function generateContentManifest() {
    const manifest = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        baseUrl: GITHUB_BASE_URL + 'content-v1.0.0/',
        documents: {},
        studyMaterials: {}
    };
    
    if (!fs.existsSync(DOCS_DIR)) {
        console.log('Documents directory not found, skipping content manifest');
        return null;
    }
    

    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.pdf'));
    
    console.log(`Found ${files.length} PDF files`);
    
    for (const file of files) {
        const filePath = path.join(DOCS_DIR, file);
        const parsed = parseFilename(file);
        
        if (!parsed) {
            console.log(`Could not parse: ${file}`);
            continue;
        }
        
        const hash = calculateHash(filePath);
        const size = getFileSize(filePath);
        
        if (parsed.type === 'study_material') {
   
            if (!manifest.studyMaterials[parsed.class]) {
                manifest.studyMaterials[parsed.class] = {};
            }
            
          
            const subjectMatch = parsed.name.match(/^(.+?)_(.+)$/);
            if (subjectMatch) {
                const subject = subjectMatch[1];
                const topic = subjectMatch[2];
                
                if (!manifest.studyMaterials[parsed.class][subject]) {
                    manifest.studyMaterials[parsed.class][subject] = [];
                }
                
                manifest.studyMaterials[parsed.class][subject].push({
                    name: topic,
                    file: file,
                    hash: hash,
                    size: size
                });
            }
        } else {
            
            const { year, class: cls, exam, subject } = parsed;
            
            if (!manifest.documents[year]) {
                manifest.documents[year] = {};
            }
            if (!manifest.documents[year][cls]) {
                manifest.documents[year][cls] = {};
            }
            if (!manifest.documents[year][cls][exam]) {
                manifest.documents[year][cls][exam] = {};
            }
            
            manifest.documents[year][cls][exam][subject] = {
                file: file,
                hash: hash,
                size: size
            };
        }
    }
    
    fs.writeFileSync(CONTENT_OUTPUT, JSON.stringify(manifest, null, 2));
    console.log(`\nContent manifest written to: ${CONTENT_OUTPUT}`);
    
    const totalSize = files.reduce((sum, f) => sum + getFileSize(path.join(DOCS_DIR, f)), 0);
    console.log(`Total content size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    return manifest;
}

function generateCodeManifest(version = '1.0.0') {
    const manifest = {
        version: version,
        lastUpdated: new Date().toISOString(),
        baseUrl: GITHUB_BASE_URL + 'src/',
        files: {}
    };
    
    console.log('\n--- Generating Code Manifest ---');
    
    for (const relPath of CODE_FILES) {
        const filePath = path.join(CODE_DIR, relPath);
        
        if (!fs.existsSync(filePath)) {
            console.log(`File not found: ${relPath}`);
            continue;
        }
        
        const hash = calculateHash(filePath);
        const size = getFileSize(filePath);
        const type = relPath.endsWith('.css') ? 'css' : 'js';
        
        manifest.files[relPath] = {
            version: version,
            url: GITHUB_BASE_URL + 'src/' + relPath,
            hash: hash,
            size: size,
            type: type,
            critical: relPath.includes('app.js') || relPath.includes('hotUpdater')
        };
        
        console.log(`  ${relPath}: ${hash.substring(0, 8)}... (${(size / 1024).toFixed(1)} KB)`);
    }

    fs.writeFileSync(CODE_OUTPUT, JSON.stringify(manifest, null, 2));
    console.log(`\nCode manifest written to: ${CODE_OUTPUT}`);
    
    return manifest;
}

function bumpVersion(currentVersion, type = 'patch') {
    const parts = currentVersion.split('.').map(Number);
    
    switch (type) {
        case 'major':
            parts[0]++;
            parts[1] = 0;
            parts[2] = 0;
            break;
        case 'minor':
            parts[1]++;
            parts[2] = 0;
            break;
        case 'patch':
        default:
            parts[2]++;
    }
    
    return parts.join('.');
}

function main() {
    console.log('=== Questionary Manifest Generator ===\n');
   
    const args = process.argv.slice(2);
    let codeVersion = '1.0.0';
    
    if (fs.existsSync(CODE_OUTPUT)) {
        try {
            const existing = JSON.parse(fs.readFileSync(CODE_OUTPUT, 'utf8'));
            codeVersion = existing.version || '1.0.0';
            
            
            if (args.includes('--bump') || args.includes('-b')) {
                const bumpType = args.includes('--major') ? 'major' : 
                               args.includes('--minor') ? 'minor' : 'patch';
                codeVersion = bumpVersion(codeVersion, bumpType);
                console.log(`Bumping version: ${existing.version} -> ${codeVersion}\n`);
            }
        } catch (e) {
            console.log('Could not read existing manifest, using default version');
        }
    }
    
    generateContentManifest();
    generateCodeManifest(codeVersion);
    
    console.log('\n=== Done! ===');
    console.log('\nNext steps:');
    console.log('1. Commit and push the manifest files to GitHub');
    console.log('2. Users will automatically receive updates on next app launch');
    console.log('\nTo bump the code version: node generate-manifest.js --bump');
}

main();
