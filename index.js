"use strict";

//Requires
const pgp = require('pg-promise')();
const escape = require('pg-escape');
const ms = require('ms');
const Promise = require('bluebird');

//Constants
const defaultOpts = {
    schema: "public",
    table: "session",
    create: true, //Create a new session table by default
    cleanupTime: ms('45 minutes')
};

module.exports = class PgSession {

    /**
     * Creates a new PgSession model for use with koa-session-generic
     * @param connection The connection string or object to be passed directly into the pg module
     * @param options A hash consisting of all optional keys {schema="public", table="session", create=true, cleanupTime = 45 minutes}
     * @constructor
     */
    constructor(connection, options) {

        //Create a PG client and store it in the object
        this.db = pgp(connection);

        //And store the session options
        this.options = Object.assign({}, defaultOpts, options);
    }

    /**
     * Starts the cleanup and creates the session tables if necessary
     * @returns A promise that resolves when the setup has completed
     */
    setup() {

        let sess = this;

        //If we need to create the tables, return a promise that resolves once the query completes
        if (this.options.create) {

            return Promise.coroutine(function *() {
                return yield sess.db.query(sess.createSql);
                //Then set up the table cleanup
            })().then(function () {
                sess.cleanup();
            });

        }

        //Otherwise just setup the cleanup and return an empty promise
        else {
            sess.cleanup();
            return Promise.resolve();
        }
    };

    /**
     * Gets a session object with the given sid
     * @param sid The Koa session ID
     * @returns The session object if it exists, otherwise false
     */

    *get(sid) {

        //Get the existing session row
        const existing = (yield this.db.query(this.getValueSql, [sid])).rows;

        //If there is no such row, return false
        if (existing.length <= 0)
            return false;
        //Otherwise return the row
        else
            return existing[0].session;
    };

    /**
     * Creates a new session or updates an existing one
     * @param sid The Koa session ID to set
     * @param sess The session date to insert into the session table
     * @param ttl The time to live, i.e. the time until the session expires
     */

    *set(sid, sess, ttl) {

        //If there is a row, update it
        if (yield this.get(sid))
            yield this.db.query(this.updateValueSql, [sess, ttl, sid]);

        //Otherwise, insert a new row
        //(These two queries intentionally have a different parameter order because of the SQL structure)
        else
            yield this.db.query(this.insertValueSql, [sid, sess, ttl]);
    };

    /**
     * Destroy the session with the given sid
     * @param sid The Koa session ID of the session to destroy
     */
    *destroy(sid) {
        yield this.db.query(this.destroyValueSql, [sid]);
    };

    /**
     * Setup cleanup of all sessions in the session table that have expired
     */
    cleanup() {
        let sess = this;

        //Each interval of cleanupTime, run the cleanup script
        setInterval(function () {
            Promise.coroutine(function *() {
                yield sess.db.query(sess.cleanupSql);
            });
        }, sess.options.cleanupTime);
    };

    /**
     * Get the raw SQL for creating a new session table
     */

    get createSql() {
        return escape(
            'CREATE SCHEMA IF NOT EXISTS %I;\n' +
            'CREATE TABLE IF NOT EXISTS %I.%I (\n' +
            '   id TEXT NOT NULL PRIMARY KEY,\n' + //This is the Koa session ID
            '   expiry timestamp NOT NULL,\n' + //This is the timestamp of when it will expire
            '   session JSON\n' + //All the session data that has been saved
            ');',
            this.options.schema,
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for getting an existing session
     */
    get getValueSql() {
        return escape(
            'SELECT session FROM %I.%I WHERE id = $1;',
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for updating an existing session
     */
    get updateValueSql() {
        return escape(
            "UPDATE %I.%I SET session = $1, expiry = (now() + $2 * interval '1 ms') WHERE id = $3;",
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for creating a new existing session
     */
    get insertValueSql() {
        return escape(
            "INSERT INTO %I.%I(id, session, expiry) VALUES($1, $2, (now() + $3 * interval '1 ms'));",
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for destroying an existing session
     */
    get destroyValueSql() {
        return escape(
            'DELETE FROM %I.%I WHERE id = $1;',
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for cleaning up expired sessions
     */
    get cleanupSql() {
        return escape(
            'DELETE FROM %I.%I WHERE expiry <= now();',
            this.options.schema,
            this.options.table
        );
    }
}