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
//var jquery = require('../public/js/vendor/jquery');

var moment = require('moment');
var app = express();

format.extend(String.prototype);


var restaurant_FIELDS = {
    restaurant_receipts:
    {
        "Name": 'Name',
        "taken": 'Taken Qty',
        "sold": 'Sold Qty',
        "wastage_percentage": 'Wastage acceptable',
        "restaurant_err_qty": 'Restaurant Error Qty',
        "reimbursed_by_food_box": 'Wastage quantity',
        "Shareperunit": 'Restaurant share p.u',
        "Chargebackvalue": 'Charge back',
        "conversion": 'Conversion'
    },
    restaurant_receipts_gst:
    {
        "Name": 'Name',
        "po_qty": 'PO Qty',
        "taken": 'Taken Qty',
        "sold": 'Sold Qty',
        "wastage_percentage": 'Wastage acceptable',
        "restaurant_err_qty": 'Restaurant Error Qty',
        "frshly_err_qty": 'Frshly Error Qty',
        "transport_err_qty": 'Transport Error Qty',
        "reimbursed_by_food_box": 'Wastage quantity',
        "Shareperunit": 'Restaurant share p.u',
        "gst":'GST',
        "Chargebackvalue": 'Charge back',
        "conversion": 'Conversion'
    }
}

router.get('/', IsAuthenticated, function (req, res, next) {
    console.log("chargeback_report *** Get called***");
    console.log("user details: " + JSON.stringify(req.user));
    var user = req.user.usertype;
    console.log("user entity details: " + user);
    var query = "SELECT id,name FROM restaurant where active=true ";
    if (user != "HQ") {
        query += "and entity='" + req.user.entity + "'";
    }
    query += " order by name";

    console.log("Page load query " + query);
    async.parallel({
        restaurants: function (callback) {
            config.query(query,
            [],
            function (err, result) {
                if (err) {
                    callback('chargeback_report error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        },
    },

     function (err, results) {
         if (err) {
             console.log("chargeback_report Error: " + err);
             return;
         }

         var context = {
             title: 'Charge Back Details',
             restaurants: results.restaurants,
             user: user,
             reportAugust: login_report_type == 'after_august' 
         };
         res.render('chargeback_report', context);
     });

});


router.get('/get_item_wise_charge_back', function (req, res) {
    console.log("get_item_wise_charge_back************** called" + JSON.stringify(req.query))
    var usertype = req.query.usertype;
    var month = req.query.month_id;
    var year = req.query.year_id;
    var report_type = req.query.report_type;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;
    var report_fields = "";
    //Validation to retrieve data after October 2016
    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get_item_wise_charge_back Error ' + JSON.stringify(err));
                return;
            }
            var query = "select * from item_wise_charge_back";
            query += "('" + restaurant_id + "','" + seleted_value + "')";

            if (restaurant_id == "0") {
                query = "select * from item_wise_summary_charge_back";
                query += "('" + seleted_value + "')";
            }
            console.log("**************get_item_wise_charge_back QUERY******" + query);
            client.query(query,
              function (query_err, result) {
                  if (query_err) {
                      done(client);
                      console.log('**************get_item_wise_charge_back Error ' + JSON.stringify(query_err));
                      return;
                  } else {
                      done();
                      console.log('************** select get_item_wise_charge_back Scuccess');

                      if (login_report_type == 'after_august') {
                          var rows = generate_rows(result.rows, true);
                          report_fields = restaurant_FIELDS["restaurant_receipts_gst"];
                      } else {
                          var rows = generate_rows(result.rows, false);
                          report_fields = restaurant_FIELDS["restaurant_receipts"];
                      }
                      
                      // aggregates
                      console.log("get_chargeback_report_details rows");
                      var aggregates = null;
                      if (!_.isEmpty(rows)) {
                          aggregates = aggregateReportColumns(rows);
                          formatNumbers(rows);
                      }

                      var result_data = { fields: report_fields, rows: rows, aggregates: null };
                      //console.log('************** select get_chargeback_report_details*****' + JSON.stringify(result_data));
                      if (result_data.rows.length != 0) {
                          res.send(result_data);
                      }
                      else {
                          res.send("NoData");
                      }
                  }
              });
        });
    }
    else {
        res.send("NoData");
    }
});

router.get('/get_chargeback_report_details', function (req, res) {
    console.log("get_chargeback_report_details************** called" + JSON.stringify(req.query))
    var usertype = req.query.usertype;
    var month = req.query.month_id;
    var year = req.query.year_id;
    var report_type = req.query.report_type;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;
    var report_fields = "";
    console.log("get_chargeback_report_details************** called" + month + year + seleted_value + restaurant_id);
    //Validation to retrieve data after October 2016
    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get_chargeback_report_details Error ' + JSON.stringify(err));
                return;
            }
            var query = "select * from restaurant_wise_charge_back";
            query += "('" + restaurant_id + "','" + seleted_value + "')";

            if (restaurant_id == "0") {
                query = "select * from restaurant_wise_charge_back_admin";
                query += "('" + seleted_value + "')";
            }
            console.log("**************get_chargeback_report_details QUERY******" + query);
            client.query(query,
              function (query_err, result) {
                  if (query_err) {
                      done(client);
                      console.log('**************get_chargeback_report_details Error ' + JSON.stringify(query_err));
                      //res.send("NoData");
                      return;
                  } else {
                      done();
                      console.log('************** select get_chargeback_report_details Scuccess');

                      if (login_report_type == 'after_august') {
                          var rows = generate_rows(result.rows, true);
                          report_fields = restaurant_FIELDS["restaurant_receipts_gst"];
                      } else {
                          var rows = generate_rows(result.rows, false);
                          report_fields = restaurant_FIELDS["restaurant_receipts"];
                      }

                      // aggregates
                      console.log("get_chargeback_report_details rows");
                      var aggregates = null;
                      if (!_.isEmpty(rows)) {
                          aggregates = aggregateReportColumns(rows);
                          formatNumbers(rows);
                      }
                      var result_data = { fields: report_fields, rows: rows, aggregates: null };
                     // console.log('************** select get_chargeback_report_details*****' + JSON.stringify(result_data));
                      if (result_data.rows.length != 0) {
                          res.send(result_data);
                      }
                      else {
                          res.send("NoData");
                      }
                  }
              });
        });
    }
    else {
        res.send("NoData");
    }
});

