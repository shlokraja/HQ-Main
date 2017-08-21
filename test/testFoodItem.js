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

describe('Food item tests', function(){

  it('should return first food item', function(done){
    supertest(app)
      .get('/food_item')
      .expect(200)
      .end(function (err, res){
        res.status.should.equal(200);
        var $ = cheerio.load(res.text);
        $("#food_items tr").length.should.be.above(0);
        done();
      });
  });

  it('should create a food_item', function(done){
    var createData = {
      name: 'food_item1',
      item_tag: 'HOLL-343',
      restaurant_id: 1,
      outlet_id: 1,
      expiry_time: '5h',
      veg: 't',
      location: 'dispenser',
      side_order: 'put something on top',
      category: 'staple',
      batch_num: 45,
      packaging_cost: 4509,
      production_cost: 46,
      purchase_price: 59,
      selling_price: 966,
      mrp: 978,
      service_tax_percent: 78,
      vat_percent: 5,
    };
    supertest(app)
      .post('/food_item/create')
      .send(createData)
      .expect(302)
      .end(function (err, res){
        res.status.should.equal(302);
        res.get('Location').should.equal('/');

        pg.connect(conString, function(err, client, pgdone) {

          if(err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(err));
            done();
          }

          client.query('SELECT * from food_item \
              WHERE name=\'food_item1\' and restaurant_id=1 \
              and outlet_id=1 and purchase_price=59', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var food_item_id = result.rows[0].id;
            result.rows[0].name.should.equal('food_item1');
            result.rows[0].category.should.equal('staple');
            result.rows[0].outlet_id.should.equal(1);
            result.rows[0].expiry_time.should.equal('5h');

            client.query('DELETE from food_item\
              where id={}'.format(food_item_id), function(err, result){
                pgdone(client);
                should.not.exist(err);
                done();
            });

          });

        });
      });

  });

  it('should create a food_item without optional params', function(done){
    var createData = {
      name: 'food_item1',
      item_tag: 'HOLL-343',
      restaurant_id: 1,
      outlet_id: 1,
      expiry_time: '5h',
      veg: 't',
      location: 'dispenser',
      category: 'staple',
      batch_num: 45,
      packaging_cost: 4509,
      mrp: 978,
      service_tax_percent: 78,
      vat_percent: 5,
    };
    supertest(app)
      .post('/food_item/create')
      .send(createData)
      .expect(302)
      .end(function (err, res){
        res.status.should.equal(302);
        res.get('Location').should.equal('/');

        pg.connect(conString, function(err, client, pgdone) {

          if(err) {
            pgdone(client);
            console.error('error fetching client from pool- {}'.format(err));
            done();
          }

          client.query('SELECT * from food_item \
              WHERE name=\'food_item1\' and restaurant_id=1 \
              and outlet_id=1 and batch_num=45', function(err, result) {
            should.not.exist(err);

            result.rows.length.should.equal(1);
            var food_item_id = result.rows[0].id;
            result.rows[0].name.should.equal('food_item1');
            result.rows[0].category.should.equal('staple');
            result.rows[0].outlet_id.should.equal(1);
            result.rows[0].expiry_time.should.equal('5h');
            should.not.exist(result.rows[0].production_cost);
            should.not.exist(result.rows[0].selling_price);

            client.query('DELETE from food_item\
              where id={}'.format(food_item_id), function(err, result){
                pgdone(client);
                should.not.exist(err);
                done();
            });

          });

        });
      });

  });

  it('should fail to create a food_item because of missing params', function(done){
    var createData = {
      name: 'food_item1',
      restaurant_id: 1,
      outlet_id: 2,
    };
    supertest(app)
      .post('/food_item/create')
      .send(createData)
      .expect(500)
      .end(function (err, res){
        console.log(res.text);
        res.status.should.equal(500);
        res.text.should.equal('error running queryerror: null value in column "expiry_time" violates not-null constraint');
        done();
      });

  });

  it('should update a food_item', function(done){
    var updateData = {
      name: 'food_item1',
      restaurant_id: 1,
      item_tag: 'HOLL-3999',
      outlet_id: 1,
      expiry_time: '5h',
      veg: 't',
      location: 'dispenser',
      side_order: 'this is a different side order',
      category: 'staple',
      batch_num: 45,
      packaging_cost: 4509,
      production_cost: 46,
      purchase_price: 59,
      selling_price: 966,
      mrp: 978,
      service_tax_percent: 78,
      vat_percent: 5,
    };
    pg.connect(conString, function(err, client, pgdone) {

      if(err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(err));
        done();
      }
      client.query('SELECT id from food_item LIMIT 1', function(err, result){
        should.not.exist(err);
        var food_item_id = result.rows[0].id;

        supertest(app)
        .post('/food_item/update/'+food_item_id)
        .send(updateData)
        .expect(302)
        .end(function (err, res){
          console.log(res.text);
          res.status.should.equal(302);
          res.get('Location').should.equal('/');

          client.query('SELECT * from food_item \
              WHERE id={}'.format(food_item_id), function(err, result) {
            pgdone(client);
            should.not.exist(err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('food_item1');
            result.rows[0].restaurant_id.should.equal(1);
            result.rows[0].expiry_time.should.equal('5h');
            result.rows[0].vat_percent.should.equal(5);
            done();
          });

        });
      });

    });

  });

  it('should update an food_item without optional params', function(done){
    var updateData = {
      name: 'food_item1',
      item_tag: 'HOLL-343',
      restaurant_id: 1,
      outlet_id: 1,
      expiry_time: '5h',
      veg: 't',
      location: 'dispenser',
      category: 'staple',
      batch_num: 45,
      packaging_cost: 4509,
      mrp: 978,
      service_tax_percent: 78,
      vat_percent: 5,
    };
    pg.connect(conString, function(err, client, pgdone) {

      if(err) {
        pgdone(client);
        console.error('error fetching client from pool- {}'.format(err));
        done();
      }
      client.query('SELECT id from food_item LIMIT 1', function(err, result){
        should.not.exist(err);
        var food_item_id = result.rows[0].id;

        supertest(app)
        .post('/food_item/update/'+food_item_id)
        .send(updateData)
        .expect(302)
        .end(function (err, res){
          console.log(res.text);
          res.status.should.equal(302);
          res.get('Location').should.equal('/');

          client.query('SELECT * from food_item \
              WHERE id='+food_item_id, function(err, result) {
            pgdone(client);
            should.not.exist(err);

            result.rows.length.should.equal(1);
            result.rows[0].name.should.equal('food_item1');
            result.rows[0].restaurant_id.should.equal(1);
            result.rows[0].expiry_time.should.equal('5h');
            result.rows[0].vat_percent.should.equal(5);
            should.not.exist(result.rows[0].production_cost);
            done();
          });

        });
      });

    });

  });



});
