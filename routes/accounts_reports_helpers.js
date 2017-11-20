/* global require __dirname module console */
'use strict';

var _ = require('underscore');
var pg = require('pg');
var async = require('async');
var format = require('string-format');
var moment = require('moment');
require('moment-range');
var dbUtils = require('../models/dbUtils');
var selected_outlet_id;
var result_po_taken;
var fromDate, todate;

//dafdafad
// aggregator helpers 
var aggregateByColumn = function (items, name)
{
    return _.reduce(items, function (memo, item)
    {
        return memo + item[name];
    }, 0);
};

var poQtyByStatus = function (poList, statusList)
{
    if (_.isNull(statusList))
    {
        return _.reduce(_.pluck(poList, 'qty'),
            function (memo, num)
            {
                return memo + num;
            }, 0);
    }

    var qtyList = _.map(statusList, function (st)
    {
        var filterByStatus = _.where(poList, { status: st })
        return _.reduce(_.pluck(filterByStatus, 'qty'),
            function (memo, num)
            {
                return memo + num;
            }, 0);
    });

    return _.reduce(qtyList, function (memo, num)
    {
        return memo + num;
    }, 0);
};

var poQtyByBucket = function (poList, bucketList)
{
    if (_.isNull(bucketList))
    {
        return _.reduce(_.pluck(poList, 'qty'),
            function (memo, num)
            {
                return memo + num;
            }, 0);
    }

    var qtyList = _.map(bucketList, function (bucket)
    {
        var filterByBucket = _.where(poList, { bucket: bucket });
        return _.reduce(_.pluck(filterByBucket, 'qty'),
            function (memo, num)
            {
                return memo + num;
            }, 0);
    });
    return _.reduce(qtyList, function (memo, num)
    {
        return memo + num;
    }, 0);
};

var isInt = function (n)
{
    return Number(n) === n && n % 1 === 0;
};

var isFloat = function isFloat(n)
{
    return n === Number(n) && n % 1 !== 0;
};

var formatNumbers = function (rows)
{
    _.each(rows, function (row)
    {
        _.each(row, function (value, key, obj)
        {
            if (isFloat(obj[key]))
            {
                obj[key] = value.toFixed(2);
            }
        });
    });
};

