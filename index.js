"use strict";

//Requires
const escape = require('pg-escape');
const ms = require('ms');
const Promise = require('bluebird');
const EventEmitter = require('events');
const pgp = require('pg-promise')({
    promiseLib: Promise
});

module.exports = class PgSession extends EventEmitter {

    /**
     * Creates a new PgSession model for use with koa-session-generic
     * @param connection The connection string or object to be passed directly into the pg module
     * @param options A hash consisting of all optional keys {schema="public", table="session", create=true, cleanupTime = 45 minutes}
     * @constructor
     */
    constructor(connection, options) {

        super();

        //If they want to use an existing client they must pass in a function to process each query.
        // Their function must return a promise.
        if (typeof connection === "function")
            this.query = connection;

        //If they don't want to use an existing client, make our own connection to the database and use that for queries
        else {
            this.db = pgp(connection);
            this.query = (query, params)=> {
                return this.db.query(query, params);
            }
        }

        //By default say that we're not ready to create sessions
        this.ready = false;

        //And store the session options
        this.options = Object.assign({}, PgSession.defaultOpts, options);
    }

    static get defaultOpts() {
        return {
            schema: "public",
            table: "session",
            create: true, //Create a new session table by default
            cleanupTime: ms("45 minutes")
        };
    }

    /**
     * Starts the cleanup, and creates the session table if necessary
     * @returns {*} A promise that resolves when the setup has completed
     */
    setup() {

        //Only setup if we're not ready
        if (this.ready)
            return;

        //If we need to create the tables, return a promise that resolves once the query completes
        //Otherwise just setup the cleanup and return an empty promise
        let promise = this.options.create ? this.query(this.createSql) : Promise.resolve();

        //Once we've finished creation, schedule cleanup and tell everyone we're ready
        return promise.then(()=> {
            this.scheduleCleanup();
            this.ready = true;
            this.emit('connect');
        });
    };

    /**
     * Gets a session object with the given sid
     * @param sid The Koa session ID
     * @returns The session object if it exists, otherwise false
     */

    *get(sid) {

        if (!this.ready)
            throw new Error(`Error trying to access koa postgres session: session setup has not been run.
            See https://github.com/TMiguelT/koa-pg-session#the-setup-function for details.`);

        //Get the existing session row
        const existing = (yield this.query(this.getValueSql, [sid]));

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
     * @param ttl The time to live, i.e. the time until the session expires. Defaults to 45 minutes
     */

    *set(sid, sess, ttl) {

        if (!this.ready)
            throw new Error(`Error trying to modify koa postgres session: session setup has not been run.
            See https://github.com/TMiguelT/koa-pg-session#the-setup-function for details.`);

        ttl = ttl || ms("45 minutes");
        const expiry = (Date.now() + ttl) / 1000;

        //If there is a row, update it
        if (yield* this.get(sid))
            yield this.query(this.updateValueSql, [sess, expiry, sid]);

        //Otherwise, insert a new row
        //(These two queries intentionally have a different parameter order because of the SQL structure)
        else
            yield this.query(this.insertValueSql, [sid, sess, expiry]);
    };

    /**
     * Destroy the session with the given sid
     * @param sid The Koa session ID of the session to destroy
     */
    *destroy(sid) {
        yield this.query(this.destroyValueSql, [sid]);
    };

    /**
     * Setup cleanup of all sessions in the session table that have expired
     */
    scheduleCleanup() {
        let sess = this;

        //Each interval of cleanupTime, run the cleanup script
        setTimeout(function interval() {
            sess.query(sess.cleanupSql, Date.now() / 1000).then(()=> {
                //Recurse so that the cleanupTime can be dynamic
                setTimeout(interval, sess.options.cleanupTime);
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
            "UPDATE %I.%I SET session = $1, expiry = to_timestamp($2) WHERE id = $3;",
            this.options.schema,
            this.options.table
        );
    }

    /**
     * Get the raw SQL for creating a new existing session
     */
    get insertValueSql() {
        return escape(
            "INSERT INTO %I.%I(id, session, expiry) VALUES($1, $2, to_timestamp($3) );",
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
            'DELETE FROM %I.%I WHERE expiry <= to_timestamp($1);',
            this.options.schema,
            this.options.table
        );
    }
};
