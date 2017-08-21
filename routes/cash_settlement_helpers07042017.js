/* global require __dirname module console */
'use strict';
var _ = require('underscore');
var jsreport = require('jsreport');
var async = require('async');
var pg = require('pg');
var format = require('string-format');
var moment = require('moment');
var path  = require('path');
var fs = require('fs');
var mailer = require('nodemailer');
var dbUtils = require('../models/dbUtils');
var config = require('../models/config');
var conString = config.dbConn;

format.extend(String.prototype);

var a = ['','one ','two ','three ','four ', 'five ','six ','seven ','eight ','nine ','ten ','eleven ','twelve ','thirteen ','fourteen ','fifteen ','sixteen ','seventeen ','eighteen ','nineteen '];
var b = ['', '', 'twenty','thirty','forty','fifty', 'sixty','seventy','eighty','ninety'];

function inWords (num) {
  num = Math.abs(num);
  if ((num = num.toString()).length > 9) return 'overflow';
  var n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return; var str = '';
  str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
  str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
  str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
  str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
  str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only ' : '';
  return str;
}


var fetchPurchaseOrders = function(outlet_id, date, async_callback) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      async_callback(err, null);
      return;
    }
    // Aggregate all purchases orders finalized on this day.
    client.query(
      "SELECT DISTINCT \
      st.purchase_order_id as po_id, \
      st.id as status_id, \
      st.food_item_id as item_id, \
      st.quantity as qty, \
      st.status as status, \
      st.problem as problem, \
      st.note as note, \
      po.restaurant_id as restaurant_id, \
      po.outlet_id as outlet_id, \
      fi.name as item_name, \
      fi.mrp as mrp, \
      fi.selling_price as selling_price, \
      fi.purchase_price as purchase_price, \
      fi.service_tax_percent as st_perc, \
      fi.vat_percent as vat_perc, \
      fi.packaging_cost as packaging_cost, \
      fi.production_cost as production_cost, \
      fi.foodbox_fee as foodbox_fee, \
      fi.restaurant_fee as restaurant_fee, \
      po.scheduled_delivery_time as scheduled_delivery_time, \
      r.entity as entity \
      FROM \
      purchase_order_final_status as st, \
      purchase_order as po, \
      purchase_order_batch as po_batch, \
      food_item as fi, \
      restaurant r \
      WHERE \
      DATE(po.scheduled_delivery_time) >= $1  \
      AND \
      po.id = po_batch.purchase_order_id \
      AND \
      po.outlet_id = $2 \
      AND \
      st.purchase_order_id = po.id \
      AND \
      fi.id = st.food_item_id \
      AND \
      r.id = po.restaurant_id",

      [date, outlet_id],

      function(query_err, purchase_orders){
        if(query_err) {
          done(client);
          async_callback(query_err, null);
          return;
        } else {
          done();
          async_callback(null, purchase_orders);
          return;
        }
      });
});
};

var fetchOutsideSales = function(outlet_id, date, async_callback) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      async_callback(err, null);
      return;
    }
    // Aggregate all purchases orders finalized on this day.
    client.query(
      "SELECT \
      so.id as so_id, \
      so.time as time, \
      bi.bill_no as bill_no, \
      bi.quantity as qty, \
      soi.quantity as refund_qty, \
      fi.id as item_id, \
      fi.name as item_name, \
      fi.restaurant_id as restaurant_id, \
      fi.mrp as mrp, \
      fi.selling_price as selling_price, \
      fi.service_tax_percent as st_perc, \
      fi.vat_percent as vat_perc, \
      fi.foodbox_fee as foodbox_fee, \
      fi.restaurant_fee as restaurant_fee, \
      r.entity as entity \
      FROM  \
      bill_items bi left join \
      sales_order_items soi on soi.sales_order_id=bi.sales_order_id and soi.food_item_id=bi.food_item_id, \
      sales_order so, \
      food_item fi, \
      restaurant r \
      WHERE \
      DATE(so.time) >= $1 \
      AND \
      so.outlet_id = $2 \
      AND \
      bi.food_item_id=fi.id \
      AND \
      bi.sales_order_id=so.id \
      AND \
      fi.location = $3 \
      AND \
      r.id = fi.restaurant_id \
      ORDER BY bill_no asc",

      [date, outlet_id, 'outside'],

      function(query_err, outside_sales){
        if(query_err) {
          done(client);
          async_callback(query_err, null);
          return;
        } else {
          done();
          async_callback(null, outside_sales);
          return;
        }
      });
});
};

