// Hot Code Update System for Questionary
// This module handles incremental code updates (JS, CSS, HTML) without requiring full app reinstall
// Load this BEFORE other scripts in index.html

(function() {
    'use strict';
    
    const CODE_MANIFEST_URL = 'https://raw.githubusercontent.com/Nugget1252/Questionarytauri/main/code-manifest.json';
    const CODE_MANIFEST_KEY = 'questionary-code-manifest';
    const CODE_FILES_KEY = 'questionary-code-files';
    
    // Bundled file versions (update these when you build)
    const BUNDLED_VERSIONS = {
        'app.js': '1.0.0',
        'styles.css': '1.0.0',
        'contentUpdater.js': '1.0.0'
    };
    
    // Code update state
    window.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        pendingUpdates: [],
        remoteManifest: null
    };
    
    // Get stored code manifest
    function getLocalCodeManifest() {
        try {
            const data = localStorage.getItem(CODE_MANIFEST_KEY);
            return data ? JSON.parse(data) : { version: '0.0.0', files: {} };
        } catch (e) {
            return { version: '0.0.0', files: {} };
        }
    }
    
    // Save code manifest
    function saveLocalCodeManifest(manifest) {
        localStorage.setItem(CODE_MANIFEST_KEY, JSON.stringify(manifest));
    }
    
    // Get stored code files (the actual code content)
    function getStoredCodeFiles() {
        try {
            const data = localStorage.getItem(CODE_FILES_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }
    
    // Save code files
    function saveStoredCodeFiles(files) {
        localStorage.setItem(CODE_FILES_KEY, JSON.stringify(files));
    }
    
    // Check if we have a newer version stored
    function hasNewerVersion(filename) {
        const stored = getStoredCodeFiles();
        const localManifest = getLocalCodeManifest();
        
        if (stored[filename] && localManifest.files && localManifest.files[filename]) {
            const storedVersion = localManifest.files[filename].version;
            const bundledVersion = BUNDLED_VERSIONS[filename] || '0.0.0';
            return compareVersions(storedVersion, bundledVersion) > 0;
        }
        return false;
    }
    
    // Compare version strings (returns 1 if a > b, -1 if a < b, 0 if equal)
    function compareVersions(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }
    
    // Load CSS from stored updates
    function loadStoredCSS(filename) {
        const stored = getStoredCodeFiles();
        if (stored[filename]) {
            console.log(`[HotUpdate] Loading updated CSS: ${filename}`);
            const style = document.createElement('style');
            style.id = `hotupdate-${filename.replace('.', '-')}`;
            style.textContent = stored[filename];
            document.head.appendChild(style);
            
            // Disable the original stylesheet
            const originalLink = document.querySelector(`link[href*="${filename}"]`);
            if (originalLink) {
                originalLink.disabled = true;
            }
            return true;
        }
        return false;
    }
    
    // Load JS from stored updates (for non-critical scripts)
    function loadStoredJS(filename) {
        const stored = getStoredCodeFiles();
        if (stored[filename]) {
            console.log(`[HotUpdate] Loading updated JS: ${filename}`);
            try {
                // Create a blob URL and load as script
                const blob = new Blob([stored[filename]], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                const script = document.createElement('script');
                script.src = url;
                script.id = `hotupdate-${filename.replace('.', '-')}`;
                document.body.appendChild(script);
                return true;
            } catch (e) {
                console.error(`[HotUpdate] Error loading ${filename}:`, e);
            }
        }
        return false;
    }
    
    // Fetch remote code manifest
    async function fetchCodeManifest() {
        try {
            const response = await fetch(CODE_MANIFEST_URL + '?t=' + Date.now());
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.log('[HotUpdate] Could not fetch code manifest:', error.message);
        }
        return null;
    }
    
    // Fetch a code file from remote
    async function fetchCodeFile(url) {
        try {
            const response = await fetch(url + '?t=' + Date.now());
            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.error('[HotUpdate] Error fetching file:', error);
        }
        return null;
    }
    
    // Check for code updates
    async function checkForCodeUpdates(silent = false) {
        if (window.codeUpdateState.checking || window.codeUpdateState.downloading) {
            return null;
        }
        
        window.codeUpdateState.checking = true;
        
        try {
            const remoteManifest = await fetchCodeManifest();
            
            if (!remoteManifest || !remoteManifest.files) {
                window.codeUpdateState.checking = false;
                return null;
            }
            
            const localManifest = getLocalCodeManifest();
            const pendingUpdates = [];
            
            // Check each file in the remote manifest
            for (const [filename, fileInfo] of Object.entries(remoteManifest.files)) {
                const localVersion = localManifest.files?.[filename]?.version || BUNDLED_VERSIONS[filename] || '0.0.0';
                const remoteVersion = fileInfo.version;
                
                if (compareVersions(remoteVersion, localVersion) > 0) {
                    pendingUpdates.push({
                        filename,
                        version: remoteVersion,
                        url: fileInfo.url || `${remoteManifest.baseUrl}${filename}`,
                        hash: fileInfo.hash,
                        size: fileInfo.size || 0,
                        type: fileInfo.type || (filename.endsWith('.css') ? 'css' : 'js')
                    });
                }
            }
            
            window.codeUpdateState.remoteManifest = remoteManifest;
            window.codeUpdateState.pendingUpdates = pendingUpdates;
            
            if (pendingUpdates.length > 0) {
                window.codeUpdateState.available = true;
                console.log(`[HotUpdate] ${pendingUpdates.length} code update(s) available`);
                
                if (!silent && typeof showNotification === 'function') {
                    showNotification(
                        `${pendingUpdates.length} code update(s) available. Click the update button to apply.`,
                        'info'
                    );
                }
                
                updateCodeUpdateUI('available', pendingUpdates.length);
            } else {
                if (!silent) {
                    console.log('[HotUpdate] Code is up to date');
                }
            }
            
            window.codeUpdateState.checking = false;
            return pendingUpdates;
            
        } catch (error) {
            console.error('[HotUpdate] Error checking for updates:', error);
            window.codeUpdateState.checking = false;
            return null;
        }
    }
    
    // Download and apply code updates
    async function downloadCodeUpdates() {
        if (window.codeUpdateState.downloading || window.codeUpdateState.pendingUpdates.length === 0) {
            return;
        }
        
        window.codeUpdateState.downloading = true;
        updateCodeUpdateUI('downloading');
        
        const storedFiles = getStoredCodeFiles();
        const localManifest = getLocalCodeManifest();
        if (!localManifest.files) localManifest.files = {};
        
        let successCount = 0;
        let requiresReload = false;
        
        for (const update of window.codeUpdateState.pendingUpdates) {
            console.log(`[HotUpdate] Downloading ${update.filename}...`);
            
            try {
                const content = await fetchCodeFile(update.url);
                
                if (content) {
                    // Store the file content
                    storedFiles[update.filename] = content;
                    localManifest.files[update.filename] = {
                        version: update.version,
                        hash: update.hash,
                        updatedAt: new Date().toISOString()
                    };
                    successCount++;
                    
                    // Check if this update can be hot-applied
                    if (update.type === 'css') {
                        // CSS can be hot-reloaded
                        applyHotCSS(update.filename, content);
                    } else {
                        // JS requires reload for safety
                        requiresReload = true;
                    }
                }
            } catch (error) {
                console.error(`[HotUpdate] Failed to download ${update.filename}:`, error);
            }
        }
        
        // Save everything
        saveStoredCodeFiles(storedFiles);
        localManifest.version = window.codeUpdateState.remoteManifest?.version || localManifest.version;
        saveLocalCodeManifest(localManifest);
        
        // Reset state
        window.codeUpdateState.downloading = false;
        window.codeUpdateState.available = false;
        window.codeUpdateState.pendingUpdates = [];
        
        updateCodeUpdateUI('idle');
        
        if (successCount > 0) {
            if (requiresReload) {
                if (typeof showNotification === 'function') {
                    showNotification(
                        `Downloaded ${successCount} update(s). Reload the app to apply JS changes.`,
                        'success'
                    );
                }
                // Show reload prompt
                showReloadPrompt();
            } else {
                if (typeof showNotification === 'function') {
                    showNotification(`Applied ${successCount} update(s) successfully!`, 'success');
                }
            }
        }
    }
    
    // Hot-apply CSS without reload
    function applyHotCSS(filename, content) {
        console.log(`[HotUpdate] Hot-applying CSS: ${filename}`);
        
        // Remove any existing hot-update style
        const existingStyle = document.getElementById(`hotupdate-${filename.replace('.', '-')}`);
        if (existingStyle) {
            existingStyle.remove();
        }
        
        // Create new style element
        const style = document.createElement('style');
        style.id = `hotupdate-${filename.replace('.', '-')}`;
        style.textContent = content;
        document.head.appendChild(style);
        
        // Disable the original stylesheet
        const originalLink = document.querySelector(`link[href*="${filename}"]`);
        if (originalLink) {
            originalLink.disabled = true;
        }
    }
    
    // Show reload prompt for JS updates
    function showReloadPrompt() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('reloadPromptModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reloadPromptModal';
            modal.innerHTML = `
                <div class="reload-prompt-overlay">
                    <div class="reload-prompt-content">
                        <i class="fas fa-sync-alt reload-icon"></i>
                        <h3>Update Ready</h3>
                        <p>New code updates have been downloaded. Reload the app to apply them.</p>
                        <div class="reload-prompt-buttons">
                            <button class="btn btn-secondary" onclick="document.getElementById('reloadPromptModal').style.display='none'">
                                Later
                            </button>
                            <button class="btn btn-primary" onclick="location.reload()">
                                <i class="fas fa-redo"></i> Reload Now
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'block';
    }
    
    // UI update function
    function updateCodeUpdateUI(state, count = 0) {
        const btn = document.getElementById('contentUpdateBtn');
        if (!btn) return;
        
        // Remove all state classes
        btn.classList.remove('checking', 'available', 'downloading');
        
        switch (state) {
            case 'checking':
                btn.classList.add('checking');
                btn.title = 'Checking for updates...';
                break;
            case 'available':
                btn.classList.add('available');
                btn.title = `${count} update(s) available - click to download`;
                // Update badge
                let badge = btn.querySelector('.content-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'content-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = count;
                break;
            case 'downloading':
                btn.classList.add('downloading');
                btn.title = 'Downloading updates...';
                break;
            default:
                btn.title = 'Check for updates';
                const existingBadge = btn.querySelector('.content-badge');
                if (existingBadge) existingBadge.remove();
        }
    }
    
    // Apply stored updates on page load
    function applyStoredUpdates() {
        const storedFiles = getStoredCodeFiles();
        const localManifest = getLocalCodeManifest();
        
        for (const [filename, content] of Object.entries(storedFiles)) {
            // Only apply if stored version is newer than bundled
            const storedVersion = localManifest.files?.[filename]?.version || '0.0.0';
            const bundledVersion = BUNDLED_VERSIONS[filename] || '0.0.0';
            
            if (compareVersions(storedVersion, bundledVersion) > 0) {
                if (filename.endsWith('.css')) {
                    loadStoredCSS(filename);
                }
                // JS is loaded via the index.html loader
            }
        }
    }
    
    // Initialize on DOM ready
    function initHotUpdater() {
        // Apply any stored CSS updates immediately
        applyStoredUpdates();
        
        // Check for updates after a delay
        setTimeout(() => {
            checkForCodeUpdates(true);
        }, 15000);
    }
    
    // Export to window
    window.hotCodeUpdater = {
        check: checkForCodeUpdates,
        download: downloadCodeUpdates,
        applyStored: applyStoredUpdates,
        init: initHotUpdater,
        getState: () => window.codeUpdateState,
        hasNewerVersion,
        getStoredCodeFiles,
        BUNDLED_VERSIONS
    };
    
    // Auto-init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }
})();
