module.exports = {
  friendlyName: 'Send native query',

  description: 'Send a native query to the SQLite database.',

  inputs: {
    connection: {
      friendlyName: 'Connection',
      description: 'An active database connection.',
      extendedDescription:
        'The provided database connection instance must still be active. Only database connection instances created by the `getConnection()` machine in this driver are supported.',
      example: '===',
      required: true
    },

    nativeQuery: {
      description: 'A native query for the database.',
      extendedDescription:
        'If `valuesToEscape` is provided, this supports template syntax like `?` for SQLite parameter binding.',
      example: 'SELECT * FROM pets WHERE species=? AND nickname=?',
      required: true
    },

    valuesToEscape: {
      description:
        'An optional list of strings, numbers, or special literals (true, false, or null) to escape and include in the native query, in order.',
      extendedDescription:
        'The first value in the list will be used to replace the first `?`, the second value to replace the second `?`, and so on.',
      example: '===',
      defaultsTo: []
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description: 'Additional stuff to pass to the driver.',
      extendedDescription:
        'This is reserved for custom driver-specific extensions.',
      example: '==='
    }
  },

  exits: {
    success: {
      description: 'The native query was executed successfully.',
      outputVariableName: 'report',
      outputDescription:
        'The `result` property is the result data the database sent back. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    queryFailed: {
      description:
        'The database returned an error when attempting to execute the native query.',
      outputVariableName: 'report',
      outputDescription:
        'The `error` property is a JavaScript Error instance with more details about what went wrong. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    badConnection: {
      friendlyName: 'Bad connection',
      description: 'The provided connection is not valid or no longer active.',
      outputVariableName: 'report',
      outputDescription:
        'The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    }
  },

  fn: function sendNativeQuery(inputs, exits) {
    if (!inputs.connection || typeof inputs.connection.prepare !== 'function') {
      return exits.badConnection()
    }

    const sql = inputs.nativeQuery
    const bindings = inputs.valuesToEscape || []

    try {
      const stmt = inputs.connection.prepare(sql)
      const isSelect =
        sql.trim().toUpperCase().startsWith('SELECT') ||
        sql.trim().toUpperCase().startsWith('PRAGMA')
      const result = isSelect ? stmt.all(...bindings) : stmt.run(...bindings)

      return exits.success({
        result: {
          rows: isSelect ? result : [],
          changes: result.changes || 0,
          lastInsertRowid: result.lastInsertRowid
        },
        meta: inputs.meta
      })
    } catch (err) {
      return exits.queryFailed({
        error: err,
        meta: inputs.meta
      })
    }
  }
}
