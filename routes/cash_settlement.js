/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var dbUtils = require('../models/dbUtils');
var cash_settlement_helpers = require('./cash_settlement_helpers');
var bill_generator_utils = require('./bill_generator_utils');
var async = require('async');


// Prepare cash settlement for an outlet.
router.get('/:outlet_id/:date/', function(req, res, next){
  debugger;
  var outlet_id = req.params.outlet_id;
  var date = req.params.date;
  console.log("Generating EOD cash settlement for outlet id : " + outlet_id +
    ", Date: " + date);

  async.parallel({
    fbxFV: function(callback) {
      dbUtils.getFVByShortName("ATC", callback);
    },
    taxes: function(callback) {
      dbUtils.getTaxesForOutlet(outlet_id, callback);
    },
    outlet: function(callback) {
      dbUtils.getOutletById(outlet_id, callback);
    },
    purchase_orders: function(callback) {
      cash_settlement_helpers.fetchPurchaseOrders(outlet_id, date, callback);
    },
    outside_sales: function(callback) {
      cash_settlement_helpers.fetchOutsideSales(outlet_id, date, callback);
    },
    outlet_sessions: function(callback) {
      dbUtils.getSessions(outlet_id, callback);
    }
  },
  function(err, results){
    debugger;
    // results now equal to {purchase_orders: <purchase_orders>, outside_sales: <outside_sales>}
    if (err) {
      handleError(res, 'error fetching db data for cash settlement' + err);
      return;
    }
    var purchase_orders = results.purchase_orders;
    var outside_sales = results.outside_sales;
    var outlet = results.outlet;
    var tds_perc = results.taxes.tds_perc;
    var abatement_perc = results.taxes.abatement_perc;
    var fbx_st_perc = results.taxes.fbx_st_perc;
    var fbxFV = results.fbxFV;
    var outlet_sessions = results.outlet_sessions;
    var gst_perc = results.taxes.cgst_perc + results.taxes.sgst_perc;
    

    // filter by outlet eod timings.
    var filtered_purchases = cash_settlement_helpers
      .filterPOByEoDTimings(purchase_orders.rows, outlet, date);

    var filtered_outside_sales = cash_settlement_helpers
      .filterOutsideSalesByEoDTimings(outside_sales.rows, outlet, date);

    // Store aggregated accounting to database and then generate
    // and send FTR
    async.series([
      // Process and persist case settlment.
      function(callback) {
        cash_settlement_helpers
          .process_and_store_cash_settlement(
            date,
            outlet,
            filtered_purchases,
            filtered_outside_sales,
            tds_perc,
            abatement_perc,
            fbx_st_perc,
            fbxFV,
            outlet_sessions,
            gst_perc,
            callback
          );
      },
      // Archive bills
      function(callback) {
        bill_generator_utils
          .prepare_and_store_bill_data(date, outlet.id, callback);
      }
    ],
    function(ftr_err, ftr_res){
      debugger;
      if(ftr_err) {
        handleError(res, ftr_err);
        return;
      }
      res.send("Successfully stored cash settlement");
    });
  });
});

var handleError = function(res, msg) {
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;
