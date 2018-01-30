var requestretry = require('requestretry');
var redis = require('redis');
var format = require('string-format');
var firebase = require('firebase');
var request = require('request');
var express = require('express');
var async = require('async');
var _ = require('underscore');
var debug = require('debug')('Bill_Check:server');
var pg = require('pg');
var config = require('../models/config');
var cache = require('./cache.js');
var general = require('../api/general');
var conString = config.dbConn;
format.extend(String.prototype);


// Initiating the redisClient
var redisClient = redis.createClient({ connect_timeout: 2000, retry_max_delay: 5000 });
redisClient.on('error', function (msg) {
    console.error(msg);
});

//selecting the Redis Database 1
redisClient.select(1, function (err) {
    if (err) {
        console.error("Selecting Db Failed" + err)
    }
    exports.BillcheckInit();
});

//Fetching the Outlets and Maintaining the details in Redis 
exports.BillcheckInit = function () {
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.error('error fetching client from pool' + err);
            return;
        }
        client.query('SELECT * FROM outlet', function (query_err, result) {
            if (query_err) {
                console.error('error running query' + query_err);
                return;
            }
            // releasing the connection
            done();
            redisClient.lpush("outlets_info", JSON.stringify(result.rows))
            cache.Loadoutlets(result.rows);
            setInterval(Start_Check, 60000);
        });
    });
}

// Main Function for this Process
function Start_Check() {
    cache.Loadoutlets(cache.Getoutlets());
    Start_Bill_check();
}

// Sub Function for each outlet to process the missing bill. 
// The Outlet information will be loaded from the cache
function Start_Bill_check() {
    var obj = cache.GetNextoutlets();
    checkMissingBills(obj);
}

// Function is to check the key is exist for the outlet
function checkMissingBills(outlet) {
    if (outlet != undefined) {
        console.log("Outlet Id" + outlet.id)
        redisClient.exists(outlet.id, function (err, reply) {
            if (!err) {
                if (reply === 1) {
                    console.log("Key exists for outlet" + outlet.id);
                    CheckMissingBillforOutlet(outlet);
                } else {
                    console.log("Does't exists");
                    Start_Bill_check();
                }
            }
        });
    }
}

//
function CheckMissingBillforOutlet(outinfo) {
    console.log("CheckMissingBillforOutlet ---> Started");
    redisClient.lrange(outinfo.id, 0, -1, function (err, reply) {
        if (!err) {
            if (reply != undefined) {
                if (reply.length > 0) {
                    for (var i = 0; i < reply.length; i++) {
                        reply[i] = JSON.parse(reply[i]);
                    }
                    // Finding the Maximum bill number from the outlet bill list 
                    var max_Bill_no = Math.max.apply(Math, reply.map(function (o) { return o.bill_no; }));
                    pg.connect(conString, function (err, client, done) {
                        if (err) {
                            console.error('error fetching client from pool' + err);
                            Start_Bill_check();
                            return;
                        }
                        else {
                            client.query("with billdata as (select b.bill_no from sales_order s \
                                inner join bill_items b on b.sales_order_id=s.id \
                                inner join outlet out on  out.id=s.outlet_id \
                                where  time >= CASE WHEN(to_char(now(),'yyyy-MM-dd HH24:MI')::time < out.start_of_day::time) THEN \
                                CONCAT(to_char(now() - interval '1' day,'yyyy-MM-dd '),out.start_of_day)::timestamp \
                                else \
                                CONCAT(to_char(now(),'yyyy-MM-dd '),out.start_of_day::time)::timestamp END \
                                and time < CASE WHEN(to_char(now(),'yyyy-MM-dd HH24:MI')::time > out.start_of_day::time) THEN \
                                CONCAT(to_char(now() + interval '1' day,'yyyy-MM-dd '),out.start_of_day)::timestamp \
                                else \
                                CONCAT(to_char(now(),'yyyy-MM-dd '),out.start_of_day)::timestamp END \
                                and outlet_id=$1 order by bill_no) \
                                SELECT s.i AS missing_bill_number FROM generate_series(1,$2) s(i) WHERE NOT EXISTS (SELECT 1 FROM billdata WHERE bill_no = s.i)",
                                [outinfo.id, max_Bill_no], function (query_err, result) {
                                    done();
                                    if (query_err) {
                                        console.error('error running query' + query_err);
                                        //done();
                                        //redisClient.del(outinfo.id);
                                        Start_Bill_check();
                                        return;
                                    }
                                    else {
                                        if (result.rows != undefined) {
                                            if (result.rows.length > 0) {
                                                console.log("Key exists for outlet and length" + reply.length);
                                                var MissingBill = FilteredArray(reply, result.rows);
                                                console.log("Missing Bill Length" + MissingBill.length);
                                                cache.SetMissingBills(MissingBill);
                                                ProcessMissingBills();
                                            }
                                            else {
                                                console.log("No Missing Bill")
                                                //redisClient.del(outinfo.id);
                                                Start_Bill_check();
                                            }
                                        }
                                        else {
                                            console.log("No Missing Bill -- Undefined")
                                            //redisClient.del(outinfo.id);
                                            Start_Bill_check();
                                        }
                                    }
                                });
                        }
                    });
                }
                else {
                    console.log("No Data for Outlet :" + outinfo.id + " to process missing bill")
                    //redisClient.del(outinfo.id);
                    Start_Bill_check();
                }
            }
            else {
                console.log("No Data for Outlet :" + outinfo.id + " to process missing bill -- undefined")
                //redisClient.del(outinfo.id);
                Start_Bill_check();
            }
        }
        else {
            console.log("Error from Reading Redis" + err)
            Start_Bill_check();
        }
    });
}



