#!/usr/bin/env python3
"""
Google Drive Download with OAuth
================================
This script downloads files using Google Drive API with your own credentials,
bypassing the "public link" requirement.

Setup (one-time):
1. Go to https://console.cloud.google.com/
2. Create a new project (or select existing)
3. Enable "Google Drive API"
4. Go to "Credentials" → "Create Credentials" → "OAuth client ID"
5. Choose "Desktop app"
6. Download the JSON file and save as "credentials.json" in this folder

Then run: python download_with_oauth.py
"""

import os
import re
import json
import pickle
import time
from pathlib import Path

# Configuration
SCRIPT_DIR = Path(__file__).parent
DOWNLOAD_DIR = SCRIPT_DIR / "downloaded_pdfs"
CREDENTIALS_FILE = SCRIPT_DIR / "credentials.json"
TOKEN_FILE = SCRIPT_DIR / "token.pickle"
APP_JS_PATH = SCRIPT_DIR.parent / "src" / "js" / "app.js"


def ensure_dependencies():
    """Install required packages"""
    import subprocess
    import sys
    packages = ["google-auth-oauthlib", "google-auth-httplib2", "google-api-python-client"]
    for pkg in packages:
        try:
            if pkg == "google-auth-oauthlib":
                __import__("google_auth_oauthlib")
            elif pkg == "google-api-python-client":
                __import__("googleapiclient")
            else:
                __import__(pkg.replace("-", "_"))
        except ImportError:
            print(f"Installing {pkg}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", pkg, "-q"])


def get_drive_service():
    """Authenticate and return Google Drive service"""
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    
    SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
    
    creds = None
    
    # Load existing token
    if TOKEN_FILE.exists():
        with open(TOKEN_FILE, 'rb') as token:
            creds = pickle.load(token)
    
    # Refresh or get new credentials
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                print("\n" + "=" * 60)
                print("SETUP REQUIRED: Google Cloud credentials.json not found!")
                print("=" * 60)
                print("""
To download files from YOUR Google Drive, you need to set up OAuth:

1. Go to: https://console.cloud.google.com/
2. Create a new project (or select existing one)
3. Search for "Google Drive API" and ENABLE it
4. Go to "APIs & Services" -> "Credentials"
5. Click "Create Credentials" -> "OAuth client ID"
6. If asked, configure consent screen:
   - Choose "External"
   - Fill in app name (e.g., "My Drive Downloader")
   - Add your email as test user
7. For OAuth client ID:
   - Choose "Desktop app"
   - Name it anything
8. Click "Download JSON"
9. Save the file as: {0}

Then run this script again.
""".format(CREDENTIALS_FILE))
                return None
            
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save credentials
        with open(TOKEN_FILE, 'wb') as token:
            pickle.dump(creds, token)
    
    return build('drive', 'v3', credentials=creds)


