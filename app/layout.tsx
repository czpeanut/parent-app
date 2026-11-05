import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/AuthProvider'
import { SWRegister } from '@/components/SWRegister'

export const metadata: Metadata = {
  title: 'CODEX STUDY 家長端',
  description: '查看小孩的到班狀態、段考準備進度，與老師聯絡',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CODEX 家長', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
}

export const viewport: Viewport = {
  themeColor: '#f7f1e8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <SWRegister />
      </body>
    </html>
  )
}
