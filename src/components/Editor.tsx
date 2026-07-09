import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getNote, saveNote } from '../services/storage';
import { AIChat } from './AIChat';
import { Bot } from 'lucide-react';

interface EditorProps { noteId: string; }

// ── Simple inline markdown → React nodes ─────────────────────────────
function Inline({ s }: { s: string }): React.ReactElement {
  const nodes: React.ReactNode[] = [];
  let i = 0, buf = '', key = 0;
  const flush = () => { if (buf) { nodes.push(buf); buf = ''; } };

  while (i < s.length) {
    const r = s.slice(i);
    if (r.startsWith('[[')) {
      const e = s.indexOf(']]', i + 2);
      if (e !== -1) { flush(); const t = s.slice(i+2,e); nodes.push(<a key={key++} href={`#${t}`} className="lp-wiki">{t}</a>); i=e+2; continue; }
    }
    if (r.startsWith('**') || r.startsWith('__')) {
      const m = r.slice(0,2); const e = s.indexOf(m, i+2);
      if (e !== -1) { flush(); nodes.push(<strong key={key++}><Inline s={s.slice(i+2,e)}/></strong>); i=e+2; continue; }
    }
    if (r.startsWith('~~')) {
      const e = s.indexOf('~~', i+2);
      if (e !== -1) { flush(); nodes.push(<del key={key++}>{s.slice(i+2,e)}</del>); i=e+2; continue; }
    }
    if ((s[i]==='*'&&s[i+1]!=='*')||(s[i]==='_'&&s[i+1]!=='_')) {
      const e = s.indexOf(s[i], i+1);
      if (e>i+1) { flush(); nodes.push(<em key={key++}><Inline s={s.slice(i+1,e)}/></em>); i=e+1; continue; }
    }
    if (s[i]==='`') {
      const e = s.indexOf('`', i+1);
      if (e !== -1) { flush(); nodes.push(<code key={key++} className="lp-icode">{s.slice(i+1,e)}</code>); i=e+1; continue; }
    }
    if (s[i]==='[') {
      const te = s.indexOf(']', i+1);
      if (te !== -1 && s[te+1]==='(') {
        const ue = s.indexOf(')', te+2);
        if (ue !== -1) { flush(); nodes.push(<a key={key++} href={s.slice(te+2,ue)} className="lp-link" onClick={e=>e.preventDefault()}>{s.slice(i+1,te)}</a>); i=ue+1; continue; }
      }
    }
    buf += s[i++];
  }
  flush();
  return <>{nodes}</>;
}

