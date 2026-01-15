const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('Boolean bindings support', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-boolean-${Date.now()}.sqlite`)
    datastore = {
      identity: 'testDatastore',
      adapter: 'sails-sqlite',
      url: testDbPath
    }

    models = {
      comment: {
        identity: 'comment',
        tableName: 'comments',
        primaryKey: 'id',
        definition: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          text: {
            type: 'string',
            required: true,
            columnName: 'text'
          },
          isResolved: {
            type: 'boolean',
            defaultsTo: false,
            columnName: 'isResolved'
          },
          isPublic: {
            type: 'boolean',
            defaultsTo: true,
            columnName: 'isPublic'
          }
        },
        attributes: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          text: {
            type: 'string',
            required: true,
            columnName: 'text'
          },
          isResolved: {
            type: 'boolean',
            defaultsTo: false,
            columnName: 'isResolved'
          },
          isPublic: {
            type: 'boolean',
            defaultsTo: true,
            columnName: 'isPublic'
          }
        }
      }
    }

    // Register datastore
    await new Promise((resolve, reject) => {
      adapter.registerDatastore(datastore, models, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Create table schema
    const tableDef = {
      id: {
        type: 'number',
        primaryKey: true,
        autoIncrement: true,
        required: true
      },
      text: {
        type: 'string',
        required: true
      },
      isResolved: {
        type: 'boolean',
        defaultsTo: false
      },
      isPublic: {
        type: 'boolean',
        defaultsTo: true
      }
    }

    await new Promise((resolve, reject) => {
      adapter.define('testDatastore', 'comments', tableDef, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Create test data
    const testRecords = [
      { text: 'Resolved public comment', isResolved: true, isPublic: true },
      { text: 'Resolved private comment', isResolved: true, isPublic: false },
      { text: 'Unresolved public comment', isResolved: false, isPublic: true },
      { text: 'Unresolved private comment', isResolved: false, isPublic: false }
    ]

    for (const record of testRecords) {
      await new Promise((resolve, reject) => {
        adapter.create(
          'testDatastore',
          { using: 'comments', newRecord: record, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })
    }
  })

  after(async () => {
    // Teardown datastore
    await new Promise((resolve, reject) => {
      adapter.teardown('testDatastore', (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath)
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  })

  test('should find records with boolean false in WHERE clause', async () => {
    const findQuery = {
      using: 'comments',
      criteria: {
        where: { isResolved: false }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should find 2 unresolved comments')
    results.forEach((record) => {
      assert.equal(record.isResolved, 0, 'isResolved should be 0 (false)')
    })
  })

  test('should find records with boolean true in WHERE clause', async () => {
    const findQuery = {
      using: 'comments',
      criteria: {
        where: { isResolved: true }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should find 2 resolved comments')
    results.forEach((record) => {
      assert.equal(record.isResolved, 1, 'isResolved should be 1 (true)')
    })
  })

  test('should find records with multiple boolean conditions', async () => {
    const findQuery = {
      using: 'comments',
      criteria: {
        where: { isResolved: false, isPublic: true }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 1, 'Should find 1 unresolved public comment')
    assert.equal(results[0].text, 'Unresolved public comment')
  })

  test('should find records with boolean in OR conditions', async () => {
    const findQuery = {
      using: 'comments',
      criteria: {
        where: {
          or: [{ isResolved: true }, { isPublic: false }]
        }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    // Should find: 2 resolved + 1 unresolved private (3 total, but 1 overlap)
    assert.equal(results.length, 3, 'Should find 3 comments')
  })

  test('should update records using boolean in WHERE clause', async () => {
    const updateQuery = {
      using: 'comments',
      criteria: {
        where: { isResolved: false, isPublic: false }
      },
      valuesToSet: { text: 'Updated unresolved private comment' },
      meta: { fetch: true }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.update('testDatastore', updateQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 1, 'Should update 1 record')
    assert.equal(results[0].text, 'Updated unresolved private comment')
  })

  test('should count records using boolean in WHERE clause', async () => {
    const countQuery = {
      using: 'comments',
      criteria: {
        where: { isPublic: true }
      }
    }

    const result = await new Promise((resolve, reject) => {
      adapter.count('testDatastore', countQuery, (err, count) => {
        if (err) return reject(err)
        resolve(count)
      })
    })

    assert.equal(result, 2, 'Should count 2 public comments')
  })

  test('should destroy records using boolean in WHERE clause', async () => {
    // First create a record to destroy
    await new Promise((resolve, reject) => {
      adapter.create(
        'testDatastore',
        {
          using: 'comments',
          newRecord: {
            text: 'To be deleted',
            isResolved: true,
            isPublic: true
          },
          meta: {}
        },
        (err) => {
          if (err) return reject(err)
          resolve()
        }
      )
    })

    // Count before destroy
    const countBefore = await new Promise((resolve, reject) => {
      adapter.count(
        'testDatastore',
        { using: 'comments', criteria: { where: { isResolved: true } } },
        (err, count) => {
          if (err) return reject(err)
          resolve(count)
        }
      )
    })

    // Destroy all resolved comments
    const destroyQuery = {
      using: 'comments',
      criteria: {
        where: { isResolved: true }
      }
    }

    await new Promise((resolve, reject) => {
      adapter.destroy('testDatastore', destroyQuery, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Count after destroy
    const countAfter = await new Promise((resolve, reject) => {
      adapter.count(
        'testDatastore',
        { using: 'comments', criteria: { where: { isResolved: true } } },
        (err, count) => {
          if (err) return reject(err)
          resolve(count)
        }
      )
    })

    assert(countBefore > 0, 'Should have resolved comments before destroy')
    assert.equal(
      countAfter,
      0,
      'Should have no resolved comments after destroy'
    )
  })
})
