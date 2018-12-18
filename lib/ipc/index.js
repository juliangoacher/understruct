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

/* An implementation of an IPC based client/server protocol.
 * The protocol supports two types of communication between the client and
 * server:
 *
 * 1. Events
 * Events are notifications which are raised by the server and broadcast to
 * all connected clients. Each event has a type ID and a message payload.
 * The event functionality provided by this module is essentially a
 * cross-process version of node's EventEmitter class.
 *
 * 2. Messages
 * Messages are requests sent from a client to the server and to which the
 * server can reply with a specific response intended only for the requesting
 * client. As such, they provide an asynchronous remote method call capability.
 * Message passing is implemented as follows in the code below:
 * - Each individual message call is allocated a unique ID, composed of the
 *   message name with a numeric value taken from a counter.
 * - A deferred promise and timeout timer are each registered under the
 *   message call's unique ID.
 * - The message call is then dispatched by emitting an event to the server.
 *   The event payload includes both the message data and the message call ID.
 * - The server will receive and process the event before dispatching a result
 *   back to the client as an event emitted to the client's socket. The result
 *   can be either a message processing result or an error message if the
 *   message processing fails. The event emitted to the client includes the
 *   originating message call ID.
 * - The client then receives the result event, reads the message call ID from
 *   its payload, and uses that to lookup the deferred promise previously
 *   registered under that ID. If a promise is failed then the result is
 *   dispatched (as a resolve or reject call on the promise). The timeout
 *   timer is cancelled and the promise and timer are removed.
 * - If the server fails to respond within the message timeout period then the
 *   timout timer fires, resolves the waiting promise by rejecting it with a
 *   timeout error, and then removes the promise and timer. Any subsequent
 *   response issued by the server to the original message request is discarded.
 */

const Client = require('./client');
const Server = require('./server');
const { readArgNames, ArgListToken } = require('../app');

/**
 * An IPC capable service.
 * Can run in one of three modes:
 * - server: An implementation of the service capable of servicing requests
 *   from remote clients.
 * - client: A local service stub which forwards all requests to a a remote
 *   service running in a separate process.
 * - service: A standalone service implementation that services all requests
 *   locally.
 *
 * Instance of this class are designed to be returned asynchronously as 
 * module exports. Client and/or server initialization can be deferred
 * to asynchronous code blocks set via the initClient and initServer
 * properties of the class.
 */
class IPCService {

    /**
     * Construct a new service.
     * @param id        A unique identifier for the service.
     * @param logger    (Optional) a logger function.
     * @param appspace  (Optional) an identifier for the app in which the
     *                  service runs; only needed when it is possible for
     *                  different instances of the same service to run
     *                  within different applications on the same machine.
     */
    constructor( id, logger, appspace ) {
        if( !id ) {
            throw new Error('Service ID is required');
        }
        this._id = id;
        this._logger = logger;
        this._appspace = appspace;
        this._events = [];
        this._messages = {};
        this._methods = {};
        this._initClient = () => {};
        this._initServer = () => {};
    }

    set events( events ) {
        this._events = events;
    }

    get events() {
        return this._events;
    }

    set messages( messages ) {
        this._messages = messages;
    }

    get messages() {
        return this._messages;
    }

    set methods( methods ) {
        this._methods = methods;
    }

    get methods() {
        return this._methods;
    }

    set initClient( fn ) {
        if( typeof fn != 'function' ) {
            throw new Error('IPCService: initClient must be a function');
        }
        this._initClient = fn;
    }

    set initServer( fn ) {
        if( typeof fn != 'function' ) {
            throw new Error('IPCService: initServer must be a function');
        }
        this._initServer = fn;
    }

    /**
     * Get a service instance in client mode.
     */
    get client() {
        // Return an async function to make the client instance.
        // This is done to allow the _initClient arg list to be exposed
        // as a property of the make function.
        const self = this;
        async function make() {
            if( !self._client ) {
                // Note that 'self' refers to the IPCService instance, whilst 'this'
                // will refer to the app backbone when invoked by the backbone.
                const clientID = self._id+'-client';
                const serverID = self._id+'-server';
                const client = new Client( clientID, serverID, self._logger, self._appspace );
                // Assign backbone to 'app' property of client.
                client.app = this;
                // Invoke client init function, passing dependencies as arguments..
                await self._initClient.apply( client, arguments );
                client.events = self._events;
                client.messages = Object.keys( self._messages );
                client.methods = self._methods;
                client.connect();
                self._client = client;
            }
            return self._client;
        }
        make[ArgListToken] = readArgNames('_initClient', this._initClient );
        return make;
    }

    /**
     * Get a service instance in server mode.
     */
    get server() {
        // Return an async function to make the client instance.
        // This is done to allow the _initServer arg list to be exposed
        // as a property of the make function.
        const self = this;
        async function make() {
            if( !self._server ) {
                // Note that 'self' refers to the IPCService instance, whilst 'this'
                // will refer to the app backbone when invoked by the backbone.
                const serverID = self._id+'-server';
                self._server = await self._makeServer('remote', serverID, this, arguments );
            }
            return self._server;
        }
        make[ArgListToken] = readArgNames('_initServer', this._initServer );
        return make;
    }

    /**
     * Get a service instance in standalone mode.
     */
    get service() {
        // Return an async function to make the client instance.
        // This is done to allow the _initServer arg list to be exposed
        // as a property of the make function.
        const self = this;
        async function make() {
            if( !self._service ) {
                // Note that 'self' refers to the IPCService instance, whilst 'this'
                // will refer to the app backbone when invoked by the backbone.
                self._service = await self._makeServer('local', self._id, this, arguments );
            }
            return self._service;
        }
        make[ArgListToken] = readArgNames('_initServer',  this._initServer );
        return make;
    }

    async _makeServer( mode, id, app, args ) {
        const server = new Server( id, this._logger, this._appspace );
        // Assign backbone to 'app' property of server.
        server.app = app;
        // Invoke server init function, passing dependencies as arguments.
        await this._initServer.apply( server, args );
        server.events = this._events;
        server.messages = this._messages;
        server.methods = this._methods;
        server.start( mode );
        return server;
    }
}

exports.IPCService = IPCService;

