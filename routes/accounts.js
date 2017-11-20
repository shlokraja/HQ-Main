/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var async = require('async');
var json2csv = require('json2csv');
var fs = require('fs');
var randomstring = require('randomstring');

var report_utils = require('./reports_utils');
var accounts_reports_helpers = require('./accounts_reports_helpers');
var dbUtils = require('../models/dbUtils');


router.get('/', IsAuthenticated, function(req, res, next){
 var user = req.user;
 var istrading = user.login_report_type=='after_august'?true:false;
 console.log("user.login_report_type");
 console.log(user);
 var istradingresult=false;
 user.reportAugust = user.login_report_type=='after_august';  
 var reports = accounts_reports_helpers.get_reoprt_types_for_user(user);
  console.log("accounts istrading ========" );
 if(user.usertype != 'HQ') {
      async.parallel({
        istrading: function (callback) {
            config.query("select case when "+istrading +" then istrading else  istradingprioraugust end as istrading from restaurant where entity='"+req.user.entity+"'",
            [],
            function (err, result) {
                if (err) {
                    callback('fin_ops_reports error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });
        },
    },
      function (err, results) {
          if (err) {
              console.log("fin_ops_reports Error: " + err);
              return;
          }
  istradingresult=results.istrading[0].istrading;
  console.log("******************************************"+istradingresult)
      });
 }
  console.log("++++++++++++++++++++++++++++");
 accounts_reports_helpers.get_outlets_for_user(user, function(err, outlets){
  if(err) {
    handleError(res, err);
    return;
  }
  
  // Add option for all outlets
  //passing month parameter
  
 
  outlets.push({id:'-1', name:'All'});
  res.render('reports_main',
      { title: 'Daily Reports', 'reports': reports, 'outlets': outlets, user: user.usertype, reportAugust: user.login_report_type,istrading:istradingresult });
 });
});

router.get('/report', IsAuthenticated, function(req, res, next){
  var from_date = new Date(req.query.from_date);
  var to_date = new Date(req.query.to_date);
  var outlet_id = Number(req.query.outlet_id);
  var report_type = req.query.report_type;
  var csvOutput = req.query.csv;
  
  var reportName = report_type + '-from-' + req.query.from_date
    + '-to-' + req.query.to_date + '.csv';

  console.log("Generating " + report_type + ", from: " + from_date
    + ", to: " + to_date + ", outlet_id: " + outlet_id
    + ", entity: " + req.user.entity);

  if(from_date.getTime() > to_date.getTime()){
    handleError(res, "Invalid date range");
    return;
  }

  accounts_reports_helpers.generate_report_for_user(from_date, to_date, outlet_id,
    report_type,req.user, function(err, reportJson){
      if(err) {
        handleError(res, err);
        return;
      }
      if(csvOutput){
        csvOut(reportName, reportJson, res);
        return;
      } else {
      res.send(reportJson);
      return;
      }
  });  
});

var handleError = function(res, msg) {
  console.error(msg);
  res.status(500).send(msg);
};

function IsAuthenticated(req,res,next){
  if(req.isAuthenticated()){
    next();
  }else{
    res.redirect('/login');
  }
}

function csvOut(reportName, reportJson, res) {
  var fields = _.keys(reportJson.fields);
  var fieldNames = _.values(reportJson.fields);
  var data = reportJson.rows;
  data.push(reportJson.aggregates);
  json2csv({data: data, fields: fields, fieldNames: fieldNames},
    function(err, csvData){
      if(err){
        handleError(res, err);
      }
      
      var rand_string = randomstring.generate(8);
      var rand_file = '/tmp/report-' + rand_string + '.csv';
      fs.writeFile(rand_file, csvData, function(error){
        if(error){
          handleError(res, error);
        }
        res.attachment(reportName);
        res.sendFile(rand_file);        
      });
  });
}

// Special reports
// Monthly transporter liability
router.get('/:month/:year/transporter_monthly_liability.pdf', IsAuthenticated, function(req, res, next) {
  var month = req.params.month;
  var year = req.params.year;
  console.log("Generating monthly transporter liability report " +
    "for month : " + month +
    ", year : " + year);
  async.waterfall([
    function(callback) {
      report_utils.get_monthly_transporter_report(month, year, callback);
    },
    function(report, callback) {
      report_utils.generate_pdf(
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

module.exports = router;
