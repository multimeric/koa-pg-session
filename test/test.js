"use strict";

//Require calls//

require('co-mocha');
const PgSession = require("../index");
/**
 * Load the connection data from a local config file.
 * Whoever is running this test must provide this config file, which must export a JS object/be a JSON file
 * that contains the connection data for a postgres database.
 * e.g. module.exports = {
    user: 'brianc',
    password: 'boom!',
    database: 'test',
    host: 'example.com',
    port: 5313
};
 */
const connection = require('./config');
const pgp = require('pg-promise')();
const db = pgp(connection);
const ms = require('ms');
const Promise = require('bluebird');
const assert = require('assert');
const co = Promise.coroutine;

//Mini server dependencies
const koa = require('koa');
const request = require('request-promise');
const generic = require('koa-generic-session');

//Utility functions//

/**
 * Returns true if the given table exists
 * @param table An object of the form {schema, table} that refers to a specific table to check
 */
function* tableExists(table) {
    return (yield db.query(`
               SELECT COUNT(*) > 0 as exists
               FROM   information_schema.tables
               WHERE  table_schema = $[schema]
               AND    table_name = $[table]
            `, table))[0].exists;
}

/**
 * Deletes the schema containing the given table object
 * @param tableObject
 * @returns {*}
 */
function deleteSchema(tableObject) {
    return db.query(`DROP SCHEMA ${tableObject.schema} CASCADE`);
}

//The location to put the test table
const sampleTable = {
    table: 'sampleTable',
    schema: '__koa_pg_session_test'
};

//Common Constants//
const sampleID = "123";
const values = {a: 1, b: 2};

//Tests//

describe('constructor', ()=> {
    it('should default to the correct options', () => {
        assert.deepEqual(new PgSession(connection).options, PgSession.defaultOpts);
    });

    it('should throw an error if no connection details are given', done=> {
        try {
            new PgSession();
            done(new Error("No exception thrown"))
        }
        catch (ex) {
            done();
        }
    });
});

describe('#setup method', () => {

    it('should return a promise no matter if create=true or false', done => {
        let noCreate = new PgSession(connection, Object.assign({create: false}, sampleTable)).setup();
        let create = new PgSession(connection, Object.assign({create: true}, sampleTable)).setup();

        assert(typeof noCreate.then == "function" && typeof create.then == "function");
        create.then(()=> {
            return deleteSchema(sampleTable);
        }).then(()=> {
            done();
        });
    });

    it('should create a table and schema with the correct names if create=true', done => {

        //Make the session
        let session = new PgSession(connection, Object.assign({create: true}, sampleTable));

        //Now wait for it to finish, then test to see if it's in the database
        co(function*() {
            if (yield* tableExists(sampleTable))
                done(new Error("Table already exists: delete it then re-run the test"));

            yield session.setup();

            //If the table exists, everything's working, but also delete it to clean up
            let exists = yield* tableExists(sampleTable);
            if (exists) {
                yield deleteSchema(sampleTable);
                done();
            }
            else
                done(new Error("Table not created"));
        })();
    });

    it('should not create a table if create=false', done => {

        //Make the session
        let session = new PgSession(connection, Object.assign({create: false}, sampleTable));

        //Now wait for it to finish, then test to see if it's in the database
        co(function*() {
            if (yield* tableExists(sampleTable))
                done(new Error("Table already exists: delete it then re-run the test"));

            yield session.setup();

            //If the table exists, that's bad!
            if (yield* tableExists(sampleTable))
                done(new Error("Table was created"));
            else
                done();
        })();
    });
});

describe('#get #set, and #destroy (public interface) functions', ()=> {
    const session = new PgSession(connection, Object.assign({create: true}, sampleTable));
    const otherValues = {c: 3, d: 4};
    const expiryTime = ms("45 minutes");

    before(function (done) {
        //First we have to setup the session
        session.setup().then(()=> {
            done();
        })
    });

    after(function (done) {
        //Once we're done, delete the table
        deleteSchema(sampleTable).then(() => {
            done();
        });
    });

    it('should set and be able to retrieve data', done => {
        co(function*() {

            //Check that we can create a new session object
            yield* session.set(sampleID, values, expiryTime);
            assert.deepEqual(yield* session.get(sampleID), values);
            done();
        })();
    });

    it('should update existing session data', done => {
        co(function*() {

            //Check that we can update it
            yield* session.set(sampleID, otherValues, expiryTime);
            assert.deepEqual(yield* session.get(sampleID), otherValues);
            done();
        })();
    });

    it('should not return a result after deleted', done => {
        co(function*() {

            //Check that we can destroy it
            yield* session.destroy(sampleID);
            assert.deepEqual(yield* session.get(sampleID), false);
            done();
        })();
    });
});

