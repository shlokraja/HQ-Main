/* global require it describe */
'use strict';

var app = require('../app');
var should = require('should');
var supertest = require('supertest');
var format = require('string-format');
var assert = require('assert');
var utils = require('../routes/cash_settlement_helpers');
var dbUtils = require('../models/dbUtils.js');
var report_helpers = require('../routes/accounts_reports_helpers');



describe('Accounts and Reports tests', function() {

  it('tests login page get', function(done) {
    supertest(app)
    .get('/login')
    .expect(200)
    .end(function(err, res){
      console.error(err);
      done();
    });
  });

  it('tests authentication', function(done) {
    supertest(app)
    .post('/login')
    .send({username: 'ajp_admin', password: 'ajp123'})
    .expect(200)
    .end(function(err, res){
      console.error(err);
      done();
    });
  });

  it('tests report for user', function(done){
    var from_date = new Date('2016-01-04');
    var to_date = new Date('2016-01-07');
    var entity = 'DHW';
    var outlet_id = -1;  
    var report_type = 'daily_revenue_analysis';
    var user = {
      entity: 'Foodbox',
      username: 'foodbox_admin',
      password_hash: 'foodbox123',
      usertype: 'HQ'
    };

    report_helpers.generate_report_for_user(from_date, to_date,
      outlet_id, report_type, user, function(err, res){
        if(err){
          console.error(err);
          done();
        }
        console.log(res);
        done();
    });
  });

  it('tests daily receipt reports', function(done){
    dbUtils.getOutletById(2, function(err, outlet){
      if(err){
        console.error(err);
        done();
      }
      var from_date = new Date('2016-01-04');
      var to_date = new Date('2016-01-05');
      var entity = 'DHW';
      var outlets = [outlet];  
      var report_generator = report_helpers.compute_daily_receipt_for_single_entity;
      report_helpers.generate_report(from_date, to_date, outlets, null,
        'daily_receipts',report_generator, 'FV', function(err, res){
          if(err){
            console.error(err);
            done();
          }
          console.log(res);
          done();
        });
    });
  });

  it('tests fv daily revenue analysis', function(done){
    dbUtils.getOutletById(2, function(err, outlet){
      if(err){
        console.error(err);
        done();
      }
      var from_date = new Date('2016-01-04');
      var to_date = new Date('2016-01-05');
      var entity = 'AJP';
      var outlets = [outlet];  
      var report_generator = report_helpers.compute_daily_revenue_analysis_for_fv;
      report_helpers.generate_report(from_date, to_date, outlets, entity,
        'daily_revenue_analysis',report_generator, 'FV', function(err, res){
          if(err){
            console.error(err);
            done();
          }
          console.log(res);
          done();
        });
    });
  });

  it('tests hq daily revenue analysis', function(done){
    dbUtils.getOutletById(2, function(err, outlet){
      if(err){
        console.error(err);
        done();
      }
      var from_date = new Date('2016-01-04');
      var to_date = new Date('2016-01-05');
      var outlets = [outlet];  
      var report_generator = report_helpers.compute_daily_revenue_analysis_hq;
      report_helpers.generate_report(from_date, to_date, outlets, null,
        'hq_daily_revenue_analysis',report_generator, 'FV', function(err, res){
          if(err){
            console.error(err);
            done();
          }
          console.log(res);
          done();
        });
    });
  });

  it('tests hq error report', function(done){
    dbUtils.getOutletById(2, function(err, outlet){
      if(err){
        console.error(err);
        done();
      }
      var from_date = new Date('2016-01-04');
      var to_date = new Date('2016-01-05');
      var outlets = [outlet];  
      var report_generator = report_helpers.compute_daily_error_details_report;
      report_helpers.generate_report(from_date, to_date, outlets, null,
        'error_details',report_generator, 'FV', function(err, res){
          if(err){
            console.error(err);
            done();
          }
          console.log(res);
          done();
        });
    });
  });

  it('tests fv error report', function(done){
    dbUtils.getOutletById(2, function(err, outlet){
      if(err){
        console.error(err);
        done();
      }
      var from_date = new Date('2016-01-04');
      var to_date = new Date('2016-01-05');
      var outlets = [outlet];  
      var entity = 'AJP';
      var report_generator = report_helpers.compute_daily_error_details_report;
      report_helpers.generate_report(from_date, to_date, outlets, entity,
        'error_details', report_generator, 'FV', function(err, res){
          if(err){
            console.error(err);
            done();
          }
          console.log(res);
          done();
        });
    });
  });
});

