/* global require it describe */
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var format = require('string-format');
var assert = require('assert');
var reports_utils = require('../routes/reports_utils');


describe('FV reports', function() {
  it('tests daily supply and issues report', function(done) {
    supertest(app)
    .get('/fv_reports/1/2/2015-12-23/daily_supply_and_issues.pdf')
    .expect(200)
    .end(function(err, res){
      console.log("Done testing");
      console.error(err);
      done();
    });
  });

  it('tests item pricing report', function(done) {
    supertest(app)
    .get('/fv_reports/4/2/2015-12-23/item_pricing.pdf')
    .expect(200)
    .end(function(err, res){
      console.log("Done testing");
      console.error(err);
      done();
    });
  });
});