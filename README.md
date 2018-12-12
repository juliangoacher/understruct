# understruct
> A microservice backbone for Node.js supporting intra-service discovery and cross-process services.

# Installation

Install via npm:

```
npm install understruct
```

# Overview

_understruct_ is a library which allows complex Node.js applications to be built as a collection of different discrete services, each implementing well-defined subsets of the application's total functionality.

_understruct_ provides an architecture for building microservice applications which supports the following capabilities:

* __Service instantiation__: _understruct_ provides a standard pattern for instantaiting services when the application is started.
* __Service discovery__: _understruct_ provides a number of mechanisms by which a service can resolve dependencies on other services on the backbone.
* __Cross-process services__: _understruct_ allows services to be split into _client_ and _server_ components, where the _server_ component implements the service's functionality and runs in a separate process, whilst the _client_ is a stub component which runs local to the dependent code and communicates with the server over IPC.

# Basic usage

Use _understruct_ by starting a backbone instance with the backbone configuration:

```javascript
    const understruct = require('understruct');

    async function run() {
        let app = await understruct.start([
            {
                'settings': require('./settings')
            },
            { 
                'db': require('./db')
            },
            {
                'http': require('./http')
            }
        ]);
        
        return app;
    }

    run();
```

The backbone configuration is a list of _service layers_. Each service layer contains one or more service instances bound to a service name. See the following sections for more information.

# Service instantiation

Services are presented to _understruct_ in one of two ways:

* As pre-instantiated _service objects_ - this is useful mainly for static objects such as system configurations.
* As _factory functions_ which return an instantiated service object. Factory functions can be either synchronous or asynchronous.

A simple service pattern is for the service module to export the factory function, e.g.:

```javascript
module.exports = function( ... ) {
    // ... instantiate and return the service ...
}
```

Each service is presented with a _name_ which the service will be bound to on the backbone:

```javascript
{
    'db': require('./db') // 'db' module exports a factory function
}
```

The name can then be used later for service discovery by other services with a dependency on the named service.

# Service discovery

Service discovery is the process by which a service's dependencies on other services are resolved. Service dependencies are normally expressed as a list of _service names_ that the dependent service requires.

## Service layers

To aid service discovery, _understruct_ organises an application's different services into _service layers_. Services in lower layers are instantiated before services in higher layers, and, generally, services in higher layers have dependencies only on services in lower layers.

### Example

```javascript
[
    {
        // Layer 0 - application settings
        'settings': require('./settings')
    },
    {
        // Layer 1 - DB layer
        'db': require('./db')
    },
    {
        // Layer 2 - HTTP layer - dependent on db and settings.
        'http': require('./http')
    }
]
```

## Backward dependencies

The standard type of service dependency is a _backwards_ dependency, where a service in one layer has a dependency on a named service in a lower, previously-instantiated layer.

Backwards dependencies are declared in the argument list of a service's factory function by listing the names of the required services. _understruct_ will resolve the service instances before invoking the factory function.

```javascript
function make( settings, db ) {

    // 'settings' and 'db' are instances of the named services.

    // ... instantiate the service ...
    const service = new Service( settings, db );
    return service;
}
```

In the example above, _understruct_ will extract the names of the dependent services - _settings_ and _db_ - from the factory function's argument list and look for services under thoses names on the backbone. This requires that services were bound to those names in previous, lower service layers of the backbone. If an instantiated service can't be found bound to any particular name then backbone instantation will be stopped and an error will be thrown.

Services are bound to their name on the `services` property of the _understruct_ backbone instance, which is available to factory functions through the `this` keyword. This means that service instances can also be accessed as named properties of the backbone, and so the following code is roughly equivalent to the previous example:

```javascript
function make() {
    const { settings, db } = this.services;
    const service = new Service( settings, db );
    return service;
}
```

## Forward dependencies

It's not always possible to organize services so that all dependencies are backwards directed, so _understruct_ provides a mechanism for a service to request a dependency on a service in a higher layer which hasn't been instantiated yet. This can be done using the `onServiceBind` method on the backbone instance. A service or factory function can call the method, passing it the name of a required service, together with a callback function which will be invoked when the service becomes available. The dependent service can then use the callback to resolve its dependency. The callback will also work if the named service has already been bound when `onServiceBind` is called.

