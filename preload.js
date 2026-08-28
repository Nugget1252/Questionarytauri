const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultStoragePath: () => ipcRenderer.invoke('get-default-storage-path'),
  selectStorageFolder: () => ipcRenderer.invoke('select-storage-folder'),
  getStorageStats: (storageDir) => ipcRenderer.invoke('get-storage-stats', storageDir),
  checkDocumentsExist: (storageDir) => ipcRenderer.invoke('check-documents-exist', storageDir),
  downloadFullPack: (payload) => ipcRenderer.invoke('download-full-pack', payload),
  onDownloadProgress: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('download-progress', sub);
    return () => ipcRenderer.removeListener('download-progress', sub);
  }
});
