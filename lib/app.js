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

const EventEmitter = require('events').EventEmitter;
const InterfaceDef = require('./interface-def');

/// The app backbone.
class App extends EventEmitter {

    constructor() {
        super();
        // A map of intantiated services, keyed by service name.
        this.services = {};
    }
    /**
     * Add an event listener.
     * Event names may be qualifed by prefixing the event name with the name
     * of a service followed by a colon, followed by an event name (e.g.
     * 'serviceName:eventName'). This allows event listeners to be registered
     * with services through the backbone, without getting a direct reference
     * to the service.
     * Qualified event names may themselves be qualified (e.g. 's1:s2:event')
     * - this can make sense if the referenced service is itself a backbone.
     * An empty qualifier (e.g. ':event') refers directly to the backbone.
     * @param eventName A possibly qualified event name.
     * @param listener  An event callback function.
     * @param method    The listener method, either 'on' or 'once'.
     */
    _addEventListener( eventName, listener, method ) {
        // Check for a qualified event name with a ':' separator.
        let idx = eventName.indexOf(':');
        if( idx > 0 ) {
            // Lookup the event source.
            let sourceName = eventName.substring( 0, idx );
            let source = this.services[sourceName];
            if( source === undefined ) {
                // No event source currently bound, register a listener for a
                // service bind event using the event source name and try adding
                // the listener again when a service of the required name registers.
                const app = this;
                this.onServiceBind( sourceName, () => {
                    app._addEventListener( eventName, listener, method );
                });
                // Do no more.
                return;
            }
            // Check that the source is an event emitter.
            if( !(source instanceof EventEmitter) ) {
                throw new Error(`Event source must be an EventEmitter: ${sourceName}`);
            }
            // Strip the source name from the event name.
            eventName = eventName.substring( idx + 1 );
            // Invoke the required method on the source.
            source[method]( eventName, listener );
            // All done.
            return;
        }
        // Strip any ':' prefix from the event name.
        if( idx == 0 ) {
            eventName = eventName.substring( 1 );
        }
        // Call the required method on the super class.
        super[method]( eventName, listener );
    }
    /**
     * Bind a service instance to a specified name on the backbone.
     */
    bind( name, service ) {
        this.services[name] = service;
        this.emit('service-bind', { name, service });
    }
    /**
     * Add an event listener.
     */
    on( eventName, listener ) {
        this._addEventListener( eventName, listener, 'on');
    }
    /**
     * Add a once-off event listener.
     */
    once( eventName, listener ) {
        this._addEventListener( eventName, listener, 'once');
    }
    /**
     * Register a callback for a service bind event for a named service.
     * If the once argument is true then the callback is only invoked at most
     * once, the first time a service is registered under the specified name;
     * otherwise the callback is called each time a service is bound under the
     * specified name (which under normal usage will be only once anyway).
     */
    onServiceBind( name, callback, once = true ) {
        if( typeof name !== 'string' ) {
            throw new TypeError('Service name must be a string');
        }
        if( typeof callback !== 'function' ) {
            throw new TypeError('Service callback must be a function');
        }
        // Check whether the requested name is already bound to the backbone,
        // and is so then invoke the callback with the service.
        let service = this.services[name];
        if( service !== undefined ) {
            callback({ name, service });
            // If this is a once-off callback then we're all done here, return.
            if( once ) {
                return;
            }
        }
        // Create a handler function for the event.
        const app = this;
        const handler = event => {
            if( event.name === name ) {
                callback( event );
                if( once ) {
                    app.removeListener('service-bind', handler );
                }
            }
        };
        // Register the event handler.
        this.on('service-bind', handler );
    }
    /**
     * Return a list of services conforming to a specified interface.
     */
    listConformingServices( ifdef ) {
        const iftest = InterfaceDef.compile( ifdef );
        const { services } = this;
        return Object.keys( services )
            .filter( name => {
                let service = services[name];
                return iftest( service );
            });
    }
    /**
     * Register a callback for a service bind event for services conforming
     * to a specified interface definition.
     */
    onConformingServiceBind( ifdef, callback ) {
        if( typeof callback !== 'function' ) {
            throw new TypeError('Callback must be a function');
        }
        // Compile the interface defintion.
        const iftest = InterfaceDef.compile( ifdef );
        // Check for previously registered services which conform to the
        // required interface.
        let conforming = this.listConformingServices( iftest );
        const { services } = this;
        conforming.forEach( name => {
            let service = services[name];
            callback({ name, service });
        });
        // Register an event handler for service bind events.
        this.on('service-bind', event => {
            // Test whether the new service conforms to the specified interface,
            // pass to the callback function if it does.
            if( iftest( event.service ) ) {
                callback( event );
            }
        });
    }
}

