#!/usr/bin/env python3
"""
Build Full Hierarchy Documents Object
=====================================
Creates a complete documents object with ALL years, terms, and subjects,
using local PDF paths where files exist and "#" placeholders where they don't.
"""

import os
import json
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).parent
DOCUMENTS_DIR = SCRIPT_DIR.parent / "src" / "documents"
OUTPUT_FILE = SCRIPT_DIR / "full_documents_object.js"

# Define the complete hierarchy structure
# Year -> Class -> Term -> Subject

YEARS = [
    "2020-21",
    "2021-22", 
    "2022-23",
    "2023-24",
    "2024-25",
    "2025-26"
]

CLASSES = [
    "Class 9",
    "Class 10",
    "Class 11",
    "Class 12"
]

TERMS = [
    "MT 1",
    "MT 2", 
    "HY",
    "FT"
]

SUBJECTS = [
    "Bengali",
    "Biology",
    "Chemistry",
    "Commerce",
    "Computer",
    "Economics",
    "English Language",
    "English Literature",
    "EVA",
    "EVS",
    "French",
    "Geography",
    "German",
    "Hindi",
    "History",
    "Home Science",
    "Math",
    "PE",
    "Physics",
    "RAI"
]

def normalize_name(name):
    """Normalize a name for matching - handle underscores, spaces, etc."""
    return name.lower().replace("_", " ").replace("-", " ").strip()

def get_class_number(class_name):
    """Extract class number from class name like 'Class 9' -> '9'"""
    return class_name.replace("Class ", "")

def find_matching_pdf(year, class_name, term, subject, pdf_files):
    """
    Find a PDF file that matches the year/class/term/subject combination.
    Returns the filename if found, None otherwise.
    """
    # Build patterns to match
    year_norm = year  # Keep as-is: 2020-21
    class_num = get_class_number(class_name)  # Class 9 -> 9
    term_norm = term.replace(" ", "_")   # MT 1 -> MT_1
    subject_norm = subject.replace(" ", "_")  # English Language -> English_Language
    
    # Also handle MT2 without underscore (2022-23 uses MT2)
    term_alt = term.replace(" ", "")  # MT 1 -> MT1
    
    # Look for exact matches - pattern: 2020-21_CL_9_MT_1_Bengali.pdf
    patterns = [
        f"{year_norm}_CL_{class_num}_{term_norm}_{subject_norm}",
        f"{year_norm}_CL_{class_num}_{term_alt}_{subject_norm}",  # MT2 variant
    ]
    
    for pdf_file in pdf_files:
        pdf_name = pdf_file.lower()
        for pattern in patterns:
            if pdf_name.startswith(pattern.lower()):
                return pdf_file
    
    # Try partial matches for subjects with variations
    subject_parts = subject_norm.lower().split("_")
    for pdf_file in pdf_files:
        pdf_lower = pdf_file.lower()
        if year_norm.lower() in pdf_lower and f"_cl_{class_num}_" in pdf_lower:
            if f"_{term_norm.lower()}_" in pdf_lower or f"_{term_alt.lower()}_" in pdf_lower:
                # Check if all subject parts are in the filename
                if all(part in pdf_lower for part in subject_parts):
                    return pdf_file
    
    return None

def find_all_pdfs_for_year_class_term(year, class_name, term, pdf_files):
    """Find all PDFs matching a specific year, class and term."""
    year_norm = year
    class_num = get_class_number(class_name)
    term_norm = term.replace(" ", "_")
    term_alt = term.replace(" ", "")
    
    matches = []
    for pdf_file in pdf_files:
        pdf_lower = pdf_file.lower()
        if year_norm.lower() in pdf_lower and f"_cl_{class_num}_" in pdf_lower:
            if f"_{term_norm.lower()}_" in pdf_lower or f"_{term_alt.lower()}_" in pdf_lower:
                matches.append(pdf_file)
    return matches

def extract_subject_from_filename(filename, year, class_name, term):
    """Extract the subject name from a PDF filename."""
    # Remove year, class, term prefixes
    year_norm = year
    class_num = get_class_number(class_name)
    term_patterns = [term.replace(" ", "_"), term.replace(" ", "")]
    
    name = filename.replace(".pdf", "")
    
    # Remove year_CL_class_term_ prefix
    for tp in term_patterns:
        pattern = f"{year_norm}_CL_{class_num}_{tp}_"
        if name.startswith(pattern):
            name = name[len(pattern):]
            break
    
    # Convert underscores to spaces for display
    subject = name.replace("_", " ").strip()
    
    # Clean up common variations
    subject = subject.replace("  ", " ")
    
    return subject