function CheckMissingBillforOutlet1(outinfo) {
    console.log("CheckMissingBillforOutlet ---> Started");
    pg.connect(conString, function (err, client, done) {
        if (err) {
            handleError(client, done, res, 'error fetching client from pool' + err);
            Start_Bill_check();
            return;
        }
        client.query("with billdata as (select b.bill_no from sales_order s \
        inner join bill_items b on b.sales_order_id=s.id \
                      inner join outlet out on  out.id=s.outlet_id \
                      where  time >= CASE WHEN(to_char(now(),'yyyy-MM-dd HH:MI')::time < out.start_of_day) THEN \
                        CONCAT(to_char(now() - interval '1' day,'yyyy-MM-dd '),out.start_of_day)::timestamp \
                        else \
                        CONCAT(to_char(now(),'yyyy-MM-dd '),out.start_of_day)::timestamp END \
                        and time < CASE WHEN(to_char(now(),'yyyy-MM-dd HH:MI')::time > out.start_of_day) THEN \
                        CONCAT(to_char(now() + interval '1' day,'yyyy-MM-dd '),out.start_of_day)::timestamp \
                        else \
                        CONCAT(to_char(now(),'yyyy-MM-dd '),out.start_of_day)::timestamp END \
                      and outlet_id=$1 order by bill_no) \
                      SELECT s.i AS missing_bill_number FROM generate_series(1,(select max(bill_no) from billdata)) s(i) WHERE NOT EXISTS (SELECT 1 FROM billdata WHERE bill_no = s.i)",
            [outinfo.id], function (query_err, result) {
                done();
                if (query_err) {
                    console.error('error running query' + query_err);
                    //done();
                    Start_Bill_check();
                    return;
                }
                else {
                    if (result != undefined) {
                        if (result.length > 0) {
                            redisClient.lrange(outinfo.id, 0, -1, function (err, reply) {
                                if (!err) {
                                    if (reply != undefined) {
                                        if (reply.length > 0) {
                                            console.log("Key exists for outlet and length" + reply.length);
                                            var MissingBill = FilteredArray(reply, result);
                                            cache.SetMissingBills(MissingBill);
                                            ProcessMissingBills();
                                        }
                                        else {
                                            console.log("No Values to Process");
                                            Start_Bill_check();
                                        }
                                    } else {
                                        console.log("Does't exists key");
                                        Start_Bill_check();
                                    }
                                }
                            });
                        }
                        else {
                            Start_Bill_check();
                        }
                    }
                    else {
                        Start_Bill_check();
                    }
                }
            });
    });
}

function FilteredArray(BillArray, outletLst) {
    var filteredArray = BillArray.filter(
        function (el) { // executed for each person
            for (var i = 0; i < outletLst.length; i++) { // iterate over filter
                if (el.bill_no == outletLst[i].missing_bill_number) {
                    console.log(JSON.stringify(outletLst[i]));
                    return true; // if this person knows this language
                }
            }
            return false;
        }
    );
    return filteredArray;
}

function ProcessMissingBills() {
    console.log("ProcessMissingBills  -- Started");
    var bill = cache.GetNextMissingBills();
    console.log("ProcessMissingBills" + bill);
    if (bill != undefined) {
        ProcessSales(bill);
    }
    else {
        Start_Bill_check();
    }
}

function GetFormattedDateDDMMYYYY() {
    var d = new Date();
    var str = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    console.log("Date :" + str);
    return str;
}

