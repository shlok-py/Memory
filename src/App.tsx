import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Editor } from './components/Editor';
import { Whiteboard } from './components/Whiteboard';
import { Plus, PenTool, LayoutTemplate, Sidebar, FolderUp, FileUp, FileText, Trash2, Copy, Pencil } from 'lucide-react';
import { getAllNotes, getAllWhiteboards, saveNote, getNote, deleteNote, saveWhiteboard, getWhiteboard, deleteWhiteboard } from './services/storage';
import { Login } from './components/Login';
import { Settings } from './components/Settings';

type ViewMode = 'tabs' | 'split';
type ActivePane = 'note' | 'whiteboard';

interface FileItem {
  id: string;
  title: string;
  type: 'note' | 'whiteboard';
}

/**
 * Allow only http(s) URLs to prevent javascript: / data: injection
 * via crafted JSON imports.
 */
const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem('currentUser'));
  const [profilePic, setProfilePic] = useState<string | null>(() => localStorage.getItem('profilePic'));
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeWhiteboardId, setActiveWhiteboardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('tabs');
  const [activeTab, setActiveTab] = useState<ActivePane>('note');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem; selectedIds: string[] } | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  // Split files into notes and boards here so we can use them in selection logic
  const noteFiles = files.filter(f => f.type === 'note');
  const boardFiles = files.filter(f => f.type === 'whiteboard');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (fileList: FileList) => {
    const filesArray = Array.from(fileList);

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        const text = await file.text();
        const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        await saveNote({
          id,
          title: file.name.replace(/\.(md|txt)$/i, ''),
          content: text,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
      } else if (file.name.endsWith('.json')) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          const id = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          let content = '';
          if (data.summary || data.source_link) {
            content = data.summary || '';
            if (data.source_link && isSafeUrl(data.source_link)) {
              content = `**Source:** [${data.source_link}](${data.source_link})\n\n${content}`;
            } else if (data.source_link) {
              // Unsafe URL — include as plain text only, not as a link
              content = `**Source:** ${data.source_link}\n\n${content}`;
            }
          } else {
            content = "```json\n" + JSON.stringify(data, null, 2) + "\n```";
          }

          await saveNote({
            id,
            title: data.title || file.name.replace(/\.json$/i, ''),
            content,
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        } catch (e) {
          console.error('Failed to parse JSON', file.name, e);
        }
      }
    }
    loadFiles();
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = ''; // Reset input
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const loadFiles = async () => {
    if (!currentUser) return;
    const notes = await getAllNotes();
    const whiteboards = await getAllWhiteboards();
    const combined: FileItem[] = [
      ...notes.map(n => ({ id: n.id, title: n.title, type: 'note' as const })),
      ...whiteboards.map(w => ({ id: w.id, title: w.title, type: 'whiteboard' as const })),
    ];
    setFiles(combined);
  };

  useEffect(() => {
    loadFiles();
    const interval = setInterval(loadFiles, 2000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', currentUser);
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  const handleProfilePicChange = (pic: string | null) => {
    setProfilePic(pic);
    if (pic) {
      localStorage.setItem('profilePic', pic);
    } else {
      localStorage.removeItem('profilePic');
    }
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const autoCloseSidebarMobile = () => {
    if (window.innerWidth <= 768) {
      setIsSidebarOpen(false);
    }
  };

  const createNote = () => {
    const id = `note-${Date.now()}`;
    setActiveNoteId(id);
    setActiveTab('note');
    autoCloseSidebarMobile();
  };

  const createWhiteboard = () => {
    const id = `wb-${Date.now()}`;
    setActiveWhiteboardId(id);
    setActiveTab('whiteboard');
    autoCloseSidebarMobile();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setShowSettings(false);
  };


  const handleFileClick = (e: React.MouseEvent, file: FileItem) => {
    if (e.ctrlKey || e.metaKey) {
      const newSel = new Set(selectedFileIds);
      if (newSel.has(file.id)) newSel.delete(file.id);
      else newSel.add(file.id);
      setSelectedFileIds(newSel);
      setLastClickedId(file.id);
    } else if (e.shiftKey && lastClickedId) {
      const displayFiles = [...noteFiles, ...boardFiles];
      const startIdx = displayFiles.findIndex(f => f.id === lastClickedId);
      const endIdx = displayFiles.findIndex(f => f.id === file.id);
      if (startIdx !== -1 && endIdx !== -1) {
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        const newSel = new Set(selectedFileIds);
        for(let i = minIdx; i <= maxIdx; i++) {
          newSel.add(displayFiles[i].id);
        }
        setSelectedFileIds(newSel);
      }
    } else {
      setSelectedFileIds(new Set([file.id]));
      setLastClickedId(file.id);
      if (file.type === 'note') {
        setActiveNoteId(file.id);
        setActiveTab('note');
      } else {
        setActiveWhiteboardId(file.id);
        setActiveTab('whiteboard');
      }
      autoCloseSidebarMobile();
    }
  };

  const handleContextMenu = (e: MouseEvent, file: FileItem) => {
    e.preventDefault();
    let currentSelection = selectedFileIds;
    if (!currentSelection.has(file.id)) {
      currentSelection = new Set([file.id]);
      setSelectedFileIds(currentSelection);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, file, selectedIds: Array.from(currentSelection) });
  };

  const handleRenameFile = async (file: FileItem) => {
    const newName = window.prompt('Enter new name for the file:', file.title);
    if (!newName || newName === file.title) return;
    
    if (file.type === 'note') {
      const note = await getNote(file.id);
      if (note) {
        await saveNote({ ...note, title: newName });
        loadFiles();
      }
    } else {
      const wb = await getWhiteboard(file.id);
      if (wb) {
        await saveWhiteboard({ ...wb, title: newName });
        loadFiles();
      }
    }
  };

  const handleDuplicateFile = async () => {
    if (!contextMenu) return;
    for (const id of contextMenu.selectedIds) {
      const fileToDup = files.find(f => f.id === id);
      if (!fileToDup) continue;
      const newId = `${fileToDup.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      if (fileToDup.type === 'note') {
        const note = await getNote(id);
        if (note) await saveNote({ ...note, id: newId, title: `${note.title} (Copy)`, createdAt: Date.now(), updatedAt: Date.now() });
      } else {
        const wb = await getWhiteboard(id);
        if (wb) await saveWhiteboard({ ...wb, id: newId, title: `${wb.title} (Copy)`, createdAt: Date.now(), updatedAt: Date.now() });
      }
    }
    loadFiles();
    setContextMenu(null);
  };

  const handleDeleteFile = async () => {
    if (!contextMenu) return;
    const ids = contextMenu.selectedIds;
    if (window.confirm(`Are you sure you want to delete ${ids.length} item(s)?`)) {
      for (const id of ids) {
        const fileToDel = files.find(f => f.id === id);
        if (!fileToDel) continue;
        if (fileToDel.type === 'note') {
          await deleteNote(id);
          if (activeNoteId === id) setActiveNoteId(null);
        } else {
          await deleteWhiteboard(id);
          if (activeWhiteboardId === id) setActiveWhiteboardId(null);
        }
      }
      loadFiles();
      setContextMenu(null);
    }
  };

  return (
    <div className="app-container" style={{ flexDirection: 'column' }}>
      
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="btn icon-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle Sidebar">
            <Sidebar size={18} />
          </button>
        </div>
        
        <div className="topbar-right">
          <button 
            className="btn icon-btn" 
            style={{ marginRight: '12px' }}
            onClick={() => setViewMode(v => v === 'tabs' ? 'split' : 'tabs')} 
            title={viewMode === 'tabs' ? 'Switch to Split View' : 'Switch to Tab View'}
          >
            <LayoutTemplate size={18} />
          </button>
          <div 
            className="profile-icon" 
            onClick={() => setShowSettings(true)}
            title="Settings & Profile"
          >
            {profilePic
              ? <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : currentUser.charAt(0).toUpperCase()
            }
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Sidebar */}
        <div className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header-row">
            <div className="sidebar-title">File Explorer</div>
            <div className="sidebar-actions">
              <button className="action-icon" onClick={createNote} title="New Note"><Plus size={16} /></button>
              <button className="action-icon" onClick={createWhiteboard} title="New Board"><PenTool size={16} /></button>
              <button className="action-icon" onClick={() => fileInputRef.current?.click()} title="Upload Files"><FileUp size={16} /></button>
              <button className="action-icon" onClick={() => folderInputRef.current?.click()} title="Upload Folder"><FolderUp size={16} /></button>
            </div>
          </div>

          <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept=".md,.json" onChange={handleFileUpload} />
          <input type="file" ref={folderInputRef} style={{ display: 'none' }} multiple {...{webkitdirectory: "true", directory: "true"} as any} onChange={handleFileUpload} />

          <div className="file-tree">
            <div className="tree-section-header">Notes</div>
            {noteFiles.map(f => (
              <div
                key={f.id}
                className={`tree-item ${f.id === activeNoteId && activeTab === 'note' ? 'active' : ''} ${selectedFileIds.has(f.id) ? 'selected' : ''}`}
                onClick={(e) => handleFileClick(e, f)}
                onContextMenu={(e) => handleContextMenu(e, f)}
              >
                <FileText size={14} className="tree-icon" /> <span className="tree-label">{f.title || 'Untitled'}</span>
              </div>
            ))}
            {noteFiles.length === 0 && <div className="tree-empty">No notes yet.</div>}

            <div className="tree-section-header" style={{ marginTop: '1rem' }}>Whiteboards</div>
            {boardFiles.map(f => (
              <div
                key={f.id}
                className={`tree-item ${f.id === activeWhiteboardId && activeTab === 'whiteboard' ? 'active' : ''} ${selectedFileIds.has(f.id) ? 'selected' : ''}`}
                onClick={(e) => handleFileClick(e, f)}
                onContextMenu={(e) => handleContextMenu(e, f)}
              >
                <PenTool size={14} className="tree-icon" /> <span className="tree-label">{f.title || 'Untitled'}</span>
              </div>
            ))}
            {boardFiles.length === 0 && <div className="tree-empty">No boards yet.</div>}
          </div>
        </div>

        {/* Main View */}
        <div className="main-view">
          {viewMode === 'tabs' && (
            <div className="tabs-header">
              {activeNoteId && (
                <div
                  className={`tab ${activeTab === 'note' ? 'active' : ''}`}
                  onClick={() => setActiveTab('note')}
                >
                  Note Editor
                </div>
              )}
              {activeWhiteboardId && (
                <div
                  className={`tab ${activeTab === 'whiteboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('whiteboard')}
                >
                  Whiteboard
                </div>
              )}
            </div>
          )}

          <div className="content-area">
            {viewMode === 'tabs' ? (
              <>
                {activeTab === 'note' && activeNoteId && <Editor key={activeNoteId} noteId={activeNoteId} />}
                {activeTab === 'whiteboard' && activeWhiteboardId && <Whiteboard key={activeWhiteboardId} whiteboardId={activeWhiteboardId} />}
                {!activeNoteId && !activeWhiteboardId && (
                  <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>Select or create a file from the sidebar.</div>
                )}
              </>
            ) : (
              <div className="split-view">
                <div className="split-pane">
                  {activeNoteId ? <Editor key={`split-note-${activeNoteId}`} noteId={activeNoteId} /> : <div style={{ margin: '2rem', color: 'var(--text-muted)' }}>No note selected</div>}
                </div>
                <div className="split-pane">
                  {activeWhiteboardId ? <Whiteboard key={`split-wb-${activeWhiteboardId}`} whiteboardId={activeWhiteboardId} /> : <div style={{ margin: '2rem', color: 'var(--text-muted)' }}>No whiteboard selected</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <Settings 
          onClose={() => setShowSettings(false)}
          username={currentUser}
          theme={theme}
          onThemeChange={setTheme}
          onUsernameChange={setCurrentUser}
          onLogout={handleLogout}
          profilePic={profilePic}
          onProfilePicChange={handleProfilePicChange}
        />
      )}

      {contextMenu && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.selectedIds.length === 1 && (
            <div className="context-menu-item" onClick={() => { handleRenameFile(contextMenu.file); setContextMenu(null); }}>
              <Pencil size={14} /> Rename
            </div>
          )}
          <div className="context-menu-item" onClick={handleDuplicateFile}>
            <Copy size={14} /> Duplicate {contextMenu.selectedIds.length > 1 ? `(${contextMenu.selectedIds.length})` : ''}
          </div>
          <div className="context-menu-item danger" onClick={handleDeleteFile}>
            <Trash2 size={14} /> Delete {contextMenu.selectedIds.length > 1 ? `(${contextMenu.selectedIds.length})` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
