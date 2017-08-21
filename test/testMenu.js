/*global require it describe*/
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var format = require('string-format');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

describe('Menu tests', function(){

  it('should return error because of no query string', function(done){
    supertest(app)
      .get('/menu')
      .expect(500)
      .end(function (err, res){
        done();
      });
  });

});
