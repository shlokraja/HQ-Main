/*global require it describe*/
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var debug = require('debug')('Foodbox-HQ:server');
var format = require('string-format');
var assert = require('assert');
var utils = require('../routes/cash_settlement_helpers');
var dbUtils = require('../models/dbUtils.js');
var jsreport = require('jsreport');
var fs = require('fs');
var path = require('path');

describe('Cash Settlement tests', function(){

  it('tests cash selttlement for an outlet', function(done) {
    supertest(app)
    .get('/cash_settlement/6/2016-02-08/')
    .expect(200)
    .end(function(err, res){
      debugger;
      if(err) {
        console.error(err);
      }
      done();
    });
  });

  it('tests fv lists for cash settlement emails', function(done){
    dbUtils.getFVListForReportEmail(4, '2016-01-05', function(err, res){
      if(err) {
        console.error(err);
      }
      done();
    });
  });

  it('tests ftr for a city code', function(done) {
    supertest(app)
    .get('/ftr/CH/2016-02-08/')
    .expect(200)
    .end(function(err, res){
      debugger;
      if(err) {
        console.error(err);
      }
      done();
    });
  });

  it('tests cash settlement for a single purchase item', function(done){
    var purchase_item = {
      status: "sold",
      mrp: 110,
      st_perc: 6,
      vat_perc: 4,
      selling_price: 50,
      foodbox_fee : 20,
      restaurant_fee: 30,
      qty: 5
    };

    var outlet = {
      abatement_percent: 60
    };



    utils.mapToBucket(purchase_item);
    assert.equal(purchase_item.bucket, "revenue");

    utils.fees_per_item(purchase_item, outlet);
    assert.equal(purchase_item.price_without_tax, 500);
    assert.equal(purchase_item.restaurant_fee, 110);
    assert.equal(purchase_item.foodbox_fee, 250);

    utils.per_item_accounting(purchase_item);
    assert.equal(purchase_item.cash_settlement.outlet_escrow_account, -1.0*purchase_item.price_without_tax);
    assert.equal(purchase_item.cash_settlement.restaurant_account, purchase_item.restaurant_fee);
    assert.equal(purchase_item.cash_settlement.foodbox_account, purchase_item.foodbox_fee);
    assert.ok(!!! purchase_item.cash_settlement.hasOwnProperty("transporter_account"));
    done();
  });

it('tests jsreport pdf generation', function(done) {
  var filePath = path.join(__dirname, '/../');
  filePath = path.join(filePath, 'public/reports/FTR.html');
  var content = fs.readFileSync(filePath, 'utf8');
  jsreport.render({
    template: {
      content: content,
      engine: 'jsrender'
    },
    recipe: 'phantom-pdf',
    data: {
      date: "18-Apr-14",
      sales_date: "17th March 2014",
      bank_name: "Axis Bank Ltd",
      bank_branch: "Anna Nagar Branch",
      bank_address: "Chennai-102",
      bank_account_no : "913020022798643",
      bank_account_name : "Atchayam Chennai Escrow Account",
      corp_name: "M/s. Atchayam Business Solutions Pvt. Ltd.",
      total_amount : "49,032 (Forty Nine Thousand and Thirty Two Only)",
      fv_names : "Restaurant A, B, C, D",
      agreement_day: 6,
      agreement_month: "May",
      agreement_year: 2013,
      transfers: [
      {
        beneficiary_name: "RESTAURANT A",
        beneficiary_ac: "94959392949593",
        amount: "5,201 (Rupees Five Thousand Two Hundred One Only)",
        bank: "IOB MYLAPORE BRANCH",
        ifsc: "IOBA4932884"
      },
      {
        beneficiary_name: "RESTAURANT B",
        beneficiary_ac: "47583759729874",
        amount: "5,201 (Rupees Five Thousand Two Hundred One Only)",
        bank: "IOB MYLAPORE BRANCH",
        ifsc: "IOBA4932884"
      },
      {
        beneficiary_name: "RESTAURANT C",
        beneficiary_ac: "384385989895829",
        amount: "5,201 (Rupees Five Thousand Two Hundred One Only)",
        bank: "IOB MYLAPORE BRANCH",
        ifsc: "IOBA4932884"
      },
      {
        beneficiary_name: "RESTAURANT D",
        beneficiary_ac: "049689375871467",
        amount: "5,201 (Rupees Five Thousand Two Hundred One Only)",
        bank: "IOB MYLAPORE BRANCH",
        ifsc: "IOBA4932884"
      }
      ]
    }
  }).then(function(out) {
    out.result.pipe(fs.createWriteStream('/tmp/testReport.pdf'));
    done();
  }).catch(function(e) {
    console.error(e);
    done();
  });
});

});