var tender_type_report_values = {
    "saledate": 'Date',
    "outlet_name": 'Outlet Name',
    "cash_amount": 'Cash',
    "card_amount": 'Card',
    "sodexocard_amount": 'Sodexo Card',
    "sodexocoupon_amount": 'Sodexo Coupon',
    "credit_amount": 'Credit',
    "gprscard_amount": 'GPRS Card',
    "wallet_amount": 'Wallet',
    "total": 'Total'
};
var REPORT_FIELDS = {
    daily_receipts:
    {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Restaurant',
        "sale": 'Gross Sales (excluding taxes)',
        "vat": 'Total VAT',
        "st_with_abatement": 'Total ST (including abatement)',
        "foodbox_fee": 'Frshly Transaction Fee',
        "foodbox_st": 'ST on Frshly Transaction Fee',
        "foodbox_txn": 'Total Frshly Transaction Fee',
        "restaurant_fee": 'Restaurant Net Receipt (from Gross Sales excl taxes)',
        "foodbox_tds": 'TDS on Frshly Transaction Fee',
        "restaurant_remit_bef_adj": 'Remittance to Restaurant (before adjustments)',
        "restaurant_liability": 'Restaurant Liability on Errors',
        "restaurant_liability_st": 'ST on Restaurant Liability',
        "restaurant_liability_tds": 'TDS on Restaurant Liability',
        "restaurant_liability_total": 'Restaurant Liability incl ST/TDS',
        "foodbox_liability": 'Frshly Liability',
        "restaurant_liability_net": 'Net Restaurant Liability (Remittance Adjustment)',
        "restaurant_remit_aft_adj": 'Adjusted Remittance to Restaurant',
        "last_carry_forward": 'Carry-Forward from previous date',
        "foodbox_final_receipt": 'Frshly Final Receipt',
        "restaurant_final_remittance": 'Final Revenue Remittance to Restaurant (after offsetting carry-fwd)',
        "next_carry_forward": 'Carry Forward to Next Date',
        "restaurant_tax_remit": 'Tax Remittance to Restaurant',
        "restaurant_total_remittance": 'Total Remittance to Restaurant',
        "start_time": 'Start Time',
        "end_time": 'End Time'
    },
    daily_receipts_gst_Nov:
    {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "sale": 'Gross Sales (excluding taxes)',
        "gst": 'Total GST',
        "foodbox_fee": 'Frshly Transaction Fee',
        "foodbox_gst": 'GST on Frshly Transaction Fee',
        "foodbox_txn_gst": 'Total Frshly Transaction Fee',
        "restaurant_fee_gst": 'Restaurant Net Receipt (from Gross Sales excl taxes)',
        "restaurant_liability": 'Restaurant Liability on Errors',
        "restaurant_liability_gst": 'GST on Restaurant Liability',
        "restaurant_liability_total_gst": 'Restaurant Liability incl GST',
        "foodbox_liability": 'Frshly Liability',
        "restaurant_liability_net_gst": 'Net Restaurant Liability (Remittance Adjustment)',
        "restaurant_remit_aft_adj_gst": 'Adjusted Remittance to Restaurant',
        "last_carry_forward": 'Carry-Forward from previous date',
        "foodbox_final_receipt": 'Frshly Final Receipt',
        "restaurant_final_remittance": 'Final Revenue Remittance to Restaurant (after offsetting carry-fwd)',
        "next_carry_forward": 'Carry Forward to Next Date',
        "restaurant_tax_remit_gst": 'Tax Remittance to Restaurant',
        "restaurant_total_remittance": 'Total Remittance to Restaurant',
        "start_time": 'Start Time',
        "end_time": 'End Time'
    },
    daily_sale_gst:
    {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "sale": 'Gross Sales (excluding taxes)',
        "gst": 'Total GST',
        "foodbox_txn_gst": 'Total Frshly Transaction Fee'
    },
    daily_receipts_gst:
    {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "sale": 'Gross Sales (excluding taxes)',
        "gst": 'Total GST',
        "foodbox_fee": 'Frshly Transaction Fee',
        "foodbox_gst": 'GST on Frshly Transaction Fee',
        "foodbox_txn_gst": 'Total Frshly Transaction Fee',
        "restaurant_fee_gst": 'Restaurant Net Receipt (from Gross Sales excl taxes)',
        "foodbox_tds": 'TDS on Frshly Transaction Fee',
        "restaurant_remit_bef_adj_gst": 'Remittance to Restaurant (before adjustments)',
        "restaurant_liability": 'Restaurant Liability on Errors',
        "restaurant_liability_gst": 'GST on Restaurant Liability',
        "restaurant_liability_tds": 'TDS on Restaurant Liability',
        "restaurant_liability_total_gst": 'Restaurant Liability incl GST/TDS',
        "foodbox_liability": 'Frshly Liability',
        "restaurant_liability_net_gst": 'Net Restaurant Liability (Remittance Adjustment)',
        "restaurant_remit_aft_adj_gst": 'Adjusted Remittance to Restaurant',
        "last_carry_forward": 'Carry-Forward from previous date',
        "foodbox_final_receipt": 'Frshly Final Receipt',
        "restaurant_final_remittance": 'Final Revenue Remittance to Restaurant (after offsetting carry-fwd)',
        "next_carry_forward": 'Carry Forward to Next Date',
        "restaurant_tax_remit_gst": 'Tax Remittance to Restaurant',
        "restaurant_total_remittance": 'Total Remittance to Restaurant',
        "start_time": 'Start Time',
        "end_time": 'End Time'
    },
    daily_revenue_analysis: {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "session_name": 'Session',
        "item_id": 'Item ID',
        "item_name": 'Item Name',
        "taken": 'Taken Qty',
        "sold": 'Sold Qty',
        "rev_share": 'Restaurant Fee for Sold',
        /* "mrp_price": 'MRP for Product', //mrp*/
        "wastage_qty": 'Wastage Qty',
        "foodbox_issues_qty": 'Frshly Error Qty',
        "foodbox_issues_value": 'Frshly Err Value',
        "restaurant_issues_qty": 'Restaurant Err Qty',
        "restaurant_issues_value": 'Restaurant Err Value',
        "transporter_issues_qty": 'Transporter Err Qty',
        "transporter_issues_value": 'Transporter Err Value',
        "net_revenue": 'Net Revenue'
    },
    daily_revenue_analysis_gst: {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "session_name": 'Session',
        "item_id": 'Item ID',
        "item_name": 'Item Name',
        "po_quantity": 'PO Qty',
        "taken": 'Taken Qty',
        "sold": 'Sold Qty',
        "rev_share": 'Restaurant Fee for Sold',
        "rest_gst": 'GST Amount',
        "rev_share_rest_gst": 'Restaurant Fee for Sold(Incl. GST)',
        //"mrp_price": 'MRP for Product', //mrp
        "wastage_qty": 'Wastage Qty',
        "foodbox_issues_qty": 'Frshly Error Qty',
        "foodbox_issues_value": 'Frshly Err Value',
        "restaurant_issues_qty": 'Restaurant Err Qty',
        "restaurant_issues_value": 'Restaurant Err Value',
        "transporter_issues_qty": 'Transporter Err Qty',
        "transporter_issues_value": 'Transporter Err Value',
        "net_revenue": 'Net Revenue'
    },
    hq_daily_revenue_analysis: {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "session_name": 'Session',
        "item_id": 'Item ID',
        "item_name": 'Item Name',
        "po_quantity": 'PO Qty',
        "taken": 'Taken Qty',
        "sold": 'Sold Qty',
        "rev_share": 'Frshly Fee for Sold',
        /* "mrp_price": 'MRP for Product', //mrp*/
        "wastage_qty": 'Wastage Qty',
        "foodbox_issues_qty": 'Frshly Error Qty',
        "foodbox_issues_value": 'Frshly Err Value',
        "restaurant_issues_qty": 'Restaurant Err Qty',
        "restaurant_issues_value": 'Restaurant Err Value',
        "transporter_issues_qty": 'Transporter Err Qty',
        "transporter_issues_value": 'Transporter Err Value',
        "net_revenue": 'Net Revenue'
    },
    error_details: {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "entity_name": 'Entity',
        "restaurant_name": 'Restaurant',
        "session_name": 'Session',
        "item_id": 'Item ID',
        "item_name": 'Item Name',
        "error_liability": 'Error Liability',
        "error_type": "Error Type",
        "error_qty": "Qty",
        "error_value_restaurant": "Value of Error @ Restaurant",
        "error_value_foodbox": "Value of Error @ Frshly"
    },
    hq_bill_bundles: {
        "date": 'Date',
        "outlet_name": 'Outlet',
        "link": 'Link to bill bundles pdf'
    },
    fv_bill_bundles: {
        "date": 'Date',
        "location": 'Location',
        "outlet_name": 'Outlet',
        "link": 'Link to bill bundles pdf'
    },
    daily_sale_gst_august:
    {
        "date": 'Date',
        "outlet_name": 'Outlet',
        /* "entity_name": 'Entity',*/
        "restaurant_name": 'Restaurant',
        "sale": 'Gross Sales (excluding taxes)',
        "gst": 'Total GST',
        "foodbox_txn_gst": 'Total Frshly Transaction Fee'
    },
    non_transit_tender_type_reports: tender_type_report_values,
    transit_tender_type_reports: tender_type_report_values

};


// fv bill bundle link
var generate_bill_bundle_fv_link = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    var rows = [];
    dbUtils.getAllFVsByEntity(entity, function (err, fvs)
    {
        if (err)
        {
            callback(err, null);
            return;
        }
        _.each(fvs, function (fv)
        {
            var report = {};
            var link = '<a target=\'_blank\' href=\'/generatebill/fv/' + date + '/' + fv.id + '/'
                + outlet.id + '/bills.pdf\'>bills</a>';

            // check if any bills present for fv
            var fv_bills = _.where(entity_consolidated_data, { 'restaurant_id': fv.id });
            if (_.isEmpty(fv_bills))
            {
                link = 'No bills found.';
            }
            report["date"] = moment(date).format('Do MMMM YYYY');
            report["location"] = fv.location;
            report["outlet_name"] = outlet.short_name;
            report["link"] = link;
            rows.push(report);
        });
        callback(null, rows);
        return;
    });
};

// hq bill bundle link
var generate_bill_bundle_hq_link = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    var rows = [];
    var report = {};
    var link = '<a target=\'_blank\' href=\'/generatebill/outlet/' + date + '/'
        + outlet.id + '/bills.pdf\'>bills</a>';

    if (_.isEmpty(entity_consolidated_data))
    {
        link = 'No bills found.';
    }

    report["date"] = moment(date).format('Do MMMM YYYY');
    report["outlet_name"] = outlet.short_name;
    report["link"] = link;
    rows.push(report);
    callback(null, rows);
    return;
};

