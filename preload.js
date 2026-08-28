const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
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