/**
 * Return the list of argument names for a service factory function.
 * @param fn    A service factory function.
 * @param name  A service name.
 * @return A list of argument names.
 */
function readArgNames( fn, name ) {
    let src = fn.toString();
    // Test for function or lambda with list of args within parenthesis.
    // e.g. function( a, b ) { ... } or ( a, b ) => ...
    let r = /^(?:function(?:\s+\w+)?)?\s*\(([^)]+)/.exec( src );
    if( r ) {
        return r[1].split(',').map( a => a.trim() );
    }
    // Test for lamdba with single argument in no parenthesis e.g. a => ...
    r = /^(\w+)\s*=>/.exec( fns );
    if( r ) {
        return r[1].trim();
    }
    // Can't extract function arguments for some reason.
    throw new Error(`Can't read argument names of factory function for service '${name}'`);
}

/**
 * Load a service instance.
 * @param name      The name of the service being loaded.
 * @param def       Either the service instance (in which case the service
 *                  is already loaded and nothing more needs to be done); or
 *                  a factory function for instantiating the service. The
 *                  function may be synchronous or asynchronous.
 * @param app       The app backbone, populated with service instances
 *                  instantiated in previous, lower layers.
 * @return A promise resolving to the service instance.
 */
async function load( name, def, app ) {
    // Check if service is presented as a factory function.
    if( typeof def === 'function' ) {
        // Resolve the factory function's argument names, and convert to
        // instances of services which have been instantiated in lower
        // service layers.
        let args = readArgNames( name, def )
            .map( argName => {
                let arg = app.services[argName];
                if( arg === undefined ) {
                    throw new Error(`Unresolved dependency: '${argName}' for '${name}'`);
                }
                return arg;
            });
        // Call the factory function with its required services as its arguments.
        // Note that the app backbone is the 'this' argument.
        return await def.apply( app, args );
    }
    // The service definition is the service instance.
    return def;
}

/**
 * Start an app backbone by instantiating a series of service layers.
 * The app backbone is defined as a list of service layers, where a service
 * in a layer can be dependent on any service defined in a lower (ealier)
 * layer.
 * @param layers    A list of service layer definitions.
 * @param log       A logging object.
 * @return An app backbone; an object with instances of named services bound to it.
 */
async function start( layers, log ) {

    // Check that the layers arg is an array.
    if( !Array.isArray( layers ) ) {
        throw new TypeError('Service layers must be an array');
    }

    // Create the app backbone.
    const app = new App();

    // Iterate over the layer definitions.
    for( let idx = 0; idx < layers.length; i++ ) {

        log.debug(`Initializing layer ${idx}...`);

        let layer = layers[idx];

        // List the service names in the current layer.
        let names = Object.keys( layer );

        // Build a list of promises resolving to service instances from
        // the service definitions in the layer.
        let pending = names.map( name => {
            // Read the service definition.
            let def = layer[name];
            // Load the service instance from the definition.
            return load( name, def, app );
        });

        // Wait for all service instances to be resolved. Note that this
        // is done in parallel.
        let services = await Promise.all( pending );

        // Iterate over the resolved service instances and bind into
        // the app backbone.
        services.forEach( ( service, idx ) => {
            // Read the name corresponding to the current service.
            let name = names[idx];
            // Bind the service to the backbone.
            log.debug(`Binding ${name}...`);
            app.bind( name, service );
        });

    };

    // Return the backbone.
    return app;
}

exports.start = start;