def extract_file_id(url):
    """Extract Google Drive file ID from URL"""
    if not url or url == "#":
        return None
    patterns = [
        r'/file/d/([a-zA-Z0-9_-]{20,})',
        r'/document/d/([a-zA-Z0-9_-]{20,})',
        r'[?&]id=([a-zA-Z0-9_-]{20,})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match and match.group(1) != "FILE_ID":
            return match.group(1)
    return None


def extract_file_id_from_url(url):
    """Extract file ID from a Google Drive URL"""
    patterns = [
        r'/file/d/([a-zA-Z0-9_-]{20,})',
        r'/document/d/([a-zA-Z0-9_-]{20,})',
        r'[?&]id=([a-zA-Z0-9_-]{20,})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match and match.group(1) != "FILE_ID":
            return match.group(1)
    return None

def collect_logical_paths_and_ids(js_content):
    """
    Extract all Google Drive URLs and their FULL hierarchical logical paths.
    Uses a more robust character-by-character parsing approach.
    
    Returns: List of (full_path_list, file_id) tuples
    """
    import re
    
    # Find the documents object
    m = re.search(r'let documents\s*=\s*\{', js_content, re.DOTALL)
    if not m:
        return []
    
    # Extract the entire documents object
    start = m.end() - 1
    brace_count = 1
    end = start + 1
    while end < len(js_content) and brace_count > 0:
        if js_content[end] == '{':
            brace_count += 1
        elif js_content[end] == '}':
            brace_count -= 1
        end += 1
    
    obj_str = js_content[start:end]
    
    # Parse character by character to build the hierarchy
    results = []
    path_stack = []  # Track current path in hierarchy
    i = 0
    
    while i < len(obj_str):
        # Look for key-value pairs: "key": "value" or "key": {
        key_match = re.match(r'\s*["\']([^"\']+)["\']\s*:\s*', obj_str[i:])
        
        if key_match:
            key = key_match.group(1)
            i += key_match.end()
            
            # Check what comes after the colon
            if i < len(obj_str):
                # Skip whitespace
                while i < len(obj_str) and obj_str[i] in ' \t\n\r':
                    i += 1
                
                if i < len(obj_str) and obj_str[i] == '{':
                    # It's a nested object - push key to path
                    path_stack.append(key)
                    i += 1
                elif i < len(obj_str) and obj_str[i] in '"\'':
                    # It's a string value - check if it's a URL
                    quote = obj_str[i]
                    i += 1
                    value_start = i
                    while i < len(obj_str) and obj_str[i] != quote:
                        i += 1
                    value = obj_str[value_start:i]
                    i += 1  # skip closing quote
                    
                    # Check if this is a Google Drive URL
                    if 'drive.google.com' in value or 'docs.google.com' in value:
                        file_id = extract_file_id_from_url(value)
                        if file_id and value != "#":
                            # Build full path
                            full_path = path_stack + [key]
                            results.append((full_path, file_id))
                else:
                    i += 1
        elif obj_str[i] == '}':
            # Exiting a nested object - pop from path
            if path_stack:
                path_stack.pop()
            i += 1
        else:
            i += 1
    
    return results


def download_file(service, file_id, output_path):
    """Download a file from Google Drive"""
    from googleapiclient.http import MediaIoBaseDownload
    import io
    
    try:
        # Get file metadata
        file_meta = service.files().get(fileId=file_id, fields='name,mimeType,size').execute()
        
        # Handle Google Docs/Sheets (export as PDF)
        mime_type = file_meta.get('mimeType', '')
        if mime_type.startswith('application/vnd.google-apps'):
            request = service.files().export_media(fileId=file_id, mimeType='application/pdf')
        else:
            request = service.files().get_media(fileId=file_id)
        
        # Download
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        
        done = False
        while not done:
            status, done = downloader.next_chunk()
        
        # Write to file
        fh.seek(0)
        with open(output_path, 'wb') as f:
            f.write(fh.read())
        
        size = output_path.stat().st_size
        return True, size
        
    except Exception as e:
        error_msg = str(e)
        if 'File not found' in error_msg:
            return False, "File not found or no access"
        elif 'Rate Limit' in error_msg:
            return False, "Rate limited - wait and retry"
        else:
            return False, error_msg[:50]


def main():
    print("=" * 60)
    print("Google Drive Download with OAuth")
    print("=" * 60)
    
    ensure_dependencies()
    
    # Authenticate
    print("\nAuthenticating with Google Drive...")
    service = get_drive_service()
    
    if not service:
        return
    
    print("Authenticated successfully!\n")
    
    # Read app.js
    if not APP_JS_PATH.exists():
        print(f"Could not find: {APP_JS_PATH}")
        return

    with open(APP_JS_PATH, 'r', encoding='utf-8') as f:
        js_content = f.read()

    # Extract logical paths and file IDs
    path_id_pairs = collect_logical_paths_and_ids(js_content)
    print(f"Found {len(path_id_pairs)} Google Drive documents with logical paths\n")

    # Create download directory
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Download files
    stats = {"downloaded": 0, "skipped": 0, "failed": 0}

    for i, (full_path, file_id) in enumerate(path_id_pairs):
        # Build filename from FULL path (including year, class, term, subject, etc.)
        filename = "_".join(full_path)
        
        # Remove trailing _pdf or similar
        filename = re.sub(r'_pdf$', '', filename, flags=re.IGNORECASE)
        
        # Clean filename (remove invalid characters)
        filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
        filename = re.sub(r'\s+', '_', filename)
        
        # Ensure it ends with .pdf
        if not filename.lower().endswith('.pdf'):
            filename = filename + ".pdf"
        
        output_path = DOWNLOAD_DIR / filename

        # Display short version for readability
        short_name = filename[:60] + "..." if len(filename) > 60 else filename
        print(f"[{i+1}/{len(path_id_pairs)}] {short_name}", end=" ")

        # Skip if already downloaded
        if output_path.exists() and output_path.stat().st_size > 1000:
            print(f"✓ Already have it ({output_path.stat().st_size:,} bytes)")
            stats["skipped"] += 1
            continue

        # Download
        success, info = download_file(service, file_id, output_path)

        if success:
            print(f"✓ Downloaded ({info:,} bytes)")
            stats["downloaded"] += 1
        else:
            print(f"✗ FAILED ({info})")
            stats["failed"] += 1

        # Rate limiting
        time.sleep(0.2)

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Total files:    {len(path_id_pairs)}")
    print(f"Downloaded:     {stats['downloaded']}")
    print(f"Already had:    {stats['skipped']}")
    print(f"Failed:         {stats['failed']}")
    print(f"\nFiles saved to: {DOWNLOAD_DIR.absolute()}")


if __name__ == "__main__":
    main()