// Daily receipt report generator
var compute_daily_receipt_for_single_entity = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    var entity_cash_settlements =
        _.pluck(entity_consolidated_data, "cash_settlement");
    var rows = [];
    var report = {};
    //basic
    report["date"] = moment(date).format('Do MMMM YYYY');
    report["outlet_name"] = outlet.short_name;
    report["entity_name"] = entity;
    report["start_time"] = outlet.start_of_day;
    report["end_time"] = outlet.end_of_day;
    report["is24hr"] = outlet.is24hr;

    // aggregates
    var fields = ["sale", "vat", "st_with_abatement", "foodbox_fee", "foodbox_st",
        "foodbox_txn", "restaurant_fee", "foodbox_tds", "restaurant_remit_bef_adj",
        "restaurant_liability", "restaurant_liability_st", "restaurant_liability_tds",
        "restaurant_liability_total", "foodbox_liability", "restaurant_liability_net",
        "restaurant_remit_aft_adj", "restaurant_tax_remit"];

    // Aggregates
    _.each(fields, function (f)
    {
        report[f] = aggregateByColumn(entity_cash_settlements, f);
    });

    // Adjust with carry forward
    var carry_forward = dbUtils.getCarryForward(entity, date, outlet.city, function (err, res)
    {
        if (err)
        {
            callback(err, null);
            return;
        }
        var past_due = (res) ? res.carry_forward : 0;
        var balance = report["restaurant_remit_aft_adj"] - past_due;
        var new_carry_forward = (balance >= 0) ? 0 : (-balance);
        var final_remittance = (balance >= 0) ? balance : 0;

        report["last_carry_forward"] = past_due;
        report["foodbox_final_receipt"] = report["sale"] - final_remittance;
        report["restaurant_final_remittance"] = final_remittance;
        report["next_carry_forward"] = new_carry_forward;
        report["restaurant_total_remittance"] = final_remittance + report["restaurant_tax_remit"];
        rows.push(report)
        callback(null, rows);
        return;
    });
};

// Daily receipt report generator for GST
var compute_daily_receipt_for_single_entity_gst = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    var entity_cash_settlements =
        _.pluck(entity_consolidated_data, "cash_settlement");

    var rest_name =
        _.pluck(entity_consolidated_data, "restaurant_name");

    var restaurant_name = _.first(rest_name);

    if (restaurant_name == undefined)
    {
        restaurant_name = entity;
    }

    var rows = [];
    var report = {};
    //basic
    report["date"] = moment(date).format('Do MMMM YYYY');
    report["outlet_name"] = outlet.short_name;
    report["entity_name"] = entity;
    report["restaurant_name"] = restaurant_name;
    report["start_time"] = outlet.start_of_day;
    report["end_time"] = outlet.end_of_day;
    report["is24hr"] = outlet.is24hr;

    // aggregates
    var fields = ["sale", "gst", "foodbox_fee", "foodbox_gst",
        "foodbox_txn_gst", "restaurant_fee_gst",
        "restaurant_liability", "restaurant_liability_gst", "restaurant_liability_tds",
        "restaurant_liability_total_gst", "foodbox_liability", "restaurant_liability_net_gst",
        "restaurant_remit_aft_adj_gst", "restaurant_tax_remit_gst"];

    // Aggregates
    _.each(fields, function (f)
    {
        report[f] = aggregateByColumn(entity_cash_settlements, f);
    });

    //report["sale"]=report["sale"].toFixed();
    // Adjust with carry forward
    var carry_forward = dbUtils.getCarryForward(entity, date, outlet.city, function (err, res)
    {
        if (err)
        {
            callback(err, null);
            return;
        }
        var past_due = (res) ? res.carry_forward : 0;
        var balance = report["restaurant_remit_aft_adj_gst"] - past_due;
        var new_carry_forward = (balance >= 0) ? 0 : (-balance);
        var final_remittance = (balance >= 0) ? balance : 0;

        report["last_carry_forward"] = past_due;
        report["foodbox_final_receipt"] = report["sale"] - final_remittance;
        report["restaurant_final_remittance"] = final_remittance;
        report["next_carry_forward"] = new_carry_forward;
        report["restaurant_total_remittance"] = final_remittance + report["restaurant_tax_remit_gst"];
        rows.push(report)
        callback(null, rows);
        return;
    });
};

//Daily sale GST
var compute_daily_receipt_for_single_entity_sale_gst = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    console.log("compute_daily_receipt_for_single_entity_sale_gst_august");
    var entity_cash_settlements =
        _.pluck(entity_consolidated_data, "cash_settlement");

    var rest_name =
        _.pluck(entity_consolidated_data, "restaurant_name");

    var restaurant_name = _.first(rest_name);

    if (restaurant_name == undefined)
    {
        restaurant_name = entity;
    }
    /*
        1.	Date
        2.	Outlet
        3.	Restaurant
        4.	Selling Price
        5.	Total GST 
        6.	Frshly Fee
    */
    var rows = [];
    var report = {};
    //basic
    report["date"] = moment(date).format('Do MMMM YYYY');
    report["outlet_name"] = outlet.short_name;
    report["entity_name"] = entity;
    report["restaurant_name"] = restaurant_name;

    // aggregates
    var fields = ["sale", "gst", "foodbox_fee", "foodbox_txn_gst"];

    // Aggregates
    _.each(fields, function (f)
    {
        report[f] = aggregateByColumn(entity_cash_settlements, f);
    });

    //report["sale"]=report["sale"].toFixed();
    // Adjust with carry forward
    var carry_forward = dbUtils.getCarryForward(entity, date, outlet.city, function (err, res)
    {
        if (err)
        {
            callback(err, null);
            return;
        }


        //report["sale"]= report["sale"].toFixed(2);
        //report["foodbox_txn_gst"]=report["foodbox_txn_gst"].toFixed(2);
        rows.push(report)
        callback(null, rows);
        return;
    });
};