def build_hierarchy():
    """Build the complete hierarchy with all files."""
    
    # Get all PDF files
    if not DOCUMENTS_DIR.exists():
        print(f"Documents directory not found: {DOCUMENTS_DIR}")
        return None
    
    pdf_files = [f.name for f in DOCUMENTS_DIR.glob("*.pdf")]
    print(f"Found {len(pdf_files)} PDF files")
    
    # Build the documents object
    # Year -> Class -> Term -> Subject
    documents = {}
    
    # Track statistics
    found_count = 0
    placeholder_count = 0
    extra_subjects = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    
    for year in YEARS:
        documents[year] = {}
        
        for class_name in CLASSES:
            documents[year][class_name] = {}
            
            for term in TERMS:
                documents[year][class_name][term] = {}
                
                # First, add all standard subjects
                for subject in SUBJECTS:
                    pdf_file = find_matching_pdf(year, class_name, term, subject, pdf_files)
                    
                    if pdf_file:
                        documents[year][class_name][term][subject] = f"documents/{pdf_file}"
                        found_count += 1
                    else:
                        documents[year][class_name][term][subject] = "#"
                        placeholder_count += 1
                
                # Now find any additional PDFs that don't match standard subjects
                term_pdfs = find_all_pdfs_for_year_class_term(year, class_name, term, pdf_files)
                for pdf_file in term_pdfs:
                    extracted = extract_subject_from_filename(pdf_file, year, class_name, term)
                    
                    # Check if this subject is already in our list (by normalized comparison)
                    extracted_norm = normalize_name(extracted)
                    found_standard = False
                    for std_subject in SUBJECTS:
                        if normalize_name(std_subject) in extracted_norm or extracted_norm in normalize_name(std_subject):
                            found_standard = True
                            break
                    
                    if not found_standard and extracted not in documents[year][class_name][term]:
                        # This is an extra subject (like "Bengali I", "Bengali II", etc.)
                        documents[year][class_name][term][extracted] = f"documents/{pdf_file}"
                        extra_subjects[year][class_name][term].append(extracted)
                        found_count += 1
    
    # Add Study Materials section
    study_materials = {}
    for pdf_file in pdf_files:
        if pdf_file.startswith("Study_Material"):
            # Parse the study material name
            name = pdf_file.replace("Study_Material_Class_9_", "").replace(".pdf", "").replace("_", " ")
            study_materials[name] = f"documents/{pdf_file}"
    
    if study_materials:
        documents["Study Materials"] = study_materials
        found_count += len(study_materials)
    
    print(f"\nStatistics:")
    print(f"  Files found: {found_count}")
    print(f"  Placeholders: {placeholder_count}")
    print(f"  Extra subjects discovered: {sum(len(v) for y in extra_subjects.values() for c in y.values() for v in c.values())}")
    
    return documents

def generate_js_output(documents):
    """Generate formatted JavaScript output."""
    
    def format_obj(obj, indent=0):
        """Recursively format an object for JS output."""
        lines = []
        spaces = "    " * indent
        
        if isinstance(obj, dict):
            for i, (key, value) in enumerate(obj.items()):
                comma = "," if i < len(obj) - 1 else ""
                
                if isinstance(value, dict) and value:
                    lines.append(f'{spaces}"{key}": {{')
                    lines.extend(format_obj(value, indent + 1))
                    lines.append(f'{spaces}}}{comma}')
                else:
                    # It's a leaf value (path or placeholder)
                    lines.append(f'{spaces}"{key}": "{value}"{comma}')
        
        return lines
    
    lines = ["let documents = {"]
    lines.extend(format_obj(documents, 1))
    lines.append("};")
    
    return "\n".join(lines)

def main():
    print("=" * 60)
    print("Building Full Hierarchy Documents Object")
    print("=" * 60)
    
    documents = build_hierarchy()
    
    if not documents:
        return
    
    # Generate JS
    js_content = generate_js_output(documents)
    
    # Write to file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"\nOutput written to: {OUTPUT_FILE}")
    print(f"\nPreview (first 100 lines):")
    print("-" * 40)
    for line in js_content.split("\n")[:100]:
        print(line)

if __name__ == "__main__":
    main()
