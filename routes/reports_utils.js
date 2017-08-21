/* global require __dirname module console */
'use strict';

var _ = require('underscore');
var pg = require('pg');
var async = require('async');
var format = require('string-format');
var moment = require('moment');
var jsreport = require('jsreport');
var path = require('path');
var fs = require('fs');
var dbUtils = require('../models/dbUtils');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

var aggregateByColumn = function(items, name) {
  return _.reduce(items, function(memo, item){
    return memo + item[name];
  }, 0);
};

var poQtyByStatus = function(purchases, statusList) {
  var poList = _.filter(purchases, function(p){
    return _.has(p, "po_id");
  });

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

var poQtyByBucket = function(purchases, bucketList) {
  var poList = _.filter(purchases, function(p){
    return _.has(p, "po_id");
  });

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


var outsideSalesQty = function(purchases) {
  var outsideSales = _.filter(purchases, function(p){
    return _.has(p, "so_id");
  });

  return _.reduce(outsideSales, function(memo, so){
    var sign = (so.amount_collected > 0)? 1:(-1);
    return memo + sign*(so.qty);
  }, 0);
};

var generate_daily_supply_issues_hq_report = function(outlet, date, po_data, callback) {
  debugger;
  var report = {};
  report["outlet_name"] = outlet.short_name;
  report["date"] = moment(date).format('Do MMMM YYYY');
  report["start_time"] = outlet.start_of_day;
  report["end_time"] = outlet.end_of_day;
  report["is24hr"] = outlet.is24hr; 
  report["items"] = [];



  var grouped = _.groupBy(po_data, function(d){
    return d.item_id;
  });
  _.each(_.keys(grouped), function(item_id){
    // one report row per item.
    var purchases = grouped[item_id];
    var first = _.first(purchases);
    var item = {};
    item["item_id"] = item_id;
    item["item_name"] = first.item_name;
    item["foodbox_fee"] = first.foodbox_fee;
    item["restaurant_fee"] = first.restaurant_fee;
    item["quantity"] = poQtyByStatus(purchases, null) + outsideSalesQty(purchases);
    item["taken"] = item["quantity"] - poQtyByStatus(purchases, ["not dispatched"]);
    item["sold"] = poQtyByStatus(purchases, ["sold"]) + outsideSalesQty(purchases);
    item["sold_revenue"] = item["sold"]*item["foodbox_fee"];
    item["expired"] = poQtyByStatus(purchases, ["expired"]);

    // FV damages
    item["quality_count"] = poQtyByStatus(purchases, ["spoiled", "quality"]);
    item["quantity_count"] = poQtyByStatus(purchases, ["quantity"]);
    item["packing_count"] = poQtyByStatus(purchases, ["packing"]);
    item["labelling_count"] = poQtyByStatus(purchases,
      ["unable to scan (Rest. fault)", "improperly sealed",
      "loading_issue","restaurantfault"]);
    var total_fv_issues = poQtyByBucket(purchases, ["restaurant"]);
    item["fv_damage_amount"] = total_fv_issues*item["foodbox_fee"];

    // Foodbox damages.
    item["fbx_scan_issues_count"] = poQtyByStatus(purchases, ["scanner fault (Foodbox fault)","unscanned"]);
    item["fbx_dispenser_damage_count"] = poQtyByStatus(purchases, ["damaged while dispensing"]);
    item["fbx_damage_count"] = poQtyByBucket(purchases, ["foodbox"]);
    item["fbx_damage_amount"] = Math.abs(item["fbx_damage_count"]*item["foodbox_fee"]);

    // Transporter damages.
    item["transporter_undelivered_count"] = poQtyByStatus(purchases, ["undelivered"]);
    item["transporter_transit_damage_count"] = poQtyByStatus(purchases, ["damaged in transit"]);
    item["transporter_transit_damage_count"] = poQtyByStatus(purchases, ["damaged"]);
    item["transporter_damage_count"] = poQtyByBucket(purchases, ["transporter"]);
    item["transporter_damage_amount"] = item["transporter_damage_count"]*first.selling_price; 

    report.items.push(item);
  });
  // Total
  var items = report.items;
  report["total_qty"] = aggregateByColumn(items, "quantity");
  report["total_taken"] = aggregateByColumn(items, "taken");
  report["total_sold"] = aggregateByColumn(items, "sold");
  report["total_revenue"] = aggregateByColumn(items, "sold_revenue");
  report["total_expired"] = aggregateByColumn(items, "expired");
  report["total_quality"] = aggregateByColumn(items, "quality_count");
  report["total_quantity"] = aggregateByColumn(items, "quantity_count");
  report["total_packing"] = aggregateByColumn(items, "packing_count");
  report["total_labelling"] = aggregateByColumn(items, "labelling_count");
  report["total_fv_damage_amount"] = aggregateByColumn(items, "fv_damage_amount");
  report["total_fbx_damage"] = aggregateByColumn(items, "fbx_damage_count");
  report["total_fbx_amount"] = aggregateByColumn(items, "fbx_damage_amount");
  report["total_transporter_count"] = aggregateByColumn(items, "transporter_damage_count");
  report["total_transporter_amount"] = aggregateByColumn(items, "transporter_damage_amount");
  report["total_due"] = (report["total_revenue"] + report["total_fv_damage_amount"] - report["total_fbx_amount"] + report["total_transporter_amount"]).toFixed(2);
  callback(null, report);
  return;
};

var generate_daily_supply_issues_fv_report = function(fv, outlet, date, po_data, callback) {
  var report = {};
  report["fv_name"] = fv.short_name;
  report["outlet_name"] = outlet.short_name;
  report["date"] = moment(date).format('Do MMMM YYYY');
  report["start_time"] = outlet.start_of_day;
  report["end_time"] = outlet.end_of_day;
  report["is24hr"] = outlet.is24hr; 
  report["items"] = [];
  var grouped = _.groupBy(po_data, function(d){
    return d.item_id;
  });

  _.each(_.keys(grouped), function(item_id){
    var item = {};
    var purchases = grouped[item_id];
    var first = _.first(purchases);
    item["item_id"] = item_id;
    item["item_name"] = first.item_name;
    item["restaurant_fee"] = first.restaurant_fee;
    item["foodbox_fee"] = first.foodbox_fee;
    item["quantity"] = poQtyByStatus(purchases, null) + outsideSalesQty(purchases);
    item["taken"] = item["quantity"] - poQtyByStatus(purchases, ["not dispatched"]);
    item["sold"] = poQtyByStatus(purchases, ["sold"]) + outsideSalesQty(purchases);
    item["sold_revenue"] = item["sold"]*item["restaurant_fee"];
    item["expired"] = poQtyByStatus(purchases, ["expired"]);

    item["quality_count"] = poQtyByStatus(purchases, ["spoiled", "quality"]);
    item["quantity_count"] = poQtyByStatus(purchases, ["quantity"]);
    item["packing_count"] = poQtyByStatus(purchases, ["packing"]);
    item["labelling_count"] = poQtyByStatus(purchases,
      ["unable to scan (Rest. fault)", "improperly sealed",
      "loading_issue","restaurantfault"]);
    var total_fv_issues = poQtyByBucket(purchases, ["restaurant"]);
    item["fv_damage_amount"] = Math.abs(total_fv_issues*item["foodbox_fee"]);

    item["fbx_damage_count"] = poQtyByBucket(purchases, ["foodbox"]);
    item["fbx_damage_amount"] = item["fbx_damage_count"]*item["restaurant_fee"];

    item["transporter_damage_count"] = poQtyByBucket(purchases, ["transporter"]);
    item["transporter_damage_amount"] = item["transporter_damage_count"]*item["restaurant_fee"]; 

    report.items.push(item);
  });
  // Total
  var items = report.items;
  report["total_qty"] = aggregateByColumn(items, "quantity");
  report["total_taken"] = aggregateByColumn(items, "taken");
  report["total_sold"] = aggregateByColumn(items, "sold");
  report["total_revenue"] = aggregateByColumn(items, "sold_revenue");
  report["total_expired"] = aggregateByColumn(items, "expired");
  report["total_quality"] = aggregateByColumn(items, "quality_count");
  report["total_quantity"] = aggregateByColumn(items, "quantity_count");
  report["total_packing"] = aggregateByColumn(items, "packing_count");
  report["total_labelling"] = aggregateByColumn(items, "labelling_count");
  report["total_fv_damage_amount"] = aggregateByColumn(items, "fv_damage_amount");
  report["total_fbx_damage"] = aggregateByColumn(items, "fbx_damage_count");
  report["total_fbx_amount"] = aggregateByColumn(items, "fbx_damage_amount");
  report["total_transporter_count"] = aggregateByColumn(items, "transporter_damage_count");
  report["total_transporter_amount"] = aggregateByColumn(items, "transporter_damage_amount");
  report["total_due"] = report["total_revenue"] - report["total_fv_damage_amount"]
  + report["total_fbx_amount"] + report["total_transporter_amount"];
  callback(null, report);
  return;
};

var generate_pdf = function(report, path_to_template, callback){
  var template_path = path.join(__dirname, '/../');
  template_path = path.join(template_path, path_to_template);
  var content = fs.readFileSync(template_path, 'utf8');
  jsreport.render({
    template: {
      content: content,
      engine: 'jsrender'
    },
    recipe: 'phantom-pdf',
    data: report
  }).then(function(out) {
    callback(null, out);
  }).catch(function(err) {
    callback(err, null);
    return;
  });
};

var generate_item_pricing_fv_report = function(fv, outlet, date, po_data, callback) {
  var report = {};
  report["fv_name"] = fv.short_name;
  report["outlet_name"] = outlet.short_name;
  report["date"] = moment(date).format('Do MMMM YYYY');
  report["start_time"] = outlet.start_of_day;
  report["end_time"] = outlet.end_of_day;
  report["is24hr"] = outlet.is24hr; 
  var sample_item = _.first(po_data);
  report["vat_perc"] = sample_item.vat_perc;
  report["st_perc"] = sample_item.st_perc;
  report["abatement"] = outlet.abatement_percent;
  report["eff_st"] = (sample_item.st_perc*outlet.abatement_percent/100);
  report["items"] = [];
  var grouped = _.groupBy(po_data, function(d){
    return d.item_id;
  });
  _.each(_.keys(grouped), function(item_id){
    debugger;
    var item = {};
    var purchases = grouped[item_id];
    var first = _.first(purchases);
    item["item_id"] = item_id;
    item["item_name"] = first.item_name;
    item["restaurant_fee"] = first.restaurant_fee;
    item["foodbox_fee"] = first.foodbox_fee;
    item["mrp"] = first.mrp;
    item["selling_price"] = first.selling_price;
    item["vat"] = (item["selling_price"]*report["vat_perc"]/100).toFixed(2);
    item["st"] = (item["selling_price"]*report["eff_st"]/100).toFixed(2);
    item["sold"] = poQtyByStatus(purchases, ["sold"]) + outsideSalesQty(purchases);
    item["total_st"] = (item["sold"]*item["st"]).toFixed(2);
    item["total_vat"] = (item["sold"]*item["vat"]).toFixed(2);
    report.items.push(item);
  });
  callback(null, report);
  return;
};

var fetchNonFoodIssues = function fetchNonFoodIssues(outlet_id, date, callback) {
  pg.connect(conString, function(err, client, done){
    if(err) {
      callback(err, null);
      return;
    }
    client.query(
      "SELECT DISTINCT \
      nfi.id as id, \
      nfi.type as problem, \
      nfi.time as time, \
      nfi.note as note \
      FROM \
      non_food_issue nfi \
      WHERE \
      nfi.outlet_id = $1 \
      AND \
      DATE(nfi.time) = $2",
      [outlet_id, date],
      function(query_err, result){
        if(query_err) {
          done(client);
          callback(query_err, null);
          return;
        } else {
          done();
          callback(null, result.rows);
          return;
        }
      });
  });
};

var generate_issues_vs_hours_report = function generate_issues_vs_hours_report(
        outlet, date, food_issues, non_food_issues,
        fv_data, callback) {
  debugger;
  var report = {};
  report["outlet_name"] = outlet.short_name;
  report["date"] = moment(date).format('Do MMMM YYYY');
  report["start_time"] = outlet.start_of_day;
  report["end_time"] = outlet.end_of_day;
  report["is24hr"] = outlet.is24hr; 
  report["items"] = [];

  var issues = [];
  _.each(food_issues, function(d) {
    var issue = {};
    issue["fv_name"] = _.findWhere(fv_data, {id: d.restaurant_id}).short_name;
    issue["item_id"] = d.item_id;
    issue["item_name"] = d.item_name;
    issue["time"] = moment(d.scheduled_delivery_time).format('hh:mm');
    issue["source"] = d.status;
    issue["problem"] = d.problem;
    issue["note"] = d.note;
    issues.push(issue);
  });

  _.each(non_food_issues, function(d) {
    var issue = {};
    issue["fv_name"] = "-";
    issue["item_id"] = "-";
    issue["item_name"] = "-";
    issue["time"] = moment(d.time).format('hh:mm');
    issue["source"] = "Non food issue";
    issue["problem"] = d.problem;
    issue["note"] = d.note;
    issues.push(issue);
  });

  _.sortBy(issues, "time");
  report.items = issues;
  callback(null, report);
  return;
};

var get_monthly_transporter_report = function get_monthly_transporter_report(month, year, callback) {
  pg.connect(conString, function(err, client, done){
    if(err) {
      callback(err, null);
      return;
    }
    client.query(
      "SELECT \
        dcs.consolidated_data as consolidated_data, \
        dcs.outlet_id as outlet_id, \
        dcs.creation_time as cs_date, \
        dcs.last_updated as last_update_time, \
        o.short_name as outlet_name, \
        o.city as city_code \
        FROM  \
        daily_cash_settlements as dcs, \
        outlet as o \
        WHERE \
        EXTRACT(YEAR FROM dcs.creation_time) = $1 \
        AND \
        EXTRACT(MONTH FROM dcs.creation_time) = $2 \
        AND \
        dcs.last_updated = \
          (SELECT max(last_updated) FROM daily_cash_settlements \
            WHERE creation_time = dcs.creation_time) \
        AND o.id = dcs.outlet_id",
      [year, month],
      function(query_err, result){
        if(query_err) {
          done(client);
          callback(query_err, null);
          return;
        } else {
          done();
          var settlements = result.rows;
          var report = {};
          report["month"] = moment().month(month - 1).format('MMMM');
          report["year"] = year;
          report["items"] = [];
          // aggregate over each outlet
          var outlet_grouped = _.groupBy(settlements, 'outlet_name');
          _.each(_.keys(outlet_grouped), function(outlet_name) {
            debugger;
            var item = {};
            var outlet_data = outlet_grouped[outlet_name];
            var sample = _.first(outlet_data);
            var outlet_settlements = _.pluck(outlet_data, 'consolidated_data');
            var po_data = _.pluck(outlet_settlements, 'purchase_orders');
            
            var transporter_issues = _.where(_.flatten(po_data, true), {bucket: 'transporter'});

            var total_liability = _.reduce(transporter_issues, function(memo, ti){
              return memo + ti.qty*ti.selling_price;
            }, 0);

            item["outlet_name"] = outlet_name;
            item["city_code"] = sample.city_code;
            item["due_amount"] = Math.abs(total_liability).toFixed(2);
            report.items.push(item);
          });
          debugger;
          callback(null, report);
          return;
        }
      });
  });  
};


module.exports = {
  generate_daily_supply_issues_fv_report: generate_daily_supply_issues_fv_report,
  generate_pdf: generate_pdf,
  generate_item_pricing_fv_report: generate_item_pricing_fv_report,
  generate_daily_supply_issues_hq_report: generate_daily_supply_issues_hq_report,
  fetchNonFoodIssues: fetchNonFoodIssues,
  generate_issues_vs_hours_report: generate_issues_vs_hours_report,
  get_monthly_transporter_report: get_monthly_transporter_report
};