// Daily revenue analysis
var compute_daily_revenue_analysis = function (date, outlet,
    entity, entity_consolidated_data, isHQ, callback)
{
    var rows = [];
    //console.log("############################## *********************** OUTLET: " + JSON.stringify(outlet));
    //console.log("############################## *********************** Outlet Version in bootstraprc file: " + process.env.OUTLETVERSION);
    // console.log("entity_consolidated_data: " + JSON.stringify(entity_consolidated_data));
    // outlet.version
    var groupBySession = _.groupBy(entity_consolidated_data, "session");
    _.each(_.keys(groupBySession), function (session)
    {
        var session_data = groupBySession[session];
        var groupByFoodItem = _.groupBy(session_data, "item_id");
        _.each(_.keys(groupByFoodItem), function (item_id)
        {
            var purchases = groupByFoodItem[item_id];
            // console.log("&&&&&&&&&&&&&&&&&& ****************************** purchases : " + JSON.stringify(purchases));
            var first = _.first(purchases);
            var base_fee = isHQ ? first.foodbox_fee : first.restaurant_fee;
            var item = {};
            var duplicate = [];
            item["date"] = moment(date).format('Do MMMM YYYY');
            item["outlet_name"] = outlet.short_name;
            item["restaurant_name"] = (first.restaurant_name == undefined) ? entity : first.restaurant_name;
            item["entity_name"] = entity;
            item["session_name"] = first.session;
            item["item_name"] = first.item_name;
            //console.log("###############po_id: " + first.po_id + "item_id: " + first.item_id);
            item["quantity"] = 0;
            item["taken"] = 0;
            item["item_id"] = first.item_id;
            item["po_id"] = first.po_id;
            var date_format = moment(date).format('YYYY-MM-DD');
            var outlet_version_date_format = null;

            if (outlet.version_date != null)
            {
                outlet_version_date_format = moment(outlet.version_date).format('YYYY-MM-DD');
            }

            //console.log("date_format: " + date_format + " outlet.version_date: " + outlet_version_date_format);
            if (_.has(first, 'po_id'))
            {

                if ((outlet_version_date_format == null || (outlet_version_date_format != null && date_format < outlet_version_date_format)))
                {
                    //console.log("##################################### ************* Old report function called");
                    item["quantity"] = poQtyByStatus(purchases, null);


                    item["taken"] = Number(item["quantity"]); // - Number(poQtyByStatus(purchases, ["not dispatched"]));
                }

                //console.log("############### if quantity" + item["quantity"]);
                //item["quantity"] = item["quantity"] == "undefined" ? 0 : item["quantity"];                
                //console.log("############### if taken: " + item["taken"] + " not dispatched: " + Number(poQtyByStatus(purchases, ["not dispatched"])));
                item["sold"] = poQtyByStatus(purchases, ["sold"]);
                item["rev_share"] = item["sold"] * base_fee;
                //mrp
                // console.log("mrp:"+ JSON.stringify( first));
                item["mrp_price"] = (first["mrp"]).toFixed(2);
                item["wastage_qty"] = poQtyByBucket(purchases, ["wastage"]);
            } else
            {

                item["taken"] = aggregateByColumn(purchases, 'qty');
                //console.log("############### else taken" + item["taken"]);
                var refunds = aggregateByColumn(purchases, 'refund_qty');
                item["sold"] = item["taken"] + refunds;
                item["rev_share"] = item["sold"] * base_fee;
                //mrp
                item["mrp_price"] = (first["mrp"]).toFixed(2);
                item["wastage_qty"] = (-1) * refunds;
            }
            item["foodbox_issues_qty"] = poQtyByBucket(purchases, ["foodbox"]);
            item["foodbox_issues_value"] = item["foodbox_issues_qty"] * first.restaurant_fee;
            item["restaurant_issues_qty"] = poQtyByBucket(purchases, ["restaurant"]);
            item["restaurant_issues_value"] = item["restaurant_issues_qty"] * first.foodbox_fee;
            item["transporter_issues_qty"] = poQtyByBucket(purchases, ["transporter"]);
            item["transporter_issues_value"] = item["transporter_issues_qty"] * first.restaurant_fee;
            if (isHQ)
            {
                item["transporter_issues_value"] += item["transporter_issues_qty"] * first.foodbox_fee;
                item["net_revenue"] = item["rev_share"] - item["foodbox_issues_value"]
                    + item["restaurant_issues_value"] + item["transporter_issues_value"];
            } else
            {
                item["net_revenue"] = item["rev_share"] + item["foodbox_issues_value"]
                    - item["restaurant_issues_value"] + item["transporter_issues_value"];
            }

            if (outlet_version_date_format != null && date_format >= outlet_version_date_format)
            {
                for (var p = 0; p < purchases.length; p++)
                {
                    //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!purchases[p] " + JSON.stringify(purchases[p]) + "cccccccccccccccccccc" + purchases[p]["item_id"]);

                    if (result_po_taken != undefined)
                    {
                        for (var i = 0; i < result_po_taken.length; i++)
                        {

                            // console.log("******************************************* result_po_taken[result_taken].po_id: " + result_po_taken[result_taken].po_id + "result_po_taken[result_taken].item_id: " + result_po_taken[result_taken].item_id)
                            // console.log("########################################### item[po_id]: " + item["po_id"] + "item[item_id]: " + item["item_id"]);

                            // item["taken"] = 15;
                            if ((Number(result_po_taken[i].po_id) == Number(purchases[p]["po_id"])) &&
                                ((Number(result_po_taken[i].item_id) == Number(purchases[p]["item_id"]))))
                            {
                                if (duplicate.indexOf(result_po_taken[i].po_id + result_po_taken[i].item_id) == -1)
                                {
                                    var qty = 0;
                                    var po_qty = 0;
                                    if (!isNaN(Number(item["taken"])))
                                    {
                                        qty = Number(item["taken"]);
                                        po_qty = Number(item["po_quantity"]);
                                    }
                                    item["taken"] = qty + Number(result_po_taken[i].quantity);
                                    item["po_quantity"] = qty + Number(result_po_taken[i].po_quantity);

                                    var damagedQty = 0;
                                    var Rest_fault_Qty = 0;
                                    if (!isNaN(Number(result_po_taken[i].damaged)))
                                    {
                                        damagedQty = Number(result_po_taken[i].damaged);
                                        if (!isNaN(Number(item["transporter_issues_qty"])))
                                        {
                                            item["transporter_issues_qty"] = Number(item["transporter_issues_qty"]);
                                        }
                                        else
                                        {
                                            item["transporter_issues_qty"] = damagedQty;
                                        }
                                    }


                                    if (!isNaN(Number(result_po_taken[i].rest_fault)))
                                    {
                                        Rest_fault_Qty = Number(result_po_taken[i].rest_fault);
                                        if (!isNaN(Number(item["restaurant_issues_qty"])))
                                        {
                                            item["restaurant_issues_qty"] = Number(item["restaurant_issues_qty"]);
                                        }
                                        else
                                        {
                                            item["restaurant_issues_qty"] = Rest_fault_Qty;
                                        }

                                    }

                                    var issues_qty = Number(item["foodbox_issues_qty"]) + Number(item["restaurant_issues_qty"]) + Number(item["transporter_issues_qty"]);
                                    item["wastage_qty"] = Number(item['taken']) - (Number(item['sold']) + Number(issues_qty));
                                    // item["taken"] = 15;
                                    // rows[i]["taken"] = result_po_taken[result_taken].quantity;;
                                    // console.log("********** loop  quantity" + item["quantity"]);
                                    duplicate.push(result_po_taken[i].po_id + result_po_taken[i].item_id);
                                }
                            }
                        }
                    }
                }
            }

            if (isNaN(Number(item["taken"])))
            {
                item["taken"] = item["sold"];
            }
            rows.push(item);
        });
    });

    callback(null, rows);
    return;
};

