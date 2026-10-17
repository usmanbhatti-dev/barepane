import type { Extension } from '@codemirror/state'
import { StreamLanguage } from '@codemirror/language'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import type { LanguageId } from '@shared/languages'

export function languageExtension(id: LanguageId): Extension {
  switch (id) {
    case 'nginx':
      return StreamLanguage.define(nginx)
    case 'yaml':
      return yaml()
    case 'json':
      return json()
    case 'shell':
      return StreamLanguage.define(shell)
    case 'properties':
      return StreamLanguage.define(properties)
    case 'javascript':
      return javascript({ typescript: true })
    case 'html':
      return html()
    case 'css':
      return css()
    case 'xml':
      return xml()
    case 'markdown':
      return markdown()
    case 'python':
      return python()
    case 'php':
      return html()
    case 'sql':
      return StreamLanguage.define(standardSQL)
    case 'toml':
      return StreamLanguage.define(toml)
    case 'docker':
      return StreamLanguage.define(dockerFile)
    default:
      return []
  }
}
