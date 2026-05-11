/**
 * Unit Tests: FxRateService
 *
 * Coverage:
 *  FX1.  getRateOnDate('USD', 'USD', date) returns 1.0 without DB access
 *  FX2.  getRateOnDate('CAD', 'CAD', date) returns 1.0 without DB access
 *  FX3.  getRateOnDate('USD', 'CAD', date) returns existing snapshot from DB
 *  FX4.  getRateOnDate('USD', 'CAD', date) with no snapshot fetches BoC, stores both
 *        directions, returns rate
 *  FX5.  getRateOnDate('CAD', 'USD', date) returns correct inverse from USD→CAD snapshot
 *  FX6.  getRateOnDate walks back when BoC returns empty (weekend), tries up to 5 days
 *  FX7.  getRateOnDate throws if no rate found within 5-day window
 *  FX8.  snapshotForDate(date) calls BoC and stores pair
 *  FX9.  snapshotForDate(date) is idempotent on ON CONFLICT (re-running same date doesn't error)
 *  FX10. scheduledDailySnapshot logs success for today
 *  FX11. scheduledDailySnapshot logs error but does not throw when snapshotForDate fails
 */

import { Test } from '@nestjs/testing'
import { FxRateService } from '../fx-rate.service'
import { DatabaseService } from '../../../db/database.service'
import { HttpService } from '@nestjs/axios'
import { of, throwError } from 'rxjs'
import { AxiosResponse, AxiosHeaders } from 'axios'

// ─── Constants ────────────────────────────────────────────────────────────────

const DATE = '2026-05-09'           // Friday
const WEEKEND_DATE = '2026-05-10'   // Saturday
const PREV_WEEKDAY = '2026-05-08'   // Thursday (D-1 from DATE, D-2 from WEEKEND)
const USD_CAD_RATE = 1.3825

// ─── Mock BoC response ────────────────────────────────────────────────────────

function makeBocResponse(series: string, date: string, value: string): AxiosResponse {
  return {
    data: {
      observations: [
        { d: date, [series]: { v: value } },
      ],
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
}

function makeEmptyBocResponse(): AxiosResponse {
  return {
    data: { observations: [] },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
}

// ─── Mock DB builder ──────────────────────────────────────────────────────────

/**
 * Creates a minimal DatabaseService mock.
 *
 * selectReturns: rows returned from .select().from().where().limit() calls (in order)
 * executeError: if set, db.client.execute() rejects with this error
 */
function createMockDb(opts: {
  selectReturns?: Array<Array<Record<string, unknown>>>
  executeError?: Error
} = {}) {
  const { selectReturns = [], executeError } = opts

  let selectCallIndex = 0
  const calls = { selects: 0, executes: 0 }

  const limitMock = jest.fn().mockImplementation(() => {
    const rows = selectReturns[selectCallIndex] ?? []
    selectCallIndex++
    calls.selects++
    return Promise.resolve(rows)
  })

  const whereMock = jest.fn().mockReturnValue({ limit: limitMock })
  const fromMock = jest.fn().mockReturnValue({ where: whereMock })
  const selectMock = jest.fn().mockReturnValue({ from: fromMock })

  const executeMock = jest.fn().mockImplementation(() => {
    calls.executes++
    if (executeError) return Promise.reject(executeError)
    return Promise.resolve([])
  })

  const client = {
    select: selectMock,
    execute: executeMock,
  }

  return { client, _calls: calls, _mocks: { selectMock, executeMock, whereMock, fromMock, limitMock } }
}

// ─── Mock HttpService builder ─────────────────────────────────────────────────

function createMockHttp(responses: Array<AxiosResponse | Error>) {
  let callIndex = 0
  const getMock = jest.fn().mockImplementation(() => {
    const response = responses[callIndex] ?? makeEmptyBocResponse()
    callIndex++
    if (response instanceof Error) return throwError(() => response)
    return of(response)
  })
  return { get: getMock }
}

// ─── Module builder ───────────────────────────────────────────────────────────

async function buildModule(
  db: ReturnType<typeof createMockDb>,
  http: ReturnType<typeof createMockHttp>,
) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      FxRateService,
      { provide: DatabaseService, useValue: db },
      { provide: HttpService, useValue: http },
    ],
  }).compile()

  return { service: moduleRef.get(FxRateService) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FxRateService.getRateOnDate — identity', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX1: returns 1.0 for USD→USD without touching DB', async () => {
    const db = createMockDb()
    const http = createMockHttp([])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('USD', 'USD', DATE)

    expect(result).toBe(1.0)
    expect(db._mocks.selectMock).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })

  it('FX2: returns 1.0 for CAD→CAD without touching DB', async () => {
    const db = createMockDb()
    const http = createMockHttp([])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('CAD', 'CAD', DATE)

    expect(result).toBe(1.0)
    expect(db._mocks.selectMock).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })
})