var gstDefaultPercent = 9;
var compute_daily_revenue_analysis_gst = function (date, outlet,
    entity, entity_consolidated_data, isHQ, callback)
{
    var rows = [];
    //console.log("############################## *********************** OUTLET: " + JSON.stringify(outlet));
    //console.log("############################## *********************** Outlet Version in bootstraprc file: " + process.env.OUTLETVERSION);
    console.log("entity_consolidated_data compute_daily_revenue_analysis_gst: " + JSON.stringify(entity_consolidated_data));
    // outlet.version
    var cgst_percent = _.pluck(entity_consolidated_data, "rest_cgst_percent");
    var sgst_percent = _.pluck(entity_consolidated_data, "rest_cgst_percent");
    var rest_cgst_percent = _.first(cgst_percent);
    var rest_sgst_percent = _.first(sgst_percent);
    console.log("rest_sgst_percent:" + rest_sgst_percent);
    if (rest_cgst_percent == undefined)
    {
        rest_cgst_percent = gstDefaultPercent;
        rest_sgst_percent = gstDefaultPercent;
    }
    var groupBySession = _.groupBy(entity_consolidated_data, "session");
    _.each(_.keys(groupBySession), function (session)
    {
        var session_data = groupBySession[session];
        var groupByFoodItem = _.groupBy(session_data, "item_id");
        _.each(_.keys(groupByFoodItem), function (item_id)
        {
            var purchases = groupByFoodItem[item_id];
            // console.log("&&&&&&&&&&&&&&&&&& ****************************** purchases : " + JSON.stringify(purchases));
            var first = _.first(purchases);
            var base_fee = isHQ ? first.foodbox_fee : first.restaurant_fee;
            var item = {};
            var duplicate = [];
            item["date"] = moment(date).format('Do MMMM YYYY');
            item["outlet_name"] = outlet.short_name;
            item["restaurant_name"] = (first.restaurant_name == undefined) ? entity : first.restaurant_name;
            item["entity_name"] = entity;
            item["session_name"] = first.session;
            item["item_name"] = first.item_name;
            //console.log("###############po_id: " + first.po_id + "item_id: " + first.item_id);
            item["quantity"] = 0;
            item["taken"] = 0;
            item["item_id"] = first.item_id;
            item["po_id"] = first.po_id;
            var date_format = moment(date).format('YYYY-MM-DD');
            var outlet_version_date_format = null;
            if (outlet.version_date != null)
            {
                outlet_version_date_format = moment(outlet.version_date).format('YYYY-MM-DD');
            }
            //console.log("date_format: " + date_format + " outlet.version_date: " + outlet_version_date_format);
            if (_.has(first, 'po_id'))
            {
                if ((outlet_version_date_format == null || (outlet_version_date_format != null && date_format < outlet_version_date_format)))
                {
                    //console.log("##################################### ************* Old report function called");
                    item["quantity"] = poQtyByStatus(purchases, null);
                    item["taken"] = Number(item["quantity"]); // - Number(poQtyByStatus(purchases, ["not dispatched"]));
                }
                //console.log("############### if quantity" + item["quantity"]);
                //item["quantity"] = item["quantity"] == "undefined" ? 0 : item["quantity"];                
                //console.log("############### if taken: " + item["taken"] + " not dispatched: " + Number(poQtyByStatus(purchases, ["not dispatched"])));
                item["sold"] = poQtyByStatus(purchases, ["sold"]);
                item["rev_share"] = item["sold"] * base_fee;
                item["rest_gst"] = item["rev_share"] * (rest_cgst_percent + rest_sgst_percent) / 100;
                item["rev_share_rest_gst"] = item["rev_share"] + item["rest_gst"];
                //mrp
                // console.log("mrp:"+ JSON.stringify( first));
                item["mrp_price"] = (first["mrp"]).toFixed(2);
                item["wastage_qty"] = poQtyByBucket(purchases, ["wastage"]);
            } else
            {
                item["taken"] = aggregateByColumn(purchases, 'qty');
                //console.log("############### else taken" + item["taken"]);
                var refunds = aggregateByColumn(purchases, 'refund_qty');
                item["sold"] = item["taken"] + refunds;
                item["rev_share"] = item["sold"] * base_fee;
                //mrp
                item["mrp_price"] = (first["mrp"]).toFixed(2);
                item["wastage_qty"] = (-1) * refunds;
            }
            item["foodbox_issues_qty"] = poQtyByBucket(purchases, ["foodbox"]);
            item["foodbox_issues_value"] = item["foodbox_issues_qty"] * first.restaurant_fee;
            item["restaurant_issues_qty"] = poQtyByBucket(purchases, ["restaurant"]);
            item["restaurant_issues_value"] = item["restaurant_issues_qty"] * first.foodbox_fee;
            item["transporter_issues_qty"] = poQtyByBucket(purchases, ["transporter"]);
            item["transporter_issues_value"] = item["transporter_issues_qty"] * first.restaurant_fee;
            if (isHQ)
            {
                item["transporter_issues_value"] += item["transporter_issues_qty"] * first.foodbox_fee;
                item["net_revenue"] = item["rev_share"] + item["rest_gst"];
            } else
            {
                item["net_revenue"] = item["rev_share"] + item["rest_gst"];
            }
            if (outlet_version_date_format != null && date_format >= outlet_version_date_format)
            {
                for (var p = 0; p < purchases.length; p++)
                {
                    //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!purchases[p] " + JSON.stringify(purchases[p]) + "cccccccccccccccccccc" + purchases[p]["item_id"]);
                    if (result_po_taken != undefined)
                    {
                        for (var i = 0; i < result_po_taken.length; i++)
                        {
                            // console.log("******************************************* result_po_taken[result_taken].po_id: " + result_po_taken[result_taken].po_id + "result_po_taken[result_taken].item_id: " + result_po_taken[result_taken].item_id)
                            // console.log("########################################### item[po_id]: " + item["po_id"] + "item[item_id]: " + item["item_id"]);
                            // item["taken"] = 15;
                            if ((Number(result_po_taken[i].po_id) == Number(purchases[p]["po_id"])) &&
                                ((Number(result_po_taken[i].item_id) == Number(purchases[p]["item_id"]))))
                            {
                                if (duplicate.indexOf(result_po_taken[i].po_id + result_po_taken[i].item_id) == -1)
                                {
                                    var qty = 0;
                                    var po_qty = 0;
                                    if (!isNaN(Number(item["taken"])))
                                    {
                                        qty = Number(item["taken"]);
                                        po_qty = Number(item["po_quantity"]);
                                    }
                                    item["po_quantity"] = qty + Number(result_po_taken[i].po_quantity);
                                    item["taken"] = qty + Number(result_po_taken[i].quantity);
                                    var damagedQty = 0;
                                    var Rest_fault_Qty = 0;
                                    if (!isNaN(Number(result_po_taken[i].damaged)))
                                    {
                                        damagedQty = Number(result_po_taken[i].damaged);
                                        if (!isNaN(Number(item["transporter_issues_qty"])))
                                        {
                                            item["transporter_issues_qty"] = Number(item["transporter_issues_qty"]);
                                        }
                                        else
                                        {
                                            item["transporter_issues_qty"] = damagedQty;
                                        }
                                    }
                                    if (!isNaN(Number(result_po_taken[i].rest_fault)))
                                    {
                                        Rest_fault_Qty = Number(result_po_taken[i].rest_fault);
                                        if (!isNaN(Number(item["restaurant_issues_qty"])))
                                        {
                                            item["restaurant_issues_qty"] = Number(item["restaurant_issues_qty"]);
                                        }
                                        else
                                        {
                                            item["restaurant_issues_qty"] = Rest_fault_Qty;
                                        }
                                    }
                                    var issues_qty = Number(item["foodbox_issues_qty"]) + Number(item["restaurant_issues_qty"]) + Number(item["transporter_issues_qty"]);
                                    item["wastage_qty"] = Number(item['taken']) - (Number(item['sold']) + Number(issues_qty));
                                    // item["taken"] = 15;
                                    // rows[i]["taken"] = result_po_taken[result_taken].quantity;;
                                    // console.log("********** loop  quantity" + item["quantity"]);
                                    duplicate.push(result_po_taken[i].po_id + result_po_taken[i].item_id);
                                }
                            }
                        }
                    }
                }
            }
            if (isNaN(Number(item["taken"])))
            {
                item["taken"] = item["sold"];
            }
            if (isNaN(Number(item["po_quantity"])))
            {
                item["po_quantity"] = item["taken"];
            }
            //  console.log("item");
            // console.log(item);
            rows.push(item);
        });
    });
    callback(null, rows);
    return;
};
var gettakenquantity = function (result_po_taken, item, callback)
{
    for (var i = 0; i < result_po_taken.length; i++)
    {

        if ((Number(result_po_taken[i].po_id) == Number(item["po_id"])) &&
            ((Number(result_po_taken[i].item_id) == Number(item["item_id"]))))
        {
            //console.log("&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&  result_po_taken[i].quantity: " + result_po_taken[i].quantity);
            return (null, result_po_taken[i].quantity);
        }
    }


};

