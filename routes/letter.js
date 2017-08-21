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
var json2csv = require('json2csv');
var fs = require('fs');
var _ = require('underscore');
var randomstring = require('randomstring');
var Multer = require('multer');
var jsreport = require('jsreport');
var pdf = require('html-pdf');
var cash_settlement_helpers = require('./cash_settlement_helpers');
var dbUtils = require('../models/dbUtils');
//var jquery = require('../public/js/vendor/jquery');

var moment = require('moment');
var app = express();

format.extend(String.prototype);

function IsAuthenticated(req, res, next) {
    if (req.isAuthenticated())
    {
        next();
    } else
    {
        res.redirect('/login');
    }
}

router.get('/', IsAuthenticated, function (req, res, next) {
    console.log("letter *** Get called***");
    console.log("user details: " + JSON.stringify(req.user));
    var user = req.user.usertype;
    console.log("user entity details: " + user);
    var query = "select short_name,name from city ";
    console.log("Page load query " + query);
    async.parallel({
        city: function (callback) {
            config.query(query,
            [],
            function (err, result) {
                if (err)
                {
                    callback('letter error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        },
    },

     function (err, results) {
         if (err)
         {
             console.log("letter Error: " + err);
             return;
         }

         var context = {
             title: 'letter Details',
             city: results.city,
             user: user,
         };
         res.render('letter', context);
     });

});



router.get("/get_letter_details/", function (req, res, next) {
    debugger;
    var city = req.query.city;
    var date = req.query.selected_date;
    console.log("Generating FTR for city: " + city +
      ", Date: " + date);

    async.parallel({
        outlets: function (callback) {
            dbUtils.getOutletsForCity(city, callback);
        },
        fbxFV: function (callback) {
            dbUtils.getFVByShortName("ATC", callback);
        }
    },
    function (err, results) {
        debugger;
        if (err)
        {
            handleError(res, "error fetching cash settlments for city " + err);
            return;
        }
        var fbxFV = results.fbxFV;
        var outlets = results.outlets;

        // Fetch all consolidated cash settlements.
        async.map(outlets,
          function (outlet, callback) {
              dbUtils.getCashSettlementData(outlet.id, date, callback);
          },
          function (err, result) {
              debugger;
              if (err)
              {
                  handleError(res, "Error generating FTR " + err);
                  return;
              }
              var cash_settlements = _.reject(result, _.isNull);
              var po_data = _.flatten(_.pluck(cash_settlements, 'purchase_orders'), true);
              var outside_sales = _.flatten(_.pluck(cash_settlements, 'outside_sales'), true);

              if (_.isEmpty(po_data) && _.isEmpty(outside_sales))
              {
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
                function (callback) {
                    debugger;
                    cash_settlement_helpers
                      .get_fv_details(data, date, city, fbxFV, callback);
                },

                // Compute FTR payouts
                function (fv_details, carry_forwards, callback) {
                    debugger;
                    cash_settlement_helpers
                      .get_fv_payouts(data, date, fv_details,
                        carry_forwards, city, fbxFV, callback);
                },

                // Get FTR data
                function (fv_payouts, fv_details, callback) {
                    cash_settlement_helpers
                      .get_ftr_data(date, city, fv_payouts, fv_details, fbxFV, callback);
                },

                // Generate FTR pdf report
                function (ftr_data, callback) {
                    console.log("**ftr_data PDF**");
                    generate_ftr_pdf(ftr_data, callback);
                },
              ],
              function (ftr_err, ftr_res) {
                  if (ftr_err)
                  {
                      console.log("**ftr_data Error**");
                      handleError(res, ftr_err);
                      return;
                  }


                 ftr_res.stream.pipe(res);
              });
          });
    });
});


var generate_ftr_pdf = function (ftr_data, async_callback) {
    console.log("**ftr_data**" + JSON.stringify(ftr_data));
    var template_path = path.join(__dirname, '/../');
    template_path = path.join(template_path, 'public/reports/FTR.html');
    var out_file_path = '/tmp/ftr-' + moment().format('MM-DD-YYYY-hh-mm') + '.pdf';
    var content = fs.readFileSync(template_path, 'utf8');
    jsreport.render({
        template: {
            content: content,
            engine: 'jsrender'
        },
        recipe: 'phantom-pdf',
        data: ftr_data
    }).then(function (out) {
        //return out.stream.pipe(res);
        async_callback(null, out);
    }).catch(function (e) {
        async_callback(e, null);
        return;
    });
};

router.get("/send_letter_details/", function (req, res, next) {
    debugger;
    var city = req.query.city;
    var date = req.query.selected_date;
    console.log("Generating FTR for city: " + city +
      ", Date: " + date);

    async.parallel({
        outlets: function (callback) {
            dbUtils.getOutletsForCity(city, callback);
        },
        fbxFV: function (callback) {
            dbUtils.getFVByShortName("ATC", callback);
        }
    },
    function (err, results) {
        debugger;
        if (err)
        {
            handleError(res, "error fetching cash settlments for city " + err);
            return;
        }
        var fbxFV = results.fbxFV;
        var outlets = results.outlets;

        // Fetch all consolidated cash settlements.
        async.map(outlets,
          function (outlet, callback) {
              dbUtils.getCashSettlementData(outlet.id, date, callback);
          },
          function (err, result) {
              debugger;
              if (err)
              {
                  handleError(res, "Error generating FTR " + err);
                  return;
              }
              var cash_settlements = _.reject(result, _.isNull);
              var po_data = _.flatten(_.pluck(cash_settlements, 'purchase_orders'), true);
              var outside_sales = _.flatten(_.pluck(cash_settlements, 'outside_sales'), true);

              if (_.isEmpty(po_data) && _.isEmpty(outside_sales))
              {
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
                function (callback) {
                    debugger;
                    cash_settlement_helpers
                      .get_fv_details(data, date, city, fbxFV, callback);
                },

                // Compute FTR payouts
                function (fv_details, carry_forwards, callback) {
                    debugger;
                    cash_settlement_helpers
                      .get_fv_payouts(data, date, fv_details,
                        carry_forwards, city, fbxFV, callback);
                },

                // Get FTR data
                function (fv_payouts, fv_details, callback) {
                    cash_settlement_helpers
                      .get_ftr_data(date, city, fv_payouts, fv_details, fbxFV, callback);
                },

                // Generate FTR pdf report
                function (ftr_data, callback) {
                    cash_settlement_helpers
                      .generate_ftr_pdf(ftr_data, callback);
                },
                // E-mail FTR
                function (ftr_path, ftr_data, callback) {
                    cash_settlement_helpers
                      .email_ftr(ftr_path, ftr_data, callback);
                }
              ],
              function (ftr_err, ftr_res) {
                  if (ftr_err)
                  {
                      handleError(res, ftr_err);
                      return;
                  }
                  res.send("Successfully generated and e-mailed FTR");
              });
          });
    });
});

var handleError = function (res, msg) {
    console.error(msg);
    res.status(500).send(msg);
};
module.exports = router;
