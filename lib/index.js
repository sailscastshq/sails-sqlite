const Database = require('better-sqlite3')
/**
 * Module constants
 */

// Private var to cache dry machine definitions.
// > This is set up in a dictionary instead of as separate variables
// > just to allow the code below to be a bit easier to read
const DRY_MACHINES = {
  verifyModelDef: require('./private/machines/verify-model-def'),
  createManager: require('./private/machines/create-manager'),
  destroyManager: require('./private/machines/destroy-manager'),
  getConnection: require('./private/machines/get-connection')
}

const WET_MACHINES = Object.fromEntries(
  Object.entries(DRY_MACHINES).map(([methodName, def]) => [
    methodName,
    Machine.build(def)
  ])
)

/**
 * Module state
 */

// Private var to track of all the datastores that use this adapter.  In order for your adapter
// to be able to connect to the database, you'll want to expose this var publicly as well.
// (See the `registerDatastore()` method for info on the format of each datastore entry herein.)
//
// > Note that this approach of process global state will be changing in an upcoming version of
// > the Waterline adapter spec (a breaking change).  But if you follow the conventions laid out
// > below in this adapter template, future upgrades should be a breeze.
const registeredDsEntries = {}

// Keep track of all the model definitions registered by the adapter (for the entire Node process).
// (indexed by the model's `identity` -- NOT by its `tableName`!!)
const registeredDryModels = {}

/**
 *  ███████╗ █████╗ ██╗██╗     ███████╗      ███████╗ ██████╗ ██╗     ██╗████████╗███████╗
 *  ██╔════╝██╔══██╗██║██║     ██╔════╝      ██╔════╝██╔═══██╗██║     ██║╚══██╔══╝██╔════╝
 *  ███████╗███████║██║██║     ███████╗█████╗███████╗██║   ██║██║     ██║   ██║   █████╗
 *  ╚════██║██╔══██║██║██║     ╚════██║╚════╝╚════██║██║▄▄ ██║██║     ██║   ██║   ██╔══╝
 *  ███████║██║  ██║██║███████╗███████║      ███████║╚██████╔╝███████╗██║   ██║   ███████╗
 *  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝      ╚══════╝ ╚══▀▀═╝ ╚══════╝╚═╝   ╚═╝   ╚══════╝
 * (sails-sqlite)
 *
 * Sails.js/Waterline adapter for SQLite database.
 *
 * > Most of the methods below are optional.
 * >
 * > If you don't need / can't get to every method, just implement
 * > what you have time for.  The other methods will only fail if
 * > you try to call them!
 * >
 * > For many adapters, this file is all you need.  For very complex adapters, you may need more flexibility.
 * > In any case, it's probably a good idea to start with one file and refactor only if necessary.
 * > If you do go that route, it's conventional in Node to create a `./lib` directory for your private submodules
 * > and `require` them at the top of this file with other dependencies. e.g.:
 * > ```
 * > var updateMethod = require('./lib/update');
 * > ```
 *
 * @type {Dictionary}
 */