describe('Automatic cleanup', ()=> {
    const session = new PgSession(connection, Object.assign({create: true}, sampleTable));
    const expiryTime = 100;

    before(function (done) {
        //First we have to setup the session manager
        session.setup().then(()=> {
            done();
        })
    });

    after(function (done) {
        //Once we're done, delete the table
        deleteSchema(sampleTable).then(() => {
            done();
        });
    });

    it("should still exist before the expiry time has passed", function (done) {
        co(function*() {
            yield* session.set(sampleID, values, expiryTime);

            //Before the expiry time (at 50ms, when the expiry is 100ms), the session should still be there
            setTimeout(()=> {
                co(function*() {
                    assert((yield* session.get(sampleID)) !== false);
                    done();
                })();

            }, 50);
        })();
    });

    it("should be deleted after the expiry time has passed", function (done) {
        co(function*() {
            yield* session.set(sampleID, values, expiryTime);

            //After the expiry time (at 150ms when the expiry is 100ms), the session should be deleted
            setTimeout(()=> {
                co(function*() {
                    const sess = yield* session.get(sampleID);
                    assert(sess === false);
                    done();
                })();
            }, 150);
        })();
    });

    //Checks that the cleanup function is being called regularly
    it("should continue to run the cleanup function", function (done) {

        co(function*() {

            //Create the first session
            yield* session.set(sampleID, values, expiryTime);

            //Every 200ms, check that the old session is deleted, and add a new one
            let counter = 0;
            const iid = setInterval(() => {

                //Check the old session has gone
                co(function*() {
                    const sess = yield* session.get(sampleID);
                    assert(sess === false);
                })();

                //Increment the counter and quit when we're done
                counter++;
                if (counter >= 4) {
                    done();
                    clearInterval(iid);
                } else {
                    //Add a new session if we're not going to quit
                    co(function*() {
                        yield* session.set(sampleID, values, expiryTime);
                    })();
                }
            }, 200);
        })();
    });
});

describe("Compatibility with koa and koa-generic sessions", ()=> {
    const session = new PgSession(connection, Object.assign({create: true}, sampleTable));

    before(function (done) {
        //First we have to setup the session manager
        session.setup().then(()=> {
            done();
        })
    });

    after(function (done) {
        //Once we're done, delete the table
        deleteSchema(sampleTable).then(() => {
            done();
        });
    });

    it("Should persist data between sessions", function (done) {
        this.timeout(0);

        //Make a little koa server
        const app = koa();
        app.keys = ['keys', 'keykeys'];
        app.use(generic({
            store: session
        }));

        //Whenever we visit the server, update the counter and display the current count
        app.use(function *() {
            this.body = this.session.test++;
        });

        app.listen(3000);

        //Check that the counter is working
        co(function*() {
            let opts = {url: 'http://localhost:3000/', jar: true};
            assert((yield request(opts)) === "null");
            assert((yield request(opts)) === "0");
            assert((yield request(opts)) === "1");
            assert((yield request(opts)) === "2");
            done();
        })();

    });
});

describe('custom client option', ()=> {
    const pg = require('co-pg')(require('pg'));
    const client = new pg.Client(connection);

    it('Correctly creates a new table with a custom client', done=> {

        co(function*() {
            //Connect to the custom client
            yield client.connectPromise();

            //Make a session manager which uses co-pg instead
            const session = new PgSession((query, args)=> {
                return client.queryPromise(query, args)
            }, Object.assign({create: true}, sampleTable), true);

            yield session.setup();

            //If the table exists, everything's working, but also delete it to clean up
            let exists = yield* tableExists(sampleTable);
            if (exists) {
                yield deleteSchema(sampleTable);
                done();
            }
            else
                done(new Error("Table not created"));
        })();
    });
});