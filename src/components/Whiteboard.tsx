import React, { useCallback, useState, useEffect } from 'react';
import { Tldraw, Editor as TldrawEditor } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import { getWhiteboard, saveWhiteboard } from '../services/storage';

interface WhiteboardProps {
  whiteboardId: string;
}

export const Whiteboard: React.FC<WhiteboardProps> = ({ whiteboardId }) => {
  const [title, setTitle] = useState('');
  const [editorInstance, setEditorInstance] = useState<TldrawEditor | null>(null);

  useEffect(() => {
    const loadTitle = async () => {
      const saved = await getWhiteboard(whiteboardId);
      if (saved && saved.title) {
        setTitle(saved.title);
      }
    };
    loadTitle();
  }, [whiteboardId]);

  // Save title changes
  useEffect(() => {
    const saveTitle = async () => {
      if (title && editorInstance) {
        const snapshot = editorInstance.getSnapshot();
        const saved = await getWhiteboard(whiteboardId);
        await saveWhiteboard({
          id: whiteboardId,
          title: title || 'Untitled Board',
          document: snapshot,
          updatedAt: Date.now(),
          createdAt: saved?.createdAt || Date.now(),
        });
      }
    };
    const timeout = setTimeout(saveTitle, 500);
    return () => clearTimeout(timeout);
  }, [title, whiteboardId, editorInstance]);

  const handleMount = useCallback((editor: TldrawEditor) => {
    setEditorInstance(editor);
    // Load from storage
    (async () => {
      const saved = await getWhiteboard(whiteboardId);
      if (saved && saved.document) {
        try {
          editor.loadSnapshot(saved.document);
        } catch (e) {
          console.error('Failed to load whiteboard state', e);
        }
      }
    })();

    // Save on changes
    editor.store.listen(async () => {
      const snapshot = editor.getSnapshot();
      const saved = await getWhiteboard(whiteboardId);
      saveWhiteboard({
        id: whiteboardId,
        title: saved?.title || 'Untitled Board', // Keep existing title
        document: snapshot,
        updatedAt: Date.now(),
        createdAt: saved?.createdAt || Date.now(),
      });
    }, { source: 'user', scope: 'document' });
  }, [whiteboardId]);

  return (
    <div className="whiteboard-container" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem 2rem 0', backgroundColor: 'var(--bg-color)' }}>
        <input
          className="editor-title"
          style={{ marginBottom: '0.5rem' }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Board Title"
        />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw onMount={handleMount} persistenceKey={whiteboardId} />
      </div>
    </div>
  );
};
