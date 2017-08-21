/*global require __dirname module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var async = require('async');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

router.get('/', function(req, res, next) {
    async.parallel({
      outlets: function(callback) {
        config.query('select name,id from outlet where active=\'true\'' ,
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });
      },
      fvs: function(callback) {
        config.query('select name,id from restaurant where active=\'true\' ',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });
      },
      food_items: function(callback) {
        config.query('select outlet_id,restaurant_id from food_item \
        where active =\'true\' \
        group by outlet_id,restaurant_id',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });
      },
      menu_band_times: function(callback) {
        config.query('select start_time,end_time,outlet_id from menu_bands',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });
      }
    },
    function(err, results) {
      if (err) {
        handleError(client, done, res, err);
        return;
      }
      var context = {title: '',
            fvs: results.fvs,
            outlets: results.outlets,
            food_items: results.food_items,
            menu_band_times: results.menu_band_times};
      res.render('emergency_po', context);
    });
});



// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;
