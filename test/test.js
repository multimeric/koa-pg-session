"use strict";

require('co-mocha');
const PgSession = require("../index");
const Promise = require('bluebird');

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

/**
 * Created by miguel on 21/11/15.
 */
describe('PgSession constructor', () => {

    /**
     * Returns true if the given table exists
     * @param table An object of the form {schema, table} that refers to a specific table to check
     */
    function* tableExists(table){
        return (yield db.query(`
               SELECT COUNT(*) > 0 as exists
               FROM   information_schema.tables
               WHERE  table_schema = $[schema]
               AND    table_name = $[table]
            `, table))[0].exists;
    }

    //The location to put the test table
    const sampleTable = {
        table: 'sampleTable',
        schema: '__koa_pg_session_test'
    };

    it('should create a table and schema with the correct names if create=true', done => {

        //Make the session
        let session = new PgSession(connection, Object.assign({create: true}, sampleTable));

        //Now wait for it to finish, then test to see if it's in the database
        Promise.coroutine(function*() {
            if (yield* tableExists(sampleTable))
                done(new Error("Table already exists: delete it then re-run the test"));

            yield session.setup();

            console.log(session.createSql);

            //If the table exists, everything's working, but also delete it to clean up
            let exists = yield* tableExists(sampleTable);
            console.log(`Exists? ${exists}`);
            if (exists) {
                yield db.query(`DROP SCHEMA ${sampleTable.schema} CASCADE`);
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
        Promise.coroutine(function*() {
            if (yield* tableExists(sampleTable))
                done(new Error("Table already exists: delete it then re-run the test"));

            yield session.setup();

            //If the table exists, everything's working, but also delete it to clean up
            if (yield* tableExists(sampleTable)) {
                done(new Error("Table was created"));
            }
            else
                done();
        })();
    });
});