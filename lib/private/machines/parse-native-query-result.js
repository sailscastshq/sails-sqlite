module.exports = {
  friendlyName: 'Parse native query result',

  description: 'Parse a raw result from a native query and normalize it.',

  inputs: {
    nativeQueryResult: {
      description:
        'The result data sent back from the the database as a result of a native query.',
      extendedDescription:
        'Specifically, this is the `result` returned by sendNativeQuery().',
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
      description: 'The result was parsed successfully.',
      outputVariableName: 'report',
      outputDescription:
        'The `result` property is the parsed result. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    couldNotParse: {
      description:
        'The provided result could not be parsed (it might be corrupted or in an unexpected format).',
      outputVariableName: 'report',
      outputDescription:
        'The `error` property is a JavaScript Error instance with more details about what went wrong. The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    }
  },

  fn: function parseNativeQueryResult(inputs, exits) {
    try {
      const result = inputs.nativeQueryResult

      return exits.success({
        result: result.rows || [],
        meta: inputs.meta
      })
    } catch (err) {
      return exits.couldNotParse({
        error: err,
        meta: inputs.meta
      })
    }
  }
}
