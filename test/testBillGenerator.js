/* global require it describe */
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var format = require('string-format');
var assert = require('assert');
var bill_generator_utils = require('../routes/bill_generator_utils');


describe('Bill Generator tests', function() {

  it('tests fv bill bundle generation', function(done) {
    supertest(app)
    .get('/generatebill/fv/2016-02-09/8/6/bills.pdf')
    .expect(200)
    .end(function(err, res){
      console.error(err);
      done();
    });
  });

  it('tests outlet bill bundle generation', function(done) {
    supertest(app)
    .get('/generatebill/outlet/2016-02-08/6/bills.pdf')
    .expect(200)
    .end(function(err, res) {
      console.error(err);
      done();
    });
  });
});

