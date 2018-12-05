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

// Standard timeout for message responses.
const MessageTimeout = 1000 * 60 * 5;

/// IPC client wrapper.
class Client extends EventEmitter {

    /**
     * Create a new IPC client for connecting to the server of the specified ID.
     */
    constructor( clientID, serverID, logger, appspace ) {
        super();
        this._ipc = IPC.make( clientID, logger, appspace );
        this._clientID = clientID;
        this._serverID = serverID;
        this._connected = false;
        this._events = [];
        this._messages = [];
    }

    /**
     * Set the list of server events handled by this client.
     * Events are notifications received from the server.
     */
    set events( events ) {
        this._events = events;
    }

    /**
     * Set the list of server message names handled by this client.
     * Messages are requests sent by the client to the server.
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
     * Connect to the server.
     */
    connect() {

        const self = this;
        const ipc = this._ipc;

        // Connect to the server.
        ipc.connectTo( self._serverID, () => {

            // Get the local server stub.
            const server = ipc.of[self._serverID];

            // Handle connection & disconnection events.
            server.on('connect',    () => self._connected = true );
            server.on('disconnect', () => self._connected = false );

            // Plumbing for server events - emit as local events from this object.
            self._events.forEach( eid => {
                server.on(`event.${eid}`, data => {
                    let { id, message } = data;
                    self.emit( eid, message );
                });
            });

            // -- See note in index.js on client/server messages. --

            // A unique message ID counter.
            let midx = 0;

            // Maps of pending message promises and timeout timers.
            const pendings = {};

            // Clear a pending message promise.
            function clear( id ) {
                // Lookup the pending by message ID.
                let pending = pendings[id];
                if( !pending ) {
                    // Pending not found - return a stub object.
                    return { resolve: () => {}, reject: () => {} };
                }
                // Delete the pending and delete the timeout timer.
                delete pendings[id];
                let { timerID } = pending;
                clearTimeout( timerID );
                // Return the pending object.
                return pending;
            }

            // Resolve a pending message promise.
            function resolve( data ) {
                let { id, message } = data;
                let { resolve } = clear( id );
                resolve( message );
            }

            // Reject a pending message promise.
            function reject( data ) {
                let { id, message } = data;
                let { reject } = clear( id );
                reject( message );
            }

            // Plumbing for server messages. Create methods on this object named
            // after the message name, and which emit events to the server.
            self._messages.forEach( name => {
                const mid = `message.${name}`;
                // Bind a method to send the message to the server.
                self[name] = function() {
                    const id = `${name}.${midx++}`;
                    const args = Array.from( arguments );
                    server.emit( mid, { id, args });
                    // Create a promise to wait for the result.
                    return new Promise( ( resolve, reject ) => {
                        // Create a request timeout.
                        const timerID = setTimeout( () => {
                            const message = 'IPC message dispatch timeout';
                            reject({ id, message });
                        }, MessageTimeout );
                        // Register the promise.
                        pendings[id] = { resolve, reject, timerID };
                    });
                };
                // Register event handler for handling message responses.
                server.on( mid, resolve );
                // Register event handler for handling message errors.
                server.on(`error.${name}`, reject );
            });

        });
    }

}

module.exports = Client;

