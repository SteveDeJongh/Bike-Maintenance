import { describe, expect, it } from 'vitest'
import { resolveFailure } from './syncFailure'

const clean = { last_synced_at: null, last_sync_failed_at: null, last_sync_error: null, last_sync_retry_at: null }

describe('resolveFailure', () => {
  it('prefers the live failure over the credential', () => {
    const sync = { ...clean, last_sync_failed_at: '2026-11-20T10:00:00Z', last_sync_error: 'unknown' as const }
    expect(resolveFailure(sync, { code: 'rate_limited', retryAt: '2026-11-20T10:15:00Z' })).toEqual({
      code: 'rate_limited',
      retryAt: '2026-11-20T10:15:00Z',
    })
  })

  it("falls back to the credential's recorded failure", () => {
    const sync = {
      ...clean,
      last_synced_at: '2026-11-20T09:00:00Z',
      last_sync_failed_at: '2026-11-20T10:00:00Z',
      last_sync_error: 'auth_failed' as const,
    }
    expect(resolveFailure(sync, null)).toEqual({ code: 'auth_failed', retryAt: null })
  })

  it("treats a recorded failure with no error code as 'unknown'", () => {
    expect(resolveFailure({ ...clean, last_sync_failed_at: '2026-11-20T10:00:00Z' }, null)?.code).toBe('unknown')
  })

  it('clears once a later sync succeeded', () => {
    const sync = { ...clean, last_synced_at: '2026-11-20T11:00:00Z', last_sync_failed_at: '2026-11-20T10:00:00Z' }
    expect(resolveFailure(sync, null)).toBeNull()
  })

  it('is null with no failure at all', () => {
    expect(resolveFailure(clean, null)).toBeNull()
  })
})
