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
    console.log("tata report");
    var query = "SELECT id,name FROM outlet ";
    var user = req.user.usertype;
    var query = "SELECT id,name FROM outlet where active=true ";
    /*if (user != "HQ") {
        query += "and entity='" + req.user.entity + "'";
    }*/
    query += " order by name";

    console.log("Page load query " + query);
    async.parallel({
        outlets: function (callback) {
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

            var context = {
                title: 'Reports',                
                outlets :results.outlets,
                user: user,
                reportAugust:login_report_type=='after_august',
            };
            res.render('tata_fin_ops_reports', context);
        });

});


router.post('/get_purchase_details', function (req, res) {
    var from_dt = req.body.from_date;
    var to_dt = req.body.to_date;
    var outlet_id=req.body.outlet_id;
    console.log(from_dt+":"+to_dt);
    pg.connect(conString, function (err, client, done) {
        console.log("pg connect");
        if (err) {
            console.log('**************get purchase order details Error ' + JSON.stringify(err));
            return;
        }
        var query = " select p.id,scheduled_delivery_time::date as purchasedate,r.name as restaurantname,f.name as foodname,pl.quantity as quantity from purchase_order p    \
         inner join purchase_order_master_list pl on pl.purchase_order_id=p.id \
         inner join food_item f on f.id=pl.food_item_id \
         inner join restaurant r on r.id=f.restaurant_id \
         where scheduled_delivery_time::date between $1 and $2 and p.outlet_id=$3 order by scheduled_delivery_time ";
        //console.log("**************purchase QUERY******" + query);
        client.query(query,[from_dt,to_dt,outlet_id],
            function (query_err, result) {
                console.log("purchase query executed")
                if (query_err) {
                    done(client);
                    console.log('**************get_Purchase_details Error ' + JSON.stringify(query_err));
                    return;
                } else {
                    done();
                    console.log('************** select get_Purchase_details Scuccess');
                    var rows = [];
                    console.log(result);
                    var result_data = result.rows;
                    if (result.rows.length != 0) {
                        rows= generate_purchase_rows(result_data);
                        res.send(rows);
                    }
                    else {
                        res.send("NoData");
                    }

                }
            });
    });
});


router.post('/get_sales_details', function (req, res) {
    var from_dt = req.body.from_date;
    var to_dt = req.body.to_date;
    var outlet_id=req.body.outlet_id;
    console.log(from_dt+":"+ to_dt+" + interval \'1 day\'");
    pg.connect(conString, function (err, client, done) {
        console.log("pg connect");
        if (err) {
            console.log('**************get sales order details Error ' + JSON.stringify(err));
            return;
        }
        var query = " select s.id as SalesId,bill_no as BillNo, s.time as SalesDate,b.food_item_id as FoodId,f.name as FoodName,b.quantity as Quantity,f.mrp as UnitPrice,r.name as Restaurant,o.short_name as Outlet, s.method as PaymentType, \
            s.mobile_num, to_char(s.time::time ,'HH24')||':00 to'||  to_char(s.time::time + interval '1 hour' ,'HH24') ||':00' as Bill_Slot ,to_char(s.time::time ,'HH24')||':00' as bill_hour,/*f.take_away,*/ \
            f.selling_price as SellingPrice,f.mrp-f.selling_price as GST from sales_order s\
            inner join bill_items b on b.sales_order_id=s.id\
            inner join food_item f on f.id=b.food_item_id\
            inner join restaurant r on r.id=f.restaurant_id\
            inner join outlet o on o.id=f.outlet_id\
            where s.time between $1 and  $2::date + interval \'1 day\' +\'02:30\'     and s.outlet_id=$3 order by s.time,b.bill_no ";
        console.log("**************sales  QUERY******" + query);
        client.query(query,[from_dt+' 02:30',to_dt ,outlet_id ],
            function (query_err, result) {
                console.log("purchase query executed")
                if (query_err) {
                    done(client);
                    console.log('**************get_Sales_details Error ' + JSON.stringify(query_err));
                    return;
                } else {
                    done();
                    console.log('************** select get_Sales_details Scuccess');
                    var rows = [];
                   // console.log(result);
                    var result_data = result.rows;
                    if (result.rows.length != 0) {
                        rows= generate_sales_rows(result_data);
                        res.send(rows);
                    }
                    else {
                        res.send("NoData");
                    }

                }
            });
    });
});



