# understruct
> A microservice backbone for Node.js supporting intra-service discovery and cross-process services.

# Installation

Install via npm:

```
npm install understruct
```

# Overview

_understruct_ is a library which allows complex Node.js applications to be built as a collection of different discrete services, each implementing well-defined subsets of the application's total functionalityand. _understruct_ provides an architecture for building microservice applications which supports the following capabilities:

* __Service instantiation__: _understruct_ provides a standard pattern for instantaiting services when the application is started.
* __Service discovery__: _understruct_ provides a number of mechanisms by which a service can resolve dependencies on other services on the backbone.
* __Cross-process services__: _understruct_ allows services to be split into _client_ and _server_ components, where the _server_ component implements the service's functionality and runs in a separate process, whilst the _client_ is a stub component which runs local to the dependent code and communicates with the server over IPC.

# Service instantiation

Services are presented to _understruct_ in one of two ways:

* As pre-instantiated _service objects_, which will be bounded to a name by _understruct_ - this is useful mainly for static objects such as system configurations.
* As _factory functions_ which return an instantiated service object. Factory functions can be either synchronous or asynchronous.

A simple service pattern is for the service module to export the factory function, e.g.:

```
module.exports = function( ... ) {
    // ... instantiate and return the service ...
}
```

Each service is presented with a _name_ which the instantiated service will be bound to on the backbone, and which can be used for service discovery, for example:

```
{
    'db': require('./db') // 'db' module exports a factory function
}
```

# Service discovery

Service discovery is the process by which one service's dependency on another service is resolved. Service dependencies are normally expressed as a list of _service names_ that the dependent service requires.

## Service layers

To aid service discovery, _understruct_ organises the different services in an application into _service layers_. Services in lower layers are instantiated before services in higher layers, and, generally, services in higher layers have dependencies only on services in lower layers.

Example:

```
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

Backwards dependencies are declared in the argument list of a service's factory function by listing the names of the required services. _understruct_ will resolve the service instances before invoking the factory function, throwing an error if any service can't be resolved on the specified name.

```
function make( settings, db ) {

    // 'settings' and 'db' are now bound to 
    // instances of the named services.

    // ... instantiate the service ...
    const service = new Service( settings, db );
    return service;
}
```

Note that the factory function is invoked as a method of the backbone so the service instances are also available through the `this` keyword, meaning that the following is roughly equivalent to the previos code:

```
function make() {
    const { settings, db } = this;
    const service = new Service( settings, db );
    return service;
}
```

## Forward dependencies

It's not always possible to organize services so that all dependencies are backwards facing, so _understruct_ provides a mechanism for a service to request a dependency on a service in a higher layer which hasn't been instantiated yet. This can be done using the _onServiceBind_ method on the backbone instance. A service or factory function can call the method, passing it the name of a required service, and a callback function which will be invoked when the service is available. The dependent service can then use the callback to resolve its dependency. The callback will also work if the named service has already been bound when _onServiceBound_ is called.

Note that when instantiating a service with forward dependencies that by necessity the service's factory function must return the service instance in an incomplete state - i.e. without all its dependencies resolved.

Example:

```
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

Service dependencies can also be expressed using a _conforming interface_ definition instead of a name - i.e. the dependency is resolved by any service which provides a specified interface.

Interface definitions can be simply expressed as a list of named properties which a service must provide:

```
['getTime','setTime']
```

More precise definitions can be expressed by specifying the expected types of each property, e.g.:

```
{
    'getTime': 'function',
    'setTime': 'function'
}
```

The _onConfirmingServiceBind_ backbone method can be used to register a callback:

```
function make( db ) {

    const service = new Service( db );
    const timerIF = {
        'getTime': 'function',
        'setTime': 'function'
    };
    this.onConformingServiceBind( timerIF, ( timer ) => {
        service.timer = timer;
    });
    return service;
}
```

# Cross-process services

_understruct_ supports multi-process applications, where a service running in one process can be accessed by client services running in seperate processes using IPC. Cross-process services are implemented as instances of the _IPCService_ class.

## Client and server

Every IPC service has a _client_ and _server_ component. The _client_ component is a service stub which acts as the local instance of a remote service, forwards _message calls_ from the client to the server, and receives _events_ raised by the server. The _service_ component implements the actual service logic.

## Messages

Service _messages_ are similar to methods but are intended for remote invocation. Messages are defined as message handler functions bound to message names:

```
    let service = new IPCService('timer');
    service.messages = {
        'setTime': function( time ) {
            // ...
        }
    };
```

Messages can be sent from a client stub by calling the message name as a method on the stub:

```
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

# Licence

Copyright 2018 Julian Goacher. Licenced under __[Apache-2.0][Lic]__.