router.get('/downloadcsv', function (req, res) {
    console.log("downloadcsv************** called");
    var usertype = req.query.usertype;
    var month = req.query.month_id;
    var year = req.query.year_id;
    var report_type = req.query.report_type;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;
    var report_fields = "";
    var csvOutput = true;
    console.log("Generating " + report_type + ", Month: " + month
      + ", year: " + year + ", usertype: " + usertype + ",restaurant_id:" + restaurant_id);
    var reportName = "Chargeback_" + report_type + "_Report" + '-on-' + month + year + '.csv';
    console.log("** Report Name**" + reportName);
    var query;
    if (report_type == "item" && restaurant_id == "0") {
        query = "select * from item_wise_summary_charge_back";
        query += "('" + seleted_value + "')";
    }
    else if (report_type == "item") {
        query = "select * from item_wise_charge_back";
        query += "('" + restaurant_id + "','" + seleted_value + "')";
    }
    else if (report_type == "restaurant" && restaurant_id == "0") {
        query = "select * from restaurant_wise_charge_back_admin";
        query += "('" + seleted_value + "')";
    }

    else {
        query = "select * from restaurant_wise_charge_back";
        query += "('" + restaurant_id + "','" + seleted_value + "')";
    }

    console.log("**************get_chargeback_report_details QUERY******" + query);
    //Validation to retrieve data after October 2016
    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get_chargeback_report_details Error ' + JSON.stringify(err));
                return;
            }
            client.query(query, [],
                  function (query_err, result) {
                      if (query_err) {
                          done(client);
                          console.log('**************get_chargeback_report_details Error ' + JSON.stringify(query_err));
                          return;
                      } else {
                          done();
                          //console.log('************** select get_chargeback_report_details Scuccess' + JSON.stringify(result));
                          console.log('************** select get_chargeback_report_details Scuccess rows' + JSON.stringify(result.rows));

                          if (login_report_type == 'after_august') {
                              var rows = generate_rows(result.rows, true);
                              report_fields = restaurant_FIELDS["restaurant_receipts_gst"];
                          } else {
                              var rows = generate_rows(result.rows, false);
                              report_fields = restaurant_FIELDS["restaurant_receipts"];
                          }

                          // aggregates
                          console.log("get_chargeback_report_details rows");
                          var aggregates = null;
                          if (!_.isEmpty(rows)) {
                              aggregates = aggregateReportColumns(rows);
                              formatNumbers(rows);
                          }
                          var result_data = { fields: report_fields, rows: rows, aggregates: null };
                          console.log('************** select get_chargeback_report_details*****');
                          //res.send(result_data);
                          csvOut(reportName, result_data, report_type, report_fields, res);
                      }
                  });
        });
    }
    else {
        res.send("NoData");
    }

    // res.send("success");
});