var mapToBucket = function(purchase_item) {
  if(_.contains(["sold"], purchase_item.status)) {
    purchase_item.bucket = "revenue"
  } else if(_.contains(["undelivered", "damaged in transit"], purchase_item.status)) {
    purchase_item.bucket = "transporter";
  } else if(_.contains(["expired"], purchase_item.status)) {
    purchase_item.bucket = "wastage";
  } else if(_.contains(["spoiled", "unable to scan (Rest. fault)", "improperly sealed",
    "loading_issue", "quantity", "quality", "packing"], purchase_item.status)) {
    purchase_item.bucket = "restaurant";
  } else if(_.contains(["scanner fault (Foodbox fault)", "damaged while dispensing"], purchase_item.status)) {
    purchase_item.bucket = "foodbox";
  } else if(_.contains(["not dispatched"], purchase_item.status)) {
    purchase_item.bucket = "NA";
  }
};


var per_item_accounting = function(purchase_item, tds_perc, abatement_perc, fbx_st_perc) {
  var cash_settlement = {};
  var mrp = purchase_item.mrp;
  var price_without_tax = purchase_item.selling_price;
  var restaurant_fee = purchase_item.restaurant_fee;
  var foodbox_fee = purchase_item.foodbox_fee;
  var st_perc = purchase_item.st_perc;
  var st_abatement_perc = st_perc*abatement_perc/100;
  var vat_perc = purchase_item.vat_perc;
  var qty = purchase_item.qty;

  if(_.contains(["revenue"], purchase_item.bucket)) {
    // Basic
    cash_settlement["sale"] = price_without_tax*qty;
    cash_settlement["foodbox_fee"] = foodbox_fee*qty;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = 0;
  } else if(_.contains(["transporter"], purchase_item.bucket)) {
    // Basic
    cash_settlement["sale"] = 0;
    cash_settlement["foodbox_fee"] = 0;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = restaurant_fee*qty;

    cash_settlement["transporter_liability"] = price_without_tax*qty;
  } else if(_.contains(["restaurant"], purchase_item.bucket)) {
    // Basic
    cash_settlement["sale"] = 0;
    cash_settlement["foodbox_fee"] = 0;

    cash_settlement["restaurant_liability"] = foodbox_fee*qty;
    cash_settlement["foodbox_liability"] = 0;
  } else if(_.contains(["foodbox"], purchase_item.bucket)) {
    // Basic
    cash_settlement["sale"] = 0;
    cash_settlement["foodbox_fee"] = 0;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = restaurant_fee*qty;

  } else if(_.contains(["wastage"], purchase_item.bucket)*purchase_item.qty) {
    // Basic
    cash_settlement["sale"] = 0;
    cash_settlement["foodbox_fee"] = 0;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = 0;

  } else {
    cash_settlement["sale"] = 0;
    cash_settlement["foodbox_fee"] = 0;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = 0;
  }

  // Derived
  cash_settlement["vat"] = cash_settlement["sale"]*vat_perc/100;
  cash_settlement["st_with_abatement"] = cash_settlement["sale"]*st_abatement_perc/100;

  cash_settlement["foodbox_st"] = cash_settlement["foodbox_fee"]*fbx_st_perc/100;
  cash_settlement["foodbox_txn"] = cash_settlement["foodbox_fee"] + cash_settlement["foodbox_st"];
  cash_settlement["restaurant_fee"] = cash_settlement["sale"] - cash_settlement["foodbox_txn"];

  cash_settlement["foodbox_tds"] = cash_settlement["foodbox_fee"]*tds_perc/100;
  cash_settlement["restaurant_remit_bef_adj"] = cash_settlement["restaurant_fee"] + cash_settlement["foodbox_tds"];

  cash_settlement["restaurant_liability_st"] = cash_settlement["restaurant_liability"]*fbx_st_perc/100;
  cash_settlement["restaurant_liability_tds"] = cash_settlement["restaurant_liability"]*tds_perc/100;
  cash_settlement["restaurant_liability_total"] = cash_settlement["restaurant_liability"]
  + cash_settlement["restaurant_liability_st"] - cash_settlement["restaurant_liability_tds"];

  cash_settlement["restaurant_liability_net"] = cash_settlement["restaurant_liability_total"]
  - cash_settlement["foodbox_liability"];

  cash_settlement["restaurant_remit_aft_adj"] =
  cash_settlement["restaurant_remit_bef_adj"] - cash_settlement["restaurant_liability_net"];

  cash_settlement["restaurant_tax_remit"] = cash_settlement["vat"] + cash_settlement["st_with_abatement"];

  // Add cash settlement to each purchase item.
  purchase_item.cash_settlement = cash_settlement;
};

