const compileStatementUtil = require('./private/compile-statement')

module.exports = {
  friendlyName: 'Compile statement',

  description: 'Compile a Waterline statement to a native query for SQLite.',

  inputs: {
    statement: {
      description:
        'A Waterline statement (stage 4 query) to compile into a native query.',
      extendedDescription:
        'See documentation for info on Waterline statements.',
      example: '===',
      required: true
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
      description:
        'The provided Waterline statement was compiled successfully.',
      outputVariableName: 'report',
      outputDescription:
        'The `nativeQuery` property is the compiled native query for the database. The `valuesToEscape` property is an array of strings, numbers, or special literals (true, false, or null) to escape and include in the query, in order. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    malformed: {
      description: 'The provided Waterline statement could not be compiled.',
      outputVariableName: 'report',
      outputDescription:
        'The `error` property is a JavaScript Error instance with more details about what went wrong. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    }
  },

  fn: function compileStatement(inputs, exits) {
    try {
      const compiled = compileStatementUtil(inputs.statement)

      return exits.success({
        nativeQuery: compiled.sql,
        valuesToEscape: compiled.bindings || [],
        meta: inputs.meta
      })
    } catch (err) {
      return exits.malformed({
        error: err,
        meta: inputs.meta
      })
    }
  }
}
