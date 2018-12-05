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

const IPC = require('node-ipc').IPC;
const Log = require('log4js').getLogger('ipc');

const DefaultLogger = function() {
    console.log.apply( console.log, arguments );
}

// Create an IPC instance using standard system config.
function make( id, logger = DefaultLogger, appspace = 'understruct' ) {
    let ipc = new IPC();
    ipc.config.id = id;
    ipc.config.appspace = appspace;
    ipc.config.retry = 1000;
    ipc.config.logger = logger;
    return ipc;
}

exports.make = make;