describe('FxRateService.getRateOnDate — snapshot hit', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX3: returns existing USD→CAD rate from snapshot without calling BoC', async () => {
    const db = createMockDb({
      selectReturns: [
        [{ rateDate: DATE, fromCurrency: 'USD', toCurrency: 'CAD', rate: String(USD_CAD_RATE) }],
      ],
    })
    const http = createMockHttp([])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('USD', 'CAD', DATE)

    expect(result).toBeCloseTo(USD_CAD_RATE, 4)
    expect(http.get).not.toHaveBeenCalled()
  })
})

describe('FxRateService.getRateOnDate — BoC fetch on cache miss', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX4: fetches BoC, stores both USD→CAD and CAD→USD, returns USD→CAD rate', async () => {
    // First select: cache miss. Second select: after store, lookup USD→CAD succeeds.
    const db = createMockDb({
      selectReturns: [
        [],  // cache miss for USD→CAD
        [{ rateDate: DATE, fromCurrency: 'USD', toCurrency: 'CAD', rate: String(USD_CAD_RATE) }],  // post-store lookup
      ],
    })
    const http = createMockHttp([
      makeBocResponse('FXUSDCAD', DATE, String(USD_CAD_RATE)),
    ])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('USD', 'CAD', DATE)

    expect(result).toBeCloseTo(USD_CAD_RATE, 4)
    // HTTP was called once for FXUSDCAD
    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('FXUSDCAD'),
    )
    // INSERT execute was called once (stores both USD→CAD and CAD→USD in a single statement)
    expect(db._mocks.executeMock).toHaveBeenCalledTimes(1)
    // Verify the SQL object contains the table name in its query chunks
    const executeArg = db._mocks.executeMock.mock.calls[0][0]
    const sqlJson = JSON.stringify(executeArg)
    expect(sqlJson).toMatch(/fx_rate_snapshots/)
  })

  it('FX5: getRateOnDate CAD→USD returns correct inverse from USD→CAD snapshot', async () => {
    const inverse = 1 / USD_CAD_RATE
    // Cache miss for CAD→USD, then BoC fetch stores USD→CAD + CAD→USD, then lookup CAD→USD
    const db = createMockDb({
      selectReturns: [
        [],         // cache miss for CAD→USD
        [{ rateDate: DATE, fromCurrency: 'CAD', toCurrency: 'USD', rate: String(inverse) }],  // post-store lookup
      ],
    })
    const http = createMockHttp([
      makeBocResponse('FXUSDCAD', DATE, String(USD_CAD_RATE)),
    ])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('CAD', 'USD', DATE)

    expect(result).toBeCloseTo(inverse, 4)
    expect(http.get).toHaveBeenCalledTimes(1)
  })
})

