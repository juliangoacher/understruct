/*
   Copyright 2018 Julian Goacher

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */

const assert = require('assert');

const understruct = require('../lib');

const settings = {
    message: 'Test message'
}

function db( settings ) {
    return {
        getMessage: () => settings.message
    }
}

function out( db, settings ) {
    return new Promise( ( resolve, reject ) => {
        resolve({
            message: settings.message,
            getMessage: () => db.getMessage()
        });
    });
}

const logger = () => {};

describe('backward dependency', function() {

    let app;

    before( async function() {
        app = await understruct.start([
            { settings },
            { db },
            { out }
        ], logger );
    });


    it('should have a settings service', function() {
        assert( app.services.settings !== undefined );
    });

    it('should have a db service', function() {
        assert( app.services.db !== undefined );
    });

    it('should have an out service', function() {
        assert( app.services.out !== undefined );
    });

    it('out.message should equal out.getMessage', function() {
        let { out } = app.services;
        assert( out.message === out.getMessage() );
    });

});

describe('backward dependency with missing service', function() {

    it('should throw an error', async function() {
        try {
            await understruct.start([
                { db }
            ], logger );
            assert( false );
        }
        catch( e ) {
            assert( e.message == "Unresolved dependency: 'settings' for 'db'" );
        }
    });

});
