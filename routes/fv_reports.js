/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var fv_report_utils = require('./reports_utils');
var dbUtils = require('../models/dbUtils');
var async = require('async');

// Daily supplies and issues.
router.get('/:fv_id/:outlet_id/:date/daily_supply_and_issues.pdf', function(req, res, next) {
  var fv_id = req.params.fv_id;
  var outlet_id = req.params.outlet_id;
  var date = req.params.date;
  console.log("Generating supply and issues pdf report for" +
    " fv id : " + fv_id +
    ", outlet id : " + outlet_id +
    ", date : " + date);
  async.parallel({
    outlet : function(callback) {
      dbUtils.getOutletById(outlet_id, callback);
    },
    fv : function(callback) {
      dbUtils.getFvById(fv_id, callback);
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
    var fv = results.fv;
    var outlet = results.outlet;
    var po_data = results.consolidated_data.purchase_orders;
    var outside_sales = results.consolidated_data.outside_sales;
    var sales_data = po_data.concat(outside_sales);


    async.waterfall([
    // Aggregate PO by item.
    function(callback) {
      // filter data by fv.
      var fv_data = _.where(sales_data, {restaurant_id: fv.id});
      fv_report_utils.generate_daily_supply_issues_fv_report(
        fv,
        outlet,
        date,
        fv_data,
        callback);
    },
    // Generate pdf report.
    function(report, callback) {
      fv_report_utils.generate_pdf(
        report,
        'public/reports/fv/daily_supply_and_issues.html',
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

// Item pricing.
router.get('/:fv_id/:outlet_id/:date/item_pricing.pdf', function(req, res, next) {
  debugger;
  var fv_id = req.params.fv_id;
  var date = req.params.date;
  var outlet_id = req.params.outlet_id;
  console.log("Generating supply and issues pdf report for" +
    " fv id : " + fv_id +
    ", outlet id : " + outlet_id +
    ", date : " + date);
  
  async.parallel({
    outlet : function(callback) {
      dbUtils.getOutletById(outlet_id, callback);
    },
    fv : function(callback) {
      dbUtils.getFvById(fv_id, callback);
    },
    consolidated_data : function(callback) {
      dbUtils.getCashSettlementData(
        outlet_id,
        date,
        callback);
    } 
  },
  function(err, results){
    debugger;
    if(err) {
      handleError(res, err);
      return;
    }
    var fv = results.fv;
    var outlet = results.outlet;
    var po_data = results.consolidated_data.purchase_orders;
    var outside_sales = results.consolidated_data.outside_sales;

    var sales_data = po_data.concat(outside_sales);
    
    async.waterfall([
    // Aggregate PO by item.
    function(callback) {
      debugger;
      // filter data by fv.
      var fv_data = _.where(sales_data, {restaurant_id: fv.id});
      fv_report_utils.generate_item_pricing_fv_report(
        fv,
        outlet,
        date,
        fv_data,
        callback);
    },
    // Generate pdf report.
    function(report, callback) {
      debugger;
      fv_report_utils.generate_pdf(
        report,
        'public/reports/fv/item_pricing.html',
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

var handleError = function(res, msg) {
  console.error(msg);
  res.status(500).send(msg);
};

module.exports = router;

