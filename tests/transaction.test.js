const { test, describe, before, after, beforeEach } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('Transaction support', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-transaction-${Date.now()}.sqlite`)
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
        definition: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          name: {
            type: 'string',
            required: true,
            columnName: 'name'
          },
          email: {
            type: 'string',
            required: true,
            unique: true,
            columnName: 'email'
          },
          balance: {
            type: 'number',
            defaultsTo: 0,
            columnName: 'balance'
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
      name: {
        type: 'string',
        required: true
      },
      email: {
        type: 'string',
        required: true,
        unique: true
      },
      balance: {
        type: 'number',
        defaultsTo: 0
      }
    }

    await new Promise((resolve, reject) => {
      adapter.define('testDatastore', 'users', tableDef, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
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

  beforeEach(async () => {
    // Clean up any existing data and reset transaction state before each test
    try {
      // First, make sure any active transactions are rolled back
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      if (connection && connection.inTransaction) {
        await new Promise((resolve, reject) => {
          adapter.rollbackTransaction(
            'testDatastore',
            { connection, meta: {} },
            (err) => {
              if (err) return reject(err)
              resolve()
            }
          )
        })
      }

      // Clean up existing data
      const findQuery = {
        using: 'users',
        criteria: {}
      }

      const existingRecords = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', findQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result || [])
        })
      })

      if (existingRecords.length > 0) {
        // Delete each record by its primary key
        for (const record of existingRecords) {
          const deleteQuery = {
            using: 'users',
            criteria: { id: record.id }
          }

          await new Promise((resolve, reject) => {
            adapter.destroy('testDatastore', deleteQuery, (err) => {
              if (err) return reject(err)
              resolve()
            })
          })
        }
      }
    } catch (err) {
      // Ignore cleanup errors in beforeEach
    }
  })

  describe('leaseConnection', () => {
    test('should lease a connection successfully', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      assert(connection, 'Connection should be returned')
      assert(
        typeof connection.inTransaction !== 'undefined',
        'Connection should be a database instance'
      )
    })

    test('should fail with invalid datastore name', async () => {
      try {
        await new Promise((resolve, reject) => {
          adapter.leaseConnection('invalidDatastore', {}, (err, connection) => {
            if (err) return reject(err)
            resolve(connection)
          })
        })
        assert.fail('Should have thrown an error')
      } catch (err) {
        assert(
          err.message.includes('no matching datastore entry'),
          'Should have proper error message'
        )
      }
    })
  })

  describe('beginTransaction', () => {
    test('should begin transaction successfully', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      await new Promise((resolve, reject) => {
        adapter.beginTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Verify transaction is active
      assert(connection.inTransaction, 'Transaction should be active')
    })

    test('should fail to begin nested transaction', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      // Begin first transaction
      await new Promise((resolve, reject) => {
        adapter.beginTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Try to begin second transaction (should fail)
      try {
        await new Promise((resolve, reject) => {
          adapter.beginTransaction(
            'testDatastore',
            { connection, meta: {} },
            (err) => {
              if (err) return reject(err)
              resolve()
            }
          )
        })
        assert.fail('Should have thrown an error for nested transaction')
      } catch (err) {
        assert(
          err.message.includes('Transaction is already active'),
          'Should have proper error message'
        )
      }
    })
  })

  describe('commitTransaction', () => {
    test('should commit transaction and persist changes', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      // Begin transaction
      await new Promise((resolve, reject) => {
        adapter.beginTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Create a record within transaction
      const createQuery = {
        using: 'users',
        newRecord: {
          name: 'Transaction User',
          email: 'tx@example.com',
          balance: 100
        },
        meta: { fetch: true }
      }

      const createdRecord = await new Promise((resolve, reject) => {
        adapter.create('testDatastore', createQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(createdRecord, 'Record should be created')
      assert(connection.inTransaction, 'Transaction should still be active')

      // Commit transaction
      await new Promise((resolve, reject) => {
        adapter.commitTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      assert(!connection.inTransaction, 'Transaction should be committed')

      // Verify the record persists after commit
      const findQuery = {
        using: 'users',
        criteria: { email: 'tx@example.com' }
      }

      const foundRecords = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', findQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(foundRecords.length === 1, 'Record should persist after commit')
      assert.equal(foundRecords[0].name, 'Transaction User')
    })

    test('should fail to commit when no active transaction', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      try {
        await new Promise((resolve, reject) => {
          adapter.commitTransaction(
            'testDatastore',
            { connection, meta: {} },
            (err) => {
              if (err) return reject(err)
              resolve()
            }
          )
        })
        assert.fail('Should have thrown an error')
      } catch (err) {
        assert(
          err.message.includes('No active transaction'),
          'Should have proper error message'
        )
      }
    })
  })

  describe('rollbackTransaction', () => {
    test('should rollback transaction and discard changes', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      // Begin transaction
      await new Promise((resolve, reject) => {
        adapter.beginTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Create a record within transaction
      const createQuery = {
        using: 'users',
        newRecord: {
          name: 'Rollback User',
          email: 'rollback@example.com',
          balance: 500
        },
        meta: { fetch: true }
      }

      const createdRecord = await new Promise((resolve, reject) => {
        adapter.create('testDatastore', createQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(createdRecord, 'Record should be created')
      assert(connection.inTransaction, 'Transaction should be active')

      // Rollback transaction
      await new Promise((resolve, reject) => {
        adapter.rollbackTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      assert(!connection.inTransaction, 'Transaction should be rolled back')

      // Verify the record does NOT persist after rollback
      const findQuery = {
        using: 'users',
        criteria: { email: 'rollback@example.com' }
      }

      const foundRecords = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', findQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(
        foundRecords.length === 0,
        'Record should NOT persist after rollback'
      )
    })

    test('should fail to rollback when no active transaction', async () => {
      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      try {
        await new Promise((resolve, reject) => {
          adapter.rollbackTransaction(
            'testDatastore',
            { connection, meta: {} },
            (err) => {
              if (err) return reject(err)
              resolve()
            }
          )
        })
        assert.fail('Should have thrown an error')
      } catch (err) {
        assert(
          err.message.includes('No active transaction'),
          'Should have proper error message'
        )
      }
    })
  })

  describe('Transaction isolation', () => {
    test('should maintain transaction isolation', async () => {
      // Create initial record
      const initialQuery = {
        using: 'users',
        newRecord: {
          name: 'Initial User',
          email: 'initial@example.com',
          balance: 1000
        },
        meta: { fetch: true }
      }

      await new Promise((resolve, reject) => {
        adapter.create('testDatastore', initialQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      const connection = await new Promise((resolve, reject) => {
        adapter.leaseConnection('testDatastore', {}, (err, connection) => {
          if (err) return reject(err)
          resolve(connection)
        })
      })

      // Begin transaction
      await new Promise((resolve, reject) => {
        adapter.beginTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Update record within transaction
      const updateQuery = {
        using: 'users',
        criteria: { email: 'initial@example.com' },
        valuesToSet: { balance: 500 },
        meta: { fetch: true }
      }

      await new Promise((resolve, reject) => {
        adapter.update('testDatastore', updateQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      // Rollback the transaction
      await new Promise((resolve, reject) => {
        adapter.rollbackTransaction(
          'testDatastore',
          { connection, meta: {} },
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Verify original value is restored
      const findQuery = {
        using: 'users',
        criteria: { email: 'initial@example.com' }
      }

      const foundRecords = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', findQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(foundRecords.length === 1, 'Record should exist')
      assert.equal(
        foundRecords[0].balance,
        1000,
        'Original balance should be restored'
      )
    })
  })
})
