#!/usr/bin/env python3
"""
Google Drive to GitHub Releases Migration Script
================================================
This script downloads all PDFs from Google Drive and optionally uploads them to GitHub Releases.

Prerequisites:
1. Install required packages:
   pip install gdown requests

2. (Optional) Create a GitHub Personal Access Token for auto-upload:
   - Go to https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Give it "repo" scope
   - Copy the token

Usage:
  python migrate_to_github.py                  # Download all files
  python migrate_to_github.py --upload         # Download and upload to GitHub
  python migrate_to_github.py --update-app     # Update app.js with new URLs (after upload)
"""

import os
import re
import json
import time
import subprocess
import sys
import argparse
from pathlib import Path
from urllib.parse import quote

# Configuration
GITHUB_REPO = "Nugget1252/Questionarytauri"  # Change to your repo
RELEASE_TAG = "study-materials-v1"
RELEASE_NAME = "Study Materials PDFs"
SCRIPT_DIR = Path(__file__).parent
DOWNLOAD_DIR = SCRIPT_DIR / "downloaded_pdfs"
MAPPING_FILE = SCRIPT_DIR / "url_mapping.json"
APP_JS_PATH = SCRIPT_DIR.parent / "src" / "js" / "app.js"


def ensure_dependencies():
    """Install required packages if not present"""
    packages = {"gdown": "gdown", "requests": "requests"}
    for module, package in packages.items():
        try:
            __import__(module)
        except ImportError:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])


def extract_file_id(url):
    """Extract Google Drive file ID from various URL formats"""
    if not url or url == "#" or url == "":
        return None
    
    patterns = [
        r'/file/d/([a-zA-Z0-9_-]{20,})',      # /file/d/FILE_ID/
        r'/document/d/([a-zA-Z0-9_-]{20,})',  # /document/d/FILE_ID/
        r'[?&]id=([a-zA-Z0-9_-]{20,})',       # ?id=FILE_ID
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            file_id = match.group(1)
            # Filter out placeholder FILE_ID
            if file_id != "FILE_ID" and len(file_id) >= 20:
                return file_id
    return None


def extract_all_urls_with_paths(content):
    """
    Extract all Google Drive URLs with their full document path from app.js
    Returns: list of {path: [list, of, keys], url: "https://...", file_id: "..."}
    """
    docs = []
    seen_ids = set()
    
    # Find all Google Drive URLs with their key context
    # Pattern matches: "key": "https://drive.google.com/..."
    url_pattern = re.compile(
        r'"([^"]+)":\s*"(https://(?:drive|docs)\.google\.com/[^"]+)"'
    )
    
    # Find the documents object boundaries
    match = re.search(r'let documents = ({[\s\S]*?});', content)
    if not match:
        print("Could not find 'let documents = {...};' in app.js")
        # Fall back to extracting all URLs from entire file
        for url_match in url_pattern.finditer(content):
            key = url_match.group(1)
            url = url_match.group(2)
            file_id = extract_file_id(url)
            if file_id and file_id not in seen_ids:
                seen_ids.add(file_id)
                docs.append({"path": [key], "url": url, "file_id": file_id})
        return docs
    
    docs_str = match.group(1)
    
    # Parse structure to get paths - track nested keys
    lines = docs_str.split('\n')
    current_path = []
    
    for line in lines:
        # Track opening braces with keys: "KeyName": {
        key_open_match = re.search(r'"([^"]+)":\s*\{\s*$', line)
        if key_open_match:
            current_path.append(key_open_match.group(1))
            continue
        
        # Track opening braces on same line as objects: "KeyName": { "SubKey": ...
        inline_open = re.search(r'"([^"]+)":\s*\{[^}]', line)
        if inline_open and not key_open_match:
            # Has nested content on same line
            temp_key = inline_open.group(1)
            # Find all URLs in this line
            for url_match in url_pattern.finditer(line):
                key = url_match.group(1)
                url = url_match.group(2)
                file_id = extract_file_id(url)
                if file_id and file_id not in seen_ids:
                    seen_ids.add(file_id)
                    # Use temp_key as parent if not the URL key itself
                    if key != temp_key:
                        docs.append({"path": current_path + [temp_key, key], "url": url, "file_id": file_id})
                    else:
                        docs.append({"path": current_path + [key], "url": url, "file_id": file_id})
            continue
        
        # Track closing braces
        close_count = line.count('}') - line.count('{')
        if close_count > 0:
            for _ in range(min(close_count, len(current_path))):
                if current_path:
                    current_path.pop()
        
        # Find URLs in regular lines
        for url_match in url_pattern.finditer(line):
            key = url_match.group(1)
            url = url_match.group(2)
            file_id = extract_file_id(url)
            if file_id and file_id not in seen_ids:
                seen_ids.add(file_id)
                docs.append({"path": current_path + [key], "url": url, "file_id": file_id})
    
    return docs


def generate_filename(doc):
    """Generate a filename from document path and file_id"""
    path_str = "_".join(doc["path"])
    path_str = re.sub(r'[^a-zA-Z0-9_\-]', '_', path_str)
    path_str = re.sub(r'_+', '_', path_str).strip('_')
    
    # Use short ID for uniqueness
    short_id = doc["file_id"][:8]
    
    # Limit total length
    max_path_len = 80
    if len(path_str) > max_path_len:
        path_str = path_str[:max_path_len]
    
    return f"{path_str}_{short_id}.pdf"


def download_file(file_id, output_path):
    """Download file from Google Drive using gdown"""
    import gdown
    
    try:
        url = f"https://drive.google.com/uc?id={file_id}"
        output = gdown.download(url, str(output_path), quiet=True, fuzzy=True)
        
        if output and Path(output).exists():
            size = Path(output).stat().st_size
            if size > 1000:  # Valid file (not error page)
                return True, size
            else:
                os.remove(output)
                return False, 0
        return False, 0
    except Exception as e:
        return False, str(e)


def upload_to_github(filepath, filename, token, release_id=None):
    """Upload file to GitHub Release"""
    import requests
    
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # Get or create release
    if release_id is None:
        release_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}"
        response = requests.get(release_url, headers=headers)
        
        if response.status_code == 404:
            # Create release
            create_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
            release_data = {
                "tag_name": RELEASE_TAG,
                "name": RELEASE_NAME,
                "body": "Study materials PDFs for offline access in Questionary app",
                "draft": False,
                "prerelease": False
            }
            response = requests.post(create_url, headers=headers, json=release_data)
            if response.status_code not in [200, 201]:
                return None, f"Failed to create release: {response.status_code}"
        
        release = response.json()
        release_id = release.get("id")
        upload_url = release.get("upload_url", "").replace("{?name,label}", "")
    else:
        # Get existing release
        release_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/{release_id}"
        response = requests.get(release_url, headers=headers)
        release = response.json()
        upload_url = release.get("upload_url", "").replace("{?name,label}", "")
    
    if not upload_url:
        return None, "Could not get upload URL"
    
    # Upload file
    upload_url = f"{upload_url}?name={quote(filename)}"
    headers["Content-Type"] = "application/pdf"
    
    with open(filepath, "rb") as f:
        response = requests.post(upload_url, headers=headers, data=f)
    
    if response.status_code in [200, 201]:
        return response.json().get("browser_download_url"), release_id
    else:
        return None, f"Upload failed: {response.status_code}"


