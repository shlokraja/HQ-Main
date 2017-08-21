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

format.extend(String.prototype);

function IsAuthenticated(req, res, next) {
    if (req.isAuthenticated())
    {
        var user = req.user.usertype;
        if (user == "HQ") {
            next();
        }
        else {
            res.redirect('/login');
        }
    } else
    {
        res.redirect('/login');
    }
}
router.get('/', IsAuthenticated, function (req, res, next) {
    async.parallel({

        city: function (callback) {
            config.query('select short_name,name from city',
            [],
            function (err, result) {
                if (err)
                {
                    callback('error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        },

        restaurants: function (callback) {
            config.query('select distinct res.id,res.name as name,out.city as city from restaurant res \
                        inner join food_item fi on fi.restaurant_id=res.id \
                        inner join outlet out on out.id=fi.outlet_id \
                        inner join restaurant_config rcon on rcon.restaurant_id=res.id \
                        where res.id>0 order by res.name',
            [],
            function (err, result) {
                if (err)
                {
                    callback('error running query' + err, null);
                    return;
                }
                callback(null, result.rows);
            });

        }

    },

      function (err, results) {
          if (err)
          {
              //handleError(client, done, res, err);
              console.log("transaction Error: " + err);
              return;
          }

          var context = {
              title: 'Payment',
              city: results.city,
              restaurants: results.restaurants,
              user: req.user.usertype,
          };


          res.render('transaction', context);


      });

});

// Some utility functions
var handleError = function (client, done, res, msg) {
    done(client);
    console.error(msg);
    res.status(500).send(msg);
};

// This router function used to insert the newly added row and updated Quantity of existing volume plan
router.post('/save_transaction_information', function (req, res) {
    //console.log("**************save_transaction_information called******");
    var reference_no = req.body.reference_no;
    var account_id = req.body.account_id;
    var from_date = req.body.from_date;
    var to_date = req.body.to_date;
    var payment_amount = req.body.payment_amount;
    var payment_date = req.body.payment_date;
    var remarks = req.body.remarks;
    var transaction_id = req.body.transaction_id;
    var check_count;
    //console.log("**************save_transaction_information json******" + JSON.stringify(req.body));
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            console.log(' save_transaction_information checkpaymentDays error fetching client from pool' + err);
            return;
        }
        var payemnt_check_query = "Select debit  from transaction where (from_date::date between '" + from_date + "'::date and'" + to_date + "'::date or  to_date::date  between '" + from_date + "'::date and'" + to_date + "') and ispublicsector=false and account_id=" + account_id;
        //console.log("save_transaction_information checkpaymentDays ****" + payemnt_check_query);
        var check_count;
        client.query(payemnt_check_query,
          [],
          function (query_err, result_payemnt_check) {
              if (query_err)
              {
                  console.log('save_transaction_information checkpaymentDays payemnt_check_query Error****' + query_err);
                  done(client);
                  return;
              }
              else
              {
                  //console.log('************** save_transaction_information checkpaymentDays count:' + result_payemnt_check.rows.length);
                  done();
                  check_count = result_payemnt_check.rows.length;

              }
              var stored_query = "INSERT INTO transaction(account_id,from_date,to_date,payment_date, debit,credit,reference_number,remarks,ispublicsector) \
        values("+ account_id + ",'" + from_date + "','" + to_date + "','" + payment_date + "'," + payment_amount + "," + "0,'" + reference_no + "','" + remarks + "',false)";

              //console.log("**************save_transaction_information QUERY******" + stored_query);
              if (check_count == 0)
              {
                  client.query(stored_query,
                    [],
                    function (query_err, result) {
                        if (query_err)
                        {
                            console.log('save_transaction Error****' + query_err);
                            done(client);
                            return;
                        }
                        else
                        {
                            //console.log('************** Inserted save_transaction Scuccess');
                            done();
                        }
                        res.send("Payment updated successfully");

                    })

              }
              else
              {

                  res.send("Payment already enter for this restaurant");
              }

          });
    });

})


router.get('/get_payment_information', function (req, res) {
    //console.log("**************get_payment_information called******");
    var account_id = req.query.account_id;
    var from_date = req.query.from_date;
    var to_date = req.query.to_date;
    pg.connect(conString, function (err, client, done) {
        if (err) {
            callback(err, null);
            return;
        }
        var query = "select *  from payment_details"
        query += "('" + account_id + "','" + from_date + "','" + to_date + "',false)";
        //console.log("**************get_payment_information QUERY******" + query);
        client.query(query,
          function (query_err, result) {
              if (query_err) {
                  done(client);
                  console.log('**************get_payment_information Error ' + JSON.stringify(query_err));
                  return;
              } else {
                  done();
                  //console.log('************** select get_payment_information Scuccess' + result.rows[0]);
                  res.send(result.rows[0]);
                  return;
              }
          });
    });

})
module.exports = router;








