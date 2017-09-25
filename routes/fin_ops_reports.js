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

function IsAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        next();
    } else {
        res.redirect('/login');
    }
}
router.get('/', IsAuthenticated, function (req, res, next) {
    var istrading=false;
    var query = "SELECT id,name FROM restaurant ";
    var user = req.user.usertype;
    istrading = login_report_type=='prior_august'?true:false;
    var query = "SELECT id,name FROM restaurant where active=true and istrading=" +istrading;
    
    if (user != "HQ") {
        query += " and entity='" + req.user.entity + "'";
    }
    query += " order by name";

    console.log("Page load query " + query);
    async.parallel({
        restaurants: function (callback) {
            config.query(query,
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
//Passing month parmater to finops report
          var context = {
              title: 'Reports',
              restaurants: results.restaurants,
              user: user,
              reportAugust:login_report_type=='after_august'
          };
          res.render('fin_ops_reports', context);
      });

});



var REPORT_FIELDS = {
    restaurant_receipts:
    {
        "ReportDate": 'Date',
        "RestaurantName": 'Restaurant',
        "TakenQty": 'Taken',
        "SoldQty": 'Sold',
        "Wastage": 'Wastage',
        "Gross": 'Gross Sales(excl.tax)',
        "Vat": 'Total VAT',
        "ST_with_Abatement": 'Total ST (including abatement)',
        "Net_Sales": 'Net Sales',
        "Foodbox_fee": 'Transaction Fee',
        "Foodbox_st": 'ST on Transaction Fee',
        "Total_Foodbox": 'Total Transaction Fee',
        "Vat_on_Gross": 'VAT on Gross Sales',
        "St_on_Gross": 'ST on Gross Sales',
        "Foodbox_TDs": 'TDS on Transaction fee',
        "Transaction_on_fee": 'Transaction Fee',
        "Service_Tax": 'Service Tax',
        "Total_cost": 'Total Cost',
        "Cost_of_Food": 'Cost of Food',
        "Transfer_to_Restaurant_from_Escrow": 'Transfer to Restaurant from Escrow',
        "Payment": 'Payments made',
        "Payment_Date": 'Date of Payment',
        "Remarks": 'Bank Reference',
        "Outstanding": 'Outstanding'

    },
    restaurant_VAT_receipts:
      {
          "Date": 'Date',
          "RestaurantName": 'Restaurant Name',
          "Gross": 'Gross Sales (excl. tax)',
          "Vat": 'Total VAT',
          "ST_with_Abatement": 'ST on Transaction Fee',
          "Net_Sales": 'Net Sales',
      },
    restaurant_ST_receipts:
    {
        "Date": 'Date',
        "RestaurantName": 'Restaurant Name',
        "Foodbox_Fee": 'Transaction Fee',
        "Foodbox_st": 'ST on Transaction Fee',
        "Total_Foodbox": 'Total Transaction Fee',
        "Foodbox_TDs": 'TDs',
        "Net_pay_to_restaurant": 'Net pay to restaurant'
    },
}

router.post('/get_restaurant_details', function (req, res) {
    //console.log("get_restaurant_details************** called" + JSON.stringify(req.body))
    var restaurant_id = req.body.restaurant_id;
    var from_dt = req.body.from_date;
    var to_dt = req.body.to_date;
    var report_type = req.body.report_type;
    var isSummary = false;
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('**************get_restaurant_details Error ' + JSON.stringify(err));
            return;
        }
        var query = "select * from ";
        if (report_type == "vat") {
            query += "restaurant_VAT_details";
        }
        else if (report_type == "st") {
            query += "restaurant_ST_details";
        }
        else if(report_type=="gst"){
            query+="restaurant_gst_details";
        }
        else if(report_type=='restaurant_payment') {
            if (restaurant_id != 0) {
                query += "restaurant_details";
            }
            else {
                query += "restaurant_details_summary";
            }
        }
        else
        {
            if (restaurant_id != 0) {
                query += "restaurant_details_gst";
            }
            else {
                query += "restaurant_details_summary_gst";
            }
        }

        if (restaurant_id == 0 && (report_type == "restaurant_payment" || report_type == "restaurant_payment_gst")) {
            query += "('" + from_dt + "','" + to_dt + "',false)";
            isSummary = true;
        }
        else if (report_type == "restaurant_payment" || report_type == "restaurant_payment_gst") {
            query += "('" + restaurant_id + "','" + from_dt + "','" + to_dt + "',false)";
        }
        else {
            query += "('" + restaurant_id + "','" + from_dt + "','" + to_dt + "')";
        }

        console.log("**************get_restaurant_details QUERY******" + query);
        client.query(query,
          function (query_err, result) {
              if (query_err) {
                  done(client);
                  console.log('**************get_restaurant_details Error ' + JSON.stringify(query_err));
                  return;
              } else {
                  done();
                  //console.log('************** select get_restaurant_details Scuccess');
                  var rows = [];
                  var resut_data = result.rows;
                  if (result.rows.length != 0) {
                      if (report_type == "vat") {
                          rows = generate_VAT_rows(resut_data);
                      }
                      else if (report_type == "gst") {
                          console.log("result_data");
                          console.log(resut_data);
                          rows = generate_GST_rows(resut_data);
                      }
                      else if (report_type == "st") {
                          rows = generate_ST_rows(resut_data);
                      }
                      else if(report_type=="restaurant_payment") {
                          rows = generate_rows(resut_data, isSummary);
                      }
                    else {
                          rows = generate_rows(resut_data, isSummary);
                      }
                      res.send(rows);
                  }
                  else {
                      res.send("NoData");
                  }

              }
          });
    });
});