function ProcessSales(data) {
    var queueItem = data;

    var check_date = general.GetFormattedDateDDMMYYYY();
    console.log("Bill_Time" + data.bill_time + "Check Time :" + check_date);
    if (data.bill_time == check_date) {
        debug("Got order details from queue :" + queueItem.bill_no + "Outlet Id : " + queueItem.outlet_id);
        if (queueItem.name == "ORDER_DETAILS") {
            // process the order details
            debug("ORDER_DETAILS")
            var order_details = queueItem.order_details;
            var sides = queueItem.sides;
            var counter_code = queueItem.counter_code;
            var payment_method = queueItem.payment_mode;
            var outlet_id = queueItem.outlet_id;
            var unique_random_id = queueItem.unique_Random_Id;
            var order_barcodes = queueItem.order_barcodes;
            if (order_barcodes == undefined) {
                order_barcodes = [];
            }
            var mobile_num = queueItem.mobile_num;
            var credit_card_no = queueItem.credit_card_no;
            var cardholder_name = queueItem.cardholder_name;
            var bill_no = queueItem.bill_no;
            var food_details = queueItem.food_details;
            var is_mobile_order = queueItem.is_mobile_order;
            var total_quantity = 0;
            var barcode_dict = {};
            var total_price = 0;
            var userid = queueItem.userid;

            for (var i = 0; i < order_barcodes.length; i++) {
                if (order_barcodes[i] in barcode_dict) {
                    barcode_dict[order_barcodes[i]]++;
                } else {
                    barcode_dict[order_barcodes[i]] = 1;
                }
            }

            for (var item_id in order_details) {
                total_quantity += order_details[item_id].count;
                if (!isNaN(order_details[item_id].price)) {

                    total_price += order_details[item_id].price;
                }
            }

            for (var item_id in sides) {
                if (!isNaN(sides[item_id].price)) {

                    total_price += sides[item_id].price;
                }
            }

            if (userid == undefined || userid == null || userid == 0)
            {
                userid = 1;
            }

            config.query('INSERT INTO sales_order (outlet_id, time, counter_code, method, mobile_num, cardholder_name, card_no,unique_random_key,is_mobile_order,userid)\
      VALUES($1, now(), $2, $3, $4, $5, $6,$7,$8,$9) \
      RETURNING id',
                [outlet_id, counter_code, payment_method, mobile_num, cardholder_name, credit_card_no, unique_random_id, is_mobile_order, userid],
                function (query_err, result) {
                    if (query_err) {
                        console.error(query_err);
                        debug("Sales Order Error :" + query_err);
                        ProcessMissingBills();
                        return;
                    }

                    else {
                        if (result != null && result.rows != null && result.rows.length > 0) {
                            var sales_order_id = result.rows[0].id;
                            debug("Created sales order id- ", sales_order_id);
                            async.map(_.keys(food_details),
                                function (item_id, map_callback) {
                                    config.query('INSERT INTO bill_items \
              VALUES ($1, $2, $3, $4, $5,$6,$7)', [sales_order_id,
                                            bill_no, item_id, food_details[item_id], 'delivered', mobile_num, is_mobile_order], map_callback);
                                },
                                function (map_err, map_results) {
                                    if (map_err) {
                                        console.error(map_err);
                                        debug("Bill Items Error :" + map_err);
                                        ProcessMissingBills();
                                        return;
                                    }
                                });


                            for (var barcode in barcode_dict) {
                                var item_id = getItemId(barcode);
                                config.query('INSERT INTO sales_order_items \
            VALUES ($1, $2, $3, $4)',
                                    [sales_order_id, item_id, barcode_dict[barcode], barcode],
                                    function (items_err, items_result) {
                                        if (items_err) {
                                            console.error(items_err);
                                            debug("Sales Order Items Error :" + items_err);
                                            ProcessMissingBills();
                                            return;
                                        }
                                    });
                            }

                            config.query('INSERT INTO sales_order_payments \
          VALUES ($1, $2, $2, $3, $4)',
                                [sales_order_id, total_price, 'sold', 'original'],
                                function (payment_error, payment_result) {
                                    if (payment_error) {
                                        console.error(payment_error);
                                        debug("Sales Order Payment Error :" + payment_error);
                                        ProcessMissingBills();
                                        return;
                                    }
                                });

                            if (is_mobile_order) {
                                var orderno = leftPad(outlet_id, 3) + leftPad(bill_no, 6);
                                console.log("save_mobile_pending_orders: isMobileOrder: " + is_mobile_order + " MobileNo: " + mobile_num + " OrderNumber: " + orderno + " Quantity: " + total_quantity + " Outlet_Id: " + outlet_id);
                                config.query('INSERT INTO mobile_pending_orders (mobileno,orderno,quantity,outlet_id,order_date)\
              VALUES ($1, $2, $3,$4,current_timestamp)',
                                    [mobile_num, orderno, total_quantity, outlet_id],
                                    function (query_err, result) {
                                        if (query_err) {
                                            console.error(query_err);
                                            console.log("save_mobile_pending_orders: Insert mobile_pending_orders error running query" + query_err);
                                            debug("Mobile Order Error :" + query_err);
                                            ProcessMissingBills();
                                            return;
                                        }
                                        else {
                                            ProcessMissingBills();
                                        }
                                    });
                            }
                            else {
                                ProcessMissingBills();
                            }

                        }
                        else {
                            ProcessMissingBills();
                        }
                    }
                });
        }
        else {
            ProcessMissingBills();
        }
    }
    else {
        ProcessMissingBills();
    }
}

function getItemId(barcode) {
    return parseInt(barcode.substr(8, 4), 36);
}

function leftPad(number, targetLength) {
    var output = number + '';
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
}