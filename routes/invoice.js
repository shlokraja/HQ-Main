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
var jsreport = require('jsreport');
var pdf = require('html-pdf');
var cash_settlement = require('../routes/cash_settlement.js');
var http = require('http');
var url = require('url');
var moment = require('moment');
var app = express();

format.extend(String.prototype);

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

router.get('/', IsAuthenticated, function (req, res, next) {
    console.log("invoice *** Get called***");
    console.log("user details: " + JSON.stringify(req.user));
    var user = req.user.usertype;
    console.log("user entity details: " + user);
    var query = "SELECT id,name FROM restaurant where active=true ";
    if (user != "HQ")
    {
        query += "and entity='" + req.user.entity + "'";
    }
    query += " order by name";
    console.log("Page load query " + query);
    async.parallel({
        restaurants: function (callback) {
            config.query(query,
            [],
            function (err, result) {
                if (err)
                {
                    callback('invoice error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        },
    },

     function (err, results) {
         if (err)
         {
             console.log("invoice Error: " + err);
             return;
         }

         var context = {
             title: 'Invoice Details',
             restaurants: results.restaurants,
             user: user,
         };
         res.render('invoice', context);
     });

});
router.get('/get_invoice_details', function (req, res) {
    var month = req.query.month_id;
    var year = req.query.year_id;
    var restaurant_id = req.query.restaurant_id;
    var seleted_value = month + year;
    var reportName = "Invoice_Report" + '-on-' + month + year + '.pdf';
    console.log("** Report Name**" + reportName);
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            console.log('**************get_item_wise_charge_back Error ' + JSON.stringify(err));
            return;
        }
        var query = "select * from invoice_restaurant_details";
        query += "('" + restaurant_id + "','" + seleted_value + "')";

        console.log("**************get_item_wise_charge_back QUERY******" + query);
        client.query(query,
          function (query_err, result) {
              if (query_err)
              {
                  done(client);
                  console.log('**************get_item_wise_charge_back Error ' + JSON.stringify(query_err));
                  return;
              } else
              {
                  done();
                  console.log('************** select get_item_wise_charge_back Scuccess');
                  if (result.rows.length != 0)
                  {
                      var invoice_data = {};

                      console.log("invoice_data " + JSON.stringify(result.rows[0]));
                      invoice_data["restaurant_name"] = result.rows[0].restaurant_name;
                      invoice_data["transaction_fee"] = Number(result.rows[0].transaction_fee).toFixed(2);
                      invoice_data["st_tax"] = Number(result.rows[0].st_tax).toFixed(2);
                      invoice_data["total"] = Number(result.rows[0].total).toFixed(2);
                      invoice_data["total_in_words"] = money_conversion(Number(result.rows[0].total).toFixed(2));
                      invoice_data["vat_tin"] = result.rows[0].vat_tin;
                      invoice_data["cst_no"] = result.rows[0].cst_no != "" ? result.rows[0].cst_no : "NA";
                      invoice_data["st_no"] = result.rows[0].st_no;
                      invoice_data["pan_no"] = result.rows[0].pan_no;
                      invoice_data["st_vat_percent"] = result.rows[0].st_vat_percent;
                      var imgSrc = path.join(__dirname, '/../');
                      imgSrc = path.join(imgSrc, 'public/img/owl-tech-logo.png');
                      console.log("imgSrc** " + imgSrc);
                      invoice_data["img"] = base64Image(imgSrc);
                      generate_invoice_pdf(invoice_data, reportName, res);
                      //res.send("Success");
                  }
                  else
                  {
                      res.send("No Data");
                  }
              }
          });
    });
});

function base64Image(src) {
    var util = require("util");
    var mime = require("mime");
    var data = fs.readFileSync(src).toString("base64");
    return util.format("data:%s;base64,%s", mime.lookup(src), data);
}
function generate_invoice_pdf(invoice_data, reportName, res) {
    console.log("generate_invoice_pdf** ");
    var template_path = path.join(__dirname, '/../');
    template_path = path.join(template_path, 'public/reports/invoice.html');
    var content = fs.readFileSync(template_path, 'utf8');
    jsreport.render({
        template: {
            content: content,
            engine: 'jsrender'
        },
        recipe: 'phantom-pdf',
        data: invoice_data
    }).then(function (out) {
        out.stream.pipe(res);
        return;
    }).catch(function (err) {
        console.log("generate_invoice_pdf" + err);
        return;
    });


}

var a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
var b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function inWords(num) {
    if ((num = num.toString()).length > 9) return 'overflow';
    var n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return; var str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? '' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + '' : '';
    return str;
}

function money_conversion(money) {
    var valu = money.toString().split('.');
    console.log(valu)
    var num = parseInt(valu[0]);
    var paise = parseInt(valu[1])
    var result = 'Indian Rupees ' + inWords(num) + 'and ' + inWords(paise) + 'Paise Only'
    return result
}

module.exports = router;