// Build & expose the adapter definition.
module.exports = {
  // The identity of this adapter, to be referenced by datastore configurations in a Sails app.
  identity: 'sails-sqlite',

  // Waterline Adapter API Version
  adapterApiVersion: 1,

  // Default configuration for connections
  default: {
    schema: false,
    url: 'db/data.db',
    pragmas: {
      journal_mode: 'WAL'
    }
  },

  //  ╔═╗═╗ ╦╔═╗╔═╗╔═╗╔═╗  ┌─┐┬─┐┬┬  ┬┌─┐┌┬┐┌─┐
  //  ║╣ ╔╩╦╝╠═╝║ ║╚═╗║╣   ├─┘├┬┘│└┐┌┘├─┤ │ ├┤
  //  ╚═╝╩ ╚═╩  ╚═╝╚═╝╚═╝  ┴  ┴└─┴ └┘ ┴ ┴ ┴ └─┘
  //  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐┌─┐
  //   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤ └─┐
  //  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘└─┘
  // This allows outside access to the datastores, for use in advanced ORM methods like `.runTransaction()`.
  datastores: registeredDsEntries,

  // Also give the driver a `Database` property, so that it provides access
  // to the better-sqlite3 Database class for Node.js. (See https://github.com/WiseLibs/better-sqlite3)
  Database: Database,

  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██╗     ██╗███████╗███████╗ ██████╗██╗   ██╗ ██████╗██╗     ███████╗                        //
  //  ██║     ██║██╔════╝██╔════╝██╔════╝╚██╗ ██╔╝██╔════╝██║     ██╔════╝                        //
  //  ██║     ██║█████╗  █████╗  ██║      ╚████╔╝ ██║     ██║     █████╗                          //
  //  ██║     ██║██╔══╝  ██╔══╝  ██║       ╚██╔╝  ██║     ██║     ██╔══╝                          //
  //  ███████╗██║██║     ███████╗╚██████╗   ██║   ╚██████╗███████╗███████╗                        //
  //  ╚══════╝╚═╝╚═╝     ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝╚══════╝╚══════╝                        //
  //                                                                                              //
  // Lifecycle adapter methods:                                                                   //
  // Methods related to setting up and tearing down; registering/un-registering datastores.       //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╦═╗╔═╗╔═╗╦╔═╗╔╦╗╔═╗╦═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
   *  ╠╦╝║╣ ║ ╦║╚═╗ ║ ║╣ ╠╦╝   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
   *  ╩╚═╚═╝╚═╝╩╚═╝ ╩ ╚═╝╩╚═  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
   *
   * Register a new datastore with this adapter. This usually involves creating a new
   * connection manager (e.g. SQLite database instance) for the underlying database layer.
   *
   * > Waterline calls this method once for every datastore that is configured to use this adapter.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   dsConfig              »-> Dictionary (plain JavaScript object) of configuration options for this datastore (e.g. storage, mode, etc.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   models                »-> Dictionary of model definitions using this datastore.
   *         ˚¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\
   *         ˙ [identity]: {Dictionary}  :: Info about a model using this datastore.
   *               ˚¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\
   *               ˙ primaryKey: {String}      :: The name of the primary key attribute.
   *               ˙ identity: {String}        :: The model's `identity`.
   *               ˙ tableName: {String}       :: The model's `tableName`.
   *               ˙ definition: {Dictionary}  :: The model's attribute definitions.
   *                             ˚¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\
   *                             ˙ [attribute]: {Dictionary}  :: Info about an attribute.
   *                                   ˚¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯\
   *                                   ˙ type: {String}        :: The attribute's type.
   *                                   ˙ columnName: {String}  :: The attribute's column name.
   *                                   ˙ required: {Boolean?}  :: Whether the attribute is required.
   *                                   ˙ ...                   :: Other attribute properties.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}  done    »-> A callback function which should be triggered by this implementation after successfully registering this datastore, or if an error is encountered.
   *         @param {Error?} err   <-« An Error instance, if something went wrong.  (Otherwise `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  registerDatastore: function registerDatastore(
    datastoreConfig,
    physicalModelsReport,
    cb
  ) {
    // Grab the unique name for this datastore for easy access below.
    const datastoreName = dsConfig.identity

    // Some sanity checks:
    if (!datastoreName) {
      return done(
        new Error(
          'Consistency violation: A datastore should contain an "identity" property: a special identifier that uniquely identifies it across this app.  This should have been provided by Waterline core!  If you are seeing this message, there could be a bug in Waterline, or the datastore could have become corrupted by userland code, or other code in this adapter.  If you determine that this is a Waterline bug, please report this at http://sailsjs.com/bugs.'
        )
      )
    }

    if (registeredDsEntries[datastoreName]) {
      return done(
        new Error(
          'Consistency violation: Cannot register datastore: `' +
            datastoreName +
            '`, because it is already registered with this adapter!  This could be due to an unexpected race condition in userland code (e.g. attempting to initialize Waterline more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at http://sailsjs.com/support.)'
        )
      )
    }

    //  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ┌┬┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐
    //  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   │││├─┤│││├─┤│ ┬├┤ ├┬┘
    //  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ┴ ┴┴ ┴┘└┘┴ ┴└─┘└─┘┴└─
    // Build a "connection manager" -- an object that contains all of the state for this datastore.
    // For SQLite, this is simpler than many other databases because SQLite is serverless and
    // doesn't require connection pooling. Our manager will be a single Database instance from
    // the better-sqlite3 library. This instance represents a connection to a SQLite database file.
    // We'll use this instance for all operations on this datastore. The actual form of the
    // manager is completely dependent on this adapter. In other words, it is custom and database-specific.
    // This is where we'll also set up any SQLite-specific configurations, like pragmas for performance tuning.
    WET_MACHINES.createManager({
      connectionString: datastoreConfig.url,
      meta: Object.fromEntries(
        Object.entries(dsConfig).filter(
          ([key]) => !['adapter', 'url', 'identity', 'schema'].includes(key)
        )
      )
    }).switch({
      error: function (error) {
        return done(
          new Error(
            'Consistency violation: Unexpected error creating db connection manager:\n```\n' +
              err.stack +
              '\n```'
          )
        )
      },
      success: function (report) {
        try {
          const manager = report.manager
          //  ╔╦╗╦═╗╔═╗╔═╗╦╔═  ┌┬┐┌─┐  ┌─┐┌┐┌┌┬┐┬─┐┬ ┬
          //   ║ ╠╦╝╠═╣║  ╠╩╗   ││└─┐  ├┤ │││ │ ├┬┘└┬┘
          //   ╩ ╩╚═╩ ╩╚═╝╩ ╩  ─┴┘└─┘  └─┘┘└┘ ┴ ┴└─ ┴
          //  ┌─  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌┐┌┌┬┐┬─┐┬ ┬  ─┐
          //  │    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   ├┤ │││ │ ├┬┘└┬┘   │
          //  └─  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘┘└┘ ┴ ┴└─ ┴   ─┘
          // Save information about the datastore to the `datastores` dictionary, keyed under
          // the datastore's unique name.  The information should itself be in the form of a
          // dictionary (plain JavaScript object), and have three keys:
          //
          // `manager`: The database-specific "connection manager" that we just built above.
          //
          // `config  : Configuration options for the datastore.  Should be passed straight through
          //            from what was provided as the `dsConfig` argument to this method.
          //
          // `driver` : Optional.  A reference to a stateless, underlying Node-Machine driver.
          //            (For instance `machinepack-postgresql` for the `sails-postgresql` adapter.)
          //            Note that this stateless, standardized driver will be merged into the main
          //            concept of an adapter in future versions of the Waterline adapter spec.
          //            (See https://github.com/node-machine/driver-interface for more informaiton.)
          //
          registeredDsEntries[datastoreName] = {
            config: datastoreConfig,
            manager: manager,
            driver: {
              createManager: WET_MACHINES.createManager,
              destroyManager: WET_MACHINES.destroyManager,
              getConnection: WET_MACHINES.getConnection,
              releaseConnection: WET_MACHINES.releaseConnection,
              Database: Database
            }
          }

          //  ╔╦╗╦═╗╔═╗╔═╗╦╔═  ┌─┐┬ ┬  ┌┬┐┌─┐┌┬┐┌─┐┬  ┌─┐
          //   ║ ╠╦╝╠═╣║  ╠╩╗  ├─┘├─┤  ││││ │ ││├┤ │  └─┐
          //   ╩ ╩╚═╩ ╩╚═╝╩ ╩  ┴  ┴ ┴  ┴ ┴└─┘─┴┘└─┘┴─┘└─┘
          // Track physical models for SQLite tables.
          // This step maps Waterline models to their corresponding SQLite table structures.
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
          // TODO: Consider implementing a more direct method to access model information,
          // potentially through an ORM accessor function, to simplify this process in future versions.
          // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

          for (const [modelIdentity, modelInfo] of Object.entries(models)) {
            // Uncomment for debugging:
            // console.log(`In datastore: '${datastoreName}' - Tracking physical model: '${modelIdentity}' (tableName: '${modelInfo.tableName}')`);

            if (registeredDryModels[modelIdentity]) {
              throw new Error(
                `Consistency violation: Cannot register model: '${modelIdentity}', because it is already registered with this adapter! ` +
                  `This could be due to an unexpected race condition in userland code (e.g. attempting to initialize multiple ORM instances at the same time), ` +
                  `or it could be due to a bug in this adapter. If you need assistance, please reach out at https://sailsjs.com/support.`
              )
            }

            registeredDryModels[modelIdentity] = {
              primaryKey: modelInfo.primaryKey,
              attributes: modelInfo.definition,
              tableName: modelInfo.tableName,
              identity: modelInfo.identity
            }

            // Uncomment for detailed debugging:
            // console.log('Model Info:', JSON.stringify(modelInfo, null, 2));
          }
        } catch (error) {
          return done(error)
        }
        // Inform Waterline that the datastore was registered successfully.
        return done(undefined, report.meta)
      } //•-success>
    }) //createManager()>
  },
  /**
   *  ╔╦╗╔═╗╔═╗╦═╗╔╦╗╔═╗╦ ╦╔╗╔
   *   ║ ║╣ ╠═╣╠╦╝ ║║║ ║║║║║║║
   *   ╩ ╚═╝╩ ╩╩╚══╩╝╚═╝╚╩╝╝╚╝
   * Tear down (un-register) a datastore.
   *
   * Fired when a datastore is unregistered.  Typically called once for
   * each relevant datastore when the server is killed, or when Waterline
   * is shut down after a series of tests.  Useful for destroying the manager
   * (i.e. terminating any remaining open connections, etc.).
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String} datastoreName   The unique name (identity) of the datastore to un-register.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function} done          Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  teardown: function (datastoreName, done) {
    // Look up the datastore entry (manager/driver/config).
    var dsEntry = registeredDsEntries[datastoreName]

    // Sanity checks:
    if (!datastoreName) {
      return done(
        new Error(
          'Consistency violation: Internal error in Waterline: Adapter received unexpected falsey datastore name (`' +
            datastoreName +
            "`)!  Can't look up a DS entry from this adapter with that...  (Please report this error at http://sailsjs.com/bugs.)"
        )
      )
    }
    if (_.isUndefined(dsEntry)) {
      return done(
        new Error(
          'Consistency violation: Attempting to tear down a datastore (`' +
            datastoreName +
            '`) which is not currently registered with this adapter.  This is usually due to a race condition in userland code (e.g. attempting to tear down the same ORM instance more than once), or it could be due to a bug in this adapter.  (If you get stumped, reach out at http://sailsjs.com/support.)'
        )
      )
    }
    if (!dsEntry.manager) {
      return done(
        new Error(
          'Consistency violation: Missing manager for this datastore. (This datastore may already be in the process of being destroyed.)'
        )
      )
    }

    //  ╔╦╗╔═╗╔═╗╔╦╗╦═╗╔═╗╦ ╦  ┌┬┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐
    //   ║║║╣ ╚═╗ ║ ╠╦╝║ ║╚╦╝  │││├─┤│││├─┤│ ┬├┤ ├┬┘
    //  ═╩╝╚═╝╚═╝ ╩ ╩╚═╚═╝ ╩   ┴ ┴┴ ┴┘└┘┴ ┴└─┘└─┘┴└─
    // Destroy the manager.
    WET_MACHINES.destroyManager({ manager: dsEntry.manager }).switch({
      error: function (err) {
        return done(
          new Error(
            'Encountered unexpected error when attempting to destroy the connection manager.\n\n```\n' +
              err.stack +
              '\n```'
          )
        )
      },
      success: function (report) {
        //  ╦ ╦╔╗╔  ╔╦╗╦═╗╔═╗╔═╗╦╔═  ┌┬┐┌─┐  ┌─┐┌┐┌┌┬┐┬─┐┬ ┬
        //  ║ ║║║║───║ ╠╦╝╠═╣║  ╠╩╗   ││└─┐  ├┤ │││ │ ├┬┘└┬┘
        //  ╚═╝╝╚╝   ╩ ╩╚═╩ ╩╚═╝╩ ╩  ─┴┘└─┘  └─┘┘└┘ ┴ ┴└─ ┴
        //  ┌─  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌┐┌┌┬┐┬─┐┬ ┬  ─┐
        //  │    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   ├┤ │││ │ ├┬┘└┬┘   │
        //  └─  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘┘└┘ ┴ ┴└─ ┴   ─┘
        // Now, un-register the datastore, as well as any registered physical model
        // definitions that use it.
        try {
          delete registeredDsEntries[datastoreName]

          _.each(_.keys(registeredDryModels), function (modelIdentity) {
            if (
              registeredDryModels[modelIdentity].datastore === datastoreName
            ) {
              delete registeredDryModels[modelIdentity]
            }
          })
        } catch (e) {
          return done(e)
        }

        // Inform Waterline that we're done, and that everything went as expected.
        return done(undefined, report.meta)
      } //•-success>
    }) //destroyManager()>
  },
  /**
   *  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ╔╦╗╔═╗╔╗╔╔═╗╔═╗╔═╗╦═╗
   *  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   ║║║╠═╣║║║╠═╣║ ╦║╣ ╠╦╝
   *  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ╩ ╩╩ ╩╝╚╝╩ ╩╚═╝╚═╝╩╚═
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/connectable/create-manager.js
   */
  createManager: DRY_MACHINES.createManager,

  /**
   *  ╔╦╗╔═╗╔═╗╔╦╗╦═╗╔═╗╦ ╦  ╔╦╗╔═╗╔╗╔╔═╗╔═╗╔═╗╦═╗
   *   ║║║╣ ╚═╗ ║ ╠╦╝║ ║╚╦╝  ║║║╠═╣║║║╠═╣║ ╦║╣ ╠╦╝
   *  ═╩╝╚═╝╚═╝ ╩ ╩╚═╚═╝ ╩   ╩ ╩╩ ╩╝╚╝╩ ╩╚═╝╚═╝╩╚═
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/connectable/destroy-manager.js
   */
  destroyManager: DRY_MACHINES.destroyManager,

  /**
   *  ╔═╗╔═╗╔╦╗  ╔═╗╔═╗╔╗╔╔╗╔╔═╗╔═╗╔╦╗╦╔═╗╔╗╔
   *  ║ ╦║╣  ║   ║  ║ ║║║║║║║║╣ ║   ║ ║║ ║║║║
   *  ╚═╝╚═╝ ╩   ╚═╝╚═╝╝╚╝╝╚╝╚═╝╚═╝ ╩ ╩╚═╝╝╚╝
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/connectable/get-connection.js
   */
  getConnection: DRY_MACHINES.getConnection,

  /**
   *  ╦═╗╔═╗╦  ╔═╗╔═╗╔═╗╔═╗  ╔═╗╔═╗╔╗╔╔╗╔╔═╗╔═╗╔╦╗╦╔═╗╔╗╔
   *  ╠╦╝║╣ ║  ║╣ ╠═╣╚═╗║╣   ║  ║ ║║║║║║║║╣ ║   ║ ║║ ║║║║
   *  ╩╚═╚═╝╩═╝╚═╝╩ ╩╚═╝╚═╝  ╚═╝╚═╝╝╚╝╝╚╝╚═╝╚═╝ ╩ ╩╚═╝╝╚╝
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/connectable/release-connection.js
   */
  releaseConnection: DRY_MACHINES.releaseConnection,

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██╗   ██╗███████╗██████╗ ██╗███████╗██╗   ██╗    ███╗   ███╗ ██████╗ ██████╗ ███████╗██╗         ██████╗ ███████╗███████╗    //
  //  ██║   ██║██╔════╝██╔══██╗██║██╔════╝╚██╗ ██╔╝    ████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║         ██╔══██╗██╔════╝██╔════╝    //
  //  ██║   ██║█████╗  ██████╔╝██║█████╗   ╚████╔╝     ██╔████╔██║██║   ██║██║  ██║█████╗  ██║         ██║  ██║█████╗  █████╗      //
  //  ╚██╗ ██╔╝██╔══╝  ██╔══██╗██║██╔══╝    ╚██╔╝      ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║         ██║  ██║██╔══╝  ██╔══╝      //
  //   ╚████╔╝ ███████╗██║  ██║██║██║        ██║       ██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗    ██████╔╝███████╗██║         //
  //    ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝       ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝    ╚═════╝ ╚══════╝╚═╝         //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  verifyModelDef: DRY_MACHINES.verifyModelDef
}
