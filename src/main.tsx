import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { migrateStorage } from '@shared/storage'
import './index.css'

migrateStorage()

const ua = navigator.userAgent
document.documentElement.dataset.chrome = /Mac|iPhone|iPad/.test(ua) ? 'mac' : /Windows/.test(ua) ? 'win' : 'other'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
