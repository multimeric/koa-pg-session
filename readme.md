# koa-pg-session

## Introduction

koa-pg-session is an implementation of a session store for koa's [generic session module](https://github.com/koajs/generic-session) that uses Postgres to hold the session data.

This module is ideal if you're already using Postgres as the database layer for your app, and you want to add a session store without adding another dependency like Redis.

## Usage

Install the module and the generic session module using `npm install koa-generic-session koa-pg-session`

Require these modules in your main koa module:

```javascript
var session = require('koa-generic-session');
var PgStore = require('koa-pg-session');
```

Use the session somewhere in your middleware:

```javascript
var app = require('koa')();
app.use(session({
    store: new PgStore("postgres://username:password@localhost/database")
}))
```

## Database Table

By default, the module will create a new table in the database called 'session', located in the public schema. This table has the schema:

```sql
CREATE TABLE IF NOT EXISTS <tablename>
    id TEXT NOT NULL PRIMARY KEY,
    expiry timestamp NOT NULL,
    session JSON
);
```

If a table with this name already exists, it will be connected to, and the module will assume that these three columns exist in the table, and will fail if they do not. However you can create a table with additional columns without issue.

You can also change the name of the table as explained in the [constructor](#constructor) section, meaning that the module will either create a table with a different name/schema, or it will use an already existing table with this name/schema.

## API

### Constructor

The koa-pg-session module returns a constructor function that takes two parameters.

```javascript
var PgStore = require('koa-pg-session');
new PgStore(connection, options);
```

#### connection

The first parameter, `connection`, is a connection object or connect string that will be passed *directly* into the pg module. As of the writing of this, `connection` can either be a connection string, e.g. `"postgres://username:password@localhost/database"`, or it can be a connection object, e.g.
```javascript
{
      user: 'brianc',
      password: 'boom!',
      database: 'test',
      host: 'example.com',
      port: 5313
}
```

For further information, see the [pg module's documentation](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback).

#### options

The second parameter, `options`, is an object consisting of all optional keys.

* `schema` String. defines the schema in which to create or find the table that we will use to store session data. Defaults to `public`
* `table` String. defines the name of the sessions table that we will create or find. Defaults to `session`
* `create` Boolean. True if the module is allowed to create a new table to store sessions. Defaults to `true`
* `cleanupTime` Number, in milliseconds. The amount of time between cleaning up the database for old sessions. Defaults to 162000000 (45 minutes)

### koa-generic-session options

Most of the customisation for this module is available through the options passed into the koa-generic-session module, which are [listed here](https://github.com/koajs/generic-session#options), for example we can allow empty sessions by using this middleware:

```javascript
app.use(session({
    store: new PgStore("postgres://username:password@localhost/database"),
    allowEmpty: true
}))
```

## Testing

You can test the module using `npm test`, or just `mocha`. The tests are located in test.js in the test directory.