var consolidate_po_item_accounting = function(purchase_orders, outlet, tds_perc, abatement_perc, fbx_st_perc) {
  // Iterate over the po status and assign bucket.
  _.each(purchase_orders, function(purchase_item){

    mapToBucket(purchase_item);

    // cash settlement per item
    per_item_accounting(purchase_item, tds_perc, abatement_perc, fbx_st_perc);
  });
};

var consolidate_so_item_accounting = function(sales_orders, outlet, tds_perc, fbx_st_perc, fbxFV) {
  // Group by order id and food item id.
  var non_dispenser_sales = [];
  var grouped = _.groupBy(sales_orders, function(v) {
    return v.so_id + "#" + v.item_id;
  });
  _.each(_.keys(grouped), function(key){
    var outside_order = {};
    var orders = grouped[key];
    var sample = _.first(orders);

    outside_order["so_id"] = sample.so_id;
    outside_order["time"] = sample.time;
    outside_order["qty"] = sample.qty;
    var refunds = _.filter(orders, function(o){
      return (o.refund_qty && (o.refund_qty < 0));
    });
    outside_order["refund_qty"] = _.reduce(refunds, function(memo, o){
      return memo + o.refund_qty;
    }, 0);

    outside_order["item_id"] = sample.item_id;
    outside_order["item_name"] = sample.item_name;
    outside_order["restaurant_id"] = sample.restaurant_id;
    outside_order["mrp"] = sample.mrp;
    outside_order["selling_price"] = sample.selling_price;
    outside_order["st_perc"] = sample.st_perc;
    outside_order["vat_perc"] = sample.vat_perc;
    outside_order["foodbox_fee"] = sample.foodbox_fee;
    outside_order["restaurant_fee"] = sample.restaurant_fee;
    outside_order["entity"] = sample.entity;
    non_dispenser_sales.push(outside_order);
  });

  // Accounting for outside sales orders.
  _.each(non_dispenser_sales, function(outside_order) {
    outside_order["status"] = "sold";
    outside_order["bucket"] = "revenue";
    outside_order["session"] = "non-dispenser";
    var selling_price = outside_order.selling_price;
    var restaurant_fee = outside_order.restaurant_fee;
    var foodbox_fee = outside_order.foodbox_fee;
    var qty = outside_order.qty + outside_order.refund_qty;
    var vat_perc = 0;
    var st_abatement_perc = 0;
    var eff_st_perc = (fbxFV.id == outside_order.restaurant_id)?0:fbx_st_perc;
    var eff_tds_perc = (fbxFV.id == outside_order.restaurant_id)?0:tds_perc;

    var cash_settlement = {};
    cash_settlement["sale"] = selling_price*qty;
    cash_settlement["foodbox_fee"] = foodbox_fee*qty;

    cash_settlement["restaurant_liability"] = 0;
    cash_settlement["foodbox_liability"] = 0;

    // Derived
    cash_settlement["vat"] = cash_settlement["sale"]*vat_perc/100;
    cash_settlement["st_with_abatement"] = cash_settlement["sale"]*st_abatement_perc/100;

    cash_settlement["foodbox_st"] = cash_settlement["foodbox_fee"]*eff_st_perc/100;
    cash_settlement["foodbox_txn"] = cash_settlement["foodbox_fee"] + cash_settlement["foodbox_st"];
    cash_settlement["restaurant_fee"] = cash_settlement["sale"] - cash_settlement["foodbox_txn"];

    cash_settlement["foodbox_tds"] = cash_settlement["foodbox_fee"]*eff_tds_perc/100;
    cash_settlement["restaurant_remit_bef_adj"] = cash_settlement["restaurant_fee"] + cash_settlement["foodbox_tds"];

    cash_settlement["restaurant_liability_st"] = cash_settlement["restaurant_liability"]*eff_st_perc/100;
    cash_settlement["restaurant_liability_tds"] = cash_settlement["restaurant_liability"]*eff_tds_perc/100;
    cash_settlement["restaurant_liability_total"] = cash_settlement["restaurant_liability"]
    + cash_settlement["restaurant_liability_st"] - cash_settlement["restaurant_liability_tds"];

    cash_settlement["restaurant_liability_net"] = cash_settlement["restaurant_liability_total"]
    - cash_settlement["foodbox_liability"];

    cash_settlement["restaurant_remit_aft_adj"] =
    cash_settlement["restaurant_remit_bef_adj"] - cash_settlement["restaurant_liability_net"];

    cash_settlement["restaurant_tax_remit"] = cash_settlement["vat"] + cash_settlement["st_with_abatement"];

    outside_order.cash_settlement = cash_settlement;
  });
return non_dispenser_sales;
};