// ── Per-line renderer (no <ul>/<li> wrappers) ─────────────────────────
const Line: React.FC<{ raw: string; inFence: boolean; onClick: () => void }> = React.memo(({ raw, inFence, onClick }) => {
  if (raw.trim() === '') return <div className="lp-line lp-empty" onClick={onClick}>&nbsp;</div>;

  // Inside code fence body
  if (inFence && !/^```/.test(raw)) return <div className="lp-line lp-fence-body" onClick={onClick}>{raw}</div>;

  // Code fence delimiter
  if (/^```/.test(raw)) return <div className="lp-line lp-fence-delim" onClick={onClick}>{raw}</div>;

  // Heading
  const hm = raw.match(/^(#{1,6}) (.*)/);
  if (hm) return <div className={`lp-line lp-h${hm[1].length}`} onClick={onClick}><Inline s={hm[2]}/></div>;

  // HR
  if (/^([-*_])\1{2,}\s*$/.test(raw)) return <div className="lp-line" onClick={onClick}><hr className="lp-hr"/></div>;

  // Blockquote
  const bq = raw.match(/^(>+) ?(.*)/);
  if (bq) return <div className="lp-line lp-bq" style={{paddingLeft:`${bq[1].length*1.2}rem`}} onClick={onClick}><Inline s={bq[2]}/></div>;

  // Unordered list  (must start with optional indent + bullet + space)
  const ul = raw.match(/^([ \t]*)([-*+])[ \t](.*)/);
  if (ul) {
    const depth = Math.floor(ul[1].length / 2);
    return (
      <div className="lp-line lp-li" style={{paddingLeft:`${1.4+depth*1.2}rem`}} onClick={onClick}>
        <span className="lp-bullet">•</span>
        <span className="lp-li-text"><Inline s={ul[3]}/></span>
      </div>
    );
  }

  // Ordered list  (digit(s) + literal dot + space at line start)
  const ol = raw.match(/^([ \t]*)(\d+)\.[ \t](.*)/);
  if (ol) {
    const depth = Math.floor(ol[1].length / 2);
    return (
      <div className="lp-line lp-li" style={{paddingLeft:`${1.4+depth*1.2}rem`}} onClick={onClick}>
        <span className="lp-bullet">{ol[2]}.</span>
        <span className="lp-li-text"><Inline s={ol[3]}/></span>
      </div>
    );
  }

  // Plain paragraph with inline markdown
  return <div className="lp-line lp-p" onClick={onClick}><Inline s={raw}/></div>;
});

// ── Track which lines are inside a fenced code block ─────────────────
function fenceMap(lines: string[]): boolean[] {
  let inside = false;
  return lines.map(l => {
    if (/^```/.test(l.trim())) { const was = inside; inside = !inside; return was; }
    return inside;
  });
}

// ── Editor ────────────────────────────────────────────────────────────
export const Editor: React.FC<EditorProps> = ({ noteId }) => {
  const [title, setTitle]       = useState('');
  const [lines, setLines]       = useState<string[]>(['']);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const taRefs      = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const note = await getNote(noteId);
      setTitle(note?.title ?? '');
      setLines(note?.content ? note.content.split('\n') : ['']);
      setActiveIdx(null);
    })();
  }, [noteId]);

  const content = lines.join('\n');
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!title && !content) return;
      const saved = await getNote(noteId);
      await saveNote({ id: noteId, title: title||'Untitled Note', content, updatedAt: Date.now(), createdAt: saved?.createdAt??Date.now() });
    }, 500);
    return () => clearTimeout(t);
  }, [title, content, noteId]);

  const resize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    if (activeIdx === null) return;
    requestAnimationFrame(() => {
      const el = taRefs.current.get(activeIdx);
      if (!el) return;
      resize(el);
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [activeIdx, resize]);

  const setLine = (idx: number, val: string) =>
    setLines(p => p.map((l, i) => i === idx ? val : l));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const el = taRefs.current.get(idx)!;
    const pos = el.selectionStart, val = el.value;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const before = val.slice(0, pos), after = val.slice(pos);
      let prefix = '';
      const lm = before.match(/^(\s*)([-*+]|\d+\.)\s/);
      if (lm) {
        const bullet = lm[2], n = parseInt(bullet), indent = lm[1];
        const isEmpty = before.trim() === bullet || before.trim() === bullet + ' ';
        if (!isEmpty) prefix = isNaN(n) ? `${indent}${bullet} ` : `${indent}${n+1}. `;
      }
      setLines(p => { const n=[...p]; n[idx]=before; n.splice(idx+1,0,prefix+after); return n; });
      setActiveIdx(idx + 1);
      return;
    }

    if (e.key === 'Backspace' && pos === 0 && el.selectionEnd === 0 && idx > 0) {
      e.preventDefault();
      const prevLen = lines[idx-1].length;
      setLines(p => { const n=[...p]; n[idx-1]=n[idx-1]+n[idx]; n.splice(idx,1); return n; });
      setActiveIdx(idx - 1);
      requestAnimationFrame(() => { const pe=taRefs.current.get(idx-1); if(pe) pe.setSelectionRange(prevLen,prevLen); });
      return;
    }

    if (e.key === 'ArrowUp' && idx > 0 && !val.slice(0,pos).includes('\n')) {
      e.preventDefault(); setActiveIdx(idx - 1); return;
    }
    if (e.key === 'ArrowDown' && idx < lines.length-1 && !val.slice(pos).includes('\n')) {
      e.preventDefault(); setActiveIdx(idx + 1); return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const nv = val.slice(0,pos)+'  '+val.slice(el.selectionEnd);
      setLine(idx, nv);
      requestAnimationFrame(() => el.setSelectionRange(pos+2, pos+2));
    }
  };

  const fences = fenceMap(lines);

  return (
    <div className="editor-wrapper">
      <div className="editor-container lp-container" ref={containerRef}
        onBlur={e => { if (!containerRef.current?.contains(e.relatedTarget as Node)) setActiveIdx(null); }}>

        <input className="editor-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Note Title"/>

        <div className="lp-body">
          {lines.map((line, idx) =>
            activeIdx === idx ? (
              <textarea
                key={`e${idx}`}
                className="lp-input"
                ref={el => { if(el){taRefs.current.set(idx,el);resize(el);}else taRefs.current.delete(idx); }}
                value={line}
                onChange={e => { setLine(idx, e.target.value); resize(e.target); }}
                onKeyDown={e => handleKeyDown(e, idx)}
                onBlur={e => { if(!containerRef.current?.contains(e.relatedTarget as Node)) setActiveIdx(null); }}
                rows={1} spellCheck
              />
            ) : (
              <Line key={`r${idx}`} raw={line} inFence={fences[idx]} onClick={() => setActiveIdx(idx)} />
            )
          )}
          <div className="lp-spacer" onClick={() => {
            const last = lines.length - 1;
            if (lines[last] === '') setActiveIdx(last);
            else { setLines(p=>[...p,'']); setActiveIdx(lines.length); }
          }}/>
        </div>

        {!isChatOpen && (
          <button className="ask-ai-fab" onClick={e=>{e.stopPropagation();setIsChatOpen(true);}} title="Ask AI">
            <Bot size={24}/>
          </button>
        )}
      </div>

      {isChatOpen && <AIChat noteTitle={title} noteContent={content} noteId={noteId} onClose={()=>setIsChatOpen(false)}/>}
    </div>
  );
};