var REPORT_FIELDS = {
    purchase_details:
    {   
        "Id": 'Purchase Id',
        "PurchaseDate":'Purchase Date',
        "RestaurantName": 'Restaurant Name',
        "FoodName": 'Food Name',
        "Quantity": 'Quantity'        

    },
    sales_details:
    {
        "Id": 'Sales id',
        "bill_No": 'Bill Number',
        "Sales_Date": 'Sale Date',
        "Food_Id": 'Food Id',
        "Food_Name": 'Food Name',
        "Quantity": 'Quantity',
        "UnitPrice":'Unit Price',
        "Restaurant":'Restaurant',
        "PaymentType":'Payment Type',
        "SellingPrice":'Selling Price',
        "Gst":'GST Amount'
    },
    //purchase_date	fid	food_name	purchase_quantity	sales_quantity	closing_balance	


}


function generate_purchase_rows(result) {

/*       "id": 'Purchase Id',
        "purchasedate":'Purchase Date',
        "restaurantname": 'Restaurant Name',
        "foodname": 'Food Name',
        "quantity": 'Quantity'        
*/
  //  var Outstanding = 0;
    var rows = [];
    //console.log("***generate_rows started****" + JSON.stringify(result));
    var result_data = result;
    
    //    Outstanding = result_data[0].Oustanding_Payment;
        var item = {};
       /* item["Id"] = "";
        item["PurchaseDate"] = "";
        item["RestaurantName"] = "";
        item["FoodName"] = "";
        item["Quantity"] = "";        
        rows.push(item);
    */

    for (var value in result_data) {
     //   console.log(result_data[value]);
        var item = {};
         item["Id"] = result_data[value].id;
        item["PurchaseDate"] = moment(result_data[value].purchasedate).format('DD-MM-YYYY') ;
        item["RestaurantName"] = result_data[value].restaurantname;
        item["FoodName"] = result_data[value].foodname;
        item["Quantity"] = result_data[value].quantity;        
        rows.push(item);
        console.log("item:");
        console.log(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
         item["Id"] = "";
        item["PurchaseDate"] = "";
        item["RestaurantName"] = "";
        item["FoodName"] = "Grand Total";
        item["Quantity"] = aggregateByColumn(rows, 'Quantity');
        
                rows.push(item);
        //console.log("***result_rows aggregates****" + JSON.stringify(rows));
    }

    var result_rows = { fields: REPORT_FIELDS["restaurant_receipts"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}

function generate_sales_rows(result) {
    var rows = [];
    var result_data = result;
    for (var value in result_data) {
     //   console.log(result_data[value]);
        var item = {};
        item["salesid"] = result_data[value].salesid;
        item["billno"] = result_data[value].billno;
        item["salesdate"] = moment(result_data[value].salesdate).format('DD-MM-YYYY') ;
        item["billtime"] = moment(result_data[value].salesdate).format('HH:mm') ;
        item["foodid"] = result_data[value].foodid;
        item["foodname"] = result_data[value].foodname;
        item["quantity"] = result_data[value].quantity;
        item["unitprice"] =  result_data[value].unitprice.toFixed(2);
        item["total"] =  (result_data[value].unitprice * result_data[value].quantity).toFixed(2);
        item["restaurant"] = result_data[value].restaurant;
        item["outlet"] = result_data[value].outlet;
        item["paymenttype"] = result_data[value].paymenttype;
        // new fields  added 
        item["mobileno"] = result_data[value].mobile_num;
        item["billslot"] = result_data[value].bill_slot;
        item["billhour"] = result_data[value].bill_hour;
       // item["takeaway"] = result_data[value].take_away;

        item["sellingprice"] = result_data[value].sellingprice.toFixed(2);
        item["gst"] = result_data[value].gst.toFixed(2);

        rows.push(item);
    //    console.log("item:");
      //  console.log(item);
    }
    var aggregates = null;
    if (!_.isEmpty(rows)) {
        var item = {};
        item["salesid"] = "Grand Total";
        item["billno"] = "";
        item["salesdate"] = "";
        item["foodid"] = "";
        item["foodname"] = "";        
        item["quantity"] = aggregateByColumn(rows, 'quantity').toFixed(2);
         item["unitprice"] = aggregateByColumn(rows, 'unitprice').toFixed(2);
         item["total"] = aggregateByColumn(rows, 'total').toFixed(2);
        item["restaurant"] = "";
        item["outlet"] ="";
        item["paymenttype"] ="";
        item["mobileno"] ="";
        item["billslot"] ="";
        item["billtime"] ="";
        item["billhour"] ="";
       // item["takeaway"] ="";
        item["sellingprice"] =aggregateByColumn(rows, 'sellingprice').toFixed(2);
        item["gst"] =aggregateByColumn(rows, 'gst').toFixed(2);
        

                rows.push(item);
        //console.log("***result_rows aggregates****" + JSON.stringify(rows));
    }

    var result_rows = { fields: REPORT_FIELDS["sales_details"], rows: rows, aggregates: aggregates };
    return result_rows.rows;
}



function roundNumbers(item,digits)
{
    return Math.round(item*Math.pow(10,digits))/Math.pow(10,digits);
}
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
        console.log(resut_data[value]);
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
        var value = item[name] != "" ? Number(item[name]) : 0;
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
    var reportName = report_type + '-from-' + req.query.from_date+'.csv';
    //console.log("Generating " + report_type + ", from: " + from_date  + ", to: " + to_date + ", restaurant_id: " + restaurant_id, "report_type:" + report_type);
var query="";
if (report_type=="purchase")
{
 query = " select p.id,scheduled_delivery_time::date as purchasedate,r.name as restaurantname,f.name as foodname,pl.quantity as quantity from purchase_order p    \
         inner join purchase_order_master_list pl on pl.purchase_order_id=p.id \
         inner join food_item f on f.id=pl.food_item_id \
         inner join restaurant r on r.id=f.restaurant_id \
         where scheduled_delivery_time::date between $1 and $2 and p.outlet_id=$3 order by scheduled_delivery_time ";
}
else if(report_type=="sales")
{
 query = " select s.id as SalesId,bill_no as BillNo, s.time as SalesDate,b.food_item_id as FoodId,f.name as FoodName,b.quantity as Quantity,f.mrp as UnitPrice,r.name as Restaurant,o.short_name as Outlet, s.method as PaymentType,\
            s.mobile_num, to_char(s.time::time ,'HH24')||':00 to'||  to_char(s.time::time + interval '1 hour' ,'HH24') ||':00' as Bill_Slot ,to_char(s.time::time ,'HH24')||':00' as bill_hour,f.take_away, \
            f.selling_price as SellingPrice,f.mrp-f.selling_price as GST from sales_order s\
            inner join bill_items b on b.sales_order_id=s.id\
            inner join food_item f on f.id=b.food_item_id\
            inner join restaurant r on r.id=f.restaurant_id\
            inner join outlet o on o.id=f.outlet_id\
            where s.time::date between $1 and  $2 and s.outlet_id=$3 order by s.time,b.bill_no ";
}
else{
  var query = "with purchase_opening_stock as (select p.id,sum(pl.quantity) as purQty,pl.food_item_id,p.scheduled_delivery_time::Date as purchase_date from purchase_order p \
inner join purchase_order_master_list pl on pl.purchase_order_id=p.id \
where p.scheduled_delivery_time::date < $2 and p.outlet_id=$3 \
group by p.id,pl.food_item_id order by p.id,pl.food_item_id,p.scheduled_delivery_time::Date) \
 \
, sales_stock as (select substring(si.barcode,28,7)::int as pid, si.food_item_id,sum(si.quantity) as salesQty from sales_order s \
inner join sales_order_items si on si.sales_order_id=s.id \
where s.time::Date<$1 and s.outlet_id=$3 \
group by si.food_item_id,pid) \
,openingStock as ( \
select pos.purchase_date, pos.id as purchase_id,pos.food_item_id,sum(coalesce(purQty,0)- coalesce(salesQty,0)) as opening_stock from purchase_opening_stock pos \
left join sales_stock s on s.pid=pos.id and pos.food_item_id=s.food_item_id \
group by pos.id,pos.food_item_id,pos.purchase_date) \
,purchase as ( \
select scheduled_delivery_time::Date , p.id ,pl.food_item_id  ,quantity  from purchase_order p \
inner join purchase_order_master_list pl on pl.purchase_order_id=p.id \
inner join food_item f on f.id=pl.food_item_id \
where scheduled_delivery_time::Date between $1 and  $2::date+ interval \'1 day'+'02:30' and p.outlet_id=$3), \
 sales as  ( \
select s.time::date  as sale_date, substring(si.barcode,28,7)::int as pid ,si.food_item_id,sum(quantity) quantity from sales_order s \
inner join sales_order_items si on si.sales_order_id=s.id \
 \
where s.time between $1 and  $2::date+ interval \'1 day'+'02:30' and s.outlet_id=$3 \
group by food_item_id ,substring(si.barcode,28,7)::int,s.time::date \
), \
movement as ( \
select p.scheduled_delivery_time as Purchase_Date,p.id as Purchase_id, p.food_item_id as fid ,f.name as food_name,sum(p.quantity) as Purchase_Quantity,sum( coalesce( s.quantity,0)) as sales_quantity, sum(p.quantity-coalesce(s.quantity,0)) as Closing_Balance from purchase p  \
left join sales s on s.pid=p.id and p.food_item_id=s.food_item_id \
inner join food_item f on f.id=p.food_item_id \
group by purchase_date,fid,food_name,p.id \
order by purchase_date,food_name) \
select  os.purchase_date,s.sale_date,os.purchase_id, os.food_item_id, f.name as food_name, os.opening_Stock ,coalesce( s.quantity,0) as movement , \
 os.opening_Stock- coalesce( s.quantity,0) as closing_balance from openingStock os \
 inner join food_item f on f.id=os.food_item_id \
inner join sales s on s.pid=os.purchase_id and s.food_item_id=os.food_item_id  /*where os.food_item_id=8987 */  \
order by os.purchase_date,s.sale_date   "; 
}


    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('**************get_restaurant_details Error ' + JSON.stringify(err));
            return;
        }
        client.query(query, [from_date,to_date],
            function (query_err, result) {
                if (query_err) {
                    done(client);
                    console.log('**************get_restaurant_details Error ' + JSON.stringify(query_err));
                    return;
                } else {
                    done();
                    var rows = [];
                    var resut_data = result.rows;
                    if (report_type == "purchase") {
                        rows = generate_purchase_rows(resut_data);
                    }
                    else if (report_type == "sales") {
                        rows = generate_sales_rows(resut_data);
                    }
                    else if (report_type == "closing") {
                        rows = generate_closingstock_rows(resut_data);
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
    if (report_type == "purchase") {
        fields = ["Id", "PurchaseDate", "RestaurantName", "FoodName", "Quantity"];
        fieldNames = ["PO ID", "PO Date", "Restaurant Name", "Food Name", "Quantity"];
    }
    else if (report_type == "sales") {
        fields = ["salesid", "billno", "salesdate","billtime", "foodid", "foodname","quantity","sellingprice","gst","unitprice","total","restaurant","outlet","paymenttype","mobileno","billslot","billhour","takeaway"];
        fieldNames = ["Sales Order Id", "Bill No", "Bill Date","Bill Time", "Item Id", "Item Name","Quantity","Price without GST","GST Amount","MRP","Bill Amount","Restaurant","Outlet","Payment Type","Mobile Number","Bill Slot","Bill Hour","Take Away"];
    }
    else if (report_type == "closing") {
        fields = ["purchase_date","purchase_id", "sale_date","fid", "food_name", "purchase_quantity", "sales_quantity", "closing_balance"];
        fieldNames = ["Purchase Date","PO ID","Bill Date", "Item ID", "Item Name", "Opening Stock", "Bill Quantity", "Closing Stock"];
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

var handleError = function (res, msg) {
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
