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

/// Property value type tests.
const Tests = {
    // Test that a value is a function.
    'function': value => typeof value === 'function',
    // Test that a value is an object.
    'object':   value => typeof value === 'object',
    // Test that a value is an array.
    'array':    value => Array.isArray( value ),
    // Test that a value is a string.
    'string':   value => typeof value === 'string',
    // Test that a value is a number.
    'number':   value => typeof value === 'number',
    // Test that a value is a boolean.
    'boolean':  value => typeof value === 'boolean'
}

/**
 * Compile an interface definition.
 * An interface is defined by specifying the name and type of one or
 * more properties of the interface. For example, the following defines
 * an interface with one function property, one object property and one
 * array property:
 *
 *      {
 *          "method":       "function",
 *          "property1":    "object",
 *          "property2":    "array"
 *      }
 *
 * Interfaces may also be defined as an array of required property names,
 * so the definition:
 *
 *      [ "property1", "property2" ]
 *
 * Is equivalent to the definition:
 *
 *      {
 *          "property1":    "object",
 *          "property2":    "object"
 *      }
 */
function compile( ifdef ) {
    // Check for a previously compiled interface definition.
    if( ifdef.__IsIFDef ) {
        return ifdef;
    }
    // If interface defintion is given as an array then convert to 
    // object format.
    if( Array.isArray( ifdef ) ) {
        ifdef = ifdef.reduce( ( def, item ) => {
            def[item] = 'object';
            return def;
        }, {});
    }
    else if( typeof ifdef !== 'object' ) {
        throw new Error('Bad interface definition');
    }
    // Generate a test for each property in the interface definition.
    const tests = Object.keys( ifdef )
        .map( name => {
            // Read the required property type.
            const type  = ifdef[name];
            // Lookup a test for the type.
            const isa = test( type, name );
            // Return a function to apply the test to an object.
            return obj => isa( obj[name] );
        });
    // Return a function for applying all property tests to an object.
    function iftest( obj ) {
        return tests.reduce( ( ok, test ) => (ok && test( obj )), true );
    }
    iftest.__IsIFDef = true;
    return iftest;
}

/// Construct a value type test for a named property.
function test( type, name ) {
    if( typeof type === 'string' ) {
        // Convert a type definition like 'object' to a function performing the test.
        let isa = Tests[type];
        // Make sure we have a test.
        if( isa === undefined ) {
            throw new Error(`Unsupported type '${type}' for property '${name}'`);
        }
        return isa;
    }
    // Type definition is a nested compound type.
    const isa = compile( type );
    return obj => obj !== undefined && isa( obj );
}

exports.compile = compile;