function generate_rows(result, summary) {
    var Outstanding = 0;
    var rows = [];
    //console.log("***generate_rows started****" + JSON.stringify(result));
    var resut_data = result;
    if (!summary) {
        Outstanding = resut_data[0].Oustanding_Payment;
        var item = {};
        item["ReportDate"] = "";
        item["RestaurantName"] = "Outstanding Payment";
        item["TakenQty"] = "";
        item["SoldQty"] = "";
        item["Wastage"] = "";
        item["Gross"] = "";
        item["Vat"] = "";
        item["Gst"]="";
        item["ST_with_Abatement"] = "";
        item["Net_Sales"] = "";
        item["Net_Sales_gst"] = "";
        item["Foodbox_Fee"] = "";
        item["Foodbox_st"] = "";
        item["Foodbox_gst"] = "";
        item["Total_Foodbox"] = "";
        item["Total_Foodbox_gst"] = "";
        item["Vat_on_Gross"] = "";
        item["Gst_on_Gross"] = "";
        item["St_on_Gross"] = "";
        item["Foodbox_TDs"] = "";
        item["Transaction_on_fee"] = "";
        item["Service_Tax"] = "";
        item["Total_cost"] = "";
        item["Cost_of_Food"] = "";
        item["Transfer_to_Restaurant_from_Escrow"] = "";
        item["Transfer_to_Restaurant_from_Escrow_gst"] = "";
        item["Payment"] = "";
        item["Payment_Date"] = "";
        item["Remarks"] = "";
        item["Outstanding"] = addCommas(Number(Outstanding).toFixed(0));
        rows.push(item);
    }

    for (var value in resut_data) {
        //console.log(resut_data[value]);
        var item = {};
        var payment = resut_data[value].Payment != null ? Number(resut_data[value].Payment).toFixed(0) : 0;
        var Escrow = resut_data[value].Transfer_to_Restaurant_from_Escrow != null ? Number(resut_data[value].Transfer_to_Restaurant_from_Escrow).toFixed(0) : 0;
        var Escrow_gst = resut_data[value].Transfer_to_Restaurant_from_Escrow_gst != null ? Number(resut_data[value].Transfer_to_Restaurant_from_Escrow_gst).toFixed(0) : 0;
        item["ReportDate"] = resut_data[value].ReportDate != null ? moment(resut_data[value].ReportDate).format('Do MMM YYYY') : "";
        item["RestaurantName"] = resut_data[value].RestaurantName;
        item["TakenQty"] = Number(resut_data[value].TakenQty);
        item["SoldQty"] = Number(resut_data[value].SoldQty);
        item["Wastage"] = Number(resut_data[value].Wastage);
        item["Gross"] = addCommas(Number(resut_data[value].Gross).toFixed(0));
        item["Vat"] = addCommas(Number(resut_data[value].Vat).toFixed(0));
        item["Gst"] = addCommas(Number(resut_data[value].Gst).toFixed(0));
        item["ST_with_Abatement"] = addCommas(Number(resut_data[value].ST_with_Abatement).toFixed(0));
        item["Net_Sales"] = addCommas(Number(resut_data[value].Net_Sales).toFixed(0));
        item["Net_Sales_gst"] = addCommas(Number(resut_data[value].Net_Sales_gst).toFixed(0));
        item["Foodbox_Fee"] = addCommas(Number(resut_data[value].Foodbox_Fee).toFixed(0));
        item["Foodbox_st"] = addCommas(Number(resut_data[value].Foodbox_st).toFixed(0));
        item["Foodbox_gst"] = addCommas(Number(resut_data[value].Foodbox_gst).toFixed(0));
        item["Total_Foodbox"] = addCommas(Number(resut_data[value].Total_Foodbox).toFixed(0));
        item["Total_Foodbox_gst"] = addCommas(Number(resut_data[value].Total_Foodbox_gst).toFixed(0));
        item["Vat_on_Gross"] = addCommas(Number(resut_data[value].Vat_on_Gross).toFixed(0));
        item["Gst_on_Gross"] = addCommas(Number(resut_data[value].Gst_on_Gross).toFixed(0));
        item["St_on_Gross"] = addCommas(Number(resut_data[value].St_on_Gross).toFixed(0));
        item["Foodbox_TDs"] = addCommas(Number(resut_data[value].Foodbox_TDs).toFixed(0));
        item["Transaction_on_fee"] = addCommas(Number(resut_data[value].Transaction_on_fee).toFixed(0));
        item["Service_Tax"] = addCommas(Number(resut_data[value].Service_Tax).toFixed(0));
        item["Total_cost"] = addCommas(Number(resut_data[value].Total_cost).toFixed(0));
        item["Cost_of_Food"] = addCommas(Number(resut_data[value].Cost_of_Food).toFixed(0));
        item["Transfer_to_Restaurant_from_Escrow"] = addCommas(Escrow);
        item["Transfer_to_Restaurant_from_Escrow_gst"] = addCommas(Escrow_gst);
        item["Payment"] = addCommas(payment);
        item["Payment_Date"] = resut_data[value].Payment_Date != null ? moment(resut_data[value].Payment_Date).format('Do MMM YYYY') : "-";
        item["Remarks"] = resut_data[value].Remarks != null ? resut_data[value].Remarks : "-";
        Outstanding = (Number(Outstanding) + Number(Escrow)) - Number(payment);
        item["Outstanding"] = addCommas(Number(Outstanding).toFixed(0));
        rows.push(item);
        console.log(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["TakenQty"] = aggregateByColumn(rows, 'TakenQty');
        item["SoldQty"] = aggregateByColumn(rows, 'SoldQty');
        item["Wastage"] = aggregateByColumn(rows, 'Wastage');
        item["Gross"] = addCommas(sum(_.pluck(rows, 'Gross')).toFixed(0));
        item["Vat"] = addCommas(sum(_.pluck(rows, 'Vat')).toFixed(0));
        item["Gst"] = addCommas(sum(_.pluck(rows, 'Gst')).toFixed(0));
        item["ST_with_Abatement"] = addCommas(sum(_.pluck(rows, 'ST_with_Abatement')).toFixed(0));
        item["Net_Sales"] = addCommas(sum(_.pluck(rows, 'Net_Sales')).toFixed(0));
        item["Net_Sales_gst"] = addCommas(sum(_.pluck(rows, 'Net_Sales_gst')).toFixed(0));
        item["Foodbox_Fee"] = addCommas(sum(_.pluck(rows, 'Foodbox_Fee')).toFixed(0));
        item["Foodbox_st"] = addCommas(sum(_.pluck(rows, 'Foodbox_st')).toFixed(0));
        item["Foodbox_gst"] = addCommas(sum(_.pluck(rows, 'Foodbox_gst')).toFixed(0));
        item["Total_Foodbox"] = addCommas(sum(_.pluck(rows, 'Total_Foodbox')).toFixed(0));
        item["Total_Foodbox_gst"] = addCommas(sum(_.pluck(rows, 'Total_Foodbox_gst')).toFixed(0));
        item["Gst_on_Gross"] = addCommas(sum(_.pluck(rows,'Gst_on_Gross')).toFixed(0));
        item["Vat_on_Gross"] = addCommas(sum(_.pluck(rows, 'Vat_on_Gross')).toFixed(0));        
        item["St_on_Gross"] = addCommas(sum(_.pluck(rows, 'St_on_Gross')).toFixed(0));
        item["Foodbox_TDs"] = addCommas(sum(_.pluck(rows, 'Foodbox_TDs')).toFixed(0));
        item["Transaction_on_fee"] = addCommas(sum(_.pluck(rows, 'Transaction_on_fee')).toFixed(0));
        item["Service_Tax"] = addCommas(sum(_.pluck(rows, 'Service_Tax')).toFixed(0));
        item["Total_cost"] = addCommas(sum(_.pluck(rows, 'Total_cost')).toFixed(0));
        item["Cost_of_Food"] = addCommas(sum(_.pluck(rows, 'Cost_of_Food')).toFixed(0));
        item["Transfer_to_Restaurant_from_Escrow"] = addCommas(sum(_.pluck(rows, 'Transfer_to_Restaurant_from_Escrow')).toFixed(0));
        item["Payment"] = "";
        item["Payment_Date"] = "";
        item["Remarks"] = "";
        item["Outstanding"] = "";
        rows.push(item);
        //console.log("***result_rows aggregates****" + JSON.stringify(rows));
    }

    var result_rows = { fields: REPORT_FIELDS["restaurant_receipts"], rows: rows, aggregates: aggregates };    
    return result_rows.rows;
}

function generate_VAT_rows(result) {
    var rows = [];
    //console.log("***generate_rows started****" + JSON.stringify(result));
    var resut_data = result;
    for (var value in resut_data) {
        var item = {};
        item["Date"] = resut_data[value].Date != null ? moment(resut_data[value].Date).format('Do MMM YYYY') : "";
        item["RestaurantName"] = resut_data[value].RestaurantName;
        item["Gross"] = addCommas(Number(resut_data[value].Gross).toFixed(0));
        item["Vat"] = addCommas(Number(resut_data[value].Vat).toFixed(0));
        item["ST_with_Abatement"] = addCommas(Number(resut_data[value].ST_with_Abatement).toFixed(0));
        item["Net_Sales"] = addCommas(Number(resut_data[value].Net_Sales).toFixed(0));
        rows.push(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["Date"] = "Total";
        item["RestaurantName"] = "";
        item["Gross"] = addCommas(sum(_.pluck(rows, 'Gross')).toFixed(0));
        item["Vat"] = addCommas(sum(_.pluck(rows, 'Vat')).toFixed(0));
        item["ST_with_Abatement"] = addCommas(sum(_.pluck(rows, 'ST_with_Abatement')).toFixed(0));
        item["Net_Sales"] = addCommas(sum(_.pluck(rows, 'Net_Sales')).toFixed(0));
        rows.push(item);
    }
    var result_rows = { fields: REPORT_FIELDS["restaurant_VAT_receipts"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}
//gst changes
function generate_GST_rows(result) {
    var rows = [];
    //console.log("***generate_rows started****" + JSON.stringify(result));
    var resut_data = result;
    for (var value in resut_data) {
        var item = {};
        item["Date"] = resut_data[value].Date != null ? moment(resut_data[value].Date).format('Do MMM YYYY') : "";
        item["RestaurantName"] = resut_data[value].RestaurantName;
        item["Gross"] = addCommas(Number(resut_data[value].Gross).toFixed(0));
        item["gst"] = addCommas(Number(resut_data[value].Gst).toFixed(0));
        item["ST_with_Abatement"] = addCommas(Number(resut_data[value].ST_with_Abatement).toFixed(0));
        item["Net_Sales"] = addCommas(Number(resut_data[value].Net_Sales).toFixed(0));
        rows.push(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["Date"] = "Total";
        item["RestaurantName"] = "";
        item["Gross"] = addCommas(sum(_.pluck(rows, 'Gross')).toFixed(0));
        console.log(_.pluck(rows, 'Gst'));
        item["gst"] = addCommas(sum(_.pluck(rows, 'gst')).toFixed(0));
        item["ST_with_Abatement"] = addCommas(sum(_.pluck(rows, 'ST_with_Abatement')).toFixed(0));
        item["Net_Sales"] = addCommas(sum(_.pluck(rows, 'Net_Sales')).toFixed(0));
        rows.push(item);
    }
    var result_rows = { fields: REPORT_FIELDS["restaurant_gst_receipts"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}
function generate_ST_rows(result) {
    var rows = [];
    //console.log("***generate_rows started****" + JSON.stringify(result));
    var resut_data = result;
    for (var value in resut_data) {
        var item = {};
        //  console.log("*** Value***" + JSON.stringify(resut_data[value]));
        item["Date"] = resut_data[value].Date != null ? moment(resut_data[value].Date).format('Do MMM YYYY') : "";
        item["RestaurantName"] = resut_data[value].RestaurantName;
        item["Foodbox_Fee"] = addCommas(Number(resut_data[value].Foodbox_Fee).toFixed(0));
        item["Foodbox_st"] = addCommas(Number(resut_data[value].Foodbox_st).toFixed(0));
        item["Total_Foodbox"] = addCommas(Number(resut_data[value].Total_Foodbox).toFixed(0));
        item["Foodbox_TDs"] = addCommas(Number(resut_data[value].Foodbox_TDs).toFixed(0));
        item["Net_pay_to_restaurant"] = addCommas(Number(resut_data[value].Net_pay_to_restaurant).toFixed(0));
        rows.push(item);

    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["Date"] = "Total";
        item["RestaurantName"] = "";
        item["Foodbox_Fee"] = addCommas(sum(_.pluck(rows, 'Foodbox_Fee')).toFixed(0));
        item["Foodbox_st"] = addCommas(sum(_.pluck(rows, 'Foodbox_st')).toFixed(0));
        item["Total_Foodbox"] = addCommas(sum(_.pluck(rows, 'Total_Foodbox')).toFixed(0));
        item["Foodbox_TDs"] = addCommas(sum(_.pluck(rows, 'Foodbox_TDs')).toFixed(0));
        item["Net_pay_to_restaurant"] = addCommas(sum(_.pluck(rows, 'Net_pay_to_restaurant')).toFixed(0));
        rows.push(item);
    }
    var result_rows = { fields: REPORT_FIELDS["restaurant_ST_receipts"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}
function sum(numbers) {
   // console.log("numbers:"+numbers);
    return _.reduce(numbers, function (result, current) {
       // console.log("current:"+current);
        current = current.replace('', '0');
        current = current.replace(',', '');
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
// Totals of numerical columns for a report
var aggregateReportColumns = function (rows) {
    var sample = _.first(rows);
    var aggregates = {};
    _.each(_.keys(sample), function (k) {
        if (_.isNumber(sample[k])) {
            var aggr = aggregateByColumn(rows, k);
            aggregates[k] = isFloat(aggr) ? (aggr.toFixed(0)) : aggr;
        } else {
            aggregates[k] = '';
        }
    });
    return aggregates;
};


// aggregator helpers
var aggregateByColumn = function (items, name) {
    return _.reduce(items, function (memo, item) {
        var value = item[name] != "" ? item[name] : 0;
        return memo + value;
    }, 0);
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
                obj[key] = value.toFixed(0);
            }
        });
    });
};
router.get('/downloadcsv', function (req, res) {
    //console.log("downloadcsv************** called");
    var restaurant_id = req.query.restaurant_id;
    var from_date = req.query.from_date;
    var to_date = req.query.to_date;
    var report_type = req.query.report_type;
    var csvOutput = true;
    //console.log("Generating " + report_type + ", from: " + from_date  + ", to: " + to_date + ", restaurant_id: " + restaurant_id, "report_type:" + report_type);

    report_type = report_type != "" ? report_type : "restaurant_payment";
    var reportName = report_type + '-from-' + req.query.from_date
      + '-to-' + req.query.to_date + '.csv';
    var isSummary = false;

    var query = "select * from ";
    if (report_type == "vat") {
        query += "restaurant_VAT_details";
    }
    else if (report_type == "st") {
        query += "restaurant_ST_details";
    }
     else if (report_type == "gst") {
        query += "restaurant_gst_details";
    }
    else if (report_type=="restaurant_payment") {
        if (restaurant_id != 0) {
            query += "restaurant_details";
        }
        else {
            isSummary = true;
            query += "restaurant_details_summary";
        }
    }
    else{
        if (restaurant_id != 0) {
            query += "restaurant_details_gst";
        }
        else {
            isSummary = true;
            query += "restaurant_details_summary_gst";
        }
    }
    if (restaurant_id == 0 && (report_type == "restaurant_payment" ||report_type == "restaurant_payment_gst")) {
        query += "('" + from_date + "','" + to_date + "',false)";
    }
    else if (report_type == "restaurant_payment"||report_type == "restaurant_payment_gst") {
        query += "('" + restaurant_id + "','" + from_date + "','" + to_date + "',false)";
    }
    else {
        query += "('" + restaurant_id + "','" + from_date + "','" + to_date + "')";
    }

    //console.log("**************get_restaurant_details QUERY******" + query);

    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('**************get_restaurant_details Error ' + JSON.stringify(err));
            return;
        }
        client.query(query, [],
              function (query_err, result) {
                  if (query_err) {
                      done(client);
                      console.log('**************get_restaurant_details Error ' + JSON.stringify(query_err));
                      return;
                  } else {
                      done();
                      var rows = [];
                      var resut_data = result.rows;
                      if (report_type == "vat") {
                          rows = generate_VAT_rows(resut_data);
                      }
                      else if (report_type == "st") {
                          rows = generate_ST_rows(resut_data);
                      }
                      else if (report_type == "gst") {
                          rows = generate_GST_rows(resut_data);
                      }
                      else {
                          rows = generate_rows(resut_data, isSummary);
                      }
                      //console.log('************** select convert data Scuccess rows' + JSON.stringify(rows));
                      csvOut(reportName, rows, report_type, res);
                  }
              });
    });

    // res.send("success");
});
function csvOut(reportName, reportJson, report_type, res) {
    var fields;
    var fieldNames;
    if (report_type == "vat") {
        fields = ["Date", "RestaurantName", "Gross", "Vat", "ST_with_Abatement", "Net_Sales"];
        fieldNames = ["Date", "Restaurant Name", "Gross Sales (excluding taxes)", "Total VAT", "Total ST (including abatement)", "Net Sales"];
    }
    else if (report_type == "gst") {
        fields = ["Date", "RestaurantName", "Gross", "gst",  "Net_Sales"];
        fieldNames = ["Date", "Restaurant Name", "Gross Sales (excluding taxes)", "Total GsT",  "Net Sales"];
    }
    else if (report_type == "st") {
        fields = ["Date", "RestaurantName", "Foodbox_Fee", "Foodbox_st", "Total_Foodbox", "Foodbox_TDs", "Net_pay_to_restaurant"];
        fieldNames = ["Date", "Restaurant Name", "Frshly Transaction Fee", "ST on Frshly Transaction Fee", "Total Frshly Transaction Fee", "TDS", "Net pay to restaurant"];
    }
    else if(report_type=="restaurant_payment") {

        fields = ["ReportDate", "RestaurantName", "TakenQty", "SoldQty", "Wastage", "Gross", "Vat", "ST_with_Abatement", "Net_Sales", "Foodbox_Fee", "Foodbox_st", "Total_Foodbox", "Vat_on_Gross", "St_on_Gross", "Foodbox_TDs", "Transaction_on_fee", "Service_Tax", "Total_cost", "Cost_of_Food", "Transfer_to_Restaurant_from_Escrow", "Payment", "Payment_Date", "Remarks", "Outstanding"];
        fieldNames = ["Date", "Restaurant Name", "Taken", "Sold", "Wastage", "Gross Sales (excluding taxes)", "Total VAT", "Total ST (including abatement)", "Net Sales", "Frshly Transaction Fee", "ST on Frshly Transaction Fee", "Total Frshly Transaction Fee", "VAT on Gross Sales", "ST on Gross Sales", "TDS on Transaction fee", "Transaction Fee", "Service Tax", "Total Cost", "Cost of Food", "Transfer to Restaurant from Escrow", "Payment", "Payment_Date", "Remarks", "Outstanding"];


    }
    else {

        fields = ["ReportDate", "RestaurantName"  , "TakenQty" , "SoldQty", "Wastage", "Gross"                        , "Gst"      , "Net_Sales_gst", "Foodbox_Fee"           , "Foodbox_gst"                   , "Total_Foodbox_gst"               , "Gst_on_Gross"      ,  "Foodbox_TDs"           , "Transaction_on_fee" ,  "Total_cost", "Cost_of_Food", "Transfer_to_Restaurant_from_Escrow_gst", "Payment", "Payment_Date", "Remarks", "Outstanding"];
        fieldNames = ["Date"  , "Restaurant Name" , "Taken"    , "Sold"   , "Wastage", "Gross Sales (excluding taxes)", "Total GST", "Net Sales", "Frshly Transaction Fee", "GST on Frshly Transaction Fee", "Total Frshly Transaction Fee", "GST on Gross Sales",  "TDS on Transaction fee", "Transaction Fee"    ,  "Total Cost"  , "Cost of Food"     , "Transfer to Restaurant from Escrow", "Payment", "Payment_Date", "Remarks", "Outstanding"];


    }


    var data = reportJson;
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
        next();
    } else {
        res.redirect('/login');
    }
}
module.exports = router;