function generate_rows(result, is_gst) {
    var rows = [];
    console.log("***generate_rows started****" + JSON.stringify(result));
    var resut_data = result;
    for (var value in resut_data) {
        var item = {};
        var taken = Number(resut_data[value].taken);
        var sold = Number(resut_data[value].sold);
        item["Name"] = resut_data[value].Name;
        item["taken"] = taken;
        item["sold"] = sold;
        item["wastage_percentage"] = resut_data[value].wastage_percentage + "%";
        item["restaurant_err_qty"] = resut_data[value].restaurant_err_qty;

        if (is_gst) {
            var gst = resut_data[value].gst;

            item["gst"] = gst;
            item["po_qty"] = resut_data[value].po_qty;
            item["frshly_err_qty"] = resut_data[value].frshly_err_qty;
            item["transport_err_qty"] = resut_data[value].transport_err_qty;
            item["Chargebackvalue"] = Number(resut_data[value].Chargebackvalue) + gst;
        }
        else {
            item["Chargebackvalue"] = Number(resut_data[value].Chargebackvalue);
        }

        item["reimbursed_by_food_box"] = resut_data[value].reimbursed_by_food_box;
        var conversion = sold != 0 ? Number((sold / taken) * 100).toFixed(0) : 0
        item["conversion"] = conversion.toString() + "%";
        item["Shareperunit"] = resut_data[value].Shareperunit;
        rows.push(item);

    }

    if (!_.isEmpty(rows)) {
        var item = {};
        item["Name"] = "Total";
        item["wastage_percentage"] = "";
        var taken = sum(_.pluck(rows, 'taken'));
        var sold = sum(_.pluck(rows, 'sold'));
        item["taken"] = taken;
        item["sold"] = sold;
        item["reimbursed_by_food_box"] = sum(_.pluck(rows, 'reimbursed_by_food_box'));
        item["Shareperunit"] = "";
        item["restaurant_err_qty"] = sum(_.pluck(rows, 'restaurant_err_qty'));

        if (is_gst) {
            var gst_total = sum(_.pluck(rows, 'gst'));

            item["gst"] = gst_total;
            item["po_qty"] = sum(_.pluck(rows, 'po_qty'));
            item["frshly_err_qty"] = sum(_.pluck(rows, 'frshly_err_qty'));
            item["transport_err_qty"] = sum(_.pluck(rows, 'transport_err_qty'));
            item["Chargebackvalue"] = sum(_.pluck(rows, 'Chargebackvalue')) + gst_total;
        } else {
            item["Chargebackvalue"] = sum(_.pluck(rows, 'Chargebackvalue'));
        }

        var conversion = sold != 0 ? Number((sold / taken) * 100).toFixed(0) : 0
        item["conversion"] = conversion.toString() + "%";        
        rows.push(item);
    }

    return rows;
}

function sum(numbers) {
    return _.reduce(numbers, function (result, current) {
        if (current.toString().indexOf(',') != -1) {
            current = current.replace(',', '');
        }
        return result + parseFloat(current);
    }, 0);
}
function addCommas(str) {
    var parts = (str + "").split("."),
        main = parts[0],
        len = main.length,
        output = "",
        first = main.charAt(0),
        i;

    if (first === '-') {
        main = main.slice(1);
        len = main.length;
    } else {
        first = "";
    }
    i = len - 1;
    while (i >= 0) {
        output = main.charAt(i) + output;
        if ((len - i) % 3 === 0 && i > 0) {
            output = "," + output;
        }
        --i;
    }
    // put sign back
    output = first + output;
    // put decimal part back
    if (parts.length > 1) {
        output += "." + parts[1];
    }
    return output;
}
function csvOut(reportName, reportJson, report_type, report_fields, res) {
    var fields = [];
    var fieldNames = [];

    _.each(report_fields, function (value, key) {
        fields.push(key);
        fieldNames.push(value);
    });

    //fields = ["Name", "taken", "sold", "wastage_percentage", "restaurant_err_qty", "reimbursed_by_food_box", "Shareperunit", "Chargebackvalue", "conversion"];
    //fieldNames = ["Name", "Taken Qty", "Sold Qty", "Wastage acceptable by the restaurant", "Restaurant Error Qty", "Wastage to be reimbursed by Food box", "Restaurant share p.u", "Charge back to be paid to restaurant", "Conversion"];

    var data = reportJson.rows;
    data.push(reportJson.aggregates);
    json2csv({ data: data, fields: fields, fieldNames: fieldNames }, function (err, csvData) {
        if (err) {
            handleError(res, err);
        }

        var rand_string = randomstring.generate(8);
        var rand_file = '/tmp/report-' + rand_string + '.csv';
        fs.writeFile(rand_file, csvData, function (error) {
            if (error) {
                handleError(res, error);
            }
            res.attachment(reportName);
            res.sendFile(rand_file);
        });
    });
}


var handleError = function(res, msg) {
    console.error(msg);
    res.status(500).send(msg);
};

function IsAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        var user = req.user.usertype;
        if (user == "HQ") {
            next();
        }
        else {
            res.redirect('/login');
        }
    } else { 
        res.redirect('/login');
    }
}

// Totals of numerical columns for a report
var aggregateReportColumns = function (rows) {
    var sample = _.first(rows);
    var aggregates = {};
    _.each(_.keys(sample), function (k) {
        if (_.isNumber(sample[k])) {
            var aggr = aggregateByColumn(rows, k);
            aggregates[k] = isFloat(aggr) ? (aggr.toFixed(2)) : aggr;
        } else {
            aggregates[k] = '';
        }
    });
    return aggregates;
};
var isInt = function (n) {
    return Number(n) === n && n % 1 === 0;
};

var isFloat = function isFloat(n) {
    return n === Number(n) && n % 1 !== 0;
};

var formatNumbers = function (rows) {
    _.each(rows, function (row) {
        _.each(row, function (value, key, obj) {
            if (isFloat(obj[key])) {
                obj[key] = value.toFixed(2);
            }
        });
    });
};

// aggregator helpers
var aggregateByColumn = function (items, name) {
    return _.reduce(items, function (memo, item) {
        return memo + item[name];
    }, 0);
};

module.exports = router;
