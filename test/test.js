var assert = require("assert");
var sinon = require("sinon");
var Promise = require('bluebird');
var PgSession = require("../index");

describe('PgSession constructor', function () {

    //Sandbox everything
    var sandbox;
    beforeEach(function () {
        sandbox = sinon.sandbox.create();
    });

    afterEach(function () {
        sandbox.restore();
    });

    it('should always start the cleanup process', function (done) {

        //Spy on the cleanup method and make the query a stub that returns a promise
        var cleanup = sandbox.stub(PgSession.prototype, "cleanup");
        sandbox.stub(PgSession.prototype, "query").returns(Promise.resolve());

        //Call the constructor with create: true and create: false
        new PgSession("", {create: true});
        new PgSession("", {create: false});

        setTimeout(function () {
            assert(cleanup.calledTwice);
            done();
        }, 0);

    });

    it("should run the create table SQL if create: true", function (done) {
        var qry = sandbox.stub(PgSession.prototype, "query").returns(Promise.resolve());

        new PgSession("", {create: true});

        setTimeout(function () {
            assert(qry.called);
            done();
        }, 0);
    });

});

//describe('query method', function () {
//
//    const pg = require('co-pg')(require('pg'));
//
//});