// FV : Daily Revenue Analysis
var compute_daily_revenue_analysis_for_fv = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    compute_daily_revenue_analysis(date, outlet, entity,
        entity_consolidated_data, false, callback);
};
var compute_daily_revenue_analysis_for_fv_gst = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    compute_daily_revenue_analysis_gst(date, outlet, entity,
        entity_consolidated_data, false, callback);
};

// HQ Daily revenue analysis
var compute_daily_revenue_analysis_hq = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    compute_daily_revenue_analysis(date, outlet, entity,
        entity_consolidated_data, true, callback);
};

//HQ Tender type Reports
var generate_report_for_tender_type = function (from_date, to_date, outlet_id,
    callback)
{
    // console.log("Tender "+from_date,to_date,outlets.id);
    compute_daily_revenue_analysis(date, outlet, entity,
        entity_consolidated_data, true, callback);
};

// Daily Error report
var compute_daily_error_details_report = function (date, outlet,
    entity, entity_consolidated_data, callback)
{
    var po_data = _.filter(entity_consolidated_data, function (d)
    {
        return _.has(d, 'po_id');
    });

    var rows = [];
    var groupBySession = _.groupBy(po_data, "session");
    _.each(_.keys(groupBySession), function (session)
    {
        var session_data = groupBySession[session];
        var groupByFoodItem = _.groupBy(session_data, "item_id");
        _.each(_.keys(groupByFoodItem), function (item_id)
        {

            var purchases = groupByFoodItem[item_id];

            var foodbox_errors = _.where(purchases, { bucket: "foodbox" });
            var restaurant_errors = _.where(purchases, { bucket: "restaurant" });
            var transporter_errors = _.where(purchases, { bucket: "transporter" });
            var all_errors = [].concat(foodbox_errors).concat(restaurant_errors).concat(transporter_errors);
            // group by error type
            var error_status_groups = _.groupBy(all_errors, "status");
            _.each(_.keys(error_status_groups), function (status)
            {
                var item = {};
                var first = _.first(error_status_groups[status]);
                item["date"] = moment(date).format('Do MMMM YYYY');
                item["outlet_name"] = outlet.short_name;
                item["entity_name"] = entity;
                if (first.restaurant_name == undefined)
                {
                    first.restaurant_name = entity;
                }
                item["restaurant_name"] = first.restaurant_name;
                item["item_id"] = first.item_id;
                item["session_name"] = first.session;
                item["item_name"] = first.item_name;
                item["error_liability"] = first.bucket;
                item["error_type"] = status;
                item["error_qty"] = aggregateByColumn(error_status_groups[status], "qty");
                if (first.bucket == "foodbox" || first.bucket == "transporter")
                {
                    item["error_value_foodbox"] = item["error_qty"] * first.restaurant_fee;
                    item["error_value_restaurant"] = 0;
                } else if (first.bucket == "restaurant")
                {
                    item["error_value_restaurant"] = item["error_qty"] * first.foodbox_fee;
                    item["error_value_foodbox"] = 0;
                }
                else
                {
                    item["error_value_foodbox"] = item["error_value_restaurant"] = 0;
                }
                rows.push(item);
            });
        });
    });
    callback(null, rows);
    return;
};

