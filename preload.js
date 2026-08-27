const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getDefaultStoragePath: () => ipcRenderer.invoke('get-default-storage-path'),
                                selectStorageFolder: () => ipcRenderer.invoke('select-storage-folder'),
                                getStorageStats: (storageDir) => ipcRenderer.invoke('get-storage-stats', storageDir),
                                checkLocalFiles: (storageDir) => ipcRenderer.invoke('check-local-files', storageDir),
                                deleteSubjectPack: (payload) => ipcRenderer.invoke('delete-subject-pack', payload),
                                moveStorageFolder: (payload) => ipcRenderer.invoke('move-storage-folder', payload),
                                startDownloads: (payload) => ipcRenderer.invoke('start-downloads', payload),
                                pauseDownloads: () => ipcRenderer.invoke('pause-downloads'),
                                onDownloadProgress: (callback) => {
                                  const sub = (event, data) => callback(data);
                                  ipcRenderer.on('download-progress', sub);
                                  return () => ipcRenderer.removeListener('download-progress', sub);
                                }
});
