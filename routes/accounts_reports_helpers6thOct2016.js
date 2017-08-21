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
// aggregator helpers
var aggregateByColumn = function(items, name) {
  return _.reduce(items, function(memo, item){
    return memo + item[name];
  }, 0);
};

var poQtyByStatus = function(poList, statusList) {
  if (_.isNull(statusList)) {
    return _.reduce(_.pluck(poList, 'qty'),
      function(memo, num){
        return memo + num;
      }, 0);
  }

  var qtyList = _.map(statusList, function(st){
    var filterByStatus = _.where(poList, {status: st})
    return _.reduce(_.pluck(filterByStatus, 'qty'),
      function(memo, num){
        return memo + num;
      }, 0);
  });

  return _.reduce(qtyList, function(memo, num){
    return memo + num;
  }, 0);
};

var poQtyByBucket = function(poList, bucketList) {
  if (_.isNull(bucketList)) {
    return _.reduce(_.pluck(poList, 'qty'),
      function(memo, num){
        return memo + num;
      }, 0);
  }

  var qtyList = _.map(bucketList, function(bucket){
    var filterByBucket = _.where(poList, {bucket: bucket});
    return _.reduce(_.pluck(filterByBucket, 'qty'),
      function(memo, num){
        return memo + num;
      }, 0);
  });
  return _.reduce(qtyList, function(memo, num){
    return memo + num;
  }, 0);
};

var isInt = function(n){
  return Number(n) === n && n % 1 === 0;
};

var isFloat = function isFloat(n){
  return n === Number(n) && n % 1 !== 0;
};

var formatNumbers = function(rows){
  _.each(rows, function(row){
    _.each(row, function(value, key, obj){
      if(isFloat(obj[key])){
        obj[key] = value.toFixed(2);
      }
    });
  });
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
    "foodbox_fee": 'FoodBox Transaction Fee',
    "foodbox_st": 'ST on FoodBox Transaction Fee',
    "foodbox_txn": 'Total FoodBox Transaction Fee',
    "restaurant_fee": 'Restaurant Net Receipt (from Gross Sales excl taxes)',
    "foodbox_tds": 'TDS on FoodBox Transaction Fee',
    "restaurant_remit_bef_adj": 'Remittance to Restaurant (before adjustments)',
    "restaurant_liability": 'Restaurant Liability on Errors',
    "restaurant_liability_st": 'ST on Restaurant Liability',
    "restaurant_liability_tds": 'TDS on Restaurant Liability',
    "restaurant_liability_total": 'Restaurant Liability incl ST/TDS',
    "foodbox_liability": 'FoodBox Liability',
    "restaurant_liability_net": 'Net Restaurant Liability (Remittance Adjustment)',
    "restaurant_remit_aft_adj": 'Adjusted Remittance to Restaurant',
    "last_carry_forward": 'Carry-Forward from previous date',
    "foodbox_final_receipt": 'Foodbox Final Receipt',
    "restaurant_final_remittance": 'Final Revenue Remittance to Restaurant (after offsetting carry-fwd)',
    "next_carry_forward": 'Carry Forward to Next Date',
    "restaurant_tax_remit": 'Tax Remittance to Restaurant',
    "restaurant_total_remittance": 'Total Remittance to Restaurant',
    "start_time": 'Start Time',
    "end_time": 'End Time'
  },
  daily_revenue_analysis: {
    "date" : 'Date',
    "outlet_name": 'Outlet',
    "entity_name": 'Restaurant',
    "session_name": 'Session',
    "item_name": 'Item Name',
    "taken": 'Taken Qty',
    "sold": 'Sold Qty',
    "rev_share": 'Restaurant Fee for Sold',
    "wastage_qty": 'Wastage Qty',
    "foodbox_issues_qty": 'Foodbox Error Qty',
    "foodbox_issues_value": 'FoodBox Err Value', 
    "restaurant_issues_qty": 'Restaurant Err Qty',
    "restaurant_issues_value": 'Restaurant Err Value',
    "transporter_issues_qty": 'Transporter Err Qty',
    "transporter_issues_value": 'Transporter Err Value',
    "net_revenue": 'Net Revenue'
  },
  hq_daily_revenue_analysis: {
    "date" : 'Date',
    "outlet_name": 'Outlet',
    "entity_name": 'Restaurant',
    "session_name": 'Session',
    "item_name": 'Item Name',
    "taken": 'Taken Qty',
    "sold": 'Sold Qty',
    "rev_share": 'Foodbox Fee for Sold',
    "wastage_qty": 'Wastage Qty',
    "foodbox_issues_qty": 'Foodbox Error Qty',
    "foodbox_issues_value": 'FoodBox Err Value', 
    "restaurant_issues_qty": 'Restaurant Err Qty',
    "restaurant_issues_value": 'Restaurant Err Value',
    "transporter_issues_qty": 'Transporter Err Qty',
    "transporter_issues_value": 'Transporter Err Value',
    "net_revenue": 'Net Revenue'
  },
  error_details: {
    "date" : 'Date',
    "outlet_name": 'Outlet',
    "entity_name": 'Restaurant',
    "session_name": 'Session',
    "item_name": 'Item Name',
    "error_liability": 'Error Liability',
    "error_type": "Error Type",
    "error_qty": "Qty",
    "error_value_restaurant": "Value of Error @ Restaurant",
    "error_value_foodbox": "Value of Error @ Foodbox"
  },
  hq_bill_bundles: {
    "date" : 'Date',
    "outlet_name": 'Outlet',
    "link" : 'Link to bill bundles pdf'  
  },
  fv_bill_bundles: {
    "date" : 'Date',
    "location" : 'Location',
    "outlet_name": 'Outlet',
    "link" : 'Link to bill bundles pdf'  
    },
    tender_type_reports: {
        "saledate": 'Date',
        "outlet_name": 'Outlet Name',
        "cash_amount": 'Cash',
        "card_amount": 'Card',
        "sodexocard_amount": 'Sodexo Card',
        "sodexocoupon_amount": 'Sodexo Coupon',
        "credit_amount": 'Credit',
        "gprscard_amount": 'GPRS Card',
        "total": 'Total'
  }
};


