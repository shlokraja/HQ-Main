/*global require $ it describe console*/
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var pg = require('pg');
var format = require('string-format');
var cheerio = require('cheerio');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

describe('Restaurant tests', function(){
  it('should return first restaurant', function(done){

    supertest(app)
      .get('/restaurant')
      .expect(200)
      .end(function (err, res){
        res.status.should.equal(200);
        var $ = cheerio.load(res.text);
        $("#restaurants tr").length.should.be.above(0);
        done();
      });
  });

  it('should create a restaurant', function(done){
    var createData = {
      name: 'rest1',
      address: 'some addr',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      account_no: 9927455,
      neft_code: 'HDFC08023',
      bank_name: 'HDFC bank',
      branch_name: 'mg road branch',
      active: 't'
    };
    supertest(app)
      .post('/restaurant/create')
      .send(createData)
      .expect(302)
      .end(function (req_err, res){
        console.log(res.text);
        res.status.should.equal(302);
        res.get('Location').should.equal('/restaurant?create=true');

        pg.connect(conString, function(pg_err, client, pgdone) {

          if(pg_err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(pg_err));
            done();
          }

          client.query('SELECT * from restaurant \
              WHERE name=\'rest1\' and address=\'some addr\' \
              and phone_no=929424', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var restaurant_id = result.rows[0].id;
            result.rows[0].active.should.equal(true);
            result.rows[0].name.should.equal('rest1');
            result.rows[0].account_no.should.equal('9927455');

            client.query('DELETE from restaurant\
              where id=' + restaurant_id, function(query_err, result){
                pgdone(client);
                should.not.exist(query_err);
                done();
            });

          });

        });
      });

  });

  it('should create a restaurant without some optional params', function(done){
    var createData = {
      name: 'rest1',
      address: 'some addr',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      branch_name: 'mg road branch',
      active: 't'
    };
    supertest(app)
      .post('/restaurant/create')
      .send(createData)
      .expect(302)
      .end(function (req_err, res){
        res.status.should.equal(302);
        res.get('Location').should.equal('/restaurant?create=true');

        pg.connect(conString, function(pg_err, client, pgdone) {

          if(pg_err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(pg_err));
            done();
          }

          client.query('SELECT * from restaurant \
              WHERE name=\'rest1\' and address=\'some addr\' \
              and phone_no=929424', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var restaurant_id = result.rows[0].id;
            result.rows[0].active.should.equal(true);
            result.rows[0].name.should.equal('rest1');
            result.rows[0].tin_no.should.equal(929833);
            should.not.exist(result.rows[0].bank_name);

            client.query('DELETE from restaurant\
              where id=' + restaurant_id, function(query_err, result){
                pgdone(client);
                should.not.exist(query_err);
                done();
            });

          });

        });

      });

  });

  it('should fail to create a restaurant without reqd. params', function(done){
    var createData = {
      name: 'rest1',
      address: 'some addr',
      contact_name: 'I have no name',
      account_no: 3498485,
      st_no: 9892824,
      tin_no: 929833,
      branch_name: 'mg road branch',
      active: 't'
    };
    supertest(app)
      .post('/restaurant/create')
      .send(createData)
      .expect(500)
      .end(function (err, res){
        console.log(res.text);
        res.status.should.equal(500);
        res.text.should.equal('error running queryerror: null value in column "phone_no" violates not-null constraint');
        done();
      });

  });

  it('should update a restaurant', function(done){
    var updateData = {
      name: 'rest2',
      address: 'addr2',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      account_no: 9927455,
      neft_code: 'HDFC08023',
      bank_name: 'HDFC bank',
      branch_name: 'mg road branch',
      active: 't'
    };
    pg.connect(conString, function(pg_err, client, pgdone) {

      if(pg_err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(pg_err));
        done();
      }
      client.query('SELECT id from restaurant LIMIT 1', function(err, result){
        should.not.exist(err);
        var restaurant_id = result.rows[0].id;

        supertest(app)
        .post('/restaurant/update/' + restaurant_id)
        .send(updateData)
        .expect(302)
        .end(function (req_err, res){
          console.log(res.text);
          res.status.should.equal(302);
          res.get('Location').should.equal('/restaurant?update=true');

          client.query('SELECT name, address, phone_no from restaurant \
              WHERE id={}'.format(restaurant_id), function(query_err, result) {
            pgdone(client);
            should.not.exist(query_err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('rest2');
            result.rows[0].address.should.equal('addr2');
            result.rows[0].phone_no.should.equal(929424);
            done();
          });

        });
      });

    });

  });

  it('should update a restaurant without optional params', function(done){
    var updateData = {
      name: 'rest2',
      address: 'addr2',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      account_no: 9927455,
      active: 't'
    };
    pg.connect(conString, function(pg_err, client, pgdone) {
      if(pg_err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(pg_err));
        done();
      }
      client.query('SELECT id from restaurant LIMIT 1', function(err, result){
        should.not.exist(err);
        var restaurant_id = result.rows[0].id;

        supertest(app)
        .post('/restaurant/update/{}'.format(restaurant_id))
        .send(updateData)
        .expect(302)
        .end(function (req_err, res){
          res.status.should.equal(302);
          res.get('Location').should.equal('/restaurant?update=true');

          client.query('SELECT name, address, account_no from restaurant \
              WHERE id={}'.format(restaurant_id), function(query_err, result) {
            pgdone(client);
            should.not.exist(query_err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('rest2');
            result.rows[0].address.should.equal('addr2');
            result.rows[0].account_no.should.equal('9927455');
            should.not.exist(result.rows[0].bank_name);
            should.not.exist(result.rows[0].branch_name);
            done();
          });

        });
      });

    });

  });


  it('should update a restaurant without optional integer params', function(done){
    var updateData = {
      name: 'rest2',
      address: 'addr2',
      contact_name: 'I have no name',
      phone_no: 929424,
      account_no: 9927455,
      neft_code: 'HDFC08023',
      bank_name: 'HDFC bank',
      branch_name: 'mg road branch',
      active: 't'
    };
    pg.connect(conString, function(pg_err, client, pgdone) {

      if(pg_err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(pg_err));
        done();
      }
      client.query('SELECT id from restaurant LIMIT 1', function(err, result){
        should.not.exist(err);
        var restaurant_id = result.rows[0].id;

        supertest(app)
        .post('/restaurant/update/{}'.format(restaurant_id))
        .send(updateData)
        .expect(302)
        .end(function (req_err, res){
          res.status.should.equal(302);
          res.get('Location').should.equal('/restaurant?update=true');

          client.query('SELECT * from restaurant \
              WHERE id={}'.format(restaurant_id), function(query_err, result) {
            pgdone(client);
            should.not.exist(query_err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('rest2');
            result.rows[0].address.should.equal('addr2');
            result.rows[0].account_no.should.equal('9927455');
            result.rows[0].bank_name.should.equal('HDFC bank');
            result.rows[0].branch_name.should.equal('mg road branch');
            should.not.exist(result.rows[0].st_no);
            should.not.exist(result.rows[0].tin_no);
            done();
          });

        });
      });

    });

  });

  it('should not update any restaurant because of out-of-range id', function(done){
    var updateData = {
      name: 'rest2',
      address: 'addr2',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      account_no: 9927455,
      neft_code: 'HDFC08023',
      bank_name: 'HDFC bank',
      branch_name: 'mg road branch',
      active: 't'
    };
    var restaurant_id = 999;

    supertest(app)
    .post('/restaurant/update/{}'.format(restaurant_id))
    .send(updateData)
    .expect(302)
    .end(function (err, res){
      console.log(res.text);
      res.status.should.equal(302);
      res.text.should.equal('Moved Temporarily. Redirecting to /restaurant?update=true');
      done();

    });

  });

  it('should fail to update a restaurant because of bad id', function(done){
    var updateData = {
      name: 'rest2',
      address: 'addr2',
      contact_name: 'I have no name',
      phone_no: 929424,
      st_no: 9892824,
      tin_no: 929833,
      account_no: 9927455,
      neft_code: 'HDFC08023',
      bank_name: 'HDFC bank',
      branch_name: 'mg road branch',
      active: 't'
    };
    var restaurant_id = 'notbad';

    supertest(app)
    .post('/restaurant/update/{}'.format(restaurant_id))
    .send(updateData)
    .expect(500)
    .end(function (err, res){
      res.status.should.equal(500);
      res.text.should.equal('error running queryerror: invalid input syntax for integer: "notbad"');
      done();

    });

  });

});