Note that when instantiating a service with forward dependencies that, by necessity, the service's factory function must return the service instance in an incomplete state - i.e. without all its dependencies resolved.

### Example

```javascript
function make() {

    // Instantiate the service.
    const service = new Service();

    // Request dependency notification
    // Note that 'this' is the understruct backbone.
    this.onServiceBind('db', ( db ) => {
        service.db = db;
    });

    // Return the service instance.
    return service;
}
```

## Conforming-interface dependencies

Service dependencies can also be expressed using a _conforming interface_ definition instead of a name - i.e. the dependency is resolved by any service which provides the specified interface.

Interface definitions can be simply expressed as a list of named properties which a service must provide:

```javascript
['getTime','setTime']
```

More exact definitions can be expressed by specifying the expected types of each property, e.g.:

```javascript
{
    'getTime': 'function',
    'setTime': 'function'
}
```

The `onConfirmingServiceBind` backbone method can be used to register a callback:

``` javascript
function make( db ) {

    const service = new Service( db );

    // The interface definition - a service with getTime and setTime methods.
    const timerIF = {
        'getTime': 'function',
        'setTime': 'function'
    };

    // Register the callback.
    this.onConformingServiceBind( timerIF, ( timer ) => {
        service.timer = timer;
    });

    return service;
}
```

# Cross-process services

Node.js applications are normally single-threaded and run in a single process. _understruct_ supports multi-process applications, where a service running in one process can be accessed by client services running in seperate processes, with the two processes communicating using IPC. Cross-process services are implemented as instances of the `IPCService` class.

## Client and server

Every IPC service has a _client_ and _server_ component. The _client_ component is a service stub which acts as the local instance of a remote service, forwards _message calls_ from the client to the server, and receives _events_ raised by the server. The _service_ component implements the actual service logic.

## Messages

Service _messages_ are similar to methods but are intended for remote invocation. Messages are defined as message handler functions bound to message names:

```javascript
    let service = new IPCService('timer');
    service.messages = {
        'setTime': function( time ) {
            // ...
        }
    };
```

Messages can be sent from a client stub by calling the message name as a method on the stub:

```javascript
function make( timer ) {
    // 'timer' is a client stub
    timer.setTime('12:34');
    // ... etc ...
}
```

In the code above, `timer` is an IPC service client stub, and calling its `setTime(...)` method sends a `setTime` message to the server component, where it is handled by the message function in the previous example.

Just like normal methods, message calls can also return values; all message calls are _asynchronous_ and return a promise which resolves to the return value once received from the remote server.

Message arguments and values must be serializable over IPC, so it is generally best to use JSON safe values.

## Events

All IPC services are event emitters. Server components can raise events using the `emit(...)` method. Code can register for events by binding listeners to a client component using its `on(...)` method.

## Instantiation

The client and server components of a service should be instantiated on different backbone instances running within different processes.

For example, if the `timer` module implements and exports an `IPCService` instance then the server can be bound on the backbone as follows:

```javascript
understruct.start([
    {
        'timer': require('./timer').server
    }
]);
```

The client stub can be bound on a separate backbone instance as follows:

```javascript
understruct.start([
    {
        'timer': require('./timer').client
    }
]);
```

If the client/server setup isn't needed, then the service can be run in standalone mode where both the client and server run together in the same process:

```javascript
understruct.start([
    {
        'timer': require('./timer').service
    }
]);
```

(Note that IPC isn't used in standalone mode.)

To support this style of usage, the `IPCService` class is designed to be instantiated synchronously so that it can be returned as a module export. If a service needs to perform asynchronous operations as part of its setup then these can be deferred from service initialization to service startup using the `initClient` and `initServer` properties of the `IPCService` instance, for example:

```javascript
    const service = new IPCService();
    service.initServer = async function( db ) {
        // ... async startup ...
    };
    module.exports = service;
```

Note that service dependencies can be declared through the `initClient` or `initServer` argument list, as with normal module initialization. Unlike normal module initialization, the `this` keyword within an `initClient` or `initServer` call refers to the `IPCService` client or server instance being initialized; however, the backbone can be accessed from within these functions using the `app` property (e.g. `this.app`).

# Licence

Copyright 2018 Julian Goacher.

Licenced under the Apache 2.0 OSS licence.

