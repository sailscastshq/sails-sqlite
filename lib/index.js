const Database = require('better-sqlite3')
const Machine = require('machine')
const buildStdAdapterMethod = require('./private/build-std-adapter-method')

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
  getConnection: require('./private/machines/get-connection'),
  releaseConnection: require('./private/machines/release-connection'),
  definePhysicalModel: require('./private/machines/define-physical-model'),
  dropPhysicalModel: require('./private/machines/drop-physical-model'),
  setPhysicalSequence: require('./private/machines/set-physical-sequence'),
  join: require('./private/machines/join')
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
  defaults: {
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
  registerDatastore: function registerDatastore(dsConfig, models, done) {
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
      connectionString: dsConfig.url,
      meta: Object.fromEntries(
        Object.entries(dsConfig).filter(
          ([key]) => !['adapter', 'url', 'identity', 'schema'].includes(key)
        )
      )
    }).switch({
      error: function (err) {
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
            config: dsConfig,
            manager,
            driver: {
              createManager: WET_MACHINES.createManager,
              destroyManager: WET_MACHINES.destroyManager,
              getConnection: WET_MACHINES.getConnection,
              releaseConnection: WET_MACHINES.releaseConnection,
              Database
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
              attributes: modelInfo.definition || modelInfo.attributes,
              tableName: modelInfo.tableName,
              identity: modelInfo.identity
            }

            // Uncomment for detailed debugging:
            // console.log('Model Info:', JSON.stringify(modelInfo, null, 2));
          }
        } catch (err) {
          return done(err)
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
    if (dsEntry === undefined) {
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

          Object.keys(registeredDryModels).forEach((modelIdentity) => {
            if (
              registeredDryModels[modelIdentity].datastore === datastoreName
            ) {
              delete registeredDryModels[modelIdentity]
            }
          })
        } catch (err) {
          return done(err)
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
  verifyModelDef: DRY_MACHINES.verifyModelDef,

  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗ ███╗   ███╗██╗                                                                      //
  //  ██╔══██╗████╗ ████║██║                                                                      //
  //  ██║  ██║██╔████╔██║██║                                                                      //
  //  ██║  ██║██║╚██╔╝██║██║                                                                      //
  //  ██████╔╝██║ ╚═╝ ██║███████╗                                                                 //
  //  ╚═════╝ ╚═╝     ╚═╝╚══════╝                                                                 //
  // (D)ata (M)anipulation (L)anguage                                                             //
  //                                                                                              //
  // DML adapter methods:                                                                         //
  // Methods related to manipulating records stored in the database.                              //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗
   *  ║  ╠╦╝║╣ ╠═╣ ║ ║╣
   *  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝
   * Create a new record.
   *
   * (e.g. add a new row to a SQL table, or a new document to a MongoDB collection.)
   *
   * > Note that depending on the value of `s3q.meta.fetch`,
   * > you may be expected to return the physical record that was
   * > created (a dictionary) as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   s3q             The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Dictionary?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  create: buildStdAdapterMethod(
    require('./private/machines/create-record'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),
  /**
   *  ╔═╗╦═╗╔═╗╔═╗╔╦╗╔═╗  ╔═╗╔═╗╔═╗╦ ╦
   *  ║  ╠╦╝║╣ ╠═╣ ║ ║╣   ║╣ ╠═╣║  ╠═╣
   *  ╚═╝╩╚═╚═╝╩ ╩ ╩ ╚═╝  ╚═╝╩ ╩╚═╝╩ ╩
   * Create multiple new records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were created as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  createEach: buildStdAdapterMethod(
    require('./private/machines/create-each-record'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),
  /**
   *  ╦ ╦╔═╗╔╦╗╔═╗╔╦╗╔═╗
   *  ║ ║╠═╝ ║║╠═╣ ║ ║╣
   *  ╚═╝╩  ═╩╝╩ ╩ ╩ ╚═╝
   * Update matching records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were updated as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  update: buildStdAdapterMethod(
    require('./private/machines/update-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),
  /**
   *  ╔╦╗╔═╗╔═╗╔╦╗╦═╗╔═╗╦ ╦
   *   ║║║╣ ╚═╗ ║ ╠╦╝║ ║╚╦╝
   *  ═╩╝╚═╝╚═╝ ╩ ╩╚═╚═╝ ╩
   * Destroy one or more records.
   *
   * > Note that depending on the value of `query.meta.fetch`,
   * > you may be expected to return the array of physical records
   * > that were destroyed as the second argument to the callback.
   * > (Otherwise, exclude the 2nd argument or send back `undefined`.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  destroy: buildStdAdapterMethod(
    require('./private/machines/destroy-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),

  //  ╔╗╔╔═╗╔╦╗╦╦  ╦╔═╗   ┬┌─┐┬┌┐┌  ┌─┐┬ ┬┌─┐┌─┐┌─┐┬─┐┌┬┐
  //  ║║║╠═╣ ║ ║╚╗╔╝║╣    ││ │││││  └─┐│ │├─┘├─┘│ │├┬┘ │
  //  ╝╚╝╩ ╩ ╩ ╩ ╚╝ ╚═╝  └┘└─┘┴┘└┘  └─┘└─┘┴  ┴  └─┘┴└─ ┴
  // Build up native joins to run on the adapter.
  join: function join(datastoreName, query, cb) {
    var datastore = registeredDsEntries[datastoreName]
    // Models are stored globally, not per datastore
    var models = registeredDryModels

    // Add redactPasswords function if not defined
    function redactPasswords(err) {
      // Simple implementation - in production you might want more sophisticated password redaction
      return err
    }

    WET_MACHINES.join({
      datastore: datastore,
      models: models,
      query: query
    }).switch({
      error: function error(err) {
        return cb(redactPasswords(err))
      },
      success: function success(report) {
        return cb(undefined, report)
      }
    })
  },
  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗  ██████╗ ██╗                                                                        //
  //  ██╔══██╗██╔═══██╗██║                                                                        //
  //  ██║  ██║██║   ██║██║                                                                        //
  //  ██║  ██║██║▄▄ ██║██║                                                                        //
  //  ██████╔╝╚██████╔╝███████╗                                                                   //
  //  ╚═════╝  ╚══▀▀═╝ ╚══════╝                                                                   //
  // (D)ata (Q)uery (L)anguage                                                                    //
  //                                                                                              //
  // DQL adapter methods:                                                                         //
  // Methods related to fetching information from the database (e.g. finding stored records).     //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╔═╗╦╔╗╔╔╦╗
   *  ╠╣ ║║║║ ║║
   *  ╚  ╩╝╚╝═╩╝
   * Find matching records.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Array}  [matching physical records]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  find: buildStdAdapterMethod(
    require('./private/machines/find-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),

  /**
   *  ╔═╗╔═╗╦ ╦╔╗╔╔╦╗
   *  ║  ║ ║║ ║║║║ ║
   *  ╚═╝╚═╝╚═╝╝╚╝ ╩
   * Get the number of matching records.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Number}  [the number of matching records]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  count: buildStdAdapterMethod(
    require('./private/machines/count-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),

  /**
   *  ╔═╗╦ ╦╔╦╗
   *  ╚═╗║ ║║║║
   *  ╚═╝╚═╝╩ ╩
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Number}  [the sum]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  sum: buildStdAdapterMethod(
    require('./private/machines/sum-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),

  /**
   *  ╔═╗╦  ╦╔═╗
   *  ╠═╣╚╗╔╝║ ╦
   *  ╩ ╩ ╚╝ ╚═╝
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore to perform the query on.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   query           The stage-3 query to perform.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   *               @param {Number}  [the average ("mean")]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  avg: buildStdAdapterMethod(
    require('./private/machines/avg-records'),
    WET_MACHINES,
    registeredDsEntries,
    registeredDryModels
  ),

  //////////////////////////////////////////////////////////////////////////////////////////////////
  //  ██████╗ ██████╗ ██╗                                                                         //
  //  ██╔══██╗██╔══██╗██║                                                                         //
  //  ██║  ██║██║  ██║██║                                                                         //
  //  ██║  ██║██║  ██║██║                                                                         //
  //  ██████╔╝██████╔╝███████╗                                                                    //
  //  ╚═════╝ ╚═════╝ ╚══════╝                                                                    //
  // (D)ata (D)efinition (L)anguage                                                               //
  //                                                                                              //
  // DDL adapter methods:                                                                         //
  // Methods related to modifying the underlying structure of physical models in the database.    //
  //////////////////////////////////////////////////////////////////////////////////////////////////

  /**
   *  ╔╦╗╔═╗╔═╗╦╔╗╔╔═╗
   *   ║║║╣ ╠╣ ║║║║║╣
   *  ═╩╝╚═╝╚  ╩╝╚╝╚═╝
   * Build a new physical model (e.g. table/etc) to use for storing records in the database.
   *
   * (This is used for schema migrations.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore containing the table to define.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       tableName       The name of the table to define.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary}   phmDef          The physical model definition (not a normal Sails/Waterline model-- log this for details.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */

  define: function (datastoreName, tableName, phmDef, done) {
    // Look up the datastore entry (manager/driver/config).
    const dsEntry = registeredDsEntries[datastoreName]

    // Sanity check:
    if (dsEntry === undefined) {
      return done(
        new Error(
          'Consistency violation: Cannot do that with datastore (`' +
            datastoreName +
            '`) because no matching datastore entry is registered in this adapter!  This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter.  (If you get stumped, reach out at http://sailsjs.com/support.)'
        )
      )
    }

    // Convert phmDef to the format expected by definePhysicalModel
    const columns = Object.entries(phmDef).map(([columnName, phmAttrDef]) => ({
      columnName,
      unique: phmAttrDef.unique || false,
      required: phmAttrDef.required || false,
      autoIncrement: columnName === 'id' || phmAttrDef.autoIncrement || false,
      columnType: phmAttrDef.columnType
    }))

    // Call the definePhysicalModel machine
    WET_MACHINES.definePhysicalModel({
      connection: dsEntry.manager,
      tableName: tableName,
      columns: columns,
      meta: dsEntry.config
    }).switch({
      error: function (err) {
        return done(err)
      },
      success: function () {
        return done()
      }
    })
  },

  /**
   *  ╔╦╗╦═╗╔═╗╔═╗
   *   ║║╠╦╝║ ║╠═╝
   *  ═╩╝╩╚═╚═╝╩
   * Drop a physical model (table/etc.) from the database, including all of its records.
   *
   * > This is idempotent.
   *
   * (This is used for schema migrations.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName   The name of the datastore containing the table to drop.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       tableName       The name of the table to drop.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Ref}          unused          Currently unused (do not use this argument.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done            Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  drop: function (datastoreName, tableName, unused, done) {
    // Look up the datastore entry (manager/driver/config).
    const dsEntry = registeredDsEntries[datastoreName]

    // Sanity check:
    if (dsEntry === undefined) {
      return done(
        new Error(
          `Consistency violation: Cannot do that with datastore (\`${datastoreName}\`) because no matching datastore entry is registered in this adapter! This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter. (If you get stumped, reach out at http://sailsjs.com/support.)`
        )
      )
    }

    // Call the dropPhysicalModel machine
    WET_MACHINES.dropPhysicalModel({
      connection: dsEntry.manager,
      tableName: tableName,
      meta: dsEntry.config
    }).switch({
      error: function (err) {
        // Check if the error is an instance of Error
        if (err instanceof Error) {
          return done(err)
        } else {
          return done(
            new Error(
              `Consistency violation: Expecting Error instance, but instead got: ${util.inspect(err)}`
            )
          )
        }
      },
      success: function () {
        // If we get here, the table was successfully dropped or didn't exist
        return done()
      }
    })
  },
  /**
   *  ╔═╗╔═╗╔╦╗  ┌─┐┌─┐┌─┐ ┬ ┬┌─┐┌┐┌┌─┐┌─┐
   *  ╚═╗║╣  ║   └─┐├┤ │─┼┐│ │├┤ ││││  ├┤
   *  ╚═╝╚═╝ ╩   └─┘└─┘└─┘└└─┘└─┘┘└┘└─┘└─┘
   * Set a sequence in a physical model (specifically, the auto-incrementing
   * counter for the primary key) to the specified value.
   *
   * (This is used for schema migrations.)
   *
   * > NOTE - If your adapter doesn't support sequence entities (like PostgreSQL),
   * > you should remove this method.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName    The name of the datastore containing the table/etc.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       sequenceName     The name of the sequence to update.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Number}       sequenceValue    The new value for the sequence (e.g. 1)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done             Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */

  /**
   *  ╔═╗╔═╗╔╦╗  ╔═╗╔═╗╔═╗ ┬ ┬┌─┐┌┐┌┌─┐┌─┐
   *  ╚═╗║╣  ║   └─┐├┤ │─┼┐│ │├┤ ││││  ├┤
   *  ╚═╝╚═╝ ╩   └─┘└─┘└─┘└└─┘└─┘┘└┘└─┘└─┘
   * Set a sequence in a physical model (specifically, the auto-incrementing
   * counter for the primary key) to the specified value.
   *
   * (This is used for schema migrations.)
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       datastoreName    The name of the datastore containing the table.
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String}       sequenceName     The name of the sequence to update (usually the table name).
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Number}       sequenceValue    The new value for the sequence (e.g. 1).
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function}     done             Callback
   *               @param {Error?}
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  setSequence: function (datastoreName, sequenceName, sequenceValue, done) {
    // Look up the datastore entry (manager/driver/config).
    const dsEntry = registeredDsEntries[datastoreName]

    // Sanity check:
    if (dsEntry === undefined) {
      return done(
        new Error(
          `Consistency violation: Cannot do that with datastore (\`${datastoreName}\`) because no matching datastore entry is registered in this adapter! This is usually due to a race condition (e.g. a lifecycle callback still running after the ORM has been torn down), or it could be due to a bug in this adapter. (If you get stumped, reach out at https://sailsjs.com/support.)`
        )
      )
    }

    // Call the setPhysicalSequence machine
    WET_MACHINES.setPhysicalSequence({
      connection: dsEntry.manager,
      sequenceName: sequenceName,
      sequenceValue: sequenceValue,
      meta: dsEntry.config
    }).switch({
      error: function (err) {
        return done(err)
      },
      notFound: function (err) {
        // In SQLite, if a table doesn't exist or doesn't have autoincrement,
        // that's not necessarily an error during migrations. We can safely ignore this.
        console.warn(
          `Warning: Could not reset sequence for '${sequenceName}'. This is normal if the table doesn't exist or doesn't have an auto-increment column.`
        )
        return done()
      },
      success: function () {
        return done()
      }
    })
  },

  /**
   *  ╔╦╗╔═╗╔═╗╦╔╗╔╔═╗  ╔═╗╦ ╦╦ ╦╔═╗╦╔═╗╔═╗╦    ╔╦╗╔═╗╔╦╗╔═╗╦
   *   ║║║╣ ╠╣ ║║║║║╣   ╠═╝╠═╣╚╦╝╚═╗║║  ╠═╣║    ║║║║ ║ ║║║╣ ║
   *  ═╩╝╚═╝╚  ╩╝╚╝╚═╝  ╩  ╩ ╩ ╩ ╚═╝╩╚═╝╩ ╩╩═╝  ╩ ╩╚═╝═╩╝╚═╝╩═╝
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/migratable/define-physical-model.js
   */
  definePhysicalModel: DRY_MACHINES.definePhysicalModel,

  /**
   *  ╔╦╗╦═╗╔═╗╔═╗  ╔═╗╦ ╦╦ ╦╔═╗╦╔═╗╔═╗╦    ╔╦╗╔═╗╔╦╗╔═╗╦
   *   ║║╠╦╝║ ║╠═╝  ╠═╝╠═╣╚╦╝╚═╗║║  ╠═╣║    ║║║║ ║ ║║║╣ ║
   *  ═╩╝╩╚═╚═╝╩    ╩  ╩ ╩ ╩ ╚═╝╩╚═╝╩ ╩╩═╝  ╩ ╩╚═╝═╩╝╚═╝╩═╝
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/migratable/drop-physical-model.js
   */
  dropPhysicalModel: DRY_MACHINES.dropPhysicalModel,

  /**
   *  ╔═╗╔═╗╔╦╗  ╔═╗╦ ╦╦ ╦╔═╗╦╔═╗╔═╗╦    ╔═╗╔═╗╔═╗ ╦ ╦╔═╗╔╗╔╔═╗╔═╗
   *  ╚═╗║╣  ║   ╠═╝╠═╣╚╦╝╚═╗║║  ╠═╣║    ╚═╗║╣ ║═╬╗║ ║║╣ ║║║║  ║╣
   *  ╚═╝╚═╝ ╩   ╩  ╩ ╩ ╩ ╚═╝╩╚═╝╩ ╩╩═╝  ╚═╝╚═╝╚═╝╚╚═╝╚═╝╝╚╝╚═╝╚═╝
   *
   * > https://github.com/node-machine/driver-interface/blob/master/layers/migratable/set-physical-sequence.js
   */
  setPhysicalSequence: DRY_MACHINES.setPhysicalSequence
}
