const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('sails-sqlite adapter', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-adapter-${Date.now()}.sqlite`)
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
          },
          email: {
            type: 'string',
            required: true,
            unique: true,
            isEmail: true,
            columnName: 'email'
          },
          age: {
            type: 'number',
            columnName: 'age'
          },
          isActive: {
            type: 'boolean',
            defaultsTo: true,
            columnName: 'is_active'
          },
          metadata: {
            type: 'json',
            columnName: 'metadata'
          },
          createdAt: {
            type: 'number',
            autoCreatedAt: true,
            columnName: 'created_at'
          },
          updatedAt: {
            type: 'number',
            autoUpdatedAt: true,
            columnName: 'updated_at'
          }
        }
      }
    }

    // Register datastore once for all tests
    await new Promise((resolve, reject) => {
      adapter.registerDatastore(datastore, models, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })

    // Create table schema once for all tests
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
      age: {
        type: 'number'
      },
      is_active: {
        type: 'boolean',
        defaultsTo: true
      },
      metadata: {
        type: 'json'
      },
      created_at: {
        type: 'number'
      },
      updated_at: {
        type: 'number'
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

  describe('DDL Methods', () => {
    test('define should create table schema', async () => {
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
        description: {
          type: 'string'
        }
      }

      await new Promise((resolve, reject) => {
        adapter.define(
          'testDatastore',
          'test_define_table',
          tableDef,
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      assert(true, 'Table created successfully')
    })

    test('drop should remove table', async () => {
      const tableDef = {
        id: { type: 'number', primaryKey: true },
        name: { type: 'string' }
      }

      // Create table first
      await new Promise((resolve, reject) => {
        adapter.define('testDatastore', 'test_drop_table', tableDef, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      // Then drop it
      await new Promise((resolve, reject) => {
        adapter.drop('testDatastore', 'test_drop_table', null, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      assert(true, 'Table dropped successfully')
    })

    test('setSequence should handle PostgreSQL-style sequence names', async () => {
      const tableDef = {
        id: { type: 'number', primaryKey: true, autoIncrement: true },
        name: { type: 'string' }
      }

      await new Promise((resolve, reject) => {
        adapter.define(
          'testDatastore',
          'test_sequence_table',
          tableDef,
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      // Test PostgreSQL-style sequence name
      await new Promise((resolve, reject) => {
        adapter.setSequence(
          'testDatastore',
          'test_sequence_table_id_seq',
          100,
          (err) => {
            if (err) return reject(err)
            resolve()
          }
        )
      })

      assert(true, 'Sequence reset with PostgreSQL-style name')
    })
  })

  describe('DML Methods', () => {
    test('create should insert single record', async () => {
      const query = {
        using: 'users',
        newRecord: {
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
          is_active: 1,
          metadata: JSON.stringify({ role: 'admin' }),
          created_at: Date.now(),
          updated_at: Date.now()
        },
        meta: {
          fetch: true
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.create('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(result, 'Should return created record')
      assert.strictEqual(result.name, 'John Doe')
      assert.strictEqual(result.email, 'john@example.com')
      assert.strictEqual(typeof result.age, 'number') // Test number conversion
      assert.strictEqual(typeof result.created_at, 'number') // Test timestamp conversion
    })

    test('createEach should insert multiple records', async () => {
      const query = {
        using: 'users',
        newRecords: [
          {
            name: 'Jane Smith',
            email: 'jane@example.com',
            age: 25,
            is_active: 1,
            metadata: JSON.stringify({ role: 'user' }),
            created_at: Date.now(),
            updated_at: Date.now()
          },
          {
            name: 'Bob Johnson',
            email: 'bob@example.com',
            age: 35,
            is_active: 0,
            metadata: JSON.stringify({ role: 'moderator' }),
            created_at: Date.now(),
            updated_at: Date.now()
          }
        ],
        meta: {
          fetch: true
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.createEach('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(Array.isArray(result), 'Should return array of records')
      assert.strictEqual(result.length, 2)
      assert.strictEqual(result[0].name, 'Jane Smith')
      assert.strictEqual(result[1].name, 'Bob Johnson')
    })

    test('find should retrieve records', async () => {
      // Create some test data first
      await new Promise((resolve, reject) => {
        const query = {
          using: 'users',
          newRecords: [
            {
              name: 'Alice Find',
              email: 'alice.find@example.com',
              age: 28,
              is_active: 1,
              created_at: Date.now(),
              updated_at: Date.now()
            },
            {
              name: 'Charlie Find',
              email: 'charlie.find@example.com',
              age: 32,
              is_active: 0,
              created_at: Date.now(),
              updated_at: Date.now()
            }
          ]
        }
        adapter.createEach('testDatastore', query, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      // Test basic find all
      const query = {
        using: 'users',
        criteria: {
          where: {},
          sort: [{ name: 'ASC' }],
          limit: 10,
          skip: 0
        },
        meta: {
          logSqliteS3Qs: true
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(Array.isArray(result), 'Should return array of records')
      assert(result.length >= 2, 'Should find the records we just created')

      // Test finding with boolean criteria
      const activeQuery = {
        using: 'users',
        criteria: {
          where: {
            is_active: true
          }
        }
      }

      const activeResult = await new Promise((resolve, reject) => {
        adapter.find('testDatastore', activeQuery, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(
        Array.isArray(activeResult),
        'Should return array of active records'
      )
      assert(activeResult.length >= 1, 'Should find at least one active user')

      // Verify all returned records have is_active = true
      activeResult.forEach((record) => {
        assert.strictEqual(
          record.is_active,
          true,
          'All returned records should have is_active = true'
        )
      })
    })

    test('count should return record count', async () => {
      // Create test data first
      await new Promise((resolve, reject) => {
        const query = {
          using: 'users',
          newRecords: [
            {
              name: 'User 1',
              email: 'user1@example.com',
              created_at: Date.now(),
              updated_at: Date.now()
            },
            {
              name: 'User 2',
              email: 'user2@example.com',
              created_at: Date.now(),
              updated_at: Date.now()
            },
            {
              name: 'User 3',
              email: 'user3@example.com',
              created_at: Date.now(),
              updated_at: Date.now()
            }
          ]
        }
        adapter.createEach('testDatastore', query, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      const query = {
        using: 'users',
        criteria: {
          where: {}
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.count('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert.strictEqual(typeof result, 'number')
      assert(result >= 3, 'Should count all created records')
    })

    test('update should modify records', async () => {
      // Create test data first
      await new Promise((resolve, reject) => {
        const query = {
          using: 'users',
          newRecord: {
            name: 'Test User',
            email: 'test@example.com',
            age: 25,
            created_at: Date.now(),
            updated_at: Date.now()
          },
          meta: { fetch: true }
        }
        adapter.create('testDatastore', query, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      const query = {
        using: 'users',
        criteria: {
          where: {
            email: 'test@example.com'
          }
        },
        valuesToSet: {
          age: 26,
          updated_at: Date.now()
        },
        meta: {
          fetch: true
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.update('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(Array.isArray(result), 'Should return array of updated records')
      assert(result.length > 0, 'Should update at least one record')
      assert.strictEqual(result[0].age, 26, 'Should update age field')
    })

    test('destroy should delete records', async () => {
      // Create test data first
      await new Promise((resolve, reject) => {
        const query = {
          using: 'users',
          newRecord: {
            name: 'Delete Me',
            email: 'delete@example.com',
            created_at: Date.now(),
            updated_at: Date.now()
          }
        }
        adapter.create('testDatastore', query, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })

      const query = {
        using: 'users',
        criteria: {
          where: {
            email: 'delete@example.com'
          }
        },
        meta: {
          fetch: true
        }
      }

      const result = await new Promise((resolve, reject) => {
        adapter.destroy('testDatastore', query, (err, result) => {
          if (err) return reject(err)
          resolve(result)
        })
      })

      assert(Array.isArray(result), 'Should return array of destroyed records')
      assert(result.length > 0, 'Should destroy at least one record')
    })
  })
})
