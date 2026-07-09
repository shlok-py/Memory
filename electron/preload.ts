import { ipcRenderer, contextBridge } from 'electron'

// ─────────────────────────────────────────────────────────────────────────────
// IPC channel whitelist
// Only channels listed here can be used by the renderer process.
// This prevents a renderer XSS from calling arbitrary IPC handlers.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_RECEIVE = ['main-process-message'] as const;

type AllowedReceive = (typeof ALLOWED_RECEIVE)[number];

contextBridge.exposeInMainWorld('electronAPI', {
  /** Listen on a whitelisted channel. */
  on(channel: AllowedReceive, listener: (...args: unknown[]) => void) {
    if (!ALLOWED_RECEIVE.includes(channel)) return;
    ipcRenderer.on(channel, (_event, ...args) => listener(...args));
  },

  /** Remove a listener from a whitelisted channel. */
  off(channel: AllowedReceive, listener: (...args: unknown[]) => void) {
    if (!ALLOWED_RECEIVE.includes(channel)) return;
    ipcRenderer.off(channel, listener as Parameters<typeof ipcRenderer.off>[1]);
  },
})
