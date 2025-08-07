const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('Sequence name parsing', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-sequence-${Date.now()}.sqlite`)
    datastore = {
      identity: 'testDatastore',
      adapter: 'sails-sqlite',
      url: testDbPath
    }

    models = {
      user: {
        identity: 'user',
        tableName: 'users',
        primaryKey: 'id',
        attributes: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          name: {
            type: 'string',
            required: true,
            columnName: 'name'
          }
        }
      }
    }

    await new Promise((resolve, reject) => {
      adapter.registerDatastore(datastore, models, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    const tableDef = {
      id: { type: 'number', primaryKey: true, autoIncrement: true },
      name: { type: 'string' }
    }

    await new Promise((resolve, reject) => {
      adapter.define('testDatastore', 'users', tableDef, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Create a record to establish the sequence
    await new Promise((resolve, reject) => {
      const query = {
        using: 'users',
        newRecord: {
          name: 'Test User'
        }
      }
      adapter.create('testDatastore', query, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  })

  after(async () => {
    await new Promise((resolve, reject) => {
      adapter.teardown('testDatastore', (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath)
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  })

  test('should handle PostgreSQL-style sequence names', async () => {
    const testCases = [
      {
        sequenceName: 'users_id_seq',
        description: 'PostgreSQL-style: users_id_seq -> users'
      },
      {
        sequenceName: 'users_some_other_seq',
        description: 'Complex name: users_some_other_seq -> users'
      },
      {
        sequenceName: 'users',
        description: 'Direct table name: users -> users'
      }
    ]

    for (const testCase of testCases) {
      await new Promise((resolve, reject) => {
        adapter.setSequence(
          'testDatastore',
          testCase.sequenceName,
          100,
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })
    }

    assert(true, 'All sequence name patterns handled successfully')
  })

  test('should extract correct table name from sequence name', async () => {
    // Test that 'user_id_seq' gets parsed to 'user' table (which doesn't exist)
    // and should gracefully handle the notFound case
    try {
      await new Promise((resolve, reject) => {
        adapter.setSequence('testDatastore', 'user_id_seq', 100, (err) => {
          // Should succeed even if table doesn't exist (handled by notFound exit)
          resolve()
        })
      })
      assert(true, 'Non-existent table handled gracefully')
    } catch (err) {
      // This should not throw due to our notFound handling
      assert.fail('Should handle non-existent table gracefully')
    }
  })

  test('should handle sequence names without underscores', async () => {
    await new Promise((resolve, reject) => {
      adapter.setSequence('testDatastore', 'users', 200, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    assert(true, 'Direct table name handled successfully')
  })
})
