/*************************************************************
 * Copyright InnerFunction Ltd. 2018 -- All Rights Reserved. *
 * Unauthorized copying of this file is strictly prohibited. *
 *************************************************************/

let Log = require('log4js').getLogger('starter');

// Handle uncaught exceptions.
process.on('uncaughtException', ( e ) => {
    Log.error('Uncaught exception: ', e.stack || e );
    console.log('Uncaught exception: ', e.stack || e );
});

// Available runtime configurations.
let configs = {
    // Full system runtime with all components.
    'full':             require('./full'),
    // HTTP API + file DB runtime.
    'http+filedb':      require('./http-filedb'),
    // Builder + Dropbox gateway runtime.
    'builder+dropbox':  require('./builder-dropbox.js')
};

exports.start = function() {

    // Parse command line and load settings.
    let settings = require('../settings').processArgv();

    // Read the runtime configuration.
    let config = settings.runtimeConfig;
    if( !config ) {
        Log.error(`No runtime configuration defined`);
        return;
    }
    let services = configs[config];
    if( !services ) {
        Log.error(`Unknown runtime configuration: '${config}'`);
        return;
    }
    Log.info(`Locomote.sh starting with runtime configuration '${config}'...`);

    // Prepend settings to the app backbone (this ensures that
    // settings are visible to all services on the backbone).
    services.unshift({ settings });

    // Initialize the app.
    let app = require('./app');
    app.start( services )
    .then( () => {
        Log.info('Locomote.sh started');
    })
    .fail( err => {
        Log.error('Locomote.sh startup error', err.stack || err );
    });
}