var compute_session_for_po = function(purchase_orders, outlet_sessions) {
  _.sortBy(outlet_sessions, 'start_time');
  _.each(purchase_orders, function(po){
    var session = _.find(outlet_sessions, function(s){
      var po_time = moment(po.scheduled_delivery_time).format('HH:mm:ss');
      var start_time = s.start_time;
      var end_time = s.end_time;
      console.log("start: " + start_time + ", end:" + end_time + ", po:" + po_time);
      if(start_time < end_time && 
        po_time >= start_time && po_time <= end_time ) {
        return true;
      } else if(start_time > end_time &&
          (po_time >= start_time || po_time <= end_time)) {
        return true;
      }
      return false;
    });
    po["session"] = session?session.name:"NA";
  });
};

var process_and_store_cash_settlement = function(date,
  outlet, purchase_orders, outside_sales,
  tds_perc, abatement_perc, fbx_st_perc, fbxFV, outlet_sessions, async_callback) {

  // Add session to po item
  compute_session_for_po(purchase_orders, outlet_sessions);

  this.consolidate_po_item_accounting(purchase_orders, outlet, tds_perc, abatement_perc, fbx_st_perc);
  var non_dispenser_sales = this.consolidate_so_item_accounting(outside_sales, outlet, tds_perc, fbx_st_perc, fbxFV);
  // store json object for cash settlement in database for future use.
  pg.connect(conString, function(err, client, done) {
    if(err) {
      async_callback(err, null);
      return;
    }
    client.query(
      "INSERT INTO daily_cash_settlements \
      (outlet_id, creation_time, consolidated_data, last_updated) \
      VALUES ($1, $2, $3, now())",
      [outlet.id, date, JSON.stringify({purchase_orders:purchase_orders, outside_sales:non_dispenser_sales})],

      function(query_err, result) {
        if(query_err) {
          done(client)
          async_callback(query_err, null);
          return;
        } else {
          done();
          async_callback(null, true);
        }
      });
  });
};

