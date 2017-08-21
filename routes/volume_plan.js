/*global require module*/
'use strict';


var express = require('express');
var pg = require('pg');
var debug = require('debug')('Foodbox-HQ:server');
var async = require('async');
var format = require('string-format');
var router = express.Router();
var path = require('path');
var config = require('../models/config');
var conString = config.dbConn;

format.extend(String.prototype);

router.get('/', function (req, res, next) {
    async.parallel({
     
      city: function(callback) {
        config.query('select short_name,name from city',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });

        },

        restaurants: function(callback) {
        config.query('select outlet.city,outlet_id,restaurant_id from food_item \
inner join outlet on food_item.outlet_id=outlet.id \
inner join restaurant on food_item.restaurant_id=restaurant.id group by outlet.city,outlet_id,restaurant_id order by outlet.city',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });

        },
     
      outlets: function(callback) {
        config.query('select name,id,city from outlet',
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
        config.query('select name,id from restaurant',
        [],
        function(err, result) {
          if(err) {
            callback('error running query' + err, null);
            return;
          }
          callback(null, result.rows);
        });

       },

       session: function(callback) {
       config.query('select id,name,outlet_id from menu_bands \
                     group by id,outlet_id',
       [],
       function(err,result) {
         if(err) {
           callback('error running query' + err, null);
           return;

         }
         callback(null,result.rows);
       });

       },

       food_items: function(callback) {
        config.query('select outlet_id,restaurant_id from food_item \
            group by outlet_id,restaurant_id',
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
          //handleError(client, done, res, err);
          console.log("volume_plan: "+err);
        return;
      }

        var context = {title: 'Foodbox',
            city:results.city,
            outlets: results.outlets,
            fvs: results.fvs,
            food_items: results.food_items,
            session: results.session,
            restaurants:results.restaurants
             };


      res.render('volume_plan', context);


    });

});



// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};


module.exports = router;








