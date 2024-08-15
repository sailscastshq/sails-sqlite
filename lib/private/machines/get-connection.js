module.exports = {
  friendlyName: 'Get connection',

  description:
    'Get an active connection to the SQLite database (this is a no-op for SQLite).',

  moreInfoUrl:
    'https://github.com/node-machine/driver-interface/blob/master/machines/get-connection.js',

  sync: true,

  inputs: {
    manager: {
      description: 'A SQLite database instance (from better-sqlite3).',
      example: '===',
      required: true
    },

    meta: {
      friendlyName: 'Meta (unused)',
      description: 'Additional stuff to pass to the driver.',
      example: '==='
    }
  },

  exits: {
    success: {
      outputFriendlyName: 'Report',
      outputDescription:
        'The `connection` property is a SQLite database instance. The `meta` property is unused.',
      outputExample: '==='
    },

    failed: {
      friendlyName: 'Failed (unused)',
      description:
        'Could not acquire a connection to the database via the provided connection manager. (This is unlikely to occur with SQLite)',
      outputFriendlyName: 'Report',
      outputExample: {
        error: '===',
        meta: '==='
      }
    }
  },

  fn: ({ manager, meta }, exits) => {
    // This is a no-op that just sends back the manager and `meta` that were passed in.
    // In SQLite, the "manager" and "connection" are the same thing: a Database instance from better-sqlite3.
    return exits.success({
      connection: manager,
      meta
    })
  }
}
