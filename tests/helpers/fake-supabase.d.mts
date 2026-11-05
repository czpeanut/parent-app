export type Row = Record<string, any>
export function startFakeSupabase(o: {
  port: number
  users: Record<string, { id: string; password: string }>
  tables: Record<string, Row[]>
  rpc?: Record<string, (args: any, db: Record<string, Row[]>) => unknown>
  unique?: Record<string, string[][]>
}): Promise<{ url: string; db: Record<string, Row[]>; log: Row[]; tokenFor: (email: string) => string; close: () => Promise<void> }>
