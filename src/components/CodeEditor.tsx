import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { gotoLine, highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
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
  onChange: (value: string) => void
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#E95420' },
  { tag: tags.controlKeyword, color: '#E95420' },
  { tag: tags.definitionKeyword, color: '#E95420' },
  { tag: tags.moduleKeyword, color: '#E95420' },
  { tag: tags.atom, color: '#FCE94F' },
  { tag: tags.bool, color: '#FCE94F' },
  { tag: tags.number, color: '#FCE94F' },
  { tag: tags.string, color: '#8AE234' },
  { tag: tags.special(tags.string), color: '#8AE234' },
  { tag: tags.comment, color: '#9A9A90', fontStyle: 'italic' },
  { tag: tags.lineComment, color: '#9A9A90', fontStyle: 'italic' },
  { tag: tags.blockComment, color: '#9A9A90', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#EEEEEC' },
  { tag: tags.definition(tags.variableName), color: '#729FCF' },
  { tag: tags.propertyName, color: '#AD7FA8' },
  { tag: tags.attributeName, color: '#AD7FA8' },
  { tag: tags.className, color: '#34E2E2' },
  { tag: tags.typeName, color: '#34E2E2' },
  { tag: tags.tagName, color: '#E95420' },
  { tag: tags.operator, color: '#D3D7CF' },
  { tag: tags.punctuation, color: '#D3D7CF' },
  { tag: tags.heading, color: '#E95420', fontWeight: 'bold' },
  { tag: tags.link, color: '#729FCF', textDecoration: 'underline' },
  { tag: tags.url, color: '#34E2E2' },
  { tag: tags.meta, color: '#C4A000' },
  { tag: tags.invalid, color: '#EF2929' },
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: '#f6f6f6',
    },
    '.cm-scroller': {
      fontFamily: 'Ubuntu Mono, Menlo, Monaco, monospace',
      fontSize: '12.5px',
      lineHeight: '1.45',
      overflow: 'auto',
    },
    '.cm-content': {
      caretColor: '#E95420',
      padding: '8px 0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#E95420',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#E9542044',
    },
    '.cm-activeLine': {
      backgroundColor: '#ffffff08',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#ffffff08',
    },
    '.cm-gutters': {
      backgroundColor: '#141414',
      color: '#6f6f6f',
      borderRight: '1px solid #ffffff14',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: '#888',
    },
    '.cm-matchingBracket': {
      backgroundColor: '#E9542033',
      outline: '1px solid #E95420',
    },
    '.cm-searchMatch': {
      backgroundColor: '#C4A00066',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#E9542088',
    },
    '.cm-panels': {
      backgroundColor: '#1a1a1a',
      color: '#f6f6f6',
      borderBottom: '1px solid #ffffff14',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid #ffffff14',
    },
    '.cm-panel.cm-search': {
      padding: '8px 28px 8px 10px',
      fontFamily: 'Ubuntu, Cantarell, Segoe UI, sans-serif',
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
      borderColor: '#E95420',
      boxShadow: '0 0 0 2px rgba(233,84,32,0.22)',
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
      backgroundColor: '#E95420',
      color: '#fff',
    },
    '.cm-search button[name=replace]:hover, .cm-search button[name=replaceAll]:hover': {
      backgroundColor: '#ff6a33',
    },
    '.cm-search label': {
      margin: '3px 10px 3px 0',
      fontSize: '11px',
      color: 'rgba(255,255,255,0.6)',
    },
    '.cm-search input[type=checkbox]': {
      accentColor: '#E95420',
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

export default function CodeEditor({ path, value, revealLine, onChange }: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
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
          EditorView.lineWrapping,
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
