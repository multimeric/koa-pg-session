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
var pgStore = new PgStore("postgres://username:password@host:port/database");
app.use(session({
    store: pgStore
}));
```

Run the setup function:
```javascript
pgStore.setup().then(function(){
    app.listen(3000);
});
```

And you can then access and modify session data in your koa web app:

```javascript
//Whenever we visit the server, update a counter variable in the session and render it as JSON
app.use(function *() {
    this.body = this.session.counter++;
});
```

### The Setup Function

Note that this function is new since version 2.0. `setup()` must be called before session use as it is needed to
connect to the database, create the session table (if required), and schedule the table cleanup.

`setup()` returns a promise, allowing you to wait for setup to finish before starting your application
(as above). While doing this is recommended, you don't need to wait for setup: you can just call `pgStore.setup()`
and proceed with your application code without caring about when it's finished, but you'll need to hope no sessions
will be created in the next few seconds.

## Database Table

By default, the module will create a new table in the database called 'session', located in the public schema. This table has the schema:

```sql
CREATE TABLE IF NOT EXISTS public.session
    id TEXT NOT NULL PRIMARY KEY,
    expiry timestamp NOT NULL,
    session JSON
);
```

If a table with this name already exists, it will be connected to, and the module will assume that these three columns exist in the table, and will fail if they do not. However you can create a table with additional columns without issue.

You can also change the name of the table as explained in the [constructor options](#options) section, meaning that the module will either create a table with a different name/schema, or it will use an already existing table with this name/schema.

## API

### Constructor

The koa-pg-session module returns a constructor function that takes two parameters, `connection` and `options`:

```javascript
var PgStore = require('koa-pg-session');
new PgStore(connection, options);
```

#### connection

The first parameter, `connection`, can be two entirely different things.

 *  The normal option is to treat `connection` as a connection object or connect string that will be passed *directly*
    into the pg-promise module. As of the writing of this, `connection` can either be a connection string:

    ```javascript
    "postgres://username:password@host:port/database"
    ```

    Or it can be a connection object, e.g.

    ```javascript
    {
          user: 'postgres',
          password: 'password',
          database: 'postgres',
          host: 'localhost',
          port: 5432
    }
    ```

    If you are using this option, see the [pg module's documentation](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback).

 *  The other option, if you have an existing client for your postgres database, is to pass in a function
    that will transfer the queries to your client. The function must have the signature (query, parameters),
    where `query` is a string optionally containing dollar sign parameters ($1, $2 for example), and `parameters` is an
    array of values to replace these dollar signs with.

    This function must return a promise (and if it doesn't already, make sure you promisify it!), as in the example below.

    For example if you wanted to use an existing co-pg client (even though this library no longer uses co-pg internally),
    you could create a PgStore like this:

    ```javascript
    new PgSession(function(query, args){
        return client.queryPromise(query, args)
    }, {create: true});
    ```

#### options

The second parameter, `options`, is an object consisting of all optional keys.

* `schema` (string): defines the schema in which to create or find the table that we will use to store session data. Defaults to `public`
* `table` (string): defines the name of the sessions table that we will create or find. Defaults to `session`
* `create` (boolean): True if the module is allowed to create a new table to store sessions. Defaults to `true`
* `cleanupTime` (number, in milliseconds): The amount of time between cleaning up the database for old sessions. Defaults to 2700000 (45 minutes)

### koa-generic-session options

Additional session customisation is available through the options passed into the koa-generic-session module, which are [listed here](https://github.com/koajs/generic-session#options), for example we can allow empty sessions by using this middleware:

```javascript
app.use(session({
    store: new PgStore("postgres://username:password@host:port/database"),
    allowEmpty: true
}))
```

## Testing

You can test the module using `npm test`, or just `mocha`. The tests are located in test.js in the test directory.

Note that the tests now require an actual postgres server to run, and so you have to create a JS file or JSON file called
config.js or config.json that exports a connection object which can be used to connect to this postgres server.
The specifications for this object are explained [above](#connection).

The tests will create a new schema called '__koa_pg_session_test' during the tests in the database you supply, but this
will be removed once the tests have finished.
