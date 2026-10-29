const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Database = require('better-sqlite3')
const normalize = require('../lib/private/machines/private/process-native-error')
const forge = require('waterline/lib/waterline/utils/query/forge-adapter-error')

test('real writer contention preserves SQLite identity through Waterline and permits a later safe write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-busy-'))
  let a, b
  try {
    a = new Database(path.join(dir, 'fixture.db'))
    b = new Database(path.join(dir, 'fixture.db'), { timeout: 10 })
    a.exec(
      'PRAGMA journal_mode=WAL; CREATE TABLE fixture(id INTEGER PRIMARY KEY, value INTEGER); INSERT INTO fixture VALUES(1,0); BEGIN IMMEDIATE; UPDATE fixture SET value=1'
    )
    let native
    try {
      b.exec('UPDATE fixture SET value=2')
    } catch (error) {
      native = error
    }
    assert.equal(native.code, 'SQLITE_BUSY')
    const mapped = normalize(native)
    assert.equal(mapped.footprint.identity, 'catchall')
    assert.equal(mapped.sqliteCode, 'SQLITE_BUSY')
    const result = forge(mapped, new Error(), 'update', 'fixture', {
      collections: {
        fixture: {
          identity: 'fixture',
          attributes: { id: { type: 'number', required: true } },
          primaryKey: 'id'
        }
      }
    })
    assert.doesNotMatch(result.message, /Malformed error/)
    assert.equal(result.raw.sqliteCode, 'SQLITE_BUSY')
    assert.equal(result.raw.code, 'E_BUSY')
    a.exec('ROLLBACK')
    b.exec('UPDATE fixture SET value=2')
    assert.equal(b.prepare('SELECT value FROM fixture').get().value, 2)
  } finally {
    a?.close()
    b?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('extended busy codes retain their exact SQLite code', () => {
  for (const code of ['SQLITE_BUSY_SNAPSHOT', 'SQLITE_BUSY_RECOVERY']) {
    const error = Object.assign(new Error('database is locked'), { code })
    const mapped = normalize(error)
    assert.equal(mapped.footprint.identity, 'catchall')
    assert.equal(mapped.sqliteCode, code)
    assert.equal(mapped.code, 'E_BUSY')
  }
})
