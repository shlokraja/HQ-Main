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
        var user = req.user.usertype;
        console.log("User :" + user);
    } else {
        res.redirect('/login');
    }
}
router.get('/', IsAuthenticated, function (req, res, next) {
    var user = req.user.usertype;
    console.log("transit_report User :" + user);
    var query = 'select distinct out.id,out.name,out.short_name from outlet out \
            inner join food_item fi on out.id=fi.outlet_id  \
            inner join restaurant res on fi.restaurant_id=res.id  \
            where res.id>0 and out.active=true ';
            if (login_report_type=='after_august')
                {
                    query= query + ' and out.ispublicsector=true ';
                }
                else
                {
                        query= query + ' and out.ispublicsectorPriorAugust=true ';
                }
            
    if (user != "HQ") {
        query += "and res.entity='" + req.user.entity + "'";
    }
    query += ' order by out.name';

    var res_qry = 'select distinct out.short_name as outlet_short_name,res.id,res.name as name,out.city as city from restaurant res \
                        inner join food_item fi on fi.restaurant_id=res.id \
                        inner join outlet out on out.id=fi.outlet_id \
                        inner join restaurant_config rcon on rcon.restaurant_id=res.id \
                        where res.id>0 and out.ispublicsector=true and out.active=true and res.active=true ';
    if (user != "HQ") {
        res_qry += "and res.entity='" + req.user.entity + "'";
    }
    res_qry += ' order by res.name';

    async.parallel({

        outlet: function (callback) {

            config.query(query,
            [],
            function (err, result) {
                if (err) {
                    callback('error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        },
        restaurants: function (callback) {

            config.query(res_qry,
                [],
                function (err, result) {
                    if (err) {
                        callback('transit_report error running query' + err, null);
                        return;
                    }
                    callback(null, result.rows);
                });

        },
    },

    function (err, results) {
        if (err) {
            console.log("transit_report Error: " + err);
            return;
        }

        var context = {
            title: 'Transit Reports',
            outlet: results.outlet,
            restaurants: results.restaurants,
            user: req.user.usertype,
            reportAugust:login_report_type=='after_august',
        };
        console.log("process.env.August:"+process.env.August);
        if (login_report_type=='after_august')
            {
                res.render('transit_report_aug', context);
            }
            else
            {
                res.render('transit_report', context);
            }
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
        "Transfer_to_Restaurant_from_Escrow": 'Total Restaurant Payment',
        "Payment": 'Payments made',
        "Payment_Date": 'Date of Payment',
        "Remarks": 'Bank Reference',
        "Outstanding": 'Outstanding'

    }
}

router.post('/get_transit_restaurant_details', function (req, res) {
    //console.log("get_transit_restaurant_details************** called" + JSON.stringify(req.body))
    var restaurant_id = req.body.restaurant_id;
    var from_dt = req.body.from_date;
    var to_dt = req.body.to_date;
    var report_type = req.body.report_type;
    var outlet_id = req.body.outlet_id;
    var isSummary = false;
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('**************get_transit_restaurant_details Error ' + JSON.stringify(err));
            return;
        }
        var query = "select * from ";
        if (restaurant_id != 0) {
            query += "restaurant_details('" + restaurant_id + "','" + from_dt + "','" + to_dt + "',true)";
        }
        else {
            isSummary = true;
            query += "transit_restaurant_details_summary('" + from_dt + "','" + to_dt + "',true,'" + outlet_id + "')";
        }

        console.log("**************get_transit_restaurant_details QUERY******" + query);
        client.query(query,
          function (query_err, result) {
              if (query_err) {
                  done(client);
                  console.log('**************get_transit_restaurant_details Error ' + JSON.stringify(query_err));
                  return;
              } else {
                  done();
                  var rows = [];
                  var resut_data = result.rows;
                  console.log('************** select get_transit_restaurant_details Scuccess -Count' + result.rows.length);
                  console.log('************** select get_transit_restaurant_details Scuccess' + JSON.stringify(resut_data));
                  if (result.rows.length != 0) {
                      rows = generate_rows(resut_data, isSummary);
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
    //console.log("***generate_rows started****");
    var resut_data = result;
    if (!summary) {
        Outstanding = resut_data[0].Oustanding_Payment;
        var item = {};
        item["ReportDate"] = "";
        item["RestaurantName"] = "Outstanding Payment";
        item["TakenQty"] = "";
        item["SoldQty"] = "";
        item["Wastage"] = "";
        item["Transfer_to_Restaurant_from_Escrow"] = "";
        item["GST"] = "";
        item["Total"] = "";
        item["Payment"] = "";
        item["Payment_Date"] = "";
        item["Remarks"] = "";
        item["Outstanding"] = addCommas(Number(Outstanding).toFixed(0));
        rows.push(item);
    }

    for (var value in resut_data) {
        var item = {};
        var payment = resut_data[value].Payment != null ? Number(resut_data[value].Payment).toFixed(0) : 0;
        var Escrow = resut_data[value].Transfer_to_Restaurant_from_Escrow != null ? Number(resut_data[value].Transfer_to_Restaurant_from_Escrow).toFixed(0) : 0;
        item["ReportDate"] = resut_data[value].ReportDate != null ? moment(resut_data[value].ReportDate).format('Do MMM YYYY') : "";
        item["RestaurantName"] = resut_data[value].RestaurantName;
        item["TakenQty"] = Number(resut_data[value].TakenQty);
        item["SoldQty"] = Number(resut_data[value].SoldQty);
        item["Wastage"] = Number(resut_data[value].Wastage);
        item["Transfer_to_Restaurant_from_Escrow"] = addCommas(Number(resut_data[value].Transfer_to_Restaurant_from_Escrow).toFixed(0));
        item["GST"] = addCommas(Number(resut_data[value].Transfer_to_Restaurant_from_Escrow *.18).toFixed(2));
        item["Total"] = addCommas(Number(resut_data[value].Transfer_to_Restaurant_from_Escrow*1.18).toFixed(2));
        item["Payment"] = addCommas(payment);
        item["Payment_Date"] = resut_data[value].Payment_Date != null ? moment(resut_data[value].Payment_Date).format('Do MMM YYYY') : "-";
        item["Remarks"] = resut_data[value].Remarks != null ? resut_data[value].Remarks : "-";
        Outstanding = (Number(Outstanding) + Number(Escrow)) - Number(payment);
        item["Outstanding"] = addCommas(Number(Outstanding).toFixed(0));        
        rows.push(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["TakenQty"] = aggregateByColumn(rows, 'TakenQty');
        item["SoldQty"] = aggregateByColumn(rows, 'SoldQty');
        item["Wastage"] = aggregateByColumn(rows, 'Wastage');
        item["Transfer_to_Restaurant_from_Escrow"] = addCommas(sum(_.pluck(rows, 'Transfer_to_Restaurant_from_Escrow')).toFixed(0));
        item["GST"] =addCommas(sum(_.pluck(rows, 'GST')).toFixed(2));
        item["Total"] = addCommas(sum(_.pluck(rows, 'Total')).toFixed(2 ));
        item["Payment"] = "";
        item["Payment_Date"] = "";
        item["Remarks"] = "";
        item["Outstanding"] = "";
        rows.push(item);
        //console.log("***result_rows aggregates****");
    }

    var result_rows = { fields: REPORT_FIELDS["restaurant_receipts"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}



function sum(numbers) {
    return _.reduce(numbers, function (result, current) {
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
    var csvOutput = true;
    var outlet_id = req.query.outlet_id;
    //console.log("Generating " + " from: " + from_date      + ", to: " + to_date + ", restaurant_id: " + restaurant_id);
    var report_type = 'Transit_Restaurant_Details';
    var reportName = report_type + '-from-' + req.query.from_date + '-to-' + req.query.to_date + '.csv';
    var isSummary = false;

    var query = "select * from ";
    if (restaurant_id != 0) {
        query += "restaurant_details('" + restaurant_id + "','" + from_date + "','" + to_date + "',true)";
    }
    else {
        isSummary = true;
        query += "transit_restaurant_details_summary('" + from_date + "','" + to_date + "',true,'" + outlet_id + "')";
    }

    //console.log("**************get_transit_restaurant_details Download QUERY******" + query);

    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('**************get_transit_restaurant_details Error ' + JSON.stringify(err));
            return;
        }
        client.query(query, [],
              function (query_err, result) {
                  if (query_err) {
                      done(client);
                      console.log('**************get_transit_restaurant_details Error ' + JSON.stringify(query_err));
                      return;
                  } else {
                      done();
                      var rows = [];
                      var resut_data = result.rows;
                      rows = generate_rows(resut_data, isSummary);
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

    fields = ["ReportDate", "RestaurantName", "TakenQty", "SoldQty", "Wastage", "Transfer_to_Restaurant_from_Escrow", "Payment", "Payment_Date", "Remarks", "Outstanding"];
    fieldNames = ["Date", "Restaurant Name", "Taken", "Sold", "Wastage", "Total Restaurant Payment", "Payment", "Payment_Date", "Remarks", "Outstanding"];

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
function IsAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        next();
    } else {
        res.redirect('/login');
    }
}
module.exports = router;
