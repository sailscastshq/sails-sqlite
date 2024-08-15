module.exports = {
  friendlyName: 'Destroy manager',

  description: 'Destroy the specified SQLite connection manager.',

  extendedDescription:
    'For SQLite, this involves closing the database connection. Unlike other databases, SQLite does not use connection pools, so this operation is relatively straightforward.',

  sync: true,

  inputs: {
    manager: {
      description: 'The SQLite connection manager instance to destroy.',
      extendedDescription:
        'Only managers built using the `createManager()` method of this driver are supported. The database connection manager instance provided must not have been destroyed previously.',
      example: '===',
      required: true
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description: 'Additional options to pass to the SQLite driver.',
      extendedDescription:
        'This is reserved for custom driver-specific extensions. Please refer to the better-sqlite3 documentation for more specific information.',
      example: '==='
    }
  },

  exits: {
    success: {
      description: 'The specified SQLite manager was successfully destroyed.',
      outputFriendlyName: 'Report',
      outputDescription:
        'The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    }
  },

  fn: ({ manager, meta }, exits) => {
    // If the manager doesn't have a `close` function for some reason,
    // then catch that ahead of time so we can provide a slightly nicer
    // error message and help prevent confusion.
    if (
      typeof manager !== 'object' ||
      manager === null ||
      typeof manager.close !== 'function'
    ) {
      return exits.error({
        error: new Error(
          'The provided `manager` is not a valid SQLite manager. It should be a better-sqlite3 Database instance with a `close` method.'
        ),
        meta
      })
    }

    // Close the SQLite database connection
    manager.close()

    return exits.success({ meta })
  }
}
