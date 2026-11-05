'use client'
import { useEffect } from 'react'

/** 註冊 service worker（推播與「加入主畫面」需要） */
export function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  return null
}
