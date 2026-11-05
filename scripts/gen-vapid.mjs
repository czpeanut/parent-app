// 產生 Web Push 的 VAPID 金鑰：npm run vapid
// 把輸出貼到 Vercel 環境變數（NEXT_PUBLIC_VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY），不要 commit。
import webpush from 'web-push'
const k = webpush.generateVAPIDKeys()
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${k.publicKey}\nVAPID_PRIVATE_KEY=${k.privateKey}`)