var aggregate_by_entities = function (date, outlet, data, report_generator, type, callback)
{
    var entitiy_groups = _.groupBy(data, "entity");
    // HACK: Always include Atchayam for reports.    

    if (type == 'HQ' && !_.isEmpty(data) && !_.has(entitiy_groups, 'ATC'))
    {
        entitiy_groups['ATC'] = [];
    }
    async.map(_.keys(entitiy_groups),
        function (entity, map_callback)
        {
            report_generator(date, outlet, entity, entitiy_groups[entity], map_callback);
        },
        function (map_err, map_results)
        {
            if (map_err)
            {
                callback(map_err, null);
                return;
            }
            callback(null, _.flatten(map_results));
            return;
        });
};

// Totals of numerical columns for a report
var aggregateReportColumns = function (rows)
{
    var sample = _.first(rows);
    var aggregates = {};
    _.each(_.keys(sample), function (k)
    {
        if (_.isNumber(sample[k]))
        {
            var aggr = aggregateByColumn(rows, k);
            aggregates[k] = isFloat(aggr) ? (aggr.toFixed(2)) : aggr;
        } else
        {
            aggregates[k] = '';
        }
    });
    return aggregates;
};


// Generic function for generating all reports based on date ranges,
// outlet(s) and entity(ies)
var generate_report = function (from_date, to_date, outlets, entity,
    report_type, report_generator, type, callback)
{
    debugger;
    // Dates
    var dr = moment.range(from_date, to_date);
    var dates = [];
    dr.by('days', function (m)
    {
        dates.push(m.format('YYYY-MM-DD'));
    });

    // pair of (outlet, date)
    var pairs = _.flatten(_.map(dates, function (dt)
    {
        return _.map(outlets, function (o)
        {
            return { outlet: o, date: dt };
        });
    }), true);
    // console.log("tender type before started");
    //console.log("----" + selected_outlet_id)
    if (report_type == 'non_transit_tender_type_reports' || report_type == 'transit_tender_type_reports')
    {
        //console.log("tender type started");
        //console.log("Data " + from_date + "--" + to_date + "---" + selected_outlet_id + "---");
        var ispublicsector = report_type == 'transit_tender_type_reports' ? true : false;

        //console.log(JSON.stringify(outlets));
        var outlet_id = selected_outlet_id;
        dbUtils.getTenderTypeRecords(outlet_id, from_date, to_date, ispublicsector, function (err, tendertype_result)
        {
            if (err)
            {
                console.log("tender type error");
                callback(err, null);
                return;
            }
            // console.log("result" + tendertype_result);
            // flatten out as each report_generator execution 
            // will return an array of results.
            var rows = tendertype_result;
            // aggregates
            console.log("tender type rows");
            var aggregates = null;
            if (!_.isEmpty(rows))
            {
                aggregates = aggregateReportColumns(rows);
                formatNumbers(rows);
            }
            debugger;
            var result = { fields: REPORT_FIELDS[report_type], rows: rows, aggregates: aggregates };
            callback(null, result);
            return;
        });
    }
    else
    {
        async.map(pairs,
            function (p, map_callback)
            {
                var date = p.date;
                var outlet = p.outlet;
                dbUtils.getCashSettlementData(outlet.id, date, function (err, csd)
                {
                    if (err)
                    {
                        callback(err, null);
                        return;
                    }
                    debugger;
                    var data = [];
                    if (csd)
                    {
                        data = csd.purchase_orders.concat(csd.outside_sales);
                    }
                    if (entity)
                    {
                        data = _.where(data, { entity: entity });
                    }
                    if (report_type == 'hq_bill_bundles' || report_type == 'fv_bill_bundles')
                    {
                        report_generator(date, outlet, entity, data, map_callback);
                    } else
                    {
                        aggregate_by_entities(date, outlet, data, report_generator, type, map_callback);
                    }
                });
            },
            function (map_err, map_results)
            {
                debugger;
                if (map_err)
                {
                    callback(map_err, null);
                    return;
                }
                // flatten out as each report_generator execution 
                // will return an array of results.
                var rows = _.flatten(map_results, true);
                // aggregates
                var aggregates = null;
                if (!_.isEmpty(rows))
                {
                    aggregates = aggregateReportColumns(rows);
                    aggregates["item_id"] = '';
                    formatNumbers(rows);
                }
                debugger;
                var result = { fields: REPORT_FIELDS[report_type], rows: rows, aggregates: aggregates };
                callback(null, result);
                return;
            });
    }
};

