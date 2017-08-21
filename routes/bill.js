/*global console require module*/
'use strict';

var express = require('express');
var router = express.Router();
var pdf = require('html-pdf');
var cheerio = require('cheerio');
var randomstring = require('randomstring');
var debug = require('debug')('Foodbox-HQ:server');
var format = require('string-format');
var path = require('path');
var pg = require('pg');
var redis = require('redis');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

var redisClient = redis.createClient({ connect_timeout: 2000, retry_max_delay: 5000 });
redisClient.on('error', function (msg) {
    console.error(msg);
});

redisClient.select(1, function (err) {
    if (err) {
        console.error("Selecting Db Failed" + err)
    }
});
// Handlers for bill related code

// This returns the bill pdf given the file name
router.get('/:id', function (req, res, next) {
    // XXX: Its better to group the files according to day/month than to
    // keep them in a single folder
    var bill_file_code = req.params.id;
    var filePath = process.env.BILL_FOLDER;
    filePath = path.join(filePath, 'bill-' + bill_file_code + '.pdf');
    res.sendFile(filePath);
});

// This creates a pdf file from the given html and stores it.
router.post('/', function (req, res, next) {
    // getting the bill html
    var bill_text = req.body.bill_text;
    // parsing it into cheerio struct
    var $ = cheerio.load(bill_text);
    // Filling the images in the html
    var filePath = path.join(__dirname, '/../');
    filePath = path.join(filePath, 'public/img/email.png');
    $("#mail img").attr("src", 'file://' + filePath);

    filePath = path.join(__dirname, '/../');
    filePath = path.join(filePath, 'public/img/fb.png');
    $("#fb img").attr("src", 'file://' + filePath);

    filePath = path.join(__dirname, '/../');
    filePath = path.join(filePath, 'public/img/twitter.png');
    $("#twitter img").attr("src", 'file://' + filePath);

    var rand_string = randomstring.generate(5);
    var bill_file = 'bill-' + rand_string + '.pdf';
    var bill_folder = process.env.BILL_FOLDER;
    var options = { filename: path.join(bill_folder, bill_file), format: 'Letter' };
    debug('Bill location- ' + options.filename);

    if ($("#outlet_id").length > 0) {
        pdf.create($.html(), options).toFile(function (err, buffer) {
            if (err) return console.error(err);
            debug('Bill {} successfully generated'.format(options.filename));
            res.send({ "bill_location": "/bill/" + rand_string });
        });
    }
    else {
        // Assigning Serial number 
        var bill_no = 0;

        $("#order_no").each(function (index, item) {
            bill_no = $(item).text();
        });

        $(".running_no").each(function (index, item) {
            var restaurant_id = $(item).attr("restaurant_id");
            var outlet_id = $(item).attr("outlet_id");

            getSerialNo(outlet_id, restaurant_id, function (result) {
                if (result != undefined) {
                    if (result.length > 0) {
                        var serial_no = "FY17-18/OTPL/" + restaurant_id + "/" + outlet_id + "/" + JSON.stringify(result[0].serial_no);
                        $(item).html(serial_no);
                        redisClient.lpush(restaurant_id + "_" + outlet_id, JSON.stringify({ billno: bill_no, serialno: serial_no }));

                        if (index + 1 == $(".running_no").length) {
                            pdf.create($.html(), options).toFile(function (err, buffer) {
                                if (err) return console.error(err);
                                debug('Bill {} successfully generated'.format(options.filename));
                                res.send({ "bill_location": "/bill/" + rand_string });
                            });
                        }
                    } else {
                        var serial_no = "FY17-18/OTPL/" + restaurant_id + "/" + outlet_id + "/0";

                        $(item).html(serial_no);
                        redisClient.lpush(restaurant_id + "_" + outlet_id, JSON.stringify({ billno: bill_no, serialno: serial_no }));

                        if (index + 1 == $(".running_no").length) {
                            pdf.create($.html(), options).toFile(function (err, buffer) {
                                if (err) return console.error(err);
                                debug('Bill {} successfully generated'.format(options.filename));
                                res.send({ "bill_location": "/bill/" + rand_string });
                            });
                        }
                    }
                }
            });
        });
    }
});

function getSerialNo(outlet_id, restaurant_id, callback) {

    pg.connect(conString, function (err, client, done) {
        if (err) {
            handleError(client, done, '', 'Error fetching SerialNo from outlet_restaurant_serial_no' + err);
            return;
        }

        client.query("update outlet_restaurant_serial_no set serial_no =serial_no + 1 where outlet_id =$1 and restaurant_id =$2 returning serial_no",
            [outlet_id, restaurant_id],
            function (query_err, result) {
                if (query_err) {
                    handleError(client, done, '', ' error running query' + query_err);
                    done();
                    callback();
                }

                done();
                callback(result.rows);
            });
    });
}

module.exports = router;
