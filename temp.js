let understruct = require('../lib');

let settings = { message: 'xxx' };

let db = function( settings ) {
    return {
        getMessage: () => settings.message
    }
}

async function run() {
    let app = await understruct.start([
        { settings },
        { db }
    ]);
    console.log('message: '+app.services.db.getMessage() );
}

run();

