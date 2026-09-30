const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('Null criteria support', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-null-${Date.now()}.sqlite`)
    datastore = {
      identity: 'testDatastore',
      adapter: 'sails-sqlite',
      url: testDbPath
    }

    models = {
      task: {
        identity: 'task',
        tableName: 'tasks',
        primaryKey: 'id',
        definition: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          title: {
            type: 'string',
            required: true,
            columnName: 'title'
          },
          completedAt: {
            type: 'number',
            allowNull: true,
            columnName: 'completedAt'
          },
          assignee: {
            type: 'string',
            allowNull: true,
            columnName: 'assignee'
          }
        },
        attributes: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          title: {
            type: 'string',
            required: true,
            columnName: 'title'
          },
          completedAt: {
            type: 'number',
            allowNull: true,
            columnName: 'completedAt'
          },
          assignee: {
            type: 'string',
            allowNull: true,
            columnName: 'assignee'
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
      title: {
        type: 'string',
        required: true
      },
      completedAt: {
        type: 'number',
        allowNull: true
      },
      assignee: {
        type: 'string',
        allowNull: true
      }
    }

    await new Promise((resolve, reject) => {
      adapter.define('testDatastore', 'tasks', tableDef, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Create test data
    const testRecords = [
      { title: 'Open unassigned task', completedAt: null, assignee: null },
      { title: 'Open assigned task', completedAt: null, assignee: 'ada' },
      {
        title: 'Completed assigned task',
        completedAt: 1700000000000,
        assignee: 'grace'
      },
      {
        title: 'Completed unassigned task',
        completedAt: 1700000001000,
        assignee: null
      }
    ]

    for (const record of testRecords) {
      await new Promise((resolve, reject) => {
        adapter.create(
          'testDatastore',
          { using: 'tasks', newRecord: record, meta: {} },
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

  test('should find records with null in WHERE clause', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: null }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should find 2 open tasks')
    results.forEach((record) => {
      assert.equal(record.completedAt, null, 'completedAt should be null')
    })
  })

  test('should find records with not-null in WHERE clause', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: { '!=': null } }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should find 2 completed tasks')
    results.forEach((record) => {
      assert.notEqual(record.completedAt, null, 'completedAt should be set')
    })
  })

  test('should find records using the ne modifier with null', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: { ne: null } }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should find 2 completed tasks')
  })

  test('should find records with multiple null conditions', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: null, assignee: null }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 1, 'Should find 1 open unassigned task')
    assert.equal(results[0].title, 'Open unassigned task')
  })

  test('should find records with null and a value condition', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: null, assignee: 'ada' }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 1, 'Should find 1 open task for ada')
    assert.equal(results[0].title, 'Open assigned task')
  })

  test('should find records with null in OR conditions', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: {
          or: [{ completedAt: null }, { assignee: 'grace' }]
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
    // Should find: 2 open + 1 assigned to grace (3 total, no overlap)
    assert.equal(results.length, 3, 'Should find 3 tasks')
  })

  test('should not affect non-null equality in WHERE clause', async () => {
    const findQuery = {
      using: 'tasks',
      criteria: {
        where: { assignee: 'grace' }
      }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.find('testDatastore', findQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 1, 'Should find 1 task assigned to grace')
    assert.equal(results[0].title, 'Completed assigned task')
  })

  test('should update records using null in WHERE clause', async () => {
    const updateQuery = {
      using: 'tasks',
      criteria: {
        where: { assignee: null }
      },
      valuesToSet: { assignee: 'unassigned' },
      meta: { fetch: true }
    }

    const results = await new Promise((resolve, reject) => {
      adapter.update('testDatastore', updateQuery, (err, result) => {
        if (err) return reject(err)
        resolve(result)
      })
    })

    assert(Array.isArray(results), 'Results should be an array')
    assert.equal(results.length, 2, 'Should update 2 records')
    results.forEach((record) => {
      assert.equal(record.assignee, 'unassigned', 'assignee should be set')
    })
  })

  test('should count records using null in WHERE clause', async () => {
    const countQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: null }
      }
    }

    const result = await new Promise((resolve, reject) => {
      adapter.count('testDatastore', countQuery, (err, count) => {
        if (err) return reject(err)
        resolve(count)
      })
    })

    assert.equal(result, 2, 'Should count 2 open tasks')
  })

  test('should destroy records using null in WHERE clause', async () => {
    // First create a record to destroy
    await new Promise((resolve, reject) => {
      adapter.create(
        'testDatastore',
        {
          using: 'tasks',
          newRecord: {
            title: 'To be deleted',
            completedAt: null,
            assignee: 'ada'
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
        { using: 'tasks', criteria: { where: { completedAt: null } } },
        (err, count) => {
          if (err) return reject(err)
          resolve(count)
        }
      )
    })

    // Destroy all open tasks
    const destroyQuery = {
      using: 'tasks',
      criteria: {
        where: { completedAt: null }
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
        { using: 'tasks', criteria: { where: { completedAt: null } } },
        (err, count) => {
          if (err) return reject(err)
          resolve(count)
        }
      )
    })

    assert(countBefore > 0, 'Should have open tasks before destroy')
    assert.equal(countAfter, 0, 'Should have no open tasks after destroy')
  })
})
