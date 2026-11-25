/* ==========================================================================
   QUESTIONARY STUDY IMPORT / EXPORT & AI PROMPT GUIDE (v1.0)
   - Import & Export for Flashcard Decks (JSON, CSV/Anki, Plain Text Q/A)
   - Import & Export for Study Notes (JSON, Markdown, Plain Text)
   - Interactive AI Prompt Builder & Step-by-Step Tutorial (100% offline/local,
     no AI integrated directly into the site)
   ========================================================================== */

(function () {
  'use strict';

  const SUBJECTS = [
    'General',
    'Physics',
    'Chemistry',
    'Biology',
    'Mathematics',
    'Computer Applications',
    'English',
    'History',
    'Geography',
    'Other'
  ];

  const SUBJECT_ALIASES = {
    '': 'General',
    'general': 'General',
    'physics': 'Physics',
    'chemistry': 'Chemistry',
    'biology': 'Biology',
    'math': 'Mathematics',
    'maths': 'Mathematics',
    'mathematics': 'Mathematics',
    'computer': 'Computer Applications',
    'computers': 'Computer Applications',
    'computer science': 'Computer Applications',
    'computer applications': 'Computer Applications',
    'english': 'English',
    'history': 'History',
    'geography': 'Geography',
    'other': 'Other'
  };

  function normalizeSubject(raw) {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return 'General';
    const lower = cleaned.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SUBJECT_ALIASES, lower)) {
      return SUBJECT_ALIASES[lower];
    }
    const exact = SUBJECTS.find(s => s.toLowerCase() === lower);
    if (exact) return exact;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notify(msg, type = 'info') {
    if (typeof window.showNotification === 'function') {
      window.showNotification(msg, type);
    }
  }

  function slugify(str, fallback = 'export') {
    const clean = String(str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    return clean || fallback;
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  function countWords(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  // =========================================================================
  // ROBUST PARSERS (JSON w/ fence & prose extraction, CSV/TSV, Q/A, Markdown)
  // =========================================================================

  function stripCodeFences(raw) {
    const trimmed = String(raw || '').trim();
    const fenced = trimmed.match(/```(?:json|JSON|markdown|md|csv|txt)?\s*\n?([\s\S]*?)```/);
    if (fenced && fenced[1]) {
      return fenced[1].trim();
    }
    return trimmed;
  }

  function tryParseJsonLenient(raw) {
    const cleaned = stripCodeFences(raw);
    if (!cleaned) return null;

    // 1. Direct parse
    try {
      return JSON.parse(cleaned);
    } catch (e) {}

    // 2. Extract outermost JSON array or object from surrounding AI chatter
    const firstBracket = cleaned.indexOf('[');
    const firstBrace = cleaned.indexOf('{');
    let startIdx = -1;
    let openChar = '';
    let closeChar = '';

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      openChar = '[';
      closeChar = ']';
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      openChar = '{';
      closeChar = '}';
    }

    if (startIdx !== -1) {
      const endIdx = cleaned.lastIndexOf(closeChar);
      if (endIdx > startIdx) {
        const candidate = cleaned.slice(startIdx, endIdx + 1);
        try {
          return JSON.parse(candidate);
        } catch (e) {
          // Try fixing trailing commas before ] or }
          const noTrailingCommas = candidate.replace(/,\s*([}\]])/g, '$1');
          try {
            return JSON.parse(noTrailingCommas);
          } catch (e2) {}
        }
      }
    }

    return null;
  }

  function parseCsvRows(text, delimiter = ',') {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const src = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          row.push(field.trim());
          field = '';
        } else if (ch === '\n') {
          row.push(field.trim());
          if (row.some(cell => cell !== '')) rows.push(row);
          row = [];
          field = '';
        } else {
          field += ch;
        }
      }
    }
    row.push(field.trim());
    if (row.some(cell => cell !== '')) rows.push(row);
    return rows;
  }

  function escapeCsvCell(value) {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  function extractCardObject(item) {
    if (!item || typeof item !== 'object') return null;
    const front = String(
      item.front ?? item.question ?? item.q ?? item.term ?? item.prompt ?? ''
    ).trim();
    const back = String(
      item.back ?? item.answer ?? item.a ?? item.definition ?? item.response ?? ''
    ).trim();
    const hint = String(item.hint ?? item.clue ?? item.tip ?? '').trim();
    const mastery = Math.max(0, Math.min(3, Number(item.mastery) || 0));
    if (!front || !back) return null;
    return { front, back, hint, mastery };
  }

  function parseFlashcardsInput(rawText, filename = '') {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Paste flashcard data or upload a file to preview.', decks: [] };
    }

    const baseName = filename
      ? filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      : '';
    const defaultDeckName = baseName || 'Imported Deck';

    // 1. Try JSON first
    const json = tryParseJsonLenient(trimmed);
    if (json !== null) {
      const parsedDecks = [];
      let needsDeckMeta = false;

      const normalizeDeckObj = (obj, idx) => {
        if (!obj || typeof obj !== 'object') return null;
        const rawCards = Array.isArray(obj.cards)
          ? obj.cards
          : Array.isArray(obj.flashcards)
            ? obj.flashcards
            : Array.isArray(obj.items)
              ? obj.items
              : null;
        if (!rawCards) return null;
        const cards = rawCards.map(extractCardObject).filter(Boolean);
        if (cards.length === 0) return null;
        const name = String(obj.name || obj.title || obj.deckName || `${defaultDeckName}${idx > 0 ? ` ${idx + 1}` : ''}`).trim();
        const subject = normalizeSubject(obj.subject || obj.category || obj.topic || 'General');
        return { name, subject, cards };
      };

      if (Array.isArray(json)) {
        // Could be array of decks OR flat array of cards
        const looksLikeDecks = json.some(el => el && typeof el === 'object' && (Array.isArray(el.cards) || Array.isArray(el.flashcards)));
        if (looksLikeDecks) {
          json.forEach((d, idx) => {
            const norm = normalizeDeckObj(d, idx);
            if (norm) parsedDecks.push(norm);
          });
        } else {
          const cards = json.map(extractCardObject).filter(Boolean);
          if (cards.length > 0) {
            needsDeckMeta = true;
            parsedDecks.push({ name: defaultDeckName, subject: 'General', cards });
          }
        }
      } else if (typeof json === 'object') {
        if (Array.isArray(json.decks)) {
          json.decks.forEach((d, idx) => {
            const norm = normalizeDeckObj(d, idx);
            if (norm) parsedDecks.push(norm);
          });
        } else if (Array.isArray(json.flashcardDecks)) {
          json.flashcardDecks.forEach((d, idx) => {
            const norm = normalizeDeckObj(d, idx);
            if (norm) parsedDecks.push(norm);
          });
        } else {
          const single = normalizeDeckObj(json, 0);
          if (single) parsedDecks.push(single);
        }
      }

      if (parsedDecks.length > 0) {
        return {
          ok: true,
          format: 'JSON',
          needsDeckMeta,
          decks: parsedDecks
        };
      }
      return {
        ok: false,
        error: 'Valid JSON was found, but no flashcards with both a front/question and back/answer were detected.',
        decks: []
      };
    }

    // Check if it looks like broken/truncated JSON from an AI
    const stripped = stripCodeFences(trimmed);
    if ((stripped.startsWith('{') || stripped.startsWith('[')) && /"front"|"question"|"cards"/.test(stripped)) {
      return {
        ok: false,
        error: 'This looks like JSON, but it has a syntax error or was cut off mid-response. Check the ending brackets or ask the AI to output valid JSON.',
        decks: []
      };
    }

    // 2. Try Q: / A: blocks
    const qaMatches = [];
    const qaBlocks = stripped.split(/\n\s*\n/);
    for (const block of qaBlocks) {
      const qMatch = block.match(/^(?:Q(?:uestion)?\s*\d*[:.)]\s*)([\s\S]*?)\n\s*(?:A(?:nswer)?\s*\d*[:.)]\s*)([\s\S]*?)(?:\n\s*(?:H(?:int)?[:.)]\s*)([\s\S]*))?$/i);
      if (qMatch) {
        const front = qMatch[1].trim();
        const back = qMatch[2].trim();
        const hint = (qMatch[3] || '').trim();
        if (front && back) {
          qaMatches.push({ front, back, hint, mastery: 0 });
        }
      }
    }
    if (qaMatches.length > 0) {
      return {
        ok: true,
        format: 'Q&A Text',
        needsDeckMeta: true,
        decks: [{ name: defaultDeckName, subject: 'General', cards: qaMatches }]
      };
    }

    // 3. Try TSV / CSV / Semicolon-separated
    const firstLine = stripped.split('\n')[0] || '';
    const delimiter = firstLine.includes('\t')
      ? '\t'
      : firstLine.includes(';') && !firstLine.includes(',')
        ? ';'
        : ',';
    const rows = parseCsvRows(stripped, delimiter);
    if (rows.length > 0) {
      const header = rows[0].map(h => h.toLowerCase().trim());
      const hasDeckHeader = header.includes('deck') && (header.includes('front') || header.includes('question'));
      const hasSimpleHeader =
        (header[0] === 'front' || header[0] === 'question' || header[0] === 'term') &&
        (header[1] === 'back' || header[1] === 'answer' || header[1] === 'definition');

      if (hasDeckHeader) {
        const deckIdx = header.indexOf('deck');
        const subjIdx = header.indexOf('subject');
        const frontIdx = header.includes('front') ? header.indexOf('front') : header.indexOf('question');
        const backIdx = header.includes('back') ? header.indexOf('back') : header.indexOf('answer');
        const hintIdx = header.indexOf('hint');

        const deckMap = new Map();
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const front = (r[frontIdx] || '').trim();
          const back = (r[backIdx] || '').trim();
          if (!front || !back) continue;
          const dName = (r[deckIdx] || defaultDeckName).trim() || defaultDeckName;
          const dSubj = normalizeSubject(subjIdx >= 0 ? r[subjIdx] : 'General');
          const hint = hintIdx >= 0 ? (r[hintIdx] || '').trim() : '';
          const key = `${dName.toLowerCase()}__${dSubj.toLowerCase()}`;
          if (!deckMap.has(key)) {
            deckMap.set(key, { name: dName, subject: dSubj, cards: [] });
          }
          deckMap.get(key).cards.push({ front, back, hint, mastery: 0 });
        }
        const parsedDecks = Array.from(deckMap.values());
        if (parsedDecks.length > 0) {
          return {
            ok: true,
            format: delimiter === '\t' ? 'TSV' : 'CSV',
            needsDeckMeta: false,
            decks: parsedDecks
          };
        }
      } else {
        const startRow = hasSimpleHeader ? 1 : 0;
        const cards = [];
        for (let i = startRow; i < rows.length; i++) {
          const r = rows[i];
          if (r.length >= 2 && r[0] && r[1]) {
            cards.push({
              front: r[0],
              back: r[1],
              hint: r[2] || '',
              mastery: 0
            });
          }
        }
        if (cards.length > 0) {
          return {
            ok: true,
            format: delimiter === '\t' ? 'TSV' : 'CSV',
            needsDeckMeta: true,
            decks: [{ name: defaultDeckName, subject: 'General', cards }]
          };
        }
      }
    }

    return {
      ok: false,
      error: 'Could not recognize flashcards in this text. Supported formats: Questionary JSON, CSV/TSV ("Front,Back,Hint"), or "Q: ... / A: ..." blocks.',
      decks: []
    };
  }

  function extractNoteObject(item, fallbackIdx = 0) {
    if (!item || typeof item !== 'object') return null;
    const content = String(
      item.content ?? item.body ?? item.markdown ?? item.text ?? ''
    );
    let title = String(item.title ?? item.name ?? item.heading ?? '').trim();
    if (!title && content.trim()) {
      const h1 = content.match(/^#\s+(.+)$/m);
      title = h1 ? h1[1].trim() : `Imported Note ${fallbackIdx + 1}`;
    }
    if (!title && !content.trim()) return null;
    return {
      title: title || `Imported Note ${fallbackIdx + 1}`,
      category: normalizeSubject(item.category || item.subject || item.topic || 'General'),
      content: content.trim(),
      pinned: Boolean(item.pinned)
    };
  }

  function parseNotesInput(rawText, filename = '') {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) {
      return { ok: false, error: 'Paste note content or upload a file to preview.', notes: [] };
    }

    const baseName = filename
      ? filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      : '';

    // 1. Try JSON first
    const json = tryParseJsonLenient(trimmed);
    if (json !== null) {
      const parsedNotes = [];
      if (Array.isArray(json)) {
        json.forEach((item, idx) => {
          const norm = extractNoteObject(item, idx);
          if (norm) parsedNotes.push(norm);
        });
      } else if (typeof json === 'object') {
        if (Array.isArray(json.notes)) {
          json.notes.forEach((item, idx) => {
            const norm = extractNoteObject(item, idx);
            if (norm) parsedNotes.push(norm);
          });
        } else {
          const single = extractNoteObject(json, 0);
          if (single) parsedNotes.push(single);
        }
      }

      if (parsedNotes.length > 0) {
        return {
          ok: true,
          format: 'JSON',
          isSingleRawMarkdown: false,
          notes: parsedNotes
        };
      }
      return {
        ok: false,
        error: 'Valid JSON was found, but no notes with a title or content field were detected.',
        notes: []
      };
    }

    // Detect broken JSON from AI
    const stripped = stripCodeFences(trimmed);
    if ((stripped.startsWith('{') || stripped.startsWith('[')) && /"title"|"content"|"notes"/.test(stripped)) {
      return {
        ok: false,
        error: 'This looks like JSON, but it has a syntax error or was cut off mid-response. Check the ending brackets or ask the AI to output valid JSON.',
        notes: []
      };
    }

    // 2. Treat as Markdown or Plain Text note
    // Check if it's a multi-note Questionary Markdown export separated by ---\n<!-- questionary-note -->
    const multiParts = stripped.split(/\n---\s*\n<!--\s*questionary-note\s*-->\s*\n/i);
    if (multiParts.length > 1) {
      const parsedNotes = [];
      multiParts.forEach((part, idx) => {
        const lines = part.trim().split('\n');
        let title = `Imported Note ${idx + 1}`;
        let category = 'General';
        let bodyStart = 0;

        if (lines[0] && /^#\s+/.test(lines[0])) {
          title = lines[0].replace(/^#\s+/, '').trim();
          bodyStart = 1;
        }
        if (lines[bodyStart] && /^_?Category:\s*/i.test(lines[bodyStart].trim())) {
          category = normalizeSubject(lines[bodyStart].trim().replace(/^_?Category:\s*/i, '').replace(/_$/, '').trim());
          bodyStart++;
        }
        const content = lines.slice(bodyStart).join('\n').trim();
        if (title || content) {
          parsedNotes.push({ title, category, content, pinned: false });
        }
      });
      if (parsedNotes.length > 0) {
        return {
          ok: true,
          format: 'Markdown Bundle',
          isSingleRawMarkdown: false,
          notes: parsedNotes
        };
      }
    }

    // Single Markdown / Plain Text note
    const lines = stripped.split('\n');
    let derivedTitle = baseName || '';
    let contentBody = stripped;
    if (lines[0] && /^#\s+(.+)$/.test(lines[0].trim())) {
      derivedTitle = lines[0].trim().replace(/^#\s+/, '').trim();
      contentBody = lines.slice(1).join('\n').trim();
    }
    if (!derivedTitle) {
      const firstNonEmpty = lines.find(l => l.trim().length > 0) || 'Imported Study Note';
      derivedTitle = firstNonEmpty.replace(/[#*_`>]/g, '').trim().slice(0, 64) || 'Imported Study Note';
    }

    return {
      ok: true,
      format: filename.toLowerCase().endsWith('.txt') ? 'Plain Text' : 'Markdown',
      isSingleRawMarkdown: true,
      notes: [{
        title: derivedTitle,
        category: 'General',
        content: contentBody || stripped,
        pinned: false
      }]
    };
  }

  // =========================================================================
  // AI PROMPT GENERATORS (Client-side templates only — NO AI API on site)
  // =========================================================================

  function buildFlashcardsAiPrompt(opts) {
    const topic = (opts.topic || '').trim() || '[INSERT YOUR TOPIC OR CHAPTER HERE]';
    const subject = normalizeSubject(opts.subject || 'General');
    const count = Math.max(5, Math.min(50, Number(opts.count) || 15));
    const focusMap = {
      concepts: 'core concepts, definitions, and clear cause-and-effect explanations',
      exam: 'exam-style questions, formulas, key dates/laws, and common tricky distinctions',
      deep: 'deep conceptual understanding, worked examples, and edge cases',
      quick: 'concise rapid-revision recall prompts with short, crisp answers'
    };
    const focusDesc = focusMap[opts.focus] || focusMap.concepts;
    const includeHints = Boolean(opts.includeHints);
    const includeSource = Boolean(opts.includeSource);

    const hintInstruction = includeHints
      ? '- Include a short, genuinely helpful "hint" on each card (a memory cue or formula clue that does not give away the full answer).'
      : '- Set "hint" to an empty string "" on every card.';

    const sourceInstruction = includeSource
      ? '\n- Base the flashcards strictly on the study material I paste below. Do not invent facts outside the provided material.'
      : '';

    const sourceBlock = includeSource
      ? '\n\nStudy material to convert into flashcards:\n"""\n[PASTE YOUR TEXTBOOK EXCERPT, CLASS NOTES, OR SYLLABUS HERE]\n"""'
      : '';

    return `You are helping me create study flashcards to import into my Questionary study app.

Topic: ${topic}
Subject: ${subject}
Number of cards: ${count}
Focus: ${focusDesc}

Output requirements (IMPORTANT):
- Return ONLY valid JSON inside a single \`\`\`json code block — no intro text or commentary outside the code block.
- Follow this exact JSON structure:
\`\`\`json
[
  {
    "name": "${topic}",
    "subject": "${subject}",
    "cards": [
      {
        "front": "Clear, specific question or prompt",
        "back": "Accurate, concise answer (use \\n for line breaks if needed)",
        "hint": "${includeHints ? 'Brief memory cue or clue' : ''}"
      }
    ]
  }
]
\`\`\`
- Create exactly ${count} high-quality flashcards covering the topic thoroughly without repeating questions.
- Keep "subject" strictly as one of: General, Physics, Chemistry, Biology, Mathematics, Computer Applications, English, History, Geography, Other.
${hintInstruction}
- Make sure all double quotes inside text are properly escaped (\\") so the JSON parses cleanly.${sourceInstruction}${sourceBlock}`;
  }

  function buildNotesAiPrompt(opts) {
    const topic = (opts.topic || '').trim() || '[INSERT YOUR TOPIC OR CHAPTER HERE]';
    const subject = normalizeSubject(opts.subject || 'General');
    const styleMap = {
      summary: 'a structured revision summary with clear headings, bullet points, key takeaways, and bolded key terms',
      formulas: 'a clean formula, law, and key-facts reference sheet using code formatting for formulas and concise definitions',
      guide: 'a step-by-step concept guide explaining intuition, examples, and common mistakes to avoid',
      exam: 'an exam preparation breakdown with high-yield questions, model answer points, and comparison lists'
    };
    const styleDesc = styleMap[opts.style] || styleMap.summary;
    const depthMap = {
      concise: 'concise and scannable (quick 1-page revision)',
      balanced: 'balanced depth with clear explanations and examples',
      detailed: 'comprehensive, thorough chapter coverage'
    };
    const depthDesc = depthMap[opts.depth] || depthMap.balanced;
    const splitCount = opts.splitMode === 'multi' ? '3 to 5 focused notes (one per subtopic)' : '1 well-organized note';
    const includeSource = Boolean(opts.includeSource);

    const sourceInstruction = includeSource
      ? '\n- Base the notes strictly on the study material I paste below. Keep all key definitions, formulas, and terms accurate to the source.'
      : '';

    const sourceBlock = includeSource
      ? '\n\nStudy material to turn into notes:\n"""\n[PASTE YOUR TEXTBOOK EXCERPT, LECTURE TRANSCRIPT, OR SYLLABUS HERE]\n"""'
      : '';

    return `You are helping me create Markdown study notes to import into my Questionary study app.

Topic: ${topic}
Subject / Category: ${subject}
Format: ${splitCount}
Style: ${styleDesc}
Depth: ${depthDesc}

Output requirements (IMPORTANT):
- Return ONLY valid JSON inside a single \`\`\`json code block — no intro text or commentary outside the code block.
- Follow this exact JSON structure:
\`\`\`json
[
  {
    "title": "${topic}",
    "category": "${subject}",
    "content": "## Overview\\n\\n- **Key Point 1:** Clear explanation\\n- **Key Point 2:** Clear explanation\\n\\n### Important Formulas & Rules\\n\\n> Remember this key takeaway"
  }
]
\`\`\`
- Use clean Markdown inside "content" (## and ### headings, **bold**, *italic*, bullet lists, numbered lists, > blockquotes, and \`inline code\` for formulas/code).
- Use \\n for newlines inside the JSON string and escape any double quotes as \\" so the JSON parses cleanly.
- Keep "category" strictly as one of: General, Physics, Chemistry, Biology, Mathematics, Computer Applications, English, History, Geography, Other.${sourceInstruction}${sourceBlock}`;
  }

  // =========================================================================
  // MODAL INJECTION & LIFECYCLE
  // =========================================================================

  let modalsInjected = false;

  const state = {
    fcImportParsed: null,
    fcImportFilename: '',
    fcExportSelectedIds: new Set(),
    notesImportParsed: null,
    notesImportFilename: '',
    notesExportSelectedIds: new Set()
  };

  function subjectOptionsHtml(selected = 'General') {
    return SUBJECTS.map(s => `<option value="${escapeHtml(s)}" ${s === selected ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
  }

  function ensureModalsExist() {
    if (modalsInjected) return;
    modalsInjected = true;

    const container = document.createElement('div');
    container.id = 'studyImportExportModalsRoot';
    container.innerHTML = `
      <!-- ===================== IMPORT FLASHCARDS MODAL ===================== -->
      <div class="modal-overlay" id="importFlashcardsModal" role="dialog" aria-modal="true" aria-labelledby="importFcModalTitle">
        <div class="modal modal-lg sie-modal">
          <div class="modal-sheet-handle"></div>
          <div class="modal-header">
            <h3 id="importFcModalTitle"><i class="fas fa-file-import"></i> Import Flashcards</h3>
            <button type="button" class="modal-close" data-sie-close="importFlashcardsModal" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="sie-tabs" role="tablist">
            <button type="button" class="sie-tab active" role="tab" aria-selected="true" data-sie-tab="fc-import-paste">
              <i class="fas fa-upload"></i> Import File or Paste
            </button>
            <button type="button" class="sie-tab" role="tab" aria-selected="false" data-sie-tab="fc-import-ai">
              <i class="fas fa-terminal"></i> AI Prompt &amp; Guide
            </button>
          </div>

          <div class="modal-body sie-modal-body">
            <!-- TAB 1: Import File / Paste -->
            <div class="sie-tab-panel active" id="siePanel_fc-import-paste">
              <div class="sie-dropzone" id="fcImportDropzone" tabindex="0" role="button" aria-label="Upload flashcard file">
                <input type="file" id="fcImportFileInput" accept=".json,.csv,.tsv,.txt" hidden>
                <div class="sie-dropzone-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="sie-dropzone-text">
                  <strong>Drop a file here or click to browse</strong>
                  <span>Supports Questionary JSON, CSV / Anki TSV, or Q&amp;A text</span>
                </div>
              </div>

              <div class="sie-or-divider"><span>or paste JSON, CSV, or AI output below</span></div>

              <div class="form-group" style="margin-bottom: 12px;">
                <div class="sie-label-row">
                  <label class="form-label" for="fcImportTextarea" style="margin:0;">Paste Flashcards</label>
                  <button type="button" class="sie-text-action" id="fcImportClearBtn">Clear</button>
                </div>
                <textarea id="fcImportTextarea" class="form-input sie-code-textarea" rows="6" placeholder='Paste JSON exported from Questionary, output copied from ChatGPT/Gemini/Claude, or CSV lines like:&#10;What is the SI unit of force?,Newton (N),Named after Isaac Newton'></textarea>
              </div>

              <!-- Live Preview & Options -->
              <div id="fcImportPreviewArea" class="sie-preview-box" style="display:none;"></div>
              <div id="fcImportErrorArea" class="sie-error-box" style="display:none;" role="alert"></div>

              <div class="sie-guide-callout">
                <div class="sie-guide-callout-text">
                  <strong>Want an AI to generate flashcards for any chapter?</strong>
                  <span>Build a ready-to-paste prompt for ChatGPT, Gemini, or Claude with a quick tutorial.</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="fcSwitchToAiGuideBtn">
                  Open AI Prompt &amp; Guide <i class="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>

            <!-- TAB 2: AI Prompt Builder & Tutorial -->
            <div class="sie-tab-panel" id="siePanel_fc-import-ai">
              <div class="sie-offline-note">
                <i class="fas fa-info-circle"></i>
                <span>Questionary does not run AI directly on the site. Customize this prompt, copy it into any AI tool you already use (ChatGPT, Gemini, Claude, etc.), and paste its output into the <strong>Import File or Paste</strong> tab.</span>
              </div>

              <div class="sie-prompt-builder">
                <div class="sie-builder-grid">
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="fcAiTopic">Topic or Chapter</label>
                    <input type="text" id="fcAiTopic" class="form-input" placeholder="e.g., Refraction of Light, French Revolution, Java Loops">
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="fcAiSubject">Subject</label>
                    <select id="fcAiSubject" class="form-input">${subjectOptionsHtml('General')}</select>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="fcAiCount">Number of Cards</label>
                    <select id="fcAiCount" class="form-input">
                      <option value="10">10 cards (Quick set)</option>
                      <option value="15" selected>15 cards (Balanced)</option>
                      <option value="20">20 cards (Thorough)</option>
                      <option value="30">30 cards (Full chapter)</option>
                    </select>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="fcAiFocus">Card Style</label>
                    <select id="fcAiFocus" class="form-input">
                      <option value="concepts">Core Concepts &amp; Definitions</option>
                      <option value="exam">Exam Prep &amp; Formulas</option>
                      <option value="deep">Deep Understanding &amp; Examples</option>
                      <option value="quick">Quick Revision Recall</option>
                    </select>
                  </div>
                </div>

                <div class="sie-checkbox-row">
                  <label class="sie-check-label">
                    <input type="checkbox" id="fcAiHints" checked>
                    <span>Include memory hints on each card</span>
                  </label>
                  <label class="sie-check-label">
                    <input type="checkbox" id="fcAiIncludeSource">
                    <span>I will paste my own notes / textbook text below the prompt</span>
                  </label>
                </div>

                <div class="sie-prompt-output-wrap">
                  <div class="sie-prompt-output-header">
                    <span>Ready-to-Copy Prompt</span>
                    <button type="button" class="btn btn-primary btn-sm" id="fcCopyAiPromptBtn">
                      <i class="fas fa-copy"></i> Copy Prompt
                    </button>
                  </div>
                  <pre class="sie-prompt-pre" id="fcAiPromptPreview"></pre>
                </div>
              </div>

              <div class="sie-tutorial">
                <h4 class="sie-tutorial-heading">How to make AI create flashcards for your topic</h4>
                <ol class="sie-steps-list">
                  <li>
                    <span class="sie-step-num">01.</span>
                    <div>
                      <strong>Enter your topic above</strong> — Type the chapter, subject, and number of cards you want. If you have textbook pages, PDF text, or syllabus bullet points, check the box to paste them in.
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">02.</span>
                    <div>
                      <strong>Copy the prompt into your AI chat</strong> — Click <em>Copy Prompt</em>, then open ChatGPT, Google Gemini, Claude, or another AI assistant and paste it in. You can also attach a PDF or photo of your textbook pages along with the prompt.
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">03.</span>
                    <div>
                      <strong>Copy the AI's JSON code block</strong> — Wait for the AI to finish generating, then click the copy button on its JSON response. (Tip: for very large chapters, 15–20 cards per prompt avoids cut-off responses.)
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">04.</span>
                    <div>
                      <strong>Paste back here and import</strong> — Switch to <em>Import File or Paste</em>, paste the JSON, check the live card preview, and click <em>Import Flashcards</em>.
                    </div>
                  </li>
                </ol>
                <div class="sie-tutorial-footer">
                  <button type="button" class="btn btn-secondary btn-sm" id="fcGoToPasteTabBtn">
                    <i class="fas fa-paste"></i> Ready? Go to Paste &amp; Import
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer" id="fcImportModalFooter">
            <button type="button" class="btn btn-secondary" data-sie-close="importFlashcardsModal">Cancel</button>
            <button type="button" class="btn btn-primary" id="fcConfirmImportBtn" disabled>
              <i class="fas fa-file-import"></i> Import Flashcards
            </button>
          </div>
        </div>
      </div>

      <!-- ===================== EXPORT FLASHCARDS MODAL ===================== -->
      <div class="modal-overlay" id="exportFlashcardsModal" role="dialog" aria-modal="true" aria-labelledby="exportFcModalTitle">
        <div class="modal modal-lg sie-modal">
          <div class="modal-sheet-handle"></div>
          <div class="modal-header">
            <h3 id="exportFcModalTitle"><i class="fas fa-file-export"></i> Export Flashcards</h3>
            <button type="button" class="modal-close" data-sie-close="exportFlashcardsModal" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body sie-modal-body">
            <div class="form-group">
              <div class="sie-label-row">
                <label class="form-label" style="margin:0;">Select Decks to Export</label>
                <div class="sie-inline-actions">
                  <button type="button" class="sie-text-action" id="fcExportSelectAllBtn">Select All</button>
                  <span class="sie-sep" aria-hidden="true">·</span>
                  <button type="button" class="sie-text-action" id="fcExportSelectNoneBtn">None</button>
                </div>
              </div>
              <div id="fcExportDecksList" class="sie-checklist"></div>
            </div>

            <div class="form-group">
              <label class="form-label">Export Format</label>
              <div class="sie-format-grid" id="fcExportFormatGroup">
                <label class="sie-format-card active" data-format="json">
                  <input type="radio" name="fcExportFormat" value="json" checked hidden>
                  <div class="sie-format-title">Questionary JSON (.json)</div>
                  <div class="sie-format-desc">Full backup with subjects, hints &amp; easy re-import.</div>
                </label>
                <label class="sie-format-card" data-format="csv">
                  <input type="radio" name="fcExportFormat" value="csv" hidden>
                  <div class="sie-format-title">CSV / Anki (.csv)</div>
                  <div class="sie-format-desc">Spreadsheet &amp; Anki-compatible table columns.</div>
                </label>
                <label class="sie-format-card" data-format="txt">
                  <input type="radio" name="fcExportFormat" value="txt" hidden>
                  <div class="sie-format-title">Study Sheet (.txt)</div>
                  <div class="sie-format-desc">Clean readable Q&amp;A text for printing or sharing.</div>
                </label>
              </div>
            </div>

            <div class="sie-checkbox-row" id="fcExportMasteryWrap">
              <label class="sie-check-label">
                <input type="checkbox" id="fcExportIncludeMastery" checked>
                <span>Include my spaced-repetition mastery progress (JSON only)</span>
              </label>
            </div>

            <div class="sie-export-summary" id="fcExportSummary"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-sie-close="exportFlashcardsModal">Cancel</button>
            <button type="button" class="btn btn-secondary" id="fcExportCopyBtn">
              <i class="fas fa-copy"></i> Copy
            </button>
            <button type="button" class="btn btn-primary" id="fcExportDownloadBtn">
              <i class="fas fa-download"></i> Download
            </button>
          </div>
        </div>
      </div>

      <!-- ===================== IMPORT NOTES MODAL ===================== -->
      <div class="modal-overlay" id="importNotesModal" role="dialog" aria-modal="true" aria-labelledby="importNotesModalTitle">
        <div class="modal modal-lg sie-modal">
          <div class="modal-sheet-handle"></div>
          <div class="modal-header">
            <h3 id="importNotesModalTitle"><i class="fas fa-file-import"></i> Import Notes</h3>
            <button type="button" class="modal-close" data-sie-close="importNotesModal" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="sie-tabs" role="tablist">
            <button type="button" class="sie-tab active" role="tab" aria-selected="true" data-sie-tab="notes-import-paste">
              <i class="fas fa-upload"></i> Import File or Paste
            </button>
            <button type="button" class="sie-tab" role="tab" aria-selected="false" data-sie-tab="notes-import-ai">
              <i class="fas fa-terminal"></i> AI Prompt &amp; Guide
            </button>
          </div>

          <div class="modal-body sie-modal-body">
            <!-- TAB 1: Import File / Paste -->
            <div class="sie-tab-panel active" id="siePanel_notes-import-paste">
              <div class="sie-dropzone" id="notesImportDropzone" tabindex="0" role="button" aria-label="Upload note file">
                <input type="file" id="notesImportFileInput" accept=".json,.md,.markdown,.txt" multiple hidden>
                <div class="sie-dropzone-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <div class="sie-dropzone-text">
                  <strong>Drop file(s) here or click to browse</strong>
                  <span>Supports Questionary JSON, Markdown (.md), or Plain Text (.txt)</span>
                </div>
              </div>

              <div class="sie-or-divider"><span>or paste JSON, Markdown, or AI output below</span></div>

              <div class="form-group" style="margin-bottom: 12px;">
                <div class="sie-label-row">
                  <label class="form-label" for="notesImportTextarea" style="margin:0;">Paste Notes</label>
                  <button type="button" class="sie-text-action" id="notesImportClearBtn">Clear</button>
                </div>
                <textarea id="notesImportTextarea" class="form-input sie-code-textarea" rows="6" placeholder="Paste Questionary JSON, AI-generated JSON, or raw Markdown notes (e.g. # Chapter Summary)..."></textarea>
              </div>

              <div id="notesImportPreviewArea" class="sie-preview-box" style="display:none;"></div>
              <div id="notesImportErrorArea" class="sie-error-box" style="display:none;" role="alert"></div>

              <div class="sie-guide-callout">
                <div class="sie-guide-callout-text">
                  <strong>Want an AI to draft structured notes for a topic?</strong>
                  <span>Generate a tailored prompt for ChatGPT, Gemini, or Claude and follow the 4-step guide.</span>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="notesSwitchToAiGuideBtn">
                  Open AI Prompt &amp; Guide <i class="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>

            <!-- TAB 2: AI Prompt Builder & Tutorial -->
            <div class="sie-tab-panel" id="siePanel_notes-import-ai">
              <div class="sie-offline-note">
                <i class="fas fa-info-circle"></i>
                <span>Questionary does not run AI directly on the site. Customize this prompt, copy it into any AI tool you already use (ChatGPT, Gemini, Claude, etc.), and paste its output into the <strong>Import File or Paste</strong> tab.</span>
              </div>

              <div class="sie-prompt-builder">
                <div class="sie-builder-grid">
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="notesAiTopic">Topic or Chapter</label>
                    <input type="text" id="notesAiTopic" class="form-input" placeholder="e.g., Organic Chemistry Basics, World War II Causes">
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="notesAiSubject">Category</label>
                    <select id="notesAiSubject" class="form-input">${subjectOptionsHtml('General')}</select>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="notesAiStyle">Note Style</label>
                    <select id="notesAiStyle" class="form-input">
                      <option value="summary">Structured Revision Summary</option>
                      <option value="formulas">Formula &amp; Key Facts Sheet</option>
                      <option value="guide">Step-by-Step Concept Guide</option>
                      <option value="exam">Exam Q&amp;A Breakdown</option>
                    </select>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label" for="notesAiDepth">Depth &amp; Structure</label>
                    <select id="notesAiDepth" class="form-input">
                      <option value="concise|single">Concise — 1 Combined Note</option>
                      <option value="balanced|single" selected>Balanced — 1 Combined Note</option>
                      <option value="detailed|single">Detailed — 1 Combined Note</option>
                      <option value="balanced|multi">Balanced — Split into 3–5 Subtopic Notes</option>
                      <option value="detailed|multi">Detailed — Split into 3–5 Subtopic Notes</option>
                    </select>
                  </div>
                </div>

                <div class="sie-checkbox-row">
                  <label class="sie-check-label">
                    <input type="checkbox" id="notesAiIncludeSource">
                    <span>I will paste my own textbook text / syllabus below the prompt</span>
                  </label>
                </div>

                <div class="sie-prompt-output-wrap">
                  <div class="sie-prompt-output-header">
                    <span>Ready-to-Copy Prompt</span>
                    <button type="button" class="btn btn-primary btn-sm" id="notesCopyAiPromptBtn">
                      <i class="fas fa-copy"></i> Copy Prompt
                    </button>
                  </div>
                  <pre class="sie-prompt-pre" id="notesAiPromptPreview"></pre>
                </div>
              </div>

              <div class="sie-tutorial">
                <h4 class="sie-tutorial-heading">How to make AI write study notes for your topic</h4>
                <ol class="sie-steps-list">
                  <li>
                    <span class="sie-step-num">01.</span>
                    <div>
                      <strong>Pick your topic &amp; style above</strong> — Type what you are studying and pick whether you want a single revision sheet or multiple subtopic notes.
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">02.</span>
                    <div>
                      <strong>Copy the prompt into your AI chat</strong> — Click <em>Copy Prompt</em> and paste it into ChatGPT, Google Gemini, Claude, or any AI tool you like. Attach a PDF or textbook photo if you want notes strictly from your syllabus.
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">03.</span>
                    <div>
                      <strong>Copy the AI's JSON response</strong> — Copy the code block the AI outputs. (You can also paste plain Markdown directly if you prefer — Questionary imports both!)
                    </div>
                  </li>
                  <li>
                    <span class="sie-step-num">04.</span>
                    <div>
                      <strong>Paste back here and import</strong> — Switch to <em>Import File or Paste</em>, review the note preview and category, and click <em>Import Notes</em>.
                    </div>
                  </li>
                </ol>
                <div class="sie-tutorial-footer">
                  <button type="button" class="btn btn-secondary btn-sm" id="notesGoToPasteTabBtn">
                    <i class="fas fa-paste"></i> Ready? Go to Paste &amp; Import
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer" id="notesImportModalFooter">
            <button type="button" class="btn btn-secondary" data-sie-close="importNotesModal">Cancel</button>
            <button type="button" class="btn btn-primary" id="notesConfirmImportBtn" disabled>
              <i class="fas fa-file-import"></i> Import Notes
            </button>
          </div>
        </div>
      </div>

      <!-- ===================== EXPORT NOTES MODAL ===================== -->
      <div class="modal-overlay" id="exportNotesModal" role="dialog" aria-modal="true" aria-labelledby="exportNotesModalTitle">
        <div class="modal modal-lg sie-modal">
          <div class="modal-sheet-handle"></div>
          <div class="modal-header">
            <h3 id="exportNotesModalTitle"><i class="fas fa-file-export"></i> Export Notes</h3>
            <button type="button" class="modal-close" data-sie-close="exportNotesModal" aria-label="Close">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="modal-body sie-modal-body">
            <div class="form-group">
              <div class="sie-label-row">
                <label class="form-label" style="margin:0;">Select Notes to Export</label>
                <div class="sie-inline-actions">
                  <button type="button" class="sie-text-action" id="notesExportSelectAllBtn">Select All</button>
                  <span class="sie-sep" aria-hidden="true">·</span>
                  <button type="button" class="sie-text-action" id="notesExportSelectNoneBtn">None</button>
                </div>
              </div>
              <div id="notesExportList" class="sie-checklist"></div>
            </div>

            <div class="form-group">
              <label class="form-label">Export Format</label>
              <div class="sie-format-grid sie-format-grid-2" id="notesExportFormatGroup">
                <label class="sie-format-card active" data-format="json">
                  <input type="radio" name="notesExportFormat" value="json" checked hidden>
                  <div class="sie-format-title">Questionary JSON (.json)</div>
                  <div class="sie-format-desc">Full backup preserving categories, pins &amp; timestamps.</div>
                </label>
                <label class="sie-format-card" data-format="md">
                  <input type="radio" name="notesExportFormat" value="md" hidden>
                  <div class="sie-format-title">Markdown (.md)</div>
                  <div class="sie-format-desc">Portable Markdown document for Obsidian, Notion, or re-import.</div>
                </label>
              </div>
            </div>

            <div class="sie-export-summary" id="notesExportSummary"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-sie-close="exportNotesModal">Cancel</button>
            <button type="button" class="btn btn-secondary" id="notesExportCopyBtn">
              <i class="fas fa-copy"></i> Copy
            </button>
            <button type="button" class="btn btn-primary" id="notesExportDownloadBtn">
              <i class="fas fa-download"></i> Download
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    wireModalInteractions();
  }

  function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  }

  function switchModalTab(modalId, tabKey) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.querySelectorAll('.sie-tab').forEach(btn => {
      const isTarget = btn.dataset.sieTab === tabKey;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });
    modal.querySelectorAll('.sie-tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `siePanel_${tabKey}`);
    });

    // Show/hide primary import footer button contextually
    if (modalId === 'importFlashcardsModal') {
      const confirmBtn = document.getElementById('fcConfirmImportBtn');
      if (confirmBtn) confirmBtn.style.display = tabKey === 'fc-import-paste' ? '' : 'none';
    } else if (modalId === 'importNotesModal') {
      const confirmBtn = document.getElementById('notesConfirmImportBtn');
      if (confirmBtn) confirmBtn.style.display = tabKey === 'notes-import-paste' ? '' : 'none';
    }
  }

  // =========================================================================
  // FLASHCARDS IMPORT LOGIC
  // =========================================================================

  function updateFcAiPrompt() {
    const pre = document.getElementById('fcAiPromptPreview');
    if (!pre) return;
    const prompt = buildFlashcardsAiPrompt({
      topic: document.getElementById('fcAiTopic')?.value,
      subject: document.getElementById('fcAiSubject')?.value,
      count: document.getElementById('fcAiCount')?.value,
      focus: document.getElementById('fcAiFocus')?.value,
      includeHints: document.getElementById('fcAiHints')?.checked,
      includeSource: document.getElementById('fcAiIncludeSource')?.checked
    });
    pre.textContent = prompt;
  }

  function refreshFcImportPreview() {
    const textarea = document.getElementById('fcImportTextarea');
    const previewArea = document.getElementById('fcImportPreviewArea');
    const errorArea = document.getElementById('fcImportErrorArea');
    const confirmBtn = document.getElementById('fcConfirmImportBtn');
    if (!textarea || !previewArea || !errorArea || !confirmBtn) return;

    const raw = textarea.value;
    if (!raw.trim()) {
      state.fcImportParsed = null;
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
      errorArea.style.display = 'none';
      confirmBtn.disabled = true;
      return;
    }

    const result = parseFlashcardsInput(raw, state.fcImportFilename);
    if (!result.ok) {
      state.fcImportParsed = null;
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
      errorArea.style.display = 'flex';
      errorArea.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(result.error)}</span>`;
      confirmBtn.disabled = true;
      return;
    }

    state.fcImportParsed = result;
    errorArea.style.display = 'none';
    confirmBtn.disabled = false;

    const totalCards = result.decks.reduce((sum, d) => sum + d.cards.length, 0);
    const sampleCards = result.decks[0]?.cards.slice(0, 3) || [];

    const existingDeckOverrideName = document.getElementById('fcImportOverrideName')?.value;
    const existingDeckOverrideSubj = document.getElementById('fcImportOverrideSubject')?.value;
    const defaultName = existingDeckOverrideName !== undefined
      ? existingDeckOverrideName
      : (result.decks[0]?.name || 'Imported Deck');
    const defaultSubj = existingDeckOverrideSubj !== undefined
      ? existingDeckOverrideSubj
      : (result.decks[0]?.subject || 'General');

    previewArea.style.display = 'block';
    previewArea.innerHTML = `
      <div class="sie-preview-header">
        <span class="sie-preview-status"><i class="fas fa-check-circle"></i> Detected ${escapeHtml(result.format)}</span>
        <span class="sie-preview-meta">${result.decks.length} ${result.decks.length === 1 ? 'deck' : 'decks'} · ${totalCards} ${totalCards === 1 ? 'card' : 'cards'}</span>
      </div>

      ${result.needsDeckMeta && result.decks.length === 1 ? `
        <div class="sie-meta-override-grid">
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="fcImportOverrideName">Deck Name</label>
            <input type="text" id="fcImportOverrideName" class="form-input" value="${escapeHtml(defaultName)}" placeholder="Enter deck name">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="fcImportOverrideSubject">Subject</label>
            <select id="fcImportOverrideSubject" class="form-input">${subjectOptionsHtml(defaultSubj)}</select>
          </div>
        </div>
      ` : `
        <div class="sie-preview-list">
          ${result.decks.slice(0, 4).map(d => `
            <div class="sie-preview-item">
              <div class="sie-preview-item-title">${escapeHtml(d.name)}</div>
              <div class="sie-preview-item-sub">${escapeHtml(d.subject)} · ${d.cards.length} ${d.cards.length === 1 ? 'card' : 'cards'}</div>
            </div>
          `).join('')}
          ${result.decks.length > 4 ? `<div class="sie-preview-more">+ ${result.decks.length - 4} more deck(s)</div>` : ''}
        </div>
      `}

      ${sampleCards.length > 0 ? `
        <div class="sie-sample-cards">
          <div class="sie-sample-label">Sample cards from ${escapeHtml(result.decks[0].name)}:</div>
          ${sampleCards.map((c, idx) => `
            <div class="sie-sample-row">
              <div class="sie-sample-q"><strong>Q${idx + 1}:</strong> ${escapeHtml(c.front)}</div>
              <div class="sie-sample-a"><strong>A:</strong> ${escapeHtml(c.back)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="sie-merge-row">
        <label class="sie-check-label">
          <input type="checkbox" id="fcImportMergeExisting">
          <span>Merge cards into existing deck if a deck has the same name</span>
        </label>
      </div>
    `;
  }

  function executeFlashcardsImport() {
    if (!state.fcImportParsed || !state.fcImportParsed.ok) return;
    if (!window.EnhancedFlashcards) return;

    const existingDecks = window.EnhancedFlashcards.getDecks();
    const mergeByName = Boolean(document.getElementById('fcImportMergeExisting')?.checked);

    const incomingDecks = state.fcImportParsed.decks.map(d => ({
      name: d.name,
      subject: d.subject,
      cards: d.cards.map(c => ({
        front: c.front,
        back: c.back,
        hint: c.hint || '',
        mastery: Math.max(0, Math.min(3, Number(c.mastery) || 0))
      }))
    }));

    if (state.fcImportParsed.needsDeckMeta && incomingDecks.length === 1) {
      const customName = document.getElementById('fcImportOverrideName')?.value.trim();
      const customSubj = document.getElementById('fcImportOverrideSubject')?.value;
      if (customName) incomingDecks[0].name = customName;
      if (customSubj) incomingDecks[0].subject = normalizeSubject(customSubj);
    }

    let addedDecks = 0;
    let mergedDecks = 0;
    let totalCardsAdded = 0;
    const now = Date.now();

    incomingDecks.forEach((inc, idx) => {
      if (mergeByName) {
        const match = existingDecks.find(
          d => d.name.trim().toLowerCase() === inc.name.trim().toLowerCase()
        );
        if (match) {
          const existingPairs = new Set(
            match.cards.map(c => `${c.front.toLowerCase()}||${c.back.toLowerCase()}`)
          );
          let addedHere = 0;
          inc.cards.forEach(card => {
            const key = `${card.front.toLowerCase()}||${card.back.toLowerCase()}`;
            if (!existingPairs.has(key)) {
              match.cards.push(card);
              existingPairs.add(key);
              addedHere++;
            }
          });
          totalCardsAdded += addedHere;
          mergedDecks++;
          return;
        }
      }

      existingDecks.unshift({
        id: `deck_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        name: inc.name || 'Imported Deck',
        subject: normalizeSubject(inc.subject),
        cards: inc.cards,
        lastStudied: null,
        createdAt: now + idx
      });
      addedDecks++;
      totalCardsAdded += inc.cards.length;
    });

    window.EnhancedFlashcards.saveDecks();
    window.EnhancedFlashcards.renderDecks();
    closeModal('importFlashcardsModal');

    const summaryParts = [];
    if (addedDecks > 0) summaryParts.push(`${addedDecks} new ${addedDecks === 1 ? 'deck' : 'decks'}`);
    if (mergedDecks > 0) summaryParts.push(`merged into ${mergedDecks} ${mergedDecks === 1 ? 'deck' : 'decks'}`);
    notify(`Imported ${totalCardsAdded} ${totalCardsAdded === 1 ? 'card' : 'cards'} (${summaryParts.join(', ')})!`, 'success');
  }

  function handleFlashcardsFile(file) {
    if (!file) return;
    state.fcImportFilename = file.name || '';
    const reader = new FileReader();
    reader.onload = (e) => {
      const textarea = document.getElementById('fcImportTextarea');
      if (textarea) {
        textarea.value = String(e.target?.result || '');
        refreshFcImportPreview();
      }
    };
    reader.onerror = () => notify('Could not read the selected file.', 'error');
    reader.readAsText(file);
  }

  // =========================================================================
  // FLASHCARDS EXPORT LOGIC
  // =========================================================================

  function getSelectedExportDecks() {
    const allDecks = window.EnhancedFlashcards ? window.EnhancedFlashcards.getDecks() : [];
    return allDecks.filter(d => state.fcExportSelectedIds.has(String(d.id)));
  }

  function getFcExportFormat() {
    return document.querySelector('input[name="fcExportFormat"]:checked')?.value || 'json';
  }

  function buildFlashcardsExportPayload() {
    const selected = getSelectedExportDecks();
    const format = getFcExportFormat();
    const includeMastery = Boolean(document.getElementById('fcExportIncludeMastery')?.checked);

    if (selected.length === 0) return null;

    const singleName = selected.length === 1 ? slugify(selected[0].name, 'deck') : 'all-decks';

    if (format === 'json') {
      const payload = selected.map(d => ({
        name: d.name,
        subject: d.subject,
        cards: d.cards.map(c => {
          const obj = { front: c.front, back: c.back };
          if (c.hint) obj.hint = c.hint;
          if (includeMastery) obj.mastery = Number(c.mastery) || 0;
          return obj;
        })
      }));
      return {
        content: JSON.stringify(payload, null, 2),
        filename: `questionary-flashcards-${singleName}-${dateStamp()}.json`,
        mime: 'application/json;charset=utf-8'
      };
    }

    if (format === 'csv') {
      const lines = [];
      if (selected.length === 1) {
        lines.push(['Front', 'Back', 'Hint'].join(','));
        selected[0].cards.forEach(c => {
          lines.push([escapeCsvCell(c.front), escapeCsvCell(c.back), escapeCsvCell(c.hint || '')].join(','));
        });
      } else {
        lines.push(['Deck', 'Subject', 'Front', 'Back', 'Hint'].join(','));
        selected.forEach(d => {
          d.cards.forEach(c => {
            lines.push([
              escapeCsvCell(d.name),
              escapeCsvCell(d.subject),
              escapeCsvCell(c.front),
              escapeCsvCell(c.back),
              escapeCsvCell(c.hint || '')
            ].join(','));
          });
        });
      }
      return {
        content: lines.join('\n'),
        filename: `questionary-flashcards-${singleName}-${dateStamp()}.csv`,
        mime: 'text/csv;charset=utf-8'
      };
    }

    // Plain Text study sheet
    const blocks = selected.map(d => {
      const header = `=== ${d.name} (${d.subject}) ===`;
      const body = d.cards.map((c, idx) => {
        const lines = [`Q${idx + 1}: ${c.front}`, `A${idx + 1}: ${c.back}`];
        if (c.hint) lines.push(`Hint: ${c.hint}`);
        return lines.join('\n');
      }).join('\n\n');
      return `${header}\n\n${body}`;
    });
    return {
      content: blocks.join('\n\n----------------------------------------\n\n'),
      filename: `questionary-flashcards-${singleName}-${dateStamp()}.txt`,
      mime: 'text/plain;charset=utf-8'
    };
  }

  function renderFcExportModalList() {
    const list = document.getElementById('fcExportDecksList');
    const summary = document.getElementById('fcExportSummary');
    const downloadBtn = document.getElementById('fcExportDownloadBtn');
    const copyBtn = document.getElementById('fcExportCopyBtn');
    const masteryWrap = document.getElementById('fcExportMasteryWrap');
    if (!list) return;

    const allDecks = window.EnhancedFlashcards ? window.EnhancedFlashcards.getDecks() : [];
    const format = getFcExportFormat();
    if (masteryWrap) masteryWrap.style.display = format === 'json' ? 'flex' : 'none';

    if (allDecks.length === 0) {
      list.innerHTML = '<div class="sie-empty-list">No flashcard decks available to export yet.</div>';
    } else {
      list.innerHTML = allDecks.map(d => {
        const checked = state.fcExportSelectedIds.has(String(d.id));
        const count = d.cards ? d.cards.length : 0;
        return `
          <label class="sie-checklist-item ${checked ? 'selected' : ''}">
            <input type="checkbox" class="sie-fc-export-cb" value="${escapeHtml(d.id)}" ${checked ? 'checked' : ''}>
            <div class="sie-checklist-main">
              <span class="sie-checklist-title">${escapeHtml(d.name)}</span>
              <span class="sie-checklist-meta">${escapeHtml(d.subject)} · ${count} ${count === 1 ? 'card' : 'cards'}</span>
            </div>
          </label>
        `;
      }).join('');

      list.querySelectorAll('.sie-fc-export-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) state.fcExportSelectedIds.add(cb.value);
          else state.fcExportSelectedIds.delete(cb.value);
          renderFcExportModalList();
        });
      });
    }

    const selected = getSelectedExportDecks();
    const totalCards = selected.reduce((sum, d) => sum + (d.cards?.length || 0), 0);
    if (summary) {
      summary.textContent = selected.length > 0
        ? `Ready to export ${selected.length} ${selected.length === 1 ? 'deck' : 'decks'} · ${totalCards} ${totalCards === 1 ? 'flashcard' : 'flashcards'}`
        : 'Select at least one deck to export.';
    }
    if (downloadBtn) downloadBtn.disabled = selected.length === 0;
    if (copyBtn) copyBtn.disabled = selected.length === 0;
  }

  // =========================================================================
  // NOTES IMPORT LOGIC
  // =========================================================================

  function updateNotesAiPrompt() {
    const pre = document.getElementById('notesAiPromptPreview');
    if (!pre) return;
    const depthCombo = (document.getElementById('notesAiDepth')?.value || 'balanced|single').split('|');
    const prompt = buildNotesAiPrompt({
      topic: document.getElementById('notesAiTopic')?.value,
      subject: document.getElementById('notesAiSubject')?.value,
      style: document.getElementById('notesAiStyle')?.value,
      depth: depthCombo[0],
      splitMode: depthCombo[1],
      includeSource: document.getElementById('notesAiIncludeSource')?.checked
    });
    pre.textContent = prompt;
  }

  function refreshNotesImportPreview() {
    const textarea = document.getElementById('notesImportTextarea');
    const previewArea = document.getElementById('notesImportPreviewArea');
    const errorArea = document.getElementById('notesImportErrorArea');
    const confirmBtn = document.getElementById('notesConfirmImportBtn');
    if (!textarea || !previewArea || !errorArea || !confirmBtn) return;

    const raw = textarea.value;
    if (!raw.trim()) {
      state.notesImportParsed = null;
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
      errorArea.style.display = 'none';
      confirmBtn.disabled = true;
      return;
    }

    const result = parseNotesInput(raw, state.notesImportFilename);
    if (!result.ok) {
      state.notesImportParsed = null;
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
      errorArea.style.display = 'flex';
      errorArea.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(result.error)}</span>`;
      confirmBtn.disabled = true;
      return;
    }

    state.notesImportParsed = result;
    errorArea.style.display = 'none';
    confirmBtn.disabled = false;

    const totalWords = result.notes.reduce((sum, n) => sum + countWords(n.content), 0);
    const existingTitle = document.getElementById('notesImportOverrideTitle')?.value;
    const existingCat = document.getElementById('notesImportOverrideCategory')?.value;
    const defaultTitle = existingTitle !== undefined ? existingTitle : (result.notes[0]?.title || 'Imported Study Note');
    const defaultCat = existingCat !== undefined ? existingCat : (result.notes[0]?.category || 'General');

    previewArea.style.display = 'block';
    previewArea.innerHTML = `
      <div class="sie-preview-header">
        <span class="sie-preview-status"><i class="fas fa-check-circle"></i> Detected ${escapeHtml(result.format)}</span>
        <span class="sie-preview-meta">${result.notes.length} ${result.notes.length === 1 ? 'note' : 'notes'} · ${totalWords} ${totalWords === 1 ? 'word' : 'words'}</span>
      </div>

      ${result.isSingleRawMarkdown && result.notes.length === 1 ? `
        <div class="sie-meta-override-grid">
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="notesImportOverrideTitle">Note Title</label>
            <input type="text" id="notesImportOverrideTitle" class="form-input" value="${escapeHtml(defaultTitle)}" placeholder="Enter note title">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="notesImportOverrideCategory">Category</label>
            <select id="notesImportOverrideCategory" class="form-input">${subjectOptionsHtml(defaultCat)}</select>
          </div>
        </div>
      ` : `
        <div class="sie-preview-list">
          ${result.notes.slice(0, 5).map(n => {
            const snippet = (n.content || '').replace(/[#*`_>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
            return `
              <div class="sie-preview-item">
                <div class="sie-preview-item-title">${escapeHtml(n.title)}</div>
                <div class="sie-preview-item-sub">${escapeHtml(n.category)} · ${countWords(n.content)} words${snippet ? ` · ${escapeHtml(snippet)}${snippet.length >= 100 ? '…' : ''}` : ''}</div>
              </div>
            `;
          }).join('')}
          ${result.notes.length > 5 ? `<div class="sie-preview-more">+ ${result.notes.length - 5} more note(s)</div>` : ''}
        </div>
      `}

      <div class="sie-merge-row">
        <label class="sie-check-label">
          <input type="checkbox" id="notesImportUpdateExisting">
          <span>Update existing note if a note has the same title</span>
        </label>
      </div>
    `;
  }

  function executeNotesImport() {
    if (!state.notesImportParsed || !state.notesImportParsed.ok) return;
    if (!window.EnhancedNotes) return;

    const existingNotes = window.EnhancedNotes.getNotes();
    const updateByTitle = Boolean(document.getElementById('notesImportUpdateExisting')?.checked);

    const incoming = state.notesImportParsed.notes.map(n => ({
      title: n.title,
      category: normalizeSubject(n.category),
      content: n.content,
      pinned: Boolean(n.pinned)
    }));

    if (state.notesImportParsed.isSingleRawMarkdown && incoming.length === 1) {
      const customTitle = document.getElementById('notesImportOverrideTitle')?.value.trim();
      const customCat = document.getElementById('notesImportOverrideCategory')?.value;
      if (customTitle) incoming[0].title = customTitle;
      if (customCat) incoming[0].category = normalizeSubject(customCat);
    }

    let added = 0;
    let updated = 0;
    const now = Date.now();

    incoming.forEach((inc, idx) => {
      if (updateByTitle) {
        const match = existingNotes.find(
          n => n.title.trim().toLowerCase() === inc.title.trim().toLowerCase()
        );
        if (match) {
          match.content = inc.content;
          match.category = inc.category;
          match.updatedAt = now + idx;
          updated++;
          return;
        }
      }
      existingNotes.unshift({
        id: `note_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        title: inc.title || 'Imported Study Note',
        category: inc.category,
        content: inc.content,
        pinned: inc.pinned,
        updatedAt: now + idx
      });
      added++;
    });

    window.EnhancedNotes.saveNotes();
    window.EnhancedNotes.renderNotes();
    closeModal('importNotesModal');

    const parts = [];
    if (added > 0) parts.push(`${added} new ${added === 1 ? 'note' : 'notes'}`);
    if (updated > 0) parts.push(`${updated} updated`);
    notify(`Imported ${parts.join(', ')}!`, 'success');
  }

  function handleNotesFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    if (files.length === 1) {
      state.notesImportFilename = files[0].name || '';
      const reader = new FileReader();
      reader.onload = (e) => {
        const textarea = document.getElementById('notesImportTextarea');
        if (textarea) {
          textarea.value = String(e.target?.result || '');
          refreshNotesImportPreview();
        }
      };
      reader.onerror = () => notify('Could not read the selected file.', 'error');
      reader.readAsText(files[0]);
      return;
    }

    // Multiple files dropped: combine into a clean JSON array so all import at once
    Promise.all(
      files.map(file => new Promise((resolve) => {
        const r = new FileReader();
        r.onload = (e) => resolve({ name: file.name, text: String(e.target?.result || '') });
        r.onerror = () => resolve(null);
        r.readAsText(file);
      }))
    ).then(results => {
      const combined = [];
      results.filter(Boolean).forEach(({ name, text }) => {
        const parsed = parseNotesInput(text, name);
        if (parsed.ok) combined.push(...parsed.notes);
      });
      if (combined.length === 0) {
        notify('No valid notes found in the selected files.', 'warning');
        return;
      }
      state.notesImportFilename = '';
      const textarea = document.getElementById('notesImportTextarea');
      if (textarea) {
        textarea.value = JSON.stringify(combined, null, 2);
        refreshNotesImportPreview();
      }
    });
  }

  // =========================================================================
  // NOTES EXPORT LOGIC
  // =========================================================================

  function getSelectedExportNotes() {
    const allNotes = window.EnhancedNotes ? window.EnhancedNotes.getNotes() : [];
    return allNotes.filter(n => state.notesExportSelectedIds.has(String(n.id)));
  }

  function getNotesExportFormat() {
    return document.querySelector('input[name="notesExportFormat"]:checked')?.value || 'json';
  }

  function buildNotesExportPayload() {
    const selected = getSelectedExportNotes();
    const format = getNotesExportFormat();
    if (selected.length === 0) return null;

    const singleName = selected.length === 1 ? slugify(selected[0].title, 'note') : 'all-notes';

    if (format === 'json') {
      const payload = selected.map(n => ({
        title: n.title,
        category: n.category,
        content: n.content,
        pinned: Boolean(n.pinned),
        updatedAt: n.updatedAt || Date.now()
      }));
      return {
        content: JSON.stringify(payload, null, 2),
        filename: `questionary-notes-${singleName}-${dateStamp()}.json`,
        mime: 'application/json;charset=utf-8'
      };
    }

    // Markdown (.md)
    if (selected.length === 1) {
      const n = selected[0];
      const md = `# ${n.title}\n\n${n.content || ''}\n`;
      return {
        content: md,
        filename: `${singleName}.md`,
        mime: 'text/markdown;charset=utf-8'
      };
    }

    const mdBundle = selected.map(n => `# ${n.title}\n_Category: ${n.category}_\n\n${n.content || ''}`).join('\n\n---\n<!-- questionary-note -->\n\n');
    return {
      content: mdBundle + '\n',
      filename: `questionary-notes-${dateStamp()}.md`,
      mime: 'text/markdown;charset=utf-8'
    };
  }

  function renderNotesExportModalList() {
    const list = document.getElementById('notesExportList');
    const summary = document.getElementById('notesExportSummary');
    const downloadBtn = document.getElementById('notesExportDownloadBtn');
    const copyBtn = document.getElementById('notesExportCopyBtn');
    if (!list) return;

    const allNotes = window.EnhancedNotes ? window.EnhancedNotes.getNotes() : [];
    if (allNotes.length === 0) {
      list.innerHTML = '<div class="sie-empty-list">No study notes available to export yet.</div>';
    } else {
      list.innerHTML = allNotes.map(n => {
        const checked = state.notesExportSelectedIds.has(String(n.id));
        const words = countWords(n.content);
        return `
          <label class="sie-checklist-item ${checked ? 'selected' : ''}">
            <input type="checkbox" class="sie-notes-export-cb" value="${escapeHtml(n.id)}" ${checked ? 'checked' : ''}>
            <div class="sie-checklist-main">
              <span class="sie-checklist-title">${escapeHtml(n.title)}</span>
              <span class="sie-checklist-meta">${escapeHtml(n.category)} · ${words} ${words === 1 ? 'word' : 'words'}</span>
            </div>
          </label>
        `;
      }).join('');

      list.querySelectorAll('.sie-notes-export-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          if (cb.checked) state.notesExportSelectedIds.add(cb.value);
          else state.notesExportSelectedIds.delete(cb.value);
          renderNotesExportModalList();
        });
      });
    }

    const selected = getSelectedExportNotes();
    const totalWords = selected.reduce((sum, n) => sum + countWords(n.content), 0);
    if (summary) {
      summary.textContent = selected.length > 0
        ? `Ready to export ${selected.length} ${selected.length === 1 ? 'note' : 'notes'} · ${totalWords} ${totalWords === 1 ? 'word' : 'words'}`
        : 'Select at least one note to export.';
    }
    if (downloadBtn) downloadBtn.disabled = selected.length === 0;
    if (copyBtn) copyBtn.disabled = selected.length === 0;
  }

  // =========================================================================
  // EVENT WIRING
  // =========================================================================

  function wireDropzone(dropzoneId, inputId, onFiles) {
    const dz = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    if (!dz || !input) return;

    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        onFiles(input.files);
        input.value = '';
      }
    });
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        onFiles(e.dataTransfer.files);
      }
    });
  }

  function wireFormatCards(groupId, onChange) {
    const group = document.getElementById(groupId);
    if (!group) return;
    group.querySelectorAll('.sie-format-card').forEach(card => {
      card.addEventListener('click', () => {
        const radio = card.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
        group.querySelectorAll('.sie-format-card').forEach(c => c.classList.toggle('active', c === card));
        if (onChange) onChange();
      });
    });
  }

  function wireCopyPromptButton(btnId, preId) {
    const btn = document.getElementById(btnId);
    const pre = document.getElementById(preId);
    if (!btn || !pre) return;
    btn.addEventListener('click', async () => {
      const ok = await copyToClipboard(pre.textContent || '');
      if (ok) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        notify('Prompt copied! Paste it into ChatGPT, Gemini, Claude, or any AI tool.', 'success');
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      } else {
        notify('Could not copy automatically — please select and copy the prompt text.', 'warning');
      }
    });
  }

  function wireModalInteractions() {
    // Close buttons & backdrop clicks
    document.querySelectorAll('[data-sie-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.sieClose));
    });
    ['importFlashcardsModal', 'exportFlashcardsModal', 'importNotesModal', 'exportNotesModal'].forEach(id => {
      const overlay = document.getElementById(id);
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeModal(id);
        });
      }
    });

    // Tab switching
    document.querySelectorAll('#importFlashcardsModal .sie-tab').forEach(btn => {
      btn.addEventListener('click', () => switchModalTab('importFlashcardsModal', btn.dataset.sieTab));
    });
    document.querySelectorAll('#importNotesModal .sie-tab').forEach(btn => {
      btn.addEventListener('click', () => switchModalTab('importNotesModal', btn.dataset.sieTab));
    });

    // Quick switch buttons inside Import modals
    document.getElementById('fcSwitchToAiGuideBtn')?.addEventListener('click', () => switchModalTab('importFlashcardsModal', 'fc-import-ai'));
    document.getElementById('fcGoToPasteTabBtn')?.addEventListener('click', () => {
      switchModalTab('importFlashcardsModal', 'fc-import-paste');
      setTimeout(() => document.getElementById('fcImportTextarea')?.focus(), 60);
    });
    document.getElementById('notesSwitchToAiGuideBtn')?.addEventListener('click', () => switchModalTab('importNotesModal', 'notes-import-ai'));
    document.getElementById('notesGoToPasteTabBtn')?.addEventListener('click', () => {
      switchModalTab('importNotesModal', 'notes-import-paste');
      setTimeout(() => document.getElementById('notesImportTextarea')?.focus(), 60);
    });

    // Flashcards Import handlers
    wireDropzone('fcImportDropzone', 'fcImportFileInput', (files) => handleFlashcardsFile(files[0]));
    document.getElementById('fcImportTextarea')?.addEventListener('input', () => {
      state.fcImportFilename = '';
      refreshFcImportPreview();
    });
    document.getElementById('fcImportClearBtn')?.addEventListener('click', () => {
      const ta = document.getElementById('fcImportTextarea');
      if (ta) ta.value = '';
      state.fcImportFilename = '';
      refreshFcImportPreview();
    });
    document.getElementById('fcConfirmImportBtn')?.addEventListener('click', executeFlashcardsImport);

    // Flashcards AI prompt live updates
    ['fcAiTopic', 'fcAiSubject', 'fcAiCount', 'fcAiFocus', 'fcAiHints', 'fcAiIncludeSource'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateFcAiPrompt);
        el.addEventListener('change', updateFcAiPrompt);
      }
    });
    wireCopyPromptButton('fcCopyAiPromptBtn', 'fcAiPromptPreview');

    // Flashcards Export handlers
    wireFormatCards('fcExportFormatGroup', renderFcExportModalList);
    document.getElementById('fcExportSelectAllBtn')?.addEventListener('click', () => {
      const all = window.EnhancedFlashcards ? window.EnhancedFlashcards.getDecks() : [];
      state.fcExportSelectedIds = new Set(all.map(d => String(d.id)));
      renderFcExportModalList();
    });
    document.getElementById('fcExportSelectNoneBtn')?.addEventListener('click', () => {
      state.fcExportSelectedIds.clear();
      renderFcExportModalList();
    });
    document.getElementById('fcExportDownloadBtn')?.addEventListener('click', () => {
      const payload = buildFlashcardsExportPayload();
      if (!payload) return;
      triggerDownload(payload.content, payload.filename, payload.mime);
      notify('Flashcards exported!', 'success');
      closeModal('exportFlashcardsModal');
    });
    document.getElementById('fcExportCopyBtn')?.addEventListener('click', async () => {
      const payload = buildFlashcardsExportPayload();
      if (!payload) return;
      const ok = await copyToClipboard(payload.content);
      if (ok) notify('Exported flashcards copied to clipboard!', 'success');
      else notify('Could not copy to clipboard.', 'warning');
    });

    // Notes Import handlers
    wireDropzone('notesImportDropzone', 'notesImportFileInput', handleNotesFiles);
    document.getElementById('notesImportTextarea')?.addEventListener('input', () => {
      state.notesImportFilename = '';
      refreshNotesImportPreview();
    });
    document.getElementById('notesImportClearBtn')?.addEventListener('click', () => {
      const ta = document.getElementById('notesImportTextarea');
      if (ta) ta.value = '';
      state.notesImportFilename = '';
      refreshNotesImportPreview();
    });
    document.getElementById('notesConfirmImportBtn')?.addEventListener('click', executeNotesImport);

    // Notes AI prompt live updates
    ['notesAiTopic', 'notesAiSubject', 'notesAiStyle', 'notesAiDepth', 'notesAiIncludeSource'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateNotesAiPrompt);
        el.addEventListener('change', updateNotesAiPrompt);
      }
    });
    wireCopyPromptButton('notesCopyAiPromptBtn', 'notesAiPromptPreview');

    // Notes Export handlers
    wireFormatCards('notesExportFormatGroup', renderNotesExportModalList);
    document.getElementById('notesExportSelectAllBtn')?.addEventListener('click', () => {
      const all = window.EnhancedNotes ? window.EnhancedNotes.getNotes() : [];
      state.notesExportSelectedIds = new Set(all.map(n => String(n.id)));
      renderNotesExportModalList();
    });
    document.getElementById('notesExportSelectNoneBtn')?.addEventListener('click', () => {
      state.notesExportSelectedIds.clear();
      renderNotesExportModalList();
    });
    document.getElementById('notesExportDownloadBtn')?.addEventListener('click', () => {
      const payload = buildNotesExportPayload();
      if (!payload) return;
      triggerDownload(payload.content, payload.filename, payload.mime);
      notify('Notes exported!', 'success');
      closeModal('exportNotesModal');
    });
    document.getElementById('notesExportCopyBtn')?.addEventListener('click', async () => {
      const payload = buildNotesExportPayload();
      if (!payload) return;
      const ok = await copyToClipboard(payload.content);
      if (ok) notify('Exported notes copied to clipboard!', 'success');
      else notify('Could not copy to clipboard.', 'warning');
    });

    // Escape key closes active modal
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      ['importFlashcardsModal', 'exportFlashcardsModal', 'importNotesModal', 'exportNotesModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains('active')) {
          e.preventDefault();
          el.classList.remove('active');
        }
      });
    });
  }

  // =========================================================================
  // PUBLIC OPENERS
  // =========================================================================

  function openFlashcardsImport(initialTab = 'fc-import-paste') {
    ensureModalsExist();
    const ta = document.getElementById('fcImportTextarea');
    if (ta) ta.value = '';
    state.fcImportFilename = '';
    state.fcImportParsed = null;
    refreshFcImportPreview();
    updateFcAiPrompt();
    switchModalTab('importFlashcardsModal', initialTab);
    document.getElementById('importFlashcardsModal')?.classList.add('active');
  }

  function openFlashcardsExport(preselectedDeckId = null) {
    ensureModalsExist();
    const allDecks = window.EnhancedFlashcards ? window.EnhancedFlashcards.getDecks() : [];
    if (allDecks.length === 0) {
      notify('No flashcard decks to export yet.', 'info');
      return;
    }
    if (preselectedDeckId) {
      state.fcExportSelectedIds = new Set([String(preselectedDeckId)]);
    } else {
      state.fcExportSelectedIds = new Set(allDecks.map(d => String(d.id)));
    }
    renderFcExportModalList();
    document.getElementById('exportFlashcardsModal')?.classList.add('active');
  }

  function openNotesImport(initialTab = 'notes-import-paste') {
    ensureModalsExist();
    const ta = document.getElementById('notesImportTextarea');
    if (ta) ta.value = '';
    state.notesImportFilename = '';
    state.notesImportParsed = null;
    refreshNotesImportPreview();
    updateNotesAiPrompt();
    switchModalTab('importNotesModal', initialTab);
    document.getElementById('importNotesModal')?.classList.add('active');
  }

  function openNotesExport(preselectedNoteId = null) {
    ensureModalsExist();
    const allNotes = window.EnhancedNotes ? window.EnhancedNotes.getNotes() : [];
    if (allNotes.length === 0) {
      notify('No study notes to export yet.', 'info');
      return;
    }
    if (preselectedNoteId) {
      state.notesExportSelectedIds = new Set([String(preselectedNoteId)]);
    } else {
      state.notesExportSelectedIds = new Set(allNotes.map(n => String(n.id)));
    }
    renderNotesExportModalList();
    document.getElementById('exportNotesModal')?.classList.add('active');
  }

  function bindSectionButtons() {
    const importDecksBtn = document.getElementById('importDecksBtn');
    if (importDecksBtn) importDecksBtn.onclick = () => openFlashcardsImport('fc-import-paste');

    const exportDecksBtn = document.getElementById('exportDecksBtn');
    if (exportDecksBtn) exportDecksBtn.onclick = () => openFlashcardsExport();

    const importNotesBtn = document.getElementById('importNotesBtn');
    if (importNotesBtn) importNotesBtn.onclick = () => openNotesImport('notes-import-paste');

    const exportNotesBtn = document.getElementById('exportNotesBtn');
    if (exportNotesBtn) exportNotesBtn.onclick = () => openNotesExport();
  }

  window.StudyImportExport = {
    openFlashcardsImport,
    openFlashcardsExport,
    openNotesImport,
    openNotesExport,
    parseFlashcardsInput,
    parseNotesInput,
    buildFlashcardsAiPrompt,
    buildNotesAiPrompt
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSectionButtons);
  } else {
    bindSectionButtons();
  }
})();
