/* global require it describe */
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var format = require('string-format');
var assert = require('assert');
var reports_utils = require('../routes/reports_utils');


describe('HQ reports', function() {
  it('tests monthly transporter liability report', function(done) {
    supertest(app)
    .get('/hq_reports/01/2016/transporter_monthly_liability.pdf')
    .expect(200)
    .end(function(err, res){
      console.log("Done testing");
      console.error(err);
      done();
    });
  });
});