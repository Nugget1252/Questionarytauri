const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ================================================================
// BROWSER ZOOM STATE RESTORATION
// ================================================================
try {
  const savedZoom = parseFloat(localStorage.getItem('questionary-browser-zoom') || '1.0');
  if (!isNaN(savedZoom) && savedZoom >= 0.5 && savedZoom <= 2.0) {
    webFrame.setZoomFactor(savedZoom);
  }
} catch (e) {}

// ================================================================
// EXPOSE NATIVE ZOOM CONTROLS
// ================================================================
contextBridge.exposeInMainWorld('zoomAPI', {
  getZoom: () => webFrame.getZoomFactor(),
  setZoom: (factor) => {
    const clamped = Math.min(2.0, Math.max(0.5, factor));
    webFrame.setZoomFactor(clamped);
    try { localStorage.setItem('questionary-browser-zoom', clamped.toString()); } catch(e) {}
  },
  zoomIn: () => {
    const next = Math.min(2.0, webFrame.getZoomFactor() + 0.08);
    webFrame.setZoomFactor(next);
    try { localStorage.setItem('questionary-browser-zoom', next.toString()); } catch(e) {}
  },
  zoomOut: () => {
    const next = Math.max(0.5, webFrame.getZoomFactor() - 0.08);
    webFrame.setZoomFactor(next);
    try { localStorage.setItem('questionary-browser-zoom', next.toString()); } catch(e) {}
  },
  resetZoom: () => {
    webFrame.setZoomFactor(1.0);
    try { localStorage.setItem('questionary-browser-zoom', '1.0'); } catch(e) {}
  }
});

// ================================================================
// EXPOSE ELECTRON STORAGE, DOWNLOAD & SCREEN-SHARE APIS
// ================================================================
contextBridge.exposeInMainWorld('electronAPI', {
  // Screen Sharing Desktop Capturer Bridge
  getDesktopSources: (options) => ipcRenderer.invoke('get-desktop-sources', options),

  // Storage & Files
  getDefaultStoragePath: () => ipcRenderer.invoke('get-default-storage-path'),
  selectStorageFolder: () => ipcRenderer.invoke('select-storage-folder'),
  getStorageStats: (storageDir) => ipcRenderer.invoke('get-storage-stats', storageDir),
  checkDocumentsExist: (storageDir) => ipcRenderer.invoke('check-documents-exist', storageDir),
  checkLocalFiles: (storageDir) => ipcRenderer.invoke('check-local-files', storageDir),
  deleteSubjectPack: (payload) => ipcRenderer.invoke('delete-subject-pack', payload),
  moveStorageFolder: (payload) => ipcRenderer.invoke('move-storage-folder', payload),
  downloadFullPack: (payload) => ipcRenderer.invoke('download-full-pack', payload),
  selectFilesToImport: () => ipcRenderer.invoke('select-files-to-import'),
  saveUserLibraryFile: (payload) => ipcRenderer.invoke('save-user-library-file', payload),
  getUserLibraryFile: (payload) => ipcRenderer.invoke('get-user-library-file', payload),
  deleteUserLibraryFile: (payload) => ipcRenderer.invoke('delete-user-library-file', payload),
  onDownloadProgress: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('download-progress', sub);
    return () => ipcRenderer.removeListener('download-progress', sub);
  }
});