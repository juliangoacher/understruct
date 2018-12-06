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

const logger = () => {};

const settings = {
    message: 'Test message'
}

function db( settings ) {
    // The IPC service.
    let service = new understruct.IPCService('db');
    service.events = ['ping'];
    service.messages = {
        getMessage: () => settings.message,
        sendPing: () => service.server.emit('ping')
    };
    return service;
}

const [ , , mode ] = process.argv;

if( mode == 'server' ) {

    // Start db server in separate process.
    understruct.start([
        { settings },
        {
            db: function( settings ) {
                // nonsense
                return db( settings ).server;
            }
        }
    ], logger );

}
else {

    const { exec } = require('child_process');

    function out( settings ) {
        const service = {
            getMessage: () => service.db.getMessage()
        };
        this.onServiceBind('db', db => {
            service.db = db;
        });
        return Promise.resolve( service );
    }

    describe('client <=> server', function() {

        let child;

        before( async function() {
            // Start server component in a separate process.
            child = exec(`node ${__filename} server`);
            // Give process time to start.
            await new Promise( resolve => setTimeout( resolve, 500 ) );
            // Start local backbone.
            app = await understruct.start([
                { settings },
                { out },
                { 
                    db: function( settings ) {
                        // nonsense
                        return db( settings ).client;
                    }
                }
            ], logger );
        });


        it('should have a db service', function() {
            assert( app.services.db !== undefined );
        });

        it('should have an out service', function() {
            assert( app.services.out !== undefined );
        });

        it('should have matching settings.message and out.getMessage', async function() {
            let { settings, out } = app.services;
            let message = await out.getMessage();
            assert( settings.message === message );
        });

        it('should receive a ping message from the server', function( done ) {
            let { db } = app.services;
            db.on('ping', done );
            db.sendPing();
        });

        after( function() {
            child.kill();
            app.services.db.disconnect();
        });

    });

}