// fv bill bundle link
var generate_bill_bundle_fv_link = function(date, outlet,
  entity, entity_consolidated_data, callback) {
  var rows = [];
  dbUtils.getAllFVsByEntity(entity, function(err, fvs){
    if(err) {
      callback(err, null);
      return;
    }
    _.each(fvs, function(fv){
      var report = {};
      var link = '<a target=\'_blank\' href=\'/generatebill/fv/' + date + '/' + fv.id + '/' 
      + outlet.id + '/bills.pdf\'>bills</a>';
      
      // check if any bills present for fv
      var fv_bills = _.where(entity_consolidated_data, {'restaurant_id': fv.id});
      if(_.isEmpty(fv_bills)) {
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
var generate_bill_bundle_hq_link = function(date, outlet,
  entity, entity_consolidated_data, callback) {
  var rows = [];
  var report = {};
  var link = '<a target=\'_blank\' href=\'/generatebill/outlet/' + date + '/' 
  + outlet.id + '/bills.pdf\'>bills</a>';

  if(_.isEmpty(entity_consolidated_data)) {
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
var compute_daily_receipt_for_single_entity = function(date, outlet,
  entity, entity_consolidated_data, callback){
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
  _.each(fields, function(f){
    report[f] = aggregateByColumn(entity_cash_settlements, f);
  });

  // Adjust with carry forward
  var carry_forward = dbUtils.getCarryForward(entity, date, outlet.city, function(err, res){
    if(err) {
      callback(err, null);
      return;
    }
    var past_due = (res)?res.carry_forward:0;
    var balance = report["restaurant_remit_aft_adj"] - past_due;
    var new_carry_forward = (balance >= 0)?0:(-balance);
    var final_remittance = (balance >= 0)?balance:0;

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

// Daily revenue analysis
var compute_daily_revenue_analysis = function(date, outlet,
  entity, entity_consolidated_data, isHQ, callback){
  var rows = [];
  var groupBySession = _.groupBy(entity_consolidated_data, "session");
  _.each(_.keys(groupBySession), function(session){
    var session_data = groupBySession[session];  
    var groupByFoodItem = _.groupBy(session_data, "item_id");
    _.each(_.keys(groupByFoodItem), function(item_id){
      var purchases = groupByFoodItem[item_id];
      var first = _.first(purchases);
      var base_fee = isHQ?first.foodbox_fee:first.restaurant_fee;
      var item = {};
      item["date"] = moment(date).format('Do MMMM YYYY');
      item["outlet_name"] = outlet.short_name;
      item["entity_name"] = entity;
      item["session_name"] = first.session;
      item["item_name"] = first.item_name;
      if(_.has(first, 'po_id')) {
        item["quantity"] = poQtyByStatus(purchases, null);
        item["taken"] = item["quantity"] - poQtyByStatus(purchases, ["not dispatched"]);
        item["sold"] = poQtyByStatus(purchases, ["sold"]);
        item["rev_share"] = item["sold"]*base_fee;
        item["wastage_qty"] = poQtyByBucket(purchases, ["wastage"]);
      } else {
        item["taken"] = aggregateByColumn(purchases, 'qty');
        var refunds = aggregateByColumn(purchases, 'refund_qty');
        item["sold"] = item["taken"] + refunds;
        item["rev_share"] = item["sold"]*base_fee;
        item["wastage_qty"] = (-1)*refunds;
      }
      item["foodbox_issues_qty"] = poQtyByBucket(purchases, ["foodbox"]);
      item["foodbox_issues_value"] = item["foodbox_issues_qty"]*first.restaurant_fee;
      item["restaurant_issues_qty"] = poQtyByBucket(purchases, ["restaurant"]);
      item["restaurant_issues_value"] = item["restaurant_issues_qty"]*first.foodbox_fee;
      item["transporter_issues_qty"] = poQtyByBucket(purchases, ["transporter"]);
      item["transporter_issues_value"] = item["transporter_issues_qty"]*first.restaurant_fee;
      if(isHQ) {
        item["transporter_issues_value"] += item["transporter_issues_qty"]*first.foodbox_fee;
        item["net_revenue"] = item["rev_share"] - item["foodbox_issues_value"]
          + item["restaurant_issues_value"] + item["transporter_issues_value"];
      } else {
        item["net_revenue"] = item["rev_share"] + item["foodbox_issues_value"]
          - item["restaurant_issues_value"] + item["transporter_issues_value"];
      }

      rows.push(item);
    });
});

callback(null, rows);
return;
};

// FV : Daily Revenue Analysis
var compute_daily_revenue_analysis_for_fv = function(date, outlet,
  entity, entity_consolidated_data, callback){
  compute_daily_revenue_analysis(date, outlet, entity,
    entity_consolidated_data, false, callback);
};

// HQ Daily revenue analysis
var compute_daily_revenue_analysis_hq = function(date, outlet,
  entity, entity_consolidated_data, callback){
  compute_daily_revenue_analysis(date, outlet, entity,
    entity_consolidated_data, true, callback);
};

//HQ Tender type Reports
var generate_report_for_tender_type = function (from_date, to_date, outlet_id,
  callback) {
    // console.log("Tender "+from_date,to_date,outlets.id);
    compute_daily_revenue_analysis(date, outlet, entity,
    entity_consolidated_data, true, callback);
};

// Daily Error report
var compute_daily_error_details_report = function(date, outlet,
  entity, entity_consolidated_data, callback) {
  var po_data = _.filter(entity_consolidated_data, function(d){
    return _.has(d, 'po_id');
  });
  
  var rows = [];
  var groupBySession = _.groupBy(po_data, "session");
  _.each(_.keys(groupBySession), function(session){
    var session_data = groupBySession[session];  
    var groupByFoodItem = _.groupBy(session_data, "item_id");
    _.each(_.keys(groupByFoodItem), function(item_id){

      var purchases = groupByFoodItem[item_id];
      var foodbox_errors = _.where(purchases, {bucket: "foodbox"});
      var restaurant_errors = _.where(purchases, {bucket: "restaurant"});
      var transporter_errors = _.where(purchases, {bucket: "transporter"});
      var all_errors = [].concat(foodbox_errors).concat(restaurant_errors)
      .concat(transporter_errors);
      // group by error type
      var error_status_groups = _.groupBy(all_errors, "status");
      _.each(_.keys(error_status_groups), function(status){
        var item = {};
        var first = _.first(error_status_groups[status]);
        item["date"] = moment(date).format('Do MMMM YYYY');
        item["outlet_name"] = outlet.short_name;
        item["entity_name"] = entity;
        item["session_name"] = first.session;
        item["item_name"] = first.item_name;
        item["error_liability"] = first.bucket;
        item["error_type"] = status;
        item["error_qty"] = aggregateByColumn(error_status_groups[status], "qty");
        if(first.bucket == "foodbox") {
          item["error_value_foodbox"] = item["error_qty"]*first.foodbox_fee;
          item["error_value_restaurant"] = 0;
        } else if(first.bucket == "restaurant") {
          item["error_value_restaurant"] = item["error_qty"]*first.restaurant_fee;
          item["error_value_foodbox"] = 0;
        } else {
          item["error_value_foodbox"] =  item["error_value_restaurant"] = 0;
        }
        rows.push(item);
      });
    });
});
callback(null, rows);
return;
};

var aggregate_by_entities = function(date, outlet, data, report_generator, type, callback) {
  var entitiy_groups = _.groupBy(data, "entity");
  // HACK: Always include Atchayam for reports.
  if(type == 'HQ' && ! _.isEmpty(data) && ! _.has(entitiy_groups, 'ATC')) {
    entitiy_groups['ATC'] = [];
  }
  async.map(_.keys(entitiy_groups),
    function(entity, map_callback){
      report_generator(date, outlet, entity, entitiy_groups[entity], map_callback);
    },
    function(map_err, map_results){
      if(map_err) {
        callback(map_err, null);
        return;
      }
      callback(null, _.flatten(map_results));
      return;
    });
};

// Totals of numerical columns for a report
var aggregateReportColumns = function(rows){
  var sample = _.first(rows);
  var aggregates = {};
  _.each(_.keys(sample), function(k){
    if(_.isNumber(sample[k])) {
      var aggr = aggregateByColumn(rows, k);
      aggregates[k] = isFloat(aggr)?(aggr.toFixed(2)):aggr; 
    } else{
      aggregates[k] = '';
    }
  });
  return aggregates;
};


// Generic function for generating all reports based on date ranges,
// outlet(s) and entity(ies)
var generate_report = function(from_date, to_date, outlets, entity,
  report_type, report_generator, type, callback){
  debugger;
  // Dates
  var dr = moment.range(from_date, to_date);
  var dates = [];
  dr.by('days', function(m){
    dates.push(m.format('YYYY-MM-DD'));
  });
  
  // pair of (outlet, date)
  var pairs = _.flatten(_.map(dates, function(dt){
    return _.map(outlets, function(o){
      return {outlet: o, date: dt};
    }); 
  }), true);
    console.log("tender type before started");
    console.log("----" + selected_outlet_id)
    if (report_type == 'tender_type_reports') {
        console.log("tender type started");
        console.log("Data " + from_date + "--" + to_date + "---" + selected_outlet_id + "---");
        //console.log(JSON.stringify(outlets));
        var outlet_id = selected_outlet_id;
        dbUtils.getTenderTypeRecords(outlet_id, from_date, to_date, function (err, tendertype_result) {
            if (err) {
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
            if (!_.isEmpty(rows)) {
                aggregates = aggregateReportColumns(rows);
                formatNumbers(rows);
            }
            debugger;
            var result = { fields: REPORT_FIELDS[report_type], rows: rows, aggregates: aggregates };
            callback(null, result);
            return;
        });
    }
    else {
  async.map(pairs,
    function(p, map_callback){
      var date = p.date;
      var outlet = p.outlet;
      dbUtils.getCashSettlementData(outlet.id, date, function(err, csd){
        if(err) {
          callback(err, null);
          return;
        }
        debugger;
        var data = [];
        if(csd) {
          data = csd.purchase_orders.concat(csd.outside_sales);
        }
        if(entity) {
          data = _.where(data, {entity: entity});
        }
        if(report_type == 'hq_bill_bundles' || report_type == 'fv_bill_bundles') {
          report_generator(date, outlet, entity, data, map_callback);
        } else {
          aggregate_by_entities(date, outlet, data, report_generator, type, map_callback);          
        }
      });      
    },
    function(map_err, map_results){
      debugger;
      if(map_err) {
        callback(map_err, null);
        return;
      }
      // flatten out as each report_generator execution 
      // will return an array of results.
      var rows = _.flatten(map_results, true);
      // aggregates
      var aggregates = null; 
      if(! _.isEmpty(rows)){
        aggregates = aggregateReportColumns(rows);
        formatNumbers(rows);
      }
      debugger;
      var result = {fields: REPORT_FIELDS[report_type], rows: rows, aggregates: aggregates};
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
  daily_revenue_analysis: {
    name: "Daily Revenue Analysis",
    generator: compute_daily_revenue_analysis_for_fv
  },
  error_details: {
    name: "Error Details",
    generator: compute_daily_error_details_report 
  }
};

var HQ_REPORTS = {
  hq_bill_bundles: {
    name: "Bill Bundles",
    generator: generate_bill_bundle_hq_link
  },
  daily_receipts: {
    name: "Daily Receipts",
    generator: compute_daily_receipt_for_single_entity
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
    tender_type_reports: {
        name: "Tender Type Reports",
        generator: generate_report_for_tender_type
  }
};


// Auth helpers
var get_reoprt_types_for_user = function(authUser) {
  console.log(authUser);
  if(! authUser) {
    return [];
  }
  if(authUser.usertype == "HQ") {
    return _.map(_.keys(HQ_REPORTS), function(k){
      return {id: k, name: HQ_REPORTS[k].name};
    });
  } else {
    return _.map(_.keys(FV_REPORTS), function(k){
      return {id: k, name: FV_REPORTS[k].name};
    });
  }
};

var get_outlets_for_user = function(authUser, callback) {
  console.log(authUser);
  if(! authUser) {
    return [];
  }
  if(authUser.usertype == "HQ") {
    dbUtils.getAllOutlets(callback);
  } else {
    dbUtils.getAllOutletsForEntity(authUser.entity, callback);
  }
};

var generate_report_for_user = function(from_date, to_date, outlet_id,
  report_type, user, callback) {
  // Retrieve report generator function.
  var report_generator, entity = null;
  if(user.usertype == "HQ") {
    report_generator = HQ_REPORTS[report_type].generator;
  } else {
    report_generator = FV_REPORTS[report_type].generator;
    entity = user.entity;
  }

  var continuation = function(err, res){
    if(err) {
      callback(err, null);
      return;
    }

    if(! res) {
      callback(new Error("Invalid input for Outlet"), null);
      return;
    }

    var outlets = res;
    if(! _.isArray(res)){
      outlets = [res];
    }
    generate_report(from_date, to_date, outlets, entity, report_type, report_generator, user.usertype, callback);
  };

    selected_outlet_id = outlet_id;
    if (outlet_id == -1) {
        dbUtils.getAllOutlets(continuation);
    } else {
        dbUtils.getOutletById(outlet_id, continuation);
    }
    return;
};

module.exports = {
  generate_report: generate_report,
  compute_daily_receipt_for_single_entity: compute_daily_receipt_for_single_entity,
  compute_daily_revenue_analysis_for_fv: compute_daily_revenue_analysis_for_fv,
  compute_daily_revenue_analysis_hq: compute_daily_revenue_analysis_hq,
  compute_daily_error_details_report: compute_daily_error_details_report,
  get_reoprt_types_for_user: get_reoprt_types_for_user,
  get_outlets_for_user: get_outlets_for_user,
    generate_report_for_user: generate_report_for_user,
    generate_report_for_tender_type: generate_report_for_tender_type
};
