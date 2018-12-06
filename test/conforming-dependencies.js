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
    return Promise.resolve({
        getMessage: () => settings.message
    });
}

function out( settings ) {
    const service = {
        message: settings.message,
        getMessage: () => service.db.getMessage()
    };
    const dbif = { getMessage: 'function' };
    this.onConformingServiceBind( dbif, db => {
        if( db === service ) {
            return;
        }
        service.db = db;
    });
    return Promise.resolve( service );
}

const logger = () => {};

describe('conforming forward dependency', function() {

    let app;

    before( async function() {
        app = await understruct.start([
            { settings },
            { out },
            { db }
        ], logger );
    });

    it('should have an out service with a db property', function() {
        let { out } = app.services;
        assert( out !== undefined );
        assert( out.db !== undefined );
    });

    it('out.message should equal out.getMessage', function() {
        let { out } = app.services;
        assert( out.message === out.getMessage() );
    });

});

describe('conforming backward dependency', function() {

    let app;

    before( async function() {
        app = await understruct.start([
            { settings },
            { db },
            { out }
        ], logger );
    });

    it('should have an out service with a db property', function() {
        let { out } = app.services;
        assert( out !== undefined );
        assert( out.db !== undefined );
    });

    it('out.message should equal out.getMessage', function() {
        let { out } = app.services;
        assert( out.message === out.getMessage() );
    });

});
