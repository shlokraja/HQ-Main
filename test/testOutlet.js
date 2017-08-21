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

describe('Outlet tests', function(){

  it('should return first outlet', function(done){
    supertest(app)
      .get('/outlet')
      .expect(200)
      .end(function (err, res){
        res.status.should.equal(200);
        var $ = cheerio.load(res.text);
        $("#outlets tr").length.should.be.above(0);
        done();
      });
  });

  it('should create a outlet', function(done){
    var createData = {
      name: 'outlet1',
      address: 'addr123',
      start_of_day: '05:00',
      end_of_day: '10:00',
      num_ordering_screens: 2,
      num_live_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash,card'
    };
    supertest(app)
      .post('/outlet/create')
      .send(createData)
      .expect(302)
      .end(function (err, res){
        res.status.should.equal(302);
        res.get('Location').should.equal('/outlet?create=true');

        pg.connect(conString, function(err, client, pgdone) {

          if(err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(err));
            done();
          }

          client.query('SELECT * from outlet \
              WHERE name=\'outlet1\' and address=\'addr123\' \
              and start_of_day=\'05:00\'', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var outlet_id = result.rows[0].id;
            result.rows[0].active.should.equal(true);
            result.rows[0].name.should.equal('outlet1');
            result.rows[0].num_ordering_screens.should.equal(2);
            result.rows[0].payment_methods.should.equal('{cash,card}');

            client.query('DELETE from outlet\
              where id={}'.format(outlet_id), function(err, result){
                pgdone(client);
                should.not.exist(err);
                done();
            });

          });

        });
      });

  });

  it('should create a outlet without optional params', function(done){
    var createData = {
      name: 'outlet1',
      address: 'addr123',
      start_of_day: '05:00',
      num_ordering_screens: 4,
      num_live_ordering_screens: 4,
      end_of_day: '10:00',
      payment_methods: 'cash,card'
    };
    supertest(app)
      .post('/outlet/create')
      .send(createData)
      .expect(302)
      .end(function (err, res){
        res.status.should.equal(302);
        res.get('Location').should.equal('/outlet?create=true');

        pg.connect(conString, function(err, client, pgdone) {

          if(err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(err));
            done();
          }

          client.query('SELECT * from outlet \
              WHERE name=\'outlet1\' and address=\'addr123\' \
              and start_of_day=\'05:00\'', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var outlet_id = result.rows[0].id;
            result.rows[0].name.should.equal('outlet1');
            result.rows[0].payment_methods.should.equal('{cash,card}');
            should.not.exist(result.rows[0].active);

            client.query('DELETE from outlet\
              where id={}'.format(outlet_id), function(err, result){
                pgdone(client);
                should.not.exist(err);
                done();
            });

          });

        });
      });

  });

  it('should fail to create a outlet because of missing params', function(done){
    var createData = {
      name: 'outlet1',
      address: 'addr123',
      num_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash,card'
    };
    supertest(app)
      .post('/outlet/create')
      .send(createData)
      .expect(500)
      .end(function (err, res){
        console.log(res.text);
        res.status.should.equal(500);
        res.text.should.equal('error running queryerror: null value in column "start_of_day" violates not-null constraint');
        done();
      });

  });

  it('should fail to create a outlet because #live screens > #screens', function(done){
    var createData = {
      name: 'outlet1',
      address: 'addr123',
      start_of_day: '05:00',
      end_of_day: '10:00',
      num_ordering_screens: 4,
      num_live_ordering_screens: 7,
      payment_methods: 'cash,card'
    };
    supertest(app)
      .post('/outlet/create')
      .send(createData)
      .expect(500)
      .end(function (err, res){
        console.log(res.text);
        res.status.should.equal(500);
        res.text.should.equal('error running queryerror: new row for relation "outlet" violates check constraint "num_screen_constraint"');
        done();
      });

  });

  it('should update a outlet', function(done){
    var updateData = {
      name: 'outlet2',
      address: 'addr234',
      start_of_day: '05:00',
      end_of_day: '10:00',
      num_ordering_screens: 2,
      num_live_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash'
    };
    pg.connect(conString, function(err, client, pgdone) {

      if(err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(err));
        done();
      }
      client.query('SELECT id from outlet LIMIT 1', function(err, result){
        should.not.exist(err);
        var outlet_id = result.rows[0].id;

        supertest(app)
        .post('/outlet/update/'+outlet_id)
        .send(updateData)
        .expect(302)
        .end(function (err, res){
          console.log(res.text);
          res.status.should.equal(302);
          res.get('Location').should.equal('/outlet?update=true');

          client.query('SELECT name, address, end_of_day from outlet \
              WHERE id={}'.format(outlet_id), function(err, result) {
            pgdone(client);
            should.not.exist(err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('outlet2');
            result.rows[0].address.should.equal('addr234');
            result.rows[0].end_of_day.should.equal('10:00:00');
            done();
          });

        });
      });

    });

  });

  it('should update an outlet without optional params', function(done){
    var updateData = {
      name: 'outlet2',
      address: 'addr234',
      num_ordering_screens: 4,
      num_live_ordering_screens: 2,
      start_of_day: '05:00',
      end_of_day: '10:00',
      payment_methods: 'cash'
    };
    pg.connect(conString, function(err, client, pgdone) {

      if(err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(err));
        done();
      }
      client.query('SELECT id from outlet LIMIT 1', function(err, result){
        should.not.exist(err);
        var outlet_id = result.rows[0].id;

        supertest(app)
        .post('/outlet/update/'+outlet_id)
        .send(updateData)
        .expect(302)
        .end(function (err, res){
          console.log(res.text);
          res.status.should.equal(302);
          res.get('Location').should.equal('/outlet?update=true');

          client.query('SELECT name, address, end_of_day from outlet \
              WHERE id='+outlet_id, function(err, result) {
            pgdone(client);
            should.not.exist(err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('outlet2');
            result.rows[0].address.should.equal('addr234');
            result.rows[0].end_of_day.should.equal('10:00:00');
            should.not.exist(result.rows[0].num_ordering_screens);
            should.not.exist(result.rows[0].active);
            done();
          });

        });
      });

    });

  });

  it('should fail to update a outlet because of missing params', function(done){
    var updateData = {
      name: 'outlet2',
      address: 'addr234',
      num_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash'
    };
    pg.connect(conString, function(err, client, pgdone) {

      if(err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(err));
        done();
      }
      client.query('SELECT id from outlet LIMIT 1', function(err, result){
        should.not.exist(err);
        var outlet_id = result.rows[0].id;

        supertest(app)
        .post('/outlet/update/'+outlet_id)
        .send(updateData)
        .expect(500)
        .end(function (err, res){
          console.log(res.text);
          res.status.should.equal(500);
          res.text.should.equal('error running queryerror: null value in column "start_of_day" violates not-null constraint');
          done();

        });
      });

    });

  });

  it('should not update any outlet because of out-of-range id', function(done){
    var updateData = {
      name: 'outlet2',
      address: 'addr234',
      num_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash'
    };
    var outlet_id = 999;

    supertest(app)
    .post('/outlet/update/{}'.format(outlet_id))
    .send(updateData)
    .expect(302)
    .end(function (err, res){
      console.log(res.text);
      res.status.should.equal(302);
      res.text.should.equal('Moved Temporarily. Redirecting to /outlet?update=true');
      done();

    });

  });

  it('should fail to update any outlet because of bad id', function(done){
    var updateData = {
      name: 'outlet2',
      address: 'addr234',
      num_ordering_screens: 2,
      num_live_ordering_screens: 2,
      active: 't',
      payment_methods: 'cash'
    };
    var outlet_id = 'notbad';

    supertest(app)
    .post('/outlet/update/{}'.format(outlet_id))
    .send(updateData)
    .expect(500)
    .end(function (err, res){
      console.log(res.text);
      res.status.should.equal(500);
      res.text.should.equal('error running queryerror: invalid input syntax for integer: "notbad"');
      done();

    });

  });

  it('should marks all po barcodes for scanner failure', function(done){
    var outlet_id = 2;
    var barcodes = [
      'CH004DHW004Q181220161800',
      'CH004DHW004Q181220161800',
      'CH004DHW004Q181220161800',
      'CH004DHW004Q181220161800'
    ];

    supertest(app)
    .post('/outlet/force_failure')
    .send({outlet_id:outlet_id, barcodes:barcodes, fail_all:true, misc_notes:null})
    .expect(200)
    .end(function (err, res){
      if(err){
        console.error(err);
      }
      done();
    });
  });
});
