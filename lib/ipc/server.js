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

const { EventEmitter } = require('events');
const IPC = require('./ipc');

/// IPC server wrapper.
class Server extends EventEmitter {

    /**
     * Create a new IPC server with the specified ID.
     */
    constructor( serverID, logger, appspace ) {
        super();
        this._ipc = IPC.make( serverID, logger, appspace );
        this._serverID = serverID;
        this._events = [];
        this._messages = {};
    }

    /**
     * Set the list of events emitted by this server.
     * Events are notifications raised by the server. Events can be raised by
     * calling this object's 'emit' method, and are then broadcast to all
     * listening clients.
     */
    set events( events ) {
        this._events = events;
    }

    /**
     * Set the list of messages handled by this server.
     * Messages are requests sent by the client to the server. The 'messages'
     * argument is an object whose keys are the message names, and whose values
     * are functions which handle each message when received by the server.
     */
    set messages( messages ) {
        this._messages = messages;
    }

    /**
     * Bind the method functions handled by this client.
     * Methods are always handled locally by the service, regardless
     * of which mode the service is running in.
     */
    set methods( methods ) {
        for( let method in methods ) {
            this[method] = methods[method];
        }
    }

    /**
     * Start the server.
     */
    start( mode = 'remote' ) {

        if( mode != 'local' && mode != 'remote' ) {
            throw new Error(`Illegal start mode: ${mode}`);
        }

        if( mode == 'local' ) {
            // In local mode, just copy the server message handlers to be
            // direct methods of the server object.
            for( let name in this._messages ) {
                this[name] = this._messages[name];
            }
            return;
        }

        // Else running in remote mode; register listeners for events and
        // messages.

        const self = this;
        const ipc = this._ipc;

        ipc.serve( () => {

            const id = self._serverID;

            // Broadcast each event registered with the server.
            self._events.forEach( eid => {
                self.on( eid, message => {
                    ipc.server.broadcast(`event.${eid}`, { id, message });
                });
            });

            // Handle messages received by the server.
            Object.keys( self._messages ).forEach( name => {
                let handler = self._messages[name];
                let mid = `message.${name}`;
                // Handle messages.
                ipc.server.on( mid, async ( data, socket ) => {
                    let { id, args } = data;
                    // Call the message handler within an async promise wrapper.
                    if( !Array.isArray( args ) ) {
                        args = [ args ];
                    }
                    try {
                        const result = await handler.apply( self, args );
                        // Send the handler result back to the client.
                        const data = { id, message: result };
                        ipc.server.emit( socket, mid, data );
                    }
                    catch( err ) {
                        // Send the handler error back to the client.
                        const message = err.description || err.message || err.toString();
                        const data = { id, message };
                        ipc.server.emit( socket, `error.${name}`, data );
                    }
                });
                // Add message handlers as methods of the server.
                self[name] = handler;
            });
        });

        ipc.server.start();
    }

}

module.exports = Server;