// Report types
var FV_REPORTS = {
    fv_bill_bundles: {
        name: "Bill Bundles",
        generator: generate_bill_bundle_fv_link
    },
    daily_receipts: {
        name: "Daily Receipts",
        generator: compute_daily_receipt_for_single_entity
    },
    daily_receipts_gst: {
        name: "Daily Receipts GST",
        generator: compute_daily_receipt_for_single_entity_gst
    }/*,
    daily_sale_gst: {
        name: "Daily Receipts Sales GST",
        generator: compute_daily_receipt_for_single_entity_sale_gst
    }*/,
    daily_revenue_analysis: {
        name: "Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    }
};

var FV_REPORTS_AUGUST = {
    daily_revenue_analysis_gst: {
        name: "Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv_gst
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    }
};
var FV_REPORTS_November = {

    fv_bill_bundles: {
        name: "Bill Bundles",
        generator: generate_bill_bundle_fv_link
    },
    daily_receipts_gst: {
        name: "Daily Receipts GST",
        generator: compute_daily_receipt_for_single_entity_gst
    },
    daily_revenue_analysis_gst: {
        name: "Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv_gst
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    }
}

var HQ_REPORTS = {
    hq_bill_bundles: {
        name: "Bill Bundles",
        generator: generate_bill_bundle_hq_link
    },
    daily_receipts: {
        name: "Daily Receipts",
        generator: compute_daily_receipt_for_single_entity
    },
    daily_receipts_gst: {
        name: "Daily Receipts GST",
        generator: compute_daily_receipt_for_single_entity_gst
    },
    daily_revenue_analysis: {
        name: "Restaurant Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    },
    hq_daily_revenue_analysis: {
        name: "HQ Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_hq
    },
    non_transit_tender_type_reports: {
        name: "Non Transit Tender Type Reports",
        generator: generate_report_for_tender_type
    },
    transit_tender_type_reports: {
        name: "Transit Tender Type Reports",
        generator: generate_report_for_tender_type
    }
};

var HQ_REPORTS_AUGUST = {

    hq_bill_bundles: {
        name: "Bill Bundles",
        generator: generate_bill_bundle_hq_link
    },
    // daily_sale_gst: {
    //     name: "Daily Receipts",
    //     generator: compute_daily_receipt_for_single_entity_sale_gst
    // },
    daily_revenue_analysis_gst: {
        name: "Restaurant Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv_gst
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    },
    hq_daily_revenue_analysis: {
        name: "HQ Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_hq
    },
    transit_tender_type_reports: {
        name: "Trading Tender Type Reports",
        generator: generate_report_for_tender_type
    }
};

// jagadesh nove report 
var HQ_REPORTS_NOV = {
    hq_bill_bundles: {
        name: "Bill Bundles",
        generator: generate_bill_bundle_hq_link
    },
    daily_receipts_gst_Nov: {
        name: "Daily Receipts GST",
        generator: compute_daily_receipt_for_single_entity_gst
    },
    daily_revenue_analysis_gst: {
        name: "Restaurant Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_for_fv_gst
    },
    error_details: {
        name: "Error Details",
        generator: compute_daily_error_details_report
    },
    hq_daily_revenue_analysis: {
        name: "HQ Daily Revenue Analysis",
        generator: compute_daily_revenue_analysis_hq
    },
    non_transit_tender_type_reports: {
        name: "Non Transit Tender Type Reports",
        generator: generate_report_for_tender_type
    },
    transit_tender_type_reports: {
        name: "Transit Tender Type Reports",
        generator: generate_report_for_tender_type
    }
};


// Auth helpers
var get_reoprt_types_for_user = function (authUser)
{
    console.log("authUser");

    console.log(authUser);
    if (!authUser)
    {
        return [];
    }
    var report = HQ_REPORTS;
    var report_FV = FV_REPORTS;
    if (authUser.login_report_type== 'after_august')
    {
        report = HQ_REPORTS_AUGUST;
        report_FV = FV_REPORTS_AUGUST;
    }
    else if (authUser.login_report_type == 'after_november')
    {
        report = HQ_REPORTS_NOV;
        report_FV = FV_REPORTS_November; //to be changed
console.log("AFter November");
    }
    if (authUser.login_report_type == 'after_august')
        console.log(report);
    if (authUser.usertype == "HQ")
    {
        return _.map(_.keys(report), function (k)
        {
            return { id: k, name: report[k].name };
        });
    } else
    {
        return _.map(_.keys(report_FV), function (k)
        {
            return { id: k, name: report_FV[k].name };
        });
    }
};

var get_outlets_for_user = function (authUser, callback)
{
    console.log(authUser);
    if (!authUser)
    {
        return [];
    }
    if (authUser.usertype == "HQ")
    {
        dbUtils.getAllOutlets(callback);
    } else
    {
        dbUtils.getAllOutletsForEntity(authUser.entity, callback);
    }
};

var generate_report_for_user = function (from_date, to_date, outlet_id,
    report_type, user, callback)
{
    // Retrieve report generator function.
    //Get Taken quanity from reconsile table using dates
    var selected_from_date = moment(from_date).format('YYYY-MM-DD');
    var selected_to_date = moment(to_date).format('YYYY-MM-DD');
    console.log("From Date" + selected_from_date + "To Date" + selected_to_date);
    poQtyFromReconsile(selected_from_date, selected_to_date, function (err, result)
    {
        if (err)
        {
        }
        else
        {
            result_po_taken = result
            var reportMonth = HQ_REPORTS;
            var reportMonthFV = FV_REPORTS;
            if (login_report_type == 'after_august')
            {
                reportMonth = HQ_REPORTS_AUGUST;
                reportMonthFV = FV_REPORTS_AUGUST;
            }
            else if (login_report_type == 'after_november')
{
                reportMonth = HQ_REPORTS_NOV;
                reportMonthFV = FV_REPORTS_AUGUST; //to be changed
            console.log(result);

            }
            var report_generator, entity = null;
            if (user.usertype == "HQ")
            {
                report_generator = reportMonth[report_type].generator;
            } else
            {
                report_generator = reportMonthFV[report_type].generator;
                entity = user.entity;
            }

            var continuation = function (err, res)
            {
                if (err)
                {
                    callback(err, null);
                    return;
                }

                if (!res)
                {
                    callback(new Error("Invalid input for Outlet"), null);
                    return;
                }

                var outlets = res;
                if (!_.isArray(res))
                {
                    outlets = [res];
                }
                generate_report(from_date, to_date, outlets, entity, report_type, report_generator, user.usertype, callback);
            };

            selected_outlet_id = outlet_id;
            if (outlet_id == -1)
            {
                dbUtils.getAllOutlets(continuation);
            } else
            {
                dbUtils.getOutletById(outlet_id, continuation);
            }
            return;
        }

    });

};


////Purchase Quantity get From purchase_order_reconcile table 
var poQtyFromReconsile = function (from_date, to_date, callback)
{
    dbUtils.getpurchasequantity(from_date, to_date, function (err, po_Quantity_result)
    {
        if (err)
        {
            console.log("poQtyFromReconsile error" + JSON.stringify(err));
            callback(err, null);
        }
        else
        {
            result_po_taken = po_Quantity_result;
            callback(null, po_Quantity_result);
            //return po_Quantity_result;
        }
    });
}

module.exports = {
    generate_report: generate_report,
    compute_daily_receipt_for_single_entity: compute_daily_receipt_for_single_entity,
    compute_daily_revenue_analysis_for_fv: compute_daily_revenue_analysis_for_fv,
    compute_daily_revenue_analysis_for_fv_gst: compute_daily_revenue_analysis_for_fv_gst,
    compute_daily_revenue_analysis_hq: compute_daily_revenue_analysis_hq,
    compute_daily_error_details_report: compute_daily_error_details_report,
    get_reoprt_types_for_user: get_reoprt_types_for_user,
    get_outlets_for_user: get_outlets_for_user,
    generate_report_for_user: generate_report_for_user,
    generate_report_for_tender_type: generate_report_for_tender_type
};
