var assert = require("assert");
var sinon = require("sinon-es6");
var Promise = require('bluebird');
var proxyquire = require('proxyquire');
var PgSession = require("../index");
require('co-mocha');


//Sandbox everything always
var sandbox;
beforeEach(function () {
    sandbox = sinon.sandbox.create();
});

afterEach(function () {
    sandbox.restore();
});

describe('PgSession constructor', function () {

    it('should start the cleanup when create=true', function (done) {

        //Spy on the cleanup method and make the query a stub that returns a promise
        var cleanup = sandbox.stub(PgSession.prototype, "cleanup");
        sandbox.stub(PgSession.prototype, "query").returns(new Promise(function () {
            done();
        }));

        //Call the constructor with create: true and create: false
        new PgSession("", {create: true});
    });

    it('should start the cleanup when create=false', function (done) {

        //Spy on the cleanup method and make the query a stub that returns a promise
        var cleanup = sandbox.stub(PgSession.prototype, "cleanup");

        //Call the constructor with create: true and create: false
        new PgSession("", {create: false});
        assert(cleanup.called);
        done();
    });


    it("should run the create table SQL if create=true", function (done) {
        sandbox.stub(PgSession.prototype, "query", function (arg) {
            if (arg.indexOf("CREATE TABLE") == -1)
                done(new Error());
            else
                done();
        });

        new PgSession("", {create: true});
    });

});

describe('#query method', function () {

    const pg = require('co-pg')(require('pg'));
    var opts = {
        some: "var",
        other: "value"
    };
    var fakeSession = {
        options: opts
    };

    it("should connect to the database with the given input options", function () {
        sandbox.mock(pg).expects("connectPromise").once().withArgs(opts);
        PgSession.prototype.query.call(fakeSession);
    });

    it("should query with the values passed in", function *(done) {
        var sql = "SOME SQL";
        var params = [1, "Fred"];
        var stub = sinon.stub().returns(Promise.resolve());

        var MockedPgSession = proxyquire("../index", {
            "co-pg": function (pg) {
                //Add the connectPromise method
                pg = require('co-pg')(pg);

                //Then stub it
                sandbox.stub(pg, "connectPromise").returns(Promise.resolve(
                    [
                        {
                            queryPromise: stub
                        },
                        sinon.stub()
                    ]));

                return pg;
            }
        });

        yield MockedPgSession.prototype.query.call(fakeSession, sql, params);

        try {
            assert(stub.calledOnce && stub.alwaysCalledWith(sql, params));
        }
        catch (e) {
            done(e)
        }

        done();

    });
});

describe("#get method", function (done) {

    it("should call #query", function *(done) {
        var proxy = {
            getValueSql: "",
            query: function () {
                done();
            }
        };

        yield PgSession.prototype.get.call(proxy);
    });

    it("should return false if no rows were returned", function *(done) {
        var proxy = {
            getValueSql: "",
            query: function *() {
                return {rows: []};
            }
        };

        var res = yield PgSession.prototype.get.call(proxy);
        if (res === false)
            done();
        else
            done(new Error());
    })
});

describe("#set method", function () {
    var update = "UPDATE";
    var insert = "INSERT";
    var fakeSession = {
        updateValueSql: update,
        insertValueSql: insert
    };

    it("should update an existing row if it exists", function *(done) {
        //Pretend that the row already exists
        fakeSession.get = function () {
            return Promise.resolve(true);
        };

        //When query is run, make sure it's with the right SQL
        fakeSession.query = function (sql) {
            if (sql === update)
                done();
            else
                done(new Error());
        };

        yield PgSession.prototype.set.call(fakeSession);
    });

    it("should insert a existing row if it doesn't already exist", function *(done) {
        //Pretend that the row doesn't already exist
        fakeSession.get = function () {
            return Promise.resolve(false);
        };

        //When query is run, make sure it's with the right SQL
        fakeSession.query = function (sql) {
            if (sql === insert)
                done();
            else
                done(new Error());
        };

        yield PgSession.prototype.set.call(fakeSession);
    });
});

describe("#destroy method", function () {
    it("calls #query with an SQL DELETE statement", function *(done) {
        var del = "DELETE";
        var fakeSession = {
            destroyValueSql: del,
            query: function (sql) {
                if (sql === del)
                    done();
                else
                    done(new Error());
            }
        };

        yield PgSession.prototype.destroy.call(fakeSession);
    });
});

describe("#cleanup method", function () {
    it("calls #query after the cleanupTime interval", function *(done) {
        var time = 2;
        var cleanup = "DELETE";
        var spy = sinon.spy();

        var fakeSession = {
            options: {
                cleanupTime: time
            },
            query: spy,
            cleanupSql: cleanup
        };

        setTimeout(function () {
            if (spy.called && spy.alwaysCalledWith(cleanup))
                done();
            else
                done(new Error());
        }, time * 2);

        yield PgSession.prototype.cleanup.call(fakeSession);
    });
});

describe("SQL Properties", function () {

    var fakeSession = Object.create(PgSession.prototype);
    fakeSession.options = {
        schema: "public",
        table: "session"
    };

    describe("createSql property", function () {
        it("needs to have a CREATE TABLE statement", function () {
            assert(fakeSession.createSql.indexOf("CREATE TABLE") != -1);
        });
    });

    describe("getValueSql property", function () {
        it("needs to have a SELECT statement", function () {
            assert(fakeSession.getValueSql.indexOf("SELECT") != -1);
        });
    });

    describe("updateValueSql property", function () {
        it("needs to have an UPDATE statement", function () {
            assert(fakeSession.updateValueSql.indexOf("UPDATE") != -1);
        });
    });

    describe("insertValueSql property", function () {
        it("needs to have an INSERT statement", function () {
            assert(fakeSession.insertValueSql.indexOf("INSERT") != -1);
        });
    });

    describe("destroyValueSql property", function () {
        it("needs to have a DELETE statement", function () {
            assert(fakeSession.destroyValueSql.indexOf("DELETE FROM") != -1);
        });
    });

    describe("cleanupSql property", function () {
        it("needs to have a DELETE statement", function () {
            assert(fakeSession.cleanupSql.indexOf("DELETE FROM") != -1);
        });
    });
});