import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { detectLanguage } from '@shared/languages'
import { languageExtension } from '../lib/editorLanguage'

type Props = {
  path: string
  value: string
  revealLine?: number
  wrap?: boolean
  onChange: (value: string) => void
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C678DD' },
  { tag: tags.controlKeyword, color: '#C678DD' },
  { tag: tags.definitionKeyword, color: '#C678DD' },
  { tag: tags.moduleKeyword, color: '#C678DD' },
  { tag: tags.atom, color: '#D19A66' },
  { tag: tags.bool, color: '#D19A66' },
  { tag: tags.number, color: '#D19A66' },
  { tag: tags.string, color: '#98C379' },
  { tag: tags.special(tags.string), color: '#98C379' },
  { tag: tags.comment, color: '#7F848E', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#7F848E', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#7F848E', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#D7DAE0' },
  { tag: tags.definition(tags.variableName), color: '#61AFEF' },
  { tag: tags.propertyName, color: '#E06C75' },
  { tag: tags.attributeName, color: '#D19A66' },
  { tag: tags.className, color: '#E5C07B' },
  { tag: tags.typeName, color: '#E5C07B' },
  { tag: tags.tagName, color: '#E06C75' },
  { tag: tags.operator, color: '#56B6C2' },
  { tag: tags.punctuation, color: '#ABB2BF' },
  { tag: tags.heading, color: '#61AFEF', fontWeight: 'bold' },
  { tag: tags.link, color: '#61AFEF', textDecoration: 'underline' },
  { tag: tags.url, color: '#56B6C2' },
  { tag: tags.meta, color: '#E5C07B' },
  { tag: tags.invalid, color: '#FF6B6B' },
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: '#f6f6f6',
    },
    '.cm-scroller': {
      fontFamily: 'JetBrains Mono, SF Mono, Menlo, Cascadia Mono, Consolas, Ubuntu Mono, monospace',
      fontSize: '12.5px',
      lineHeight: '1.45',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: '8DA4EF',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '8DA4EF',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#3D63DD55',
    },
    '.cm-activeLine': {
      backgroundColor: '#ffffff08',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#ffffff08',
    },
    '.cm-gutters': {
      backgroundColor: '#0d1117',
      color: '#6f6f6f',
      borderRight: '1px solid #ffffff14',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: '#888',
    },
    '.cm-matchingBracket': {
      backgroundColor: '#3D63DD33',
      outline: '1px solid #3D63DD',
    },
    '.cm-searchMatch': {
      backgroundColor: '#E5C07B55',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#3D63DD99',
    },
    '.cm-panels': {
      backgroundColor: '#11151b',
      color: '#f6f6f6',
      borderBottom: '1px solid #ffffff14',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #ffffff14',
    },
    '.cm-panel.cm-search': {
      padding: '8px 28px 8px 10px',
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    },
    '.cm-search .cm-textfield': {
      width: '11rem',
      height: '1.7rem',
      margin: '3px 6px 3px 0',
      padding: '0 8px',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.12)',
      backgroundColor: 'rgba(0,0,0,0.35)',
      color: '#f6f6f6',
      fontSize: '12px',
      outline: 'none',
    },
    '.cm-search .cm-textfield:focus': {
      borderColor: '#3D63DD',
      boxShadow: '0 0 0 2px rgba(61,99,221,0.28)',
    },
    '.cm-search .cm-button': {
      height: '1.7rem',
      margin: '3px 6px 3px 0',
      padding: '0 9px',
      border: 'none',
      borderRadius: '6px',
      backgroundImage: 'none',
      backgroundColor: 'rgba(255,255,255,0.1)',
      color: '#f6f6f6',
      fontSize: '11px',
      fontWeight: '600',
    },
    '.cm-search .cm-button:hover': {
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    '.cm-search button[name=replace], .cm-search button[name=replaceAll]': {
      backgroundColor: '#3D63DD',
      color: '#fff',
    },
    '.cm-search button[name=replace]:hover, .cm-search button[name=replaceAll]:hover': {
      backgroundColor: '#5173E8',
    },
    '.cm-search label': {
      margin: '3px 10px 3px 0',
      fontSize: '11px',
      color: 'rgba(255,255,255,0.6)',
    },
    '.cm-search input[type=checkbox]': {
      accentColor: '#3D63DD',
      marginRight: '4px',
    },
    '.cm-search button[name=close]': {
      position: 'absolute',
      top: '6px',
      right: '8px',
      width: '1.5rem',
      height: '1.5rem',
      padding: 0,
      border: 'none',
      borderRadius: '6px',
      backgroundColor: 'transparent',
      color: 'rgba(255,255,255,0.45)',
      fontSize: '16px',
      lineHeight: 1,
    },
    '.cm-search button[name=close]:hover': {
      backgroundColor: 'rgba(255,255,255,0.1)',
      color: '#fff',
    },
  },
  { dark: true },
)

function reveal(view: EditorView, lineNo: number) {
  const safe = Math.min(Math.max(1, lineNo), view.state.doc.lines)
  const line = view.state.doc.line(safe)
  view.dispatch({
    selection: { anchor: line.from },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
  })
}

export default function CodeEditor({ path, value, revealLine, wrap = true, onChange }: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapRef = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          foldGutter(),
          drawSelection(),
          dropCursor(),
          history(),
          indentOnInput(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          wrapRef.current.of(wrap ? EditorView.lineWrapping : []),
          languageExtension(detectLanguage(path)),
          syntaxHighlighting(highlightStyle),
          editorTheme,
          keymap.of([
            indentWithTab,
            { key: 'Mod-Alt-g', run: gotoLine },
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          }),
        ],
      }),
    })
    viewRef.current = view
    if (revealLine) reveal(view, revealLine)
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Recreate when the file (and therefore language) changes. Value is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: wrapRef.current.reconfigure(wrap ? EditorView.lineWrapping : []),
    })
  }, [wrap])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !revealLine) return
    reveal(view, revealLine)
  }, [revealLine])

  return <div ref={parentRef} className="cm-host min-h-0 flex-1" />
}
