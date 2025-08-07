const { test, describe, before, after } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const fs = require('node:fs')

// Import the adapter
const adapter = require('../lib/index.js')

describe('Data type conversions', () => {
  let testDbPath
  let datastore
  let models

  before(async () => {
    testDbPath = path.join(__dirname, `test-datatypes-${Date.now()}.sqlite`)
    datastore = {
      identity: 'testDatastore',
      adapter: 'sails-sqlite',
      url: testDbPath
    }

    models = {
      testmodel: {
        identity: 'testmodel',
        tableName: 'test_records',
        primaryKey: 'id',
        attributes: {
          id: {
            type: 'number',
            autoIncrement: true,
            columnName: 'id'
          },
          stringField: {
            type: 'string',
            columnName: 'string_field'
          },
          numberField: {
            type: 'number',
            columnName: 'number_field'
          },
          booleanField: {
            type: 'boolean',
            columnName: 'boolean_field'
          },
          jsonField: {
            type: 'json',
            columnName: 'json_field'
          },
          timestampField: {
            type: 'number',
            columnName: 'timestamp_field'
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
      id: {
        type: 'number',
        primaryKey: true,
        autoIncrement: true,
        required: true
      },
      string_field: {
        type: 'string'
      },
      number_field: {
        type: 'number',
        columnType: 'float' // Specify float for decimal numbers
      },
      boolean_field: {
        type: 'boolean'
      },
      json_field: {
        type: 'json'
      },
      timestamp_field: {
        type: 'number'
      }
    }

    await new Promise((resolve, reject) => {
      adapter.define('testDatastore', 'test_records', tableDef, (err) => {
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

  test('should convert number types correctly', async () => {
    const testNumbers = [0, 42, 3.14159, -100, 1754501840042]

    for (const testNumber of testNumbers) {
      const query = {
        using: 'test_records',
        newRecord: {
          number_field: testNumber,
          timestamp_field: testNumber
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

      assert.strictEqual(
        typeof result.number_field,
        'number',
        `number_field should be a number, got ${typeof result.number_field}`
      )
      assert.strictEqual(
        typeof result.timestamp_field,
        'number',
        `timestamp_field should be a number, got ${typeof result.timestamp_field}`
      )
      assert.strictEqual(
        result.number_field,
        testNumber,
        `number_field should equal ${testNumber}`
      )
      assert.strictEqual(
        result.timestamp_field,
        testNumber,
        `timestamp_field should equal ${testNumber}`
      )
    }
  })

  test('should convert boolean types correctly', async () => {
    const testCases = [
      { input: true, expected: true },
      { input: false, expected: false },
      { input: 1, expected: true },
      { input: 0, expected: false }
    ]

    for (const testCase of testCases) {
      const query = {
        using: 'test_records',
        newRecord: {
          boolean_field: testCase.input
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

      assert.strictEqual(
        typeof result.boolean_field,
        'boolean',
        'boolean_field should be a boolean'
      )
      assert.strictEqual(
        result.boolean_field,
        testCase.expected,
        `boolean_field should equal ${testCase.expected}`
      )
    }
  })

  test('should convert JSON types correctly', async () => {
    const testObjects = [
      { name: 'test', value: 42 },
      { array: [1, 2, 3], nested: { key: 'value' } },
      null,
      'simple string',
      [1, 2, 3, 4, 5]
    ]

    for (const testObject of testObjects) {
      const query = {
        using: 'test_records',
        newRecord: {
          json_field: testObject // Pass raw object, let the adapter handle JSON.stringify
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

      // The result should be the parsed JSON object, not a string
      assert.deepStrictEqual(
        result.json_field,
        testObject,
        'JSON field should be parsed correctly'
      )
    }
  })

  test('should handle string types correctly', async () => {
    const testStrings = ['hello world', '', 'unicode: 🚀', 'numbers: 123']

    for (const testString of testStrings) {
      const query = {
        using: 'test_records',
        newRecord: {
          string_field: testString
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

      assert.strictEqual(
        typeof result.string_field,
        'string',
        'string_field should be a string'
      )
      assert.strictEqual(
        result.string_field,
        testString,
        `string_field should equal "${testString}"`
      )
    }
  })

  test('should handle auto-increment ID conversion', async () => {
    const query = {
      using: 'test_records',
      newRecord: {
        string_field: 'test'
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

    assert.strictEqual(
      typeof result.id,
      'number',
      'Auto-increment ID should be a number'
    )
    assert(result.id > 0, 'Auto-increment ID should be positive')
  })
})