var get_fv_details = function(consolidated_data, date, city_code, fbxFV, async_callback) {
  var list1 = _.pluck(consolidated_data.purchase_orders, 'restaurant_id');
  var list2 = _.pluck(consolidated_data.outside_sales, 'restaurant_id');
  var full_list = list1.concat(list2);
  full_list.push(fbxFV.id);
  var fv_ids = _.uniq(full_list);
  async.waterfall([
    function(callback) {
      dbUtils.getFvByIds(fv_ids, callback);
    },
    function(fv_details, callback) {
      var uniq_entities = _.uniq(_.pluck(fv_details, 'entity'));
      async.map(uniq_entities,
        function(entity, map_callback){
          dbUtils.getCarryForward(entity, date, city_code, map_callback);
        },
        function(map_err, map_results){
          if(map_err) {
            callback(map_err, null);
            return;
          }
          callback(null, {fv_details: fv_details, carry_forwards: map_results});
          return;
        });
    }
    ],function(err, res) {
      if(err) {
        async_callback(err, null);
        return;
      }
      async_callback(null, res.fv_details, res.carry_forwards);
      return;
    });
};

var get_fv_payouts = function(consolidated_data, date, fv_details, carry_forwards, city_code, fbxFV, async_callback) {
  var payouts = {};
  payouts[fbxFV.entity] = {
    gross_sales: 0,
    net_revenue: 0,
    tax: 0,
    fbx_share: 0,
    total_remittance: 0,
    new_carry_forward: 0
  };

  _.each(consolidated_data.purchase_orders, function(o) {
    var cst = o.cash_settlement;
    var fv = _.findWhere(fv_details, {id: o.restaurant_id});
    if(! _.has(payouts, fv.entity)) {
      payouts[fv.entity] = {
        gross_sales: cst.sale,
        net_revenue: cst.restaurant_remit_aft_adj,
        tax:cst.restaurant_tax_remit
      };
    } else {
      payouts[fv.entity].gross_sales += cst.sale;
      payouts[fv.entity].net_revenue += cst.restaurant_remit_aft_adj;
      payouts[fv.entity].tax += cst.restaurant_tax_remit;
    }
  });

  _.each(consolidated_data.outside_sales, function(o) {
    var cst = o.cash_settlement;
    var fv = _.findWhere(fv_details, {id: o.restaurant_id});
    if(! _.has(payouts, fv.entity)) {
      payouts[fv.entity] = {
        gross_sales: cst.sale,
        net_revenue: cst.restaurant_remit_aft_adj,
        tax:cst.restaurant_tax_remit
      };
    } else {
      payouts[fv.entity].gross_sales += cst.sale;
      payouts[fv.entity].net_revenue += cst.restaurant_remit_aft_adj;
      payouts[fv.entity].tax += cst.restaurant_tax_remit;
    }
  });

  // Adjust with carry forwards
  _.each(_.keys(payouts), function(entity){
    var payout = payouts[entity];
    var ftr_carry_forward = _.findWhere(carry_forwards, {entity: entity});
    var past_due = (ftr_carry_forward)?ftr_carry_forward.carry_forward:0;
    var balance = payout["net_revenue"] - past_due;
    var new_carry_forward = (balance >= 0)?0:(-balance);
    var final_remittance = (balance >= 0)?balance:0;
    payout["fbx_share"] = payout["gross_sales"] - final_remittance;
    payout["total_remittance"] = final_remittance + payout["tax"];
    payout["new_carry_forward"] = new_carry_forward;
  });

  debugger;
  // Adding foodbox share to ATC restaurant.
  var total_fbx_share = _.reduce(_.values(payouts),
  function(memo, payout) {return memo + payout.fbx_share;}, 0);

  // Add fbx share to foodbox fv account.
  var fbx_balance = total_fbx_share - payouts[fbxFV.entity].new_carry_forward;
  payouts[fbxFV.entity].new_carry_forward = (fbx_balance >= 0)?0:(-fbx_balance);
  var additional_amount = (fbx_balance >= 0)?fbx_balance:0;
  payouts[fbxFV.entity].total_remittance += additional_amount;


  // Update ftr_carry_forwards table
  async.map(_.keys(payouts),
    function(entity, map_callback){
      var payout = payouts[entity];
      dbUtils.addCarryForwards(
        entity, date, city_code, payout.new_carry_forward, map_callback);
    },
    function(map_err, map_results){
      if(map_err) {
        async_callback(map_err, null);
        return;
      }
      async_callback(null, payouts, fv_details);
      return;
  });
};

