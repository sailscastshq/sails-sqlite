module.exports = {
  friendlyName: 'Release connection',

  description: 'Release an active SQLite database connection.',

  extendedDescription:
    "For SQLite, this is typically a no-op as there is no connection pooling. However, it's included for consistency with other database adapters.",

  sync: true,

  inputs: {
    connection: {
      description: 'An active SQLite database connection.',
      extendedDescription:
        'The provided database connection instance must still be active. Only database connection instances created by the `getConnection()` function in this driver are supported.',
      example: '===',
      required: true
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description: 'Additional stuff to pass to the driver.',
      extendedDescription:
        'This is reserved for custom driver-specific extensions. Please refer to the documentation for better-sqlite3 for more specific information.',
      example: '==='
    }
  },

  exits: {
    success: {
      description: 'The connection was released (no-op for SQLite).',
      extendedDescription:
        "For SQLite, this is typically a no-op, but it's included for consistency.",
      outputFriendlyName: 'Report',
      outputDescription:
        'The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    },

    badConnection: {
      description: 'The provided connection is not a valid SQLite connection.',
      extendedDescription:
        'This might occur if the connection was already closed or if an invalid object was passed as the connection.',
      outputFriendlyName: 'Report',
      outputDescription:
        'The `meta` property is reserved for custom driver-specific extensions.',
      outputExample: '==='
    }
  },

  fn: ({ connection, meta }, exits) => {
    // Check if the connection is a valid SQLite database instance
    if (
      typeof connection !== 'object' ||
      connection === null ||
      typeof connection.close !== 'function'
    ) {
      return exits.badConnection({
        meta
      })
    }

    // For SQLite, releasing a connection is typically a no-op
    // We don't actually close the connection here because SQLite connections
    // are meant to be long-lived and are automatically closed when the database is closed
    return exits.success({
      meta
    })
  }
}
