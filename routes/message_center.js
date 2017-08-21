/*global require __dirname module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var async = require('async');
format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

router.get('/', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }

    async.parallel({
      roles: function(callback) {
        client.query('SELECT enum_range(NULL::user_role)',
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          var roles = result.rows[0].enum_range;
          roles = (roles.substr(1,roles.length-2)).split(',')
          callback(null, roles);
        });
      },
      outlets: function(callback) {
        client.query('select id,name from outlet',
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows);
        });
      }
    },
    function(err, results) {
      if (err) {
        handleError(client, done, res, err);
        return;
      }
      var firebase_link = process.env.FIREBASE_CONN;
      var context = {
        title: 'Foodbox',
        firebase_link: firebase_link,
        roles: results.roles,
        outlets: results.outlets};
      res.render('message_center', context);
    });
  });
});

module.exports = router;