var get_ftr_data = function(date, city_code, fv_payouts, fv_details, fbxFV, async_callback) {
  // Atchayam bank details.
  pg.connect(conString, function(err, client, done) {
    if(err) {
      async_callback(err, null);
      return;
    }
    client.query(
      "SELECT * \
      FROM \
      escrow_accounts \
      WHERE \
      city = $1",
      [city_code],
      function(query_err, account_details){
        if(query_err) {
          done(client);
          async_callback(query_err, null);
          return;
        } else {
          done();
          var atp_account = account_details.rows[0];
        // prepare ftr data.
        var today = moment(date);
        var tomorrow = moment(date).add(1, 'days');

        var ftr_data = {};
        ftr_data["city"] = city_code;
        ftr_data["date"] = tomorrow.format("MMM Do, YYYY");
        ftr_data["sales_date"] = today.format("MMM Do, YYYY");
        ftr_data["fv_names"] = _.uniq(_.pluck(_.reject(fv_details, function(fv) {return (fv.id == fbxFV.id);}),
          "beneficiary_name")).join(',');
        ftr_data["bank_account_name"] = atp_account.account_name;
        ftr_data["corp_name"] = atp_account.corp_name;
        ftr_data["bank_account_no"] = atp_account.account_no;
        ftr_data["bank_name"] = atp_account.bank_name;
        ftr_data["bank_branch"] = atp_account.bank_branch;
        ftr_data["bank_address"] = atp_account.bank_address;
        ftr_data["agreement_date"] = moment(atp_account.agreement_date).format('Do MMMM YYYY');
        ftr_data["ftr_email"] = atp_account.correspondent_email;

        var fvEntities = _.groupBy(fv_details, 'entity');

        var transfers = [];
        var total_payout = 0;
        _.each(_.keys(fvEntities), function(entity) {
          var fv = _.first(fvEntities[entity]);
          var payout = Math.round(fv_payouts[entity].total_remittance);
          if(payout <= 0) {
            return;
          }
          total_payout += payout;
          transfers.push({
            beneficiary_name: fv.beneficiary_name,
            beneficiary_ac: fv.account_no,
            amount: (payout + "( Rupees " + inWords(payout) + ")"),
            bank: fv.bank_name + " " + fv.branch_name,
            ifsc: fv.neft_code
          });
        });

        ftr_data["transfers"] = transfers;
        ftr_data["total_amount"] = total_payout + "( Rupees " + inWords(total_payout) + ")";
        async_callback(null, ftr_data);
        return;
      }
    });
  });
};

var generate_ftr_pdf = function(ftr_data, async_callback) {
  var template_path = path.join(__dirname, '/../');
  template_path = path.join(template_path, 'public/reports/FTR.html');
  var out_file_path = '/tmp/ftr-' + moment().format('MM-DD-YYYY-hh-mm') + '.pdf';
  var content = fs.readFileSync(template_path, 'utf8');
  jsreport.render({
    template: {
      content: content,
      engine: 'jsrender'
    },
    recipe: 'phantom-pdf',
    data: ftr_data
  }).then(function(out) {
    var w = out.result.pipe(fs.createWriteStream(out_file_path));
    w.on('close', function(){
      debugger;
      async_callback(null, out_file_path, ftr_data);
    })
  }).catch(function(e) {
    async_callback(e, null);
    return;
  });
};

