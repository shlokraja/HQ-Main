/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var hq_report_utils = require('./reports_utils');
var dbUtils = require('../models/dbUtils');
var async = require('async');

// Daily supplies and issues.
router.get('/:outlet_id/:date/daily_supply_and_issues.pdf', function(req, res, next) {
  var outlet_id = req.params.outlet_id;
  var date = req.params.date;
  console.log("Generating HQ supply and issues pdf report for" +
    ", outlet id : " + outlet_id +
    ", date : " + date);
  async.parallel({
    outlet : function(callback) {
      dbUtils.getOutletById(outlet_id, callback);
    },
    consolidated_data : function(callback) {
      dbUtils.getCashSettlementData(
        outlet_id,
        date,
        callback);
    } 
  },
  function(err, results){
    if(err) {
      handleError(res, err);
      return;
    }
    var outlet = results.outlet;
    var po_data = results.consolidated_data.purchase_orders;
    var outside_sales = results.consolidated_data.outside_sales;
    var sales_data = po_data.concat(outside_sales);

    async.waterfall([
      // Aggregate PO by item.
      function(callback) {
        hq_report_utils.generate_daily_supply_issues_hq_report(
          outlet,
          date,
          sales_data,
          callback);
      },
      // Generate pdf report.
      function(report, callback) {
        hq_report_utils.generate_pdf(
          report,
          'public/reports/hq/daily_supply_and_issues.html',
          callback);
      }
    ],
    function(err, out){
      if(err) {
        handleError(res, err);
        return;
      }
      out.stream.pipe(res);
      return;
    });
  });
});

// Issues vs Hours
router.get('/:outlet_id/:date/issues_vs_hours.pdf', function(req, res, next) {
  var outlet_id = req.params.outlet_id;
  var date = req.params.date;
  console.log("Generating HQ Issues vs Hours report for" +
    ", outlet id : " + outlet_id +
    ", date : " + date);
  async.parallel({
    outlet : function(callback) {
      dbUtils.getOutletById(outlet_id, callback);
    },
    consolidated_data : function(callback) {
      dbUtils.getCashSettlementData(
        outlet_id,
        date,
        callback);
    },
    non_food_issues: function(callback) {
      hq_report_utils.fetchNonFoodIssues(
        outlet_id,
        date,
        callback
      );
    } 
  },
  function(err, results){
    if(err) {
      handleError(res, err);
      return;
    }
    var outlet = results.outlet;
    var po_data = results.consolidated_data.purchase_orders;
    debugger;
    var food_issues = _.reject(po_data, function(po) {
      return (po.status == 'sold');
    });

    var non_food_issues = results.non_food_issues;
    
    async.waterfall([
      // Get all FV details
      function(callback) {
        var fv_ids = _.uniq(_.pluck(food_issues, "restaurant_id"));
        dbUtils.getFvByIds(fv_ids, callback);
      },  
      // Aggregate PO by item.
      function(fv_data, callback) {
        hq_report_utils.generate_issues_vs_hours_report(
          outlet,
          date,
          food_issues,
          non_food_issues,
          fv_data,
          callback);
      },
      // Generate pdf report.
      function(report, callback) {
        hq_report_utils.generate_pdf(
          report,
          'public/reports/hq/issues_vs_hours.html',
          callback);
      }
    ],
    function(err, out){
      if(err) {
        handleError(res, err);
        return;
      }
      out.stream.pipe(res);
      return;
    });
  });
});

// Monthly transporter liability
router.get('/:month/:year/transporter_monthly_liability.pdf', function(req, res, next) {
  var month = req.params.month;
  var year = req.params.year;
  console.log("Generating HQ Issues vs Hours report for" +
    "for month : " + month +
    ", year : " + year);
  async.waterfall([
    function(callback) {
      hq_report_utils.get_monthly_transporter_report(month, year, callback);
    },
    function(report, callback) {
      hq_report_utils.generate_pdf(
        report,
        'public/reports/hq/transporter_liability_monthly.html',
        callback);
    }
  ],
  function(err, out){
    if(err) {
      handleError(res, err);
      return;
    }
    out.stream.pipe(res);
    return;
  });
});

var handleError = function(res, msg) {
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;
