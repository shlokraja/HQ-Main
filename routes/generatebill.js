/* global require __dirname module console */
'use strict';

var express = require('express');
var router = express.Router();
var debug = require('debug')('Foodbox-HQ:server');
var path = require('path');
var _ = require('underscore');
var bill_generator_utils = require('./bill_generator_utils');
var async = require('async');

// FV bill bundle
router.get('/fv/:bill_date/:fv_id/:outlet_id/bills.pdf',  function (req, res, next) {
    var fv_id = req.params.fv_id;
    var outlet_id = req.params.outlet_id;
    var bill_date = req.params.bill_date;
    var gst_date = '2017-07-01';
    console.log("Generating FV bill bundle for" +
        " fv id : " + fv_id +
        ", outlet id : " + outlet_id +
        ", date : " + bill_date);

    async.waterfall([
        // Fetch all bills for the day for the restaurant
        function (callback) {
            bill_generator_utils
                .fetch_bill_data(
                bill_date,
                outlet_id,
                fv_id,
                callback);
        },
        // Generate bill bundle data
        function (bill_data, callback) {
            bill_generator_utils
                .get_bill_bundle(
                bill_data,
                outlet_id,
                bill_date,
                callback);
        },
        // Generate pdf
        function (bills, callback) {
            if (bill_date >= gst_date) {
                bill_generator_utils
                    .generate_bill_bundle_pdf_Gst(
                    bills,
                    callback);
            }
            else {
                bill_generator_utils
                    .generate_bill_bundle_pdf(
                    bills,
                    callback);
            }
        }
    ],
        function (err, out) {
            if (err) {
                handleError(res, err);
                return;
            }
            out.stream.pipe(res);
            return;
        });
});

// Outlet bill bundle
router.get('/outlet/:bill_date/:outlet_id/bills.pdf',  function (req, res, next) {
	var outlet_id = req.params.outlet_id;
    var bill_date = req.params.bill_date;
    console.log("Generating Outlet bill bundle for" +
        ", outlet id : " + outlet_id +
        ", date : " + bill_date);

    var gst_date = '2017-07-01';
    async.waterfall([
        // Fetch all bills for the day for the restaurant
        function (callback) {
            bill_generator_utils
                .fetch_bill_data(
                bill_date,
                outlet_id,
                null,
                callback);
        },
        // Generate bill bundle data
        function (bill_data, callback) {
            bill_generator_utils
                .get_bill_bundle(
                bill_data,
                outlet_id,
                bill_date,
                callback);
        },
        // Generate pdf
        function (bills, callback) {
            console.log(bill_date);
            console.log(gst_date);

            if (bill_date >= gst_date) {
                bill_generator_utils
                    .generate_bill_bundle_pdf_Gst(
                    bills,
                    callback);
            }
            else {
                bill_generator_utils
                    .generate_bill_bundle_pdf(
                    bills,
                    callback);
            }
        }
    ],
        function (err, out) {
            if (err) {
                handleError(res, err);
                return;
            }
            out.stream.pipe(res);
            return;
        });
});

var handleError = function (res, msg) {
    console.error(msg);
    res.status(500).send(msg);
};

module.exports = router;
