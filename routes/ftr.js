/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var dbUtils = require('../models/dbUtils');
var cash_settlement_helpers = require('./cash_settlement_helpers');
var async = require('async');

router.get("/:city/:date/", function(req, res, next) {
  debugger;
  var city = req.params.city;
  var date = req.params.date;
  console.log("Generating FTR for city: " + city +
    ", Date: " + date);

  async.parallel({
    outlets : function(callback) {
      dbUtils.getOutletsForCity(city, callback);
    },
    fbxFV: function(callback) {
      dbUtils.getFVByShortName("ATC", callback);
    }
  },
  function(err, results){
    debugger;
    if(err) {
      handleError(res, "error fetching cash settlments for city " + err);
      return;
    }
    var fbxFV = results.fbxFV;
    var outlets = results.outlets;

    // Fetch all consolidated cash settlements.
    async.map(outlets,
      function(outlet, callback) {
        dbUtils.getCashSettlementData(outlet.id, date, callback);
      },
      function(err, result){
        debugger;
        if(err) {
          handleError(res, "Error generating FTR " + err);
          return;
        }
      var cash_settlements = _.reject(result, _.isNull);
      var po_data = _.flatten(_.pluck(cash_settlements, 'purchase_orders'), true);
      var outside_sales = _.flatten(_.pluck(cash_settlements, 'outside_sales'), true);

      if(_.isEmpty(po_data) && _.isEmpty(outside_sales)) {
        handleError(res, 'No sales data to process');
        return;
      }

      var data = {
        'purchase_orders': po_data,
        'outside_sales': outside_sales
      };
      debugger;
      async.waterfall([
        // FV account details
        function(callback) {
          debugger;
          cash_settlement_helpers
            .get_fv_details(data, date, city, fbxFV, callback);
        },

        // Compute FTR payouts
        function(fv_details, carry_forwards, callback) {
          debugger;
          cash_settlement_helpers
            .get_fv_payouts(data, date, fv_details,
              carry_forwards, city, fbxFV, callback);
        },

        // Get FTR data
        function(fv_payouts, fv_details, callback) {
          cash_settlement_helpers
            .get_ftr_data(date, city, fv_payouts, fv_details, fbxFV, callback);
        },

        // Generate FTR pdf report
        function(ftr_data, callback) {
          cash_settlement_helpers
            .generate_ftr_pdf(ftr_data, callback);
        },
        // E-mail FTR
        function(ftr_path, ftr_data, callback) {
          cash_settlement_helpers
            .email_ftr(ftr_path, ftr_data, callback);
        }
      ],
      function(ftr_err, ftr_res){
        if(ftr_err) {
          handleError(res, ftr_err);
          return;
        }
        res.send("Successfully generated and e-mailed FTR");
      });
    });
  });
});


var handleError = function(res, msg) {
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;
