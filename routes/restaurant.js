/*global require module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var format = require('string-format');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

// Handlers for restaurant related code

// Listing all the restaurants
router.get('/', function(req, res, next) {

  pg.connect(conString, function(err, client, done) {

  if(err) {
    handleError(client, done, res, 'error fetching client from pool' + err);
    return;
  }

  client.query('SELECT * FROM restaurant', function(query_err, result) {
    if(query_err) {
      handleError(client, done, res, 'error running query' + query_err);
      return;
    }

    // releasing the connection
    done();
    var context = { title: 'Foodbox', restaurants: result.rows };
    if (req.query.create) {
      context.restaurant_created = true;
    }
    if (req.query.update) {
      context.restaurant_updated = true;
    }
    res.render('list_restaurants', context);
    });

  });

});

router.get('/get/:id', function(req, res, next) {

  pg.connect(conString, function(err, client, done) {

  if(err) {
    handleError(client, done, res, 'error fetching client from pool' + err);
    return;
  }
  var restaurant_id = req.params.id;

  client.query('SELECT * FROM restaurant \
    WHERE id={}'.format(restaurant_id), function(query_err, result) {
    if(query_err) {
      handleError(client, done, res, 'error running query' + query_err);
      return;
    }

    // releasing the connection
    done();

    res.render('get_restaurant', {title: 'Foodbox', restaurant: result.rows[0]});
    });

  });

});

// Creating a restaurant
router.get('/create', function(req, res, next) {
  res.render('create_restaurant', {title: 'Foodbox'});
});

router.post('/create', function(req, res, next) {

  pg.connect(conString, function(err, client, done) {

  if(err) {
    handleError(client, done, res, 'error fetching client from pool' + err);
    return;
  }
  client.query('INSERT into restaurant \
    (name, address, short_name, contact_name, phone_no, st_no, tin_no, account_no, \
      neft_code, bank_name, branch_name, active, start_of_day) \
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)', [req.body.name,
      req.body.address,
      req.body.short_name,
      req.body.contact_name,
      sanitizeInteger(req.body.phone_no),
      sanitizeInteger(req.body.st_no),
      sanitizeInteger(req.body.tin_no),
      sanitizeInteger(req.body.account_no),
      req.body.neft_code,
      req.body.bank_name,
      req.body.branch_name,
      req.body.active,
      req.body.start_of_day],
    function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }

      // releasing the connection
      done();

      res.redirect('/restaurant?create=true');
    });

  });

});

router.get('/update/:id', function(req, res, next) {

  pg.connect(conString, function(err, client, done) {

  if(err) {
    handleError(client, done, res, 'error fetching client from pool' + err);
    return;
  }
  var restaurant_id = req.params.id;

  client.query('SELECT * FROM restaurant \
    WHERE id={}'.format(restaurant_id), function(query_err, result) {
    if(query_err) {
      handleError(client, done, res, 'error running query' + query_err);
      return;
    }

    // releasing the connection
    done();

    res.render('update_restaurant', { title: 'Foodbox', restaurant: result.rows[0] });
    });

  });
});

// Updating a restaurant
router.post('/update/:id', function(req, res, next) {

  pg.connect(conString, function(err, client, done) {

  if(err) {
    handleError(client, done, res, 'error fetching client from pool' + err);
    return;
  }

  var restaurant_id = req.params.id;
  client.query('UPDATE restaurant \
    SET name=$1, address=$2, short_name=$3, contact_name=$4, phone_no=$5, \
    st_no=$6, tin_no=$7, account_no=$8, neft_code=$9, bank_name=$10, \
    branch_name=$11, active=$12, start_of_day=$13 \
    WHERE id=$14', [req.body.name,
      req.body.address,
      req.body.short_name,
      req.body.contact_name,
      sanitizeInteger(req.body.phone_no),
      sanitizeInteger(req.body.st_no),
      sanitizeInteger(req.body.tin_no),
      sanitizeInteger(req.body.account_no),
      req.body.neft_code,
      req.body.bank_name,
      req.body.branch_name,
      req.body.active,
      req.body.start_of_day,
      restaurant_id],
    function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }

      // releasing the connection
      done();

      res.redirect('/restaurant?update=true');
    });

  });

});

// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};

var sanitizeInteger = function(str) {
  if (!str) {
    return null;
  }
  return str;
};

module.exports = router;