def update_app_js(mapping):
    """Update app.js with new URLs from mapping"""
    if not mapping:
        print("No URL mapping found")
        return False
    
    with open(APP_JS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    original = content
    
    # Replace each old URL with new URL
    for old_url, new_url in mapping.items():
        content = content.replace(f'"{old_url}"', f'"{new_url}"')
    
    if content != original:
        # Backup original
        backup_path = APP_JS_PATH.with_suffix('.js.backup')
        with open(backup_path, "w", encoding="utf-8") as f:
            f.write(original)
        print(f"Backup saved to: {backup_path}")
        
        # Write updated content
        with open(APP_JS_PATH, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Count replacements
        count = sum(1 for old in mapping if old in original)
        print(f"Updated {count} URLs in app.js")
        return True
    else:
        print("No changes made to app.js")
        return False


def main():
    global GITHUB_REPO
    
    parser = argparse.ArgumentParser(description="Migrate Google Drive PDFs to GitHub Releases")
    parser.add_argument("--upload", action="store_true", help="Upload files to GitHub Releases")
    parser.add_argument("--update-app", action="store_true", help="Update app.js with new URLs")
    parser.add_argument("--token", type=str, help="GitHub Personal Access Token")
    parser.add_argument("--repo", type=str, default=GITHUB_REPO, help="GitHub repo (owner/repo)")
    args = parser.parse_args()
    
    GITHUB_REPO = args.repo
    
    ensure_dependencies()
    
    print("=" * 60)
    print("Google Drive to GitHub Releases Migration Tool")
    print("=" * 60)
    
    # Handle --update-app
    if args.update_app:
        if MAPPING_FILE.exists():
            with open(MAPPING_FILE, "r") as f:
                mapping = json.load(f)
            update_app_js(mapping)
        else:
            print(f"No mapping file found at {MAPPING_FILE}")
            print("Run the script with --upload first to generate mappings")
        return
    
    # Read app.js
    if not APP_JS_PATH.exists():
        print(f"Could not find app.js at: {APP_JS_PATH}")
        return
    
    print(f"\nReading: {APP_JS_PATH}")
    with open(APP_JS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Extract all URLs
    docs = extract_all_urls_with_paths(content)
    print(f"Found {len(docs)} unique Google Drive documents\n")
    
    if not docs:
        print("No documents to process")
        return
    
    # Create download directory
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    
    # Load existing mapping
    mapping = {}
    if MAPPING_FILE.exists():
        with open(MAPPING_FILE, "r") as f:
            mapping = json.load(f)
    
    # Get GitHub token if uploading
    github_token = None
    release_id = None
    if args.upload:
        github_token = args.token or os.environ.get("GITHUB_TOKEN")
        if not github_token:
            print("GitHub token required for upload.")
            print("Provide via --token or GITHUB_TOKEN environment variable")
            print("Create one at: https://github.com/settings/tokens (needs 'repo' scope)")
            github_token = input("\nEnter GitHub token (or press Enter to skip upload): ").strip()
            if not github_token:
                args.upload = False
    
    # Process documents
    print("=" * 60)
    print("Processing Documents")
    print("=" * 60)
    
    stats = {"downloaded": 0, "uploaded": 0, "skipped": 0, "failed": 0}
    
    for i, doc in enumerate(docs):
        path_str = " > ".join(doc["path"])
        filename = generate_filename(doc)
        filepath = DOWNLOAD_DIR / filename
        
        print(f"\n[{i+1}/{len(docs)}] {path_str}")
        print(f"         File ID: {doc['file_id'][:15]}...")
        
        # Skip if already uploaded
        if doc["url"] in mapping:
            print(f"         -> Already uploaded, skipping")
            stats["skipped"] += 1
            continue
        
        # Download if needed
        if filepath.exists() and filepath.stat().st_size > 1000:
            print(f"         -> Already downloaded ({filepath.stat().st_size:,} bytes)")
        else:
            print(f"         -> Downloading...", end=" ", flush=True)
            success, info = download_file(doc["file_id"], filepath)
            
            if success:
                print(f"OK ({info:,} bytes)")
                stats["downloaded"] += 1
            else:
                print(f"FAILED ({info})")
                stats["failed"] += 1
                continue
        
        # Upload if requested
        if args.upload and github_token:
            print(f"         -> Uploading to GitHub...", end=" ", flush=True)
            new_url, result = upload_to_github(filepath, filename, github_token, release_id)
            
            if new_url:
                if isinstance(result, int):
                    release_id = result  # Save for subsequent uploads
                mapping[doc["url"]] = new_url
                print(f"OK")
                stats["uploaded"] += 1
            else:
                print(f"FAILED ({result})")
                stats["failed"] += 1
        
        # Save mapping periodically
        if mapping and (i + 1) % 10 == 0:
            with open(MAPPING_FILE, "w") as f:
                json.dump(mapping, f, indent=2)
        
        # Rate limiting
        time.sleep(0.3)
    
    # Save final mapping
    if mapping:
        with open(MAPPING_FILE, "w") as f:
            json.dump(mapping, f, indent=2)
    
    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total documents:  {len(docs)}")
    print(f"Downloaded:       {stats['downloaded']}")
    print(f"Uploaded:         {stats['uploaded']}")
    print(f"Skipped:          {stats['skipped']}")
    print(f"Failed:           {stats['failed']}")
    print(f"\nDownload folder:  {DOWNLOAD_DIR.absolute()}")
    
    if mapping:
        print(f"URL mapping:      {MAPPING_FILE.absolute()}")
        print(f"\nMapped {len(mapping)} URLs")
        print("\nTo update app.js with new URLs, run:")
        print(f"  python {Path(__file__).name} --update-app")
    
    if stats["uploaded"] == 0 and not args.upload:
        print("\nTo upload files to GitHub Releases, run:")
        print(f"  python {Path(__file__).name} --upload --token YOUR_GITHUB_TOKEN")


if __name__ == "__main__":
    main()
