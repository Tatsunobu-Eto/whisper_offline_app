import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // IPC functions placeholder
});
