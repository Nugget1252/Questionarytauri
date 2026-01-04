#!/usr/bin/env python3
"""
Generate the documents object for app.js from local PDF files.
Creates a nested structure: Year -> Term -> Subject -> local path
"""

import os
import json
import re
from pathlib import Path
from collections import defaultdict

DOCUMENTS_DIR = Path(__file__).parent.parent / "documents"

def parse_filename(filename):
    """Parse a PDF filename into its components."""
    # Remove .pdf extension
    name = filename.replace('.pdf', '')
    
    # Handle Study Material files separately
    if name.startswith('Study_Material'):
        return {
            'category': 'Study Material',
            'filename': filename,
            'display_name': name.replace('_', ' ')
        }
    
    # Pattern: YEAR_CL_9_TERM_SUBJECT.pdf
    # Examples: 2020-21_CL_9_FT_Bengali.pdf, 2020-21_CL_9_MT_1_Bengali.pdf
    
    parts = name.split('_')
    
    if len(parts) < 4:
        return None
    
    year = parts[0]  # e.g., "2020-21"
    
    # Find the term (FT, HY, MT_1, MT_2, MT2)
    term_idx = 3  # After YEAR_CL_9
    term = parts[term_idx]
    
    # Handle MT_1, MT_2 vs MT2
    if term in ['MT', 'MT1', 'MT2']:
        if term == 'MT' and len(parts) > term_idx + 1 and parts[term_idx + 1] in ['1', '2']:
            term = f"MT {parts[term_idx + 1]}"
            subject_start = term_idx + 2
        elif term in ['MT1', 'MT2']:
            term = f"MT {term[-1]}"
            subject_start = term_idx + 1
        else:
            subject_start = term_idx + 1
    else:
        subject_start = term_idx + 1
    
    # Get subject name (rest of the parts)
    subject_parts = parts[subject_start:]
    subject = ' '.join(subject_parts)
    
    # Clean up subject name
    subject = subject.replace('_', ' ')
    
    return {
        'year': year,
        'term': term,
        'subject': subject,
        'filename': filename
    }

def build_documents_object():
    """Build the nested documents object from PDF files."""
    docs = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    study_materials = defaultdict(dict)
    
    # Get all PDF files
    pdf_files = sorted([f for f in os.listdir(DOCUMENTS_DIR) if f.endswith('.pdf')])
    
    for filename in pdf_files:
        parsed = parse_filename(filename)
        if not parsed:
            continue
        
        # Local path relative to the app
        local_path = f"documents/{filename}"
        
        if parsed.get('category') == 'Study Material':
            # Handle study materials specially
            display = parsed['display_name']
            study_materials[display] = local_path
        else:
            year = parsed['year']
            term = parsed['term']
            subject = parsed['subject']
            
            docs[year][term][subject] = local_path
    
    # Convert to regular dict
    result = {}
    
    # Add year-based documents
    for year in sorted(docs.keys(), reverse=True):
        result[year] = {}
        for term in ['MT 1', 'MT 2', 'HY', 'FT', 'MT1', 'MT2']:
            if term in docs[year]:
                result[year][term] = dict(sorted(docs[year][term].items()))
    
    # Add study materials if any
    if study_materials:
        result['Study Material'] = dict(sorted(study_materials.items()))
    
    return result

def generate_js_object(docs, indent=0):
    """Generate JavaScript object string from dict."""
    lines = []
    spaces = '    ' * indent
    
    lines.append('{')
    
    items = list(docs.items())
    for i, (key, value) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        
        if isinstance(value, dict):
            lines.append(f'{spaces}    "{key}": ' + generate_js_object(value, indent + 1) + comma)
        else:
            lines.append(f'{spaces}    "{key}": "{value}"{comma}')
    
    lines.append(spaces + '}')
    
    return '\n'.join(lines)

def main():
    print("Scanning PDF files...")
    docs = build_documents_object()
    
    # Count documents
    count = 0
    for year, terms in docs.items():
        if isinstance(terms, dict):
            for term, subjects in terms.items():
                if isinstance(subjects, dict):
                    count += len(subjects)
                else:
                    count += 1
    
    print(f"Found {count} documents organized by year/term/subject")
    
    # Generate JS object
    js_code = f"let documents = {generate_js_object(docs)};"
    
    # Save to file
    output_path = Path(__file__).parent / "documents_object.js"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_code)
    
    print(f"\nGenerated JavaScript saved to: {output_path}")
    print("\nPreview (first 100 lines):")
    print("-" * 60)
    lines = js_code.split('\n')[:100]
    print('\n'.join(lines))
    if len(js_code.split('\n')) > 100:
        print("... (truncated)")

if __name__ == "__main__":
    main()
