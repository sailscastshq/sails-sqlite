const Machine = require('machine')

/**
 * buildStdAdapterMethod()
 *
 * Build a generic DQL/DML adapter method for SQLite from a machine definition and available state.
 *
 * @param {Object} machineDef - The machine definition (dry)
 * @param {Object} registeredDsEntries - Registered datastore entries
 * @param {Object} registeredDryModels - Registered dry models
 * @returns {Function} - The adapter method
 */
module.exports = function buildStdAdapterMethod(
  machineDef,
  wetMachines,
  registeredDsEntries,
  registeredDryModels
) {
  // Build wet machine.
  const performQuery = Machine.build(machineDef)

  // Return function that will be the adapter method.
  return function (datastoreName, s3q, done) {
    // Look up the datastore entry (to get the manager).
    const dsEntry = registeredDsEntries[datastoreName]

    // Sanity check:
    if (!dsEntry) {
      return done(
        new Error(
          `Consistency violation: Cannot do that with datastore (${datastoreName}) because no matching datastore entry is registered in this adapter! This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter. (If you get stumped, reach out at http://sailsjs.com/support.)`
        )
      )
    }

    // For SQLite, we don't need to obtain a separate connection. The manager is the connection.
    const connection = dsEntry.manager

    // Build switch handlers based on the machine's defined exits
    const switchHandlers = {
      error: function (err) {
        return done(err)
      },
      success: function (result) {
        return done(null, result)
      }
    }

    // Only add notUnique handler if the machine defines this exit
    if (machineDef.exits.notUnique) {
      switchHandlers.notUnique = function (errInfo) {
        // Create error in same format as sails-postgresql
        const e = new Error(errInfo.message || 'Not unique')
        e.code = 'E_UNIQUE'
        if (errInfo.footprint) {
          e.footprint = errInfo.footprint
        }
        return done(e)
      }
    }

    // Perform the query
    performQuery({
      query: s3q,
      connection: connection,
      dryOrm: { models: registeredDryModels }
    }).switch(switchHandlers)
  }
}