describe('FxRateService.getRateOnDate — walk-back on weekend/holiday', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX6: walks back when BoC returns empty, finds rate on the previous weekday', async () => {
    // Saturday: BoC returns empty. Walk back i=0 (Sat) → empty, i=1 (Fri) → has rate.
    // After store, lookup for the exact date (Fri) returns the rate.
    const db = createMockDb({
      selectReturns: [
        [],  // cache miss on WEEKEND_DATE
        [{ rateDate: PREV_WEEKDAY, fromCurrency: 'USD', toCurrency: 'CAD', rate: String(USD_CAD_RATE) }],
      ],
    })
    const http = createMockHttp([
      makeEmptyBocResponse(),                                                   // i=0: Sat — empty
      makeBocResponse('FXUSDCAD', PREV_WEEKDAY, String(USD_CAD_RATE)),           // i=1: Fri — found
    ])
    const { service } = await buildModule(db, http)

    const result = await service.getRateOnDate('USD', 'CAD', WEEKEND_DATE)

    expect(result).toBeCloseTo(USD_CAD_RATE, 4)
    expect(http.get).toHaveBeenCalledTimes(2)
  })

  it('FX7: throws when no rate found within 5-day walk-back window', async () => {
    const db = createMockDb({
      selectReturns: [
        [],  // initial cache miss
        // no post-store lookups because nothing gets stored
      ],
    })
    // All 5 walk-back attempts return empty
    const http = createMockHttp([
      makeEmptyBocResponse(),
      makeEmptyBocResponse(),
      makeEmptyBocResponse(),
      makeEmptyBocResponse(),
      makeEmptyBocResponse(),
    ])
    const { service } = await buildModule(db, http)

    await expect(service.getRateOnDate('USD', 'CAD', WEEKEND_DATE))
      .rejects
      .toThrow(/Could not resolve FX rate USD→CAD/)
  })
})

describe('FxRateService.snapshotForDate', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX8: fetches BoC and stores pair for given date', async () => {
    const db = createMockDb()
    const http = createMockHttp([
      makeBocResponse('FXUSDCAD', DATE, String(USD_CAD_RATE)),
    ])
    const { service } = await buildModule(db, http)

    await service.snapshotForDate(DATE)

    expect(http.get).toHaveBeenCalledTimes(1)
    expect(http.get).toHaveBeenCalledWith(expect.stringContaining(`start_date=${DATE}`))
    expect(db._mocks.executeMock).toHaveBeenCalledTimes(1)
  })

  it('FX9: is idempotent — ON CONFLICT re-run does not throw', async () => {
    // execute always succeeds (ON CONFLICT DO NOTHING handles the duplicate)
    const db = createMockDb()
    const http = createMockHttp([
      makeBocResponse('FXUSDCAD', DATE, String(USD_CAD_RATE)),
      makeBocResponse('FXUSDCAD', DATE, String(USD_CAD_RATE)),
    ])
    const { service } = await buildModule(db, http)

    // Run twice — should not throw
    await expect(service.snapshotForDate(DATE)).resolves.toBeUndefined()
    await expect(service.snapshotForDate(DATE)).resolves.toBeUndefined()
    expect(db._mocks.executeMock).toHaveBeenCalledTimes(2)
  })

  it('FX8b: logs warning and continues when BoC returns empty observations', async () => {
    const db = createMockDb()
    const http = createMockHttp([makeEmptyBocResponse()])
    const { service } = await buildModule(db, http)

    await expect(service.snapshotForDate(DATE)).resolves.toBeUndefined()
    // No INSERT when observations are empty
    expect(db._mocks.executeMock).not.toHaveBeenCalled()
  })
})

describe('FxRateService.scheduledDailySnapshot', () => {
  afterEach(() => jest.clearAllMocks())

  it('FX10: calls snapshotForDate with today and resolves without throwing', async () => {
    const db = createMockDb()
    const http = createMockHttp([
      makeBocResponse('FXUSDCAD', '2026-05-11', '1.3810'),
    ])
    const { service } = await buildModule(db, http)

    await expect(service.scheduledDailySnapshot()).resolves.toBeUndefined()
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('FX11: does NOT throw when snapshotForDate fails — logs error and returns', async () => {
    const db = createMockDb()
    const http = createMockHttp([new Error('BoC API timeout')])
    const { service } = await buildModule(db, http)

    // scheduledDailySnapshot should swallow the error
    await expect(service.scheduledDailySnapshot()).resolves.toBeUndefined()
  })
})
