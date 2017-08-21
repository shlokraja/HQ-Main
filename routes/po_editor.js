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
var volume_planning_helper = require('../routes/volume_planning _helper');
router.get('/', function(req, res, next) {
  var outlet_id = req.query.outlet_id;
  var fv_id = req.query.fv_id;
  var menu_band_id = req.query.menu_band_id;
  var target_ts = req.query.target_ts;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }

    async.parallel({
      data: function(callback) {
        // If this request came from emergency po page, then no data is required
        if (menu_band_id == -1) {
          callback(null, []);
          return;
        }
        client.query('SELECT food_item_id,quantity,f.name,f.master_id \
          FROM menu_plans mp, food_item f \
          WHERE mp.food_item_id=f.id \
            and f.outlet_id=$1 \
            and f.restaurant_id=$2 \
            and menu_band_id=$3 \
            and target_ts::date=$4::date',
          [outlet_id, fv_id, menu_band_id, target_ts],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows);
        });
      },
      checkPOExists: function(callback) {
        // If this request came from emergency po page, then no data is required
        client.query('SELECT count(*) from purchase_order \
            WHERE outlet_id=$1 \
            and restaurant_id=$2 \
            and volume_forecast_id=$3 \
            and scheduled_delivery_time=$4',
          [outlet_id, fv_id, menu_band_id, target_ts],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows[0]);
        });
      },
      header_data: function(callback) {
        client.query('select \
          (select name as restaurant_name from restaurant where id=$1), \
          (select name outlet_name from outlet where id=$2)',
          [fv_id, outlet_id],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows[0]);
        });
      },
      food_items: function(callback) {
        client.query('SELECT id,name,master_id \
          FROM food_item \
          WHERE outlet_id=$1 and restaurant_id=$2 and \
          active= TRUE and location=\'dispenser\'',
          [outlet_id,fv_id],
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
      var context = {title: '',
            data: results.data,
            outlet_id: outlet_id,
            restaurant_id: fv_id,
            menu_band_id: menu_band_id,
            target_ts: target_ts,
            food_items: results.food_items,
            header_data: results.header_data};
      if (results.checkPOExists.count > 0) {
        context["checkPOExists"] = "true";
      }
      res.render('po_editor', context);
    });
  });
});

router.post('/', function(req, res, next) {
  var outlet_id = req.body.outlet_id;
  var restaurant_id = req.body.restaurant_id;
  var menu_band_id = req.body.menu_band_id;
  var target_ts = req.body.target_ts;

  var data = req.body.data;
console.log("Emergency po creation");
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }

    client.query('INSERT INTO purchase_order \
        (outlet_id, restaurant_id, volume_forecast_id, green_signal_time, scheduled_delivery_time) \
        VALUES ($1, $2, $3, now(), $4) \
        RETURNING id',
      [outlet_id, restaurant_id, menu_band_id, target_ts],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // Getting the purchase order id
      var purchase_order_id = result.rows[0].id;

      // Inserting the po data
      data.map(function(row) {
        client.query('INSERT INTO purchase_order_master_list \
          VALUES ($1, $2, $3)',
          [purchase_order_id, row.food_item_id, row.qty],
          function(query_err, result) {
          if(query_err) {
            handleError(client, done, res, 'error running query' + query_err);
            return;
          }
          done();
        });
      });
      volume_planning_helper.emergency_po_mail(data, outlet_id, restaurant_id, target_ts, function (err, response) {
                  if (err) {
                      console.log("********************************* emergency_po_mail " + err)

                  } if (response) {
                      res.send('success');
                  }
              })    });
  });

});


// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;