var email_ftr = function(ftr_path, ftr_data, async_callback) {
  debugger;
  var transporter = mailer.createTransport({
     host: "smtp.gmail.com", // hostname
     port: 465,
     secure: true,
     auth: {
       user: 'no-reply@atchayam.in',
       pass: 'Atchayam123'
     }
   }, {
     // default values for sendMail method
     from: 'no-reply@atchayam.in',
     headers: {
       'My-Awesome-Header': '123'
     }
   });
  debugger;
  transporter.sendMail({
    sender: 'no-reply@atchayam.in',
    to: ftr_data.ftr_email,
    subject: 'Autogenerated FTR -' + moment().format("MMM Do, YYYY"),
    text: 'PFA the auto-generated FTR for all oulets in city code:' + ftr_data.city
      +', date:' + ftr_data.sales_date,
    attachments: [{'filename': 'ftr-'+ ftr_data.city + '-' + ftr_data.sales_date +'.pdf', 'path':ftr_path, contentType:'application/pdf'}]
  }, function(mailer_err, mailer_info) {
    debugger;
    if(mailer_err) {
      async_callback(mailer_err, null);
    }
    async_callback(null, true);
  });
};

var filterPOByEoDTimings = function(purchases, outlet, date) {
  if(outlet.is24hr) {
    return _.filter(purchases, function(p) {
      return (moment(p.scheduled_delivery_time).format('YYYY-MM-DD') == date);
    });
  }
  var last_eod,next_eod = null;
  if(outlet.start_of_day < outlet.end_of_day) {
    var prev_day = moment(date).add(-1, 'days').format('YYYY-MM-DD');
    last_eod = moment(prev_day + ' ' + outlet.end_of_day);
    next_eod = moment(date + ' ' + outlet.end_of_day);
  } else {
    var next_day = moment(date).add(1, 'days').format('YYYY-MM-DD'); 
    last_eod = moment(date + ' ' + outlet.end_of_day);
    next_eod = moment(next_day + ' ' + outlet.end_of_day);
  }
  
  return _.filter(purchases, function(p) {
    return moment(p.scheduled_delivery_time).isBetween(last_eod, next_eod);
  });
};

var filterOutsideSalesByEoDTimings = function(outside_sales, outlet, date) {
  if (outlet.is24hr) {
    return _.filter(outside_sales, function(os) {
      return (moment(os.time).format('YYYY-MM-DD') == date);
    });
  }

  var last_eod,next_eod = null;
  if(outlet.start_of_day < outlet.end_of_day) {
    var prev_day = moment(date).add(-1, 'days').format('YYYY-MM-DD');
    last_eod = moment(prev_day + ' ' + outlet.end_of_day);
    next_eod = moment(date + ' ' + outlet.end_of_day);
  } else {
    var next_day = moment(date).add(1, 'days').format('YYYY-MM-DD'); 
    last_eod = moment(date + ' ' + outlet.end_of_day);
    next_eod = moment(next_day + ' ' + outlet.end_of_day);
  }
  
  return _.filter(outside_sales, function(os) {
    return moment(os.time).isBetween(last_eod, next_eod);
  });
};

module.exports = {
  fetchPurchaseOrders: fetchPurchaseOrders,
  fetchOutsideSales: fetchOutsideSales,
  mapToBucket: mapToBucket,
  per_item_accounting: per_item_accounting,
  consolidate_po_item_accounting: consolidate_po_item_accounting,
  consolidate_so_item_accounting: consolidate_so_item_accounting,
  process_and_store_cash_settlement: process_and_store_cash_settlement,
  get_fv_payouts: get_fv_payouts,
  get_fv_details: get_fv_details,
  get_ftr_data: get_ftr_data,
  generate_ftr_pdf: generate_ftr_pdf,
  email_ftr: email_ftr,
  filterPOByEoDTimings: filterPOByEoDTimings,
  filterOutsideSalesByEoDTimings: filterOutsideSalesByEoDTimings
};
