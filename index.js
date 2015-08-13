"use strict";

//Requires
const co = require('co');
const pg = require('co-pg')(require('pg'));
const merge = require('merge');
const escape = require('pg-escape');
const ms = require('ms');

//Constants
const defaultOpts = {
    schema: "public",
    table: "session",
    create: true, //Create a new session table by default
    cleanupTime: ms('45 minutes')
};

/**
 * Creates a new PgSession model for use with koa-session-generic
 * @param connection The connection string or object to be passed directly into the pg module
 * @param options A hash consisting of all optional keys {schema="public", table="session", create=true, cleanupTime = 45 minutes}
 * @constructor
 */
function PgSession(connection, options) {

    //Save the parameters to the object
    this.connection = connection;
    this.options = merge(defaultOpts, options);

    //If we need to create a table, do so asynchronously
    let sess = this;
    if (this.options.create) {
        co(function *() {
            return yield sess.query(sess.createSql);
        //Then set up the table cleanup
        }).then(function () {
            sess.cleanup();
        });

    }

    //Otherwise just setup the cleanup
    else
        sess.cleanup();
}

/**
 * Runs an SQL query asynchronously, using generators
 * @param sql The raw SQL to use as the query
 * @param params Bound parameters to be used in the query
 */
PgSession.prototype.query = function *(sql, params) {

    let client, done;
    if (this.connection.client && this.connection.done) {
        //Connect using a koa-pg client pool
        client = this.connection.client;
        done = this.connection.done;
    } else {
        //or build our own by passing the connection settings to co-pg
        const connectionResults = yield pg.connectPromise(this.connection);
        client = connectionResults[0];
        done = connectionResults[1];
    }

    //Run the query, return the client to the pool, then return the query result
    const result = yield client.queryPromise(sql, params);
    done();
    return result;
};

/**
 * Gets a session object with the given sid
 * @param sid The Koa session ID
 * @returns The session object if it exists, otherwise false
 */
PgSession.prototype.get = function *(sid) {

    //Get the existing session row
    const existing = (yield this.query(this.getValueSql, [sid])).rows;

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
PgSession.prototype.set = function *(sid, sess, ttl) {

    //If there is a row, update it
    if (yield this.get(sid))
        yield this.query(this.updateValueSql, [sess, ttl, sid]);

    //Otherwise, insert a new row
    //(These two queries intentionally have a different parameter order because of the SQL structure)
    else
        yield this.query(this.insertValueSql, [sid, sess, ttl]);
};

/**
 * Destroy the session with the given sid
 * @param sid The Koa session ID of the session to destroy
 */
PgSession.prototype.destroy = function *(sid) {
    yield this.query(this.destroyValueSql, sid);
};

/**
 * Setup cleanup of all sessions in the session table that have expired
 */
PgSession.prototype.cleanup = function () {
    let sess = this;

    //Each interval of cleanupTime, run the cleanup script
    setInterval(function () {
        co(function *() {
            yield sess.query(sess.cleanupSql);
        });
    }, sess.options.cleanupTime);
};

/**
 * Get the raw SQL for creating a new session table
 */
Object.defineProperty(PgSession.prototype, "createSql", {
    get: function myProperty() {
        return escape(
            'CREATE TABLE IF NOT EXISTS %I.%I (\n' +
            '   id TEXT NOT NULL PRIMARY KEY,\n' + //This is the Koa session ID
            '   expiry timestamp NOT NULL,\n' + //This is the timestamp of when it will expire
            '   session JSON\n' + //All the session data that has been saved
            ');',
            this.options.schema,
            this.options.table
        );
    }
});

/**
 * Get the raw SQL for getting an existing session
 */
Object.defineProperty(PgSession.prototype, "getValueSql", {
    get: function myProperty() {
        return escape(
            'SELECT session FROM %I.%I WHERE id = $1;',
            this.options.schema,
            this.options.table
        );
    }
});

/**
 * Get the raw SQL for updating an existing session
 */
Object.defineProperty(PgSession.prototype, "updateValueSql", {
    get: function myProperty() {
        return escape(
            "UPDATE %I.%I SET session = $1, expiry = (now() + $2 * interval '1 ms') WHERE id = $3;",
            this.options.schema,
            this.options.table
        );
    }
});

/**
 * Get the raw SQL for creating a new existing session
 */
Object.defineProperty(PgSession.prototype, "insertValueSql", {
    get: function myProperty() {
        return escape(
            "INSERT INTO %I.%I(id, session, expiry) VALUES($1, $2, (now() + $3 * interval '1 ms'));",
            this.options.schema,
            this.options.table
        );
    }
});

/**
 * Get the raw SQL for destroying an existing session
 */
Object.defineProperty(PgSession.prototype, "destroyValueSql", {
    get: function myProperty() {
        return escape(
            'DELETE FROM %I.%I WHERE id = $1;',
            this.options.schema,
            this.options.table
        );
    }
});

/**
 * Get the raw SQL for cleaning up expired sessions
 */
Object.defineProperty(PgSession.prototype, "cleanupSql", {
    get: function myProperty() {
        return escape(
            'DELETE FROM %I.%I WHERE expiry <= now();',
            this.options.schema,
            this.options.table
        );
    }
});

//Export the PgSession class since everything is attached to it and its prototype
module.exports = PgSession;
