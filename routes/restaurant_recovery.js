/*global require module*/
'use strict';

var express = require('express');
var pg = require('pg');
var debug = require('debug')('Foodbox-HQ:server');
var async = require('async');
var router = express.Router();
var config = require('../models/config');
var conString = config.dbConn;
var json2csv = require('json2csv');
var fs = require('fs');
var _ = require('underscore');
var randomstring = require('randomstring');
var app = express();

var restaurant_FIELDS = {
    restaurant_receipts:
    {
        "Restaurant_Name":'Restaurant', 
        "item_id": 'Item Id',
        "name": 'Item Name',
        "qty": 'Error Qty',
        "price": 'Frshly Price Per Unit',
        "total": 'Total Fee to be Recoverd'
    },
    restaurant_wise_receipts:
    {
        "name": 'Restaurant Name',
        "qty": 'Error Qty',
        "total": 'Total Fee to be Recoverd'
    }
}

router.get('/', IsAuthenticated, function (req, res, next) {
    var user = req.user.usertype;
    var query = "SELECT id,name FROM restaurant where  1=1 ";
	if (req.user.login_report_type=='after_august')
	{
		query+=" and active=true ";
	}
    if (user != "HQ") {
        query += "and entity='" + req.user.entity + "'";
    }
    query += " order by name";
    
    async.parallel({
        restaurants: function (callback) {
            config.query(query,
                [],
                function (err, result) {
                    if (err) {
                        callback('Restaurant Recover Report error running query' + err, null);
                        return;
                    }
                    callback(null, result.rows);
                });

        },
    },

        function (err, results) {
            if (err) {
                console.log("Restaurant Recover Report Error: " + err);
                return;
            }

            var context = {
                title: 'Restaurant Recover Details',
                restaurants: results.restaurants,
                user: user,
                reportAugust: req.user.login_report_type=='after_august' 
            };
            res.render('restaurant_recovery', context);
        });

});

router.get('/get_item_wise_restaurant_recovery', function (req, res) {
    var usertype = req.query.usertype;
    var month = req.query.month_id;
    var year = req.query.year_id;
    var report_type = req.query.report_type;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;

    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get item_wise_restaurant_recovery Error ' + JSON.stringify(err));
                return;
            }
            var query = "select * from item_wise_restaurant_recovery";
            query += "('" + restaurant_id + "','" + seleted_value + "')";

            client.query(query,
                function (query_err, result) {
                    if (query_err) {
                        done(client);
                        console.log('**************get_item_wise_charge_back Error ' + JSON.stringify(query_err));
                        return;
                    } else {
                        done();
                        console.log('************** select get_item_wise_charge_back Scuccess');
                        var rows = generate_rows(result.rows, report_type);
                        var aggregates = null;
                        if (!_.isEmpty(rows)) {
                            aggregates = aggregateReportColumns(rows);
                            formatNumbers(rows);
                        }
                        var result_data = { fields: restaurant_FIELDS["restaurant_receipts"], rows: rows, aggregates: null };
                        
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

router.get('/get_restaurant_wise_restaurant_recovery', function (req, res) {
    var usertype = req.query.usertype;
    var month = req.query.month_id;
    var year = req.query.year_id;
    var report_type = req.query.report_type;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;

    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get restaurant_wise_restaurant_recovery Error ' + JSON.stringify(err));
                return;
            }
            var query = "select * from restaurant_wise_restaurant_recovery";
            query += "('" + restaurant_id + "','" + seleted_value + "')";

            client.query(query,
                function (query_err, result) {
                    if (query_err) {
                        done(client);
                        console.log('**************get_restaurant_wise_restaurant_recovery Error ' + JSON.stringify(query_err));
                        return;
                    } else {
                        done();
                        console.log('************** select get_restaurant_wise_restaurant_recovery Scuccess');
                        var rows = generate_rows(result.rows, report_type);
                        var aggregates = null;
                        if (!_.isEmpty(rows)) {
                            aggregates = aggregateReportColumns(rows);
                            formatNumbers(rows);
                        }
                        var result_data = { fields: restaurant_FIELDS["restaurant_wise_receipts"], rows: rows, aggregates: null };

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
    var csvOutput = true;
    var report_fields = "";

    console.log("Generating " + report_type + ", Month: " + month
        + ", year: " + year + ", usertype: " + usertype + ",restaurant_id:" + restaurant_id);
    var reportName = "Restaurant_Recovery_" + report_type + "_Report" + '-on-' + month + year + '.csv';
    console.log("** Report Name**" + reportName);
    var query;

    if (report_type == "item") {
        query = "select * from item_wise_restaurant_recovery";
        query += "('" + restaurant_id + "','" + seleted_value + "')";
        report_fields = restaurant_FIELDS["restaurant_receipts"];
    }
    else {
        query = "select * from restaurant_wise_restaurant_recovery";
        query += "('" + restaurant_id + "','" + seleted_value + "')";
        report_fields = restaurant_FIELDS["restaurant_wise_receipts"];
    }

    console.log("**************get_restaurant_recovery_report_details QUERY******" + query);
    //Validation to retrieve data after October 2016
    if ((Number(month) >= 10 && Number(year) == 2016) || (Number(year) > 2016)) {
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log('**************get_restaurant_recovery_report_details Error ' + JSON.stringify(err));
                return;
            }
            client.query(query, [],
                function (query_err, result) {
                    if (query_err) {
                        done(client);
                        console.log('**************get_restaurant_recovery_report_details Error ' + JSON.stringify(query_err));
                        return;
                    } else {
                        done();
                        console.log('************** select get_restaurant_recovery_report_details Scuccess rows' + JSON.stringify(result.rows));
                        var rows = generate_rows(result.rows, report_type);
                        // aggregates
                        console.log("get_restaurant_recovery_report_details rows");
                        var aggregates = null;
                        if (!_.isEmpty(rows)) {
                            aggregates = aggregateReportColumns(rows);
                            //formatNumbers(rows);
                        }
                        var result_data = { fields: report_fields, rows: rows, aggregates: null };
                        console.log('************** select get_restaurant_recovery_report_details*****');
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

function generate_rows(result, report_type) {
    var rows = [];
    var resut_data = result;
    for (var value in resut_data) {
        var item = {};

        if (report_type == "item") {
	    item["Restaurant_Name"]=resut_data[value].Restaurant_Name;
            item["item_id"] = resut_data[value].Item_Id;
            item["price"] = Number(resut_data[value].Frshly_Fee).toFixed(2);
        }

        item["name"] = resut_data[value].Name;
        item["qty"] = resut_data[value].restaurant_err_qty;
        item["total"] = Number(resut_data[value].Total).toFixed(2);
        rows.push(item);

    }

    console.log(rows);

    if (!_.isEmpty(rows)) {
        var item = {};

        if (report_type == "item") {
	    item["Restaurant_Name"]="";
            item["item_id"] = "Total";
            item["name"] = "";
            item["price"] = sum(_.pluck(rows, 'price'));
        } else {
            item["name"] = "Total";
        }
        
        item["qty"] = sum(_.pluck(rows, 'qty'));
        item["total"] = sum(_.pluck(rows, 'total'));
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

function csvOut(reportName, reportJson, report_type, report_fields, res) {
    var fields = [];
    var fieldNames = [];

    _.each(report_fields, function (value, key) {
        fields.push(key);
        fieldNames.push(value);
    });

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


var handleError = function (res, msg) {
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

module.exports = router;
