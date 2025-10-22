module.exports = {
  friendlyName: 'Parse native query error',

  description:
    'Attempt to identify and parse a raw error from sending a native query and normalize it into a standard error footprint.',

  inputs: {
    nativeQueryError: {
      description:
        'The error sent back from the database as a result of a native query.',
      extendedDescription:
        'Specifically, this is the Error returned from sendNativeQuery().',
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
      description: 'The error was parsed successfully.',
      outputVariableName: 'report',
      outputDescription:
        'The `footprint` property is the normalized "footprint" dictionary representing the provided error.',
      outputExample: '==='
    },

    malformed: {
      description:
        'The provided error cannot be parsed (perhaps it was corrupted or otherwise incomplete).',
      outputVariableName: 'report',
      outputDescription:
        'The `error` property is a JavaScript Error instance with more details about what went wrong. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    notUnique: {
      description: 'A uniqueness constraint was violated.',
      outputVariableName: 'report',
      outputDescription:
        'The `footprint` property contains details about the uniqueness error.',
      outputExample: '==='
    },

    notFound: {
      description: 'No record(s) found matching the specified criteria.',
      outputVariableName: 'report',
      outputDescription:
        'The `footprint` property contains details about the not found error.',
      outputExample: '==='
    }
  },

  fn: function parseNativeQueryError(inputs, exits) {
    try {
      const err = inputs.nativeQueryError
      const footprint = {
        identity: 'unknown',
        error: err,
        raw: err
      }

      if (err.code === 'SQLITE_CONSTRAINT') {
        if (err.message && err.message.includes('UNIQUE')) {
          return exits.notUnique({
            footprint: footprint,
            meta: inputs.meta
          })
        }
      }

      return exits.success({
        footprint: footprint,
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
