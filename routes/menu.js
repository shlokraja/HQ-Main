/*global require module console*/
'use strict';

var express = require('express');
var router = express.Router();
//var pg = require('pg');
var format = require('string-format');

format.extend(String.prototype);
var config = require('../models/config');
// var conString = config.dbConn;

// Handlers for menu related code

// Getting menu data
router.get('/', function(req, res, next) {

  // TODO: test with bad source and test with no source
  var source = req.query.source;
  switch(source) {
    case 'menu_display':
      // return data for menu display
      res.send('menu display');
      break;
    case 'order_app':
      // return data for ordering app
      res.send('order app');
      break;
    default:
      // error condition
      var error_msg = 'Query string value supplied does not match either ' +
                  'menu_display or order_app';
      console.error(error_msg);
      res.status(500).send(error_msg);
  }

});

module.exports = router;
