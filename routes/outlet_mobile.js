var express = require('express');
var router = express.Router();
var pg = require('pg');
var debug = require('debug')('Foodbox-HQ:server');
var config = require('../models/config');
var firebase = require('firebase');
var requestretry = require('requestretry');
var conString = config.dbConn;
var rootref = new firebase(process.env.FIREBASE_CONN);
var nodemailer = require('nodemailer');
var moment = require('moment');
var reconcile_po_id = 0;
/// Get Mobile pending orders
router.get('/mobile_pending_orders', function (req, res, next) {
   // debug("**********************mobile_pending_orders called");
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            debug("**********************mobile_pending_orders ", client, done, res, 'error fetching client from pool' + err);
            return;
        }
        client.query('select id,mobileno,orderno,quantity,outlet_id,order_date \
                    from mobile_pending_orders',
        function (query_err, result) {
            if (query_err)
            {
                debug("**********************mobile_pending_orders ", client, done, res, 'error running query' + query_err);
                return;
            }
            done();
            res.send(result.rows);
        });
    });
});

router.get('/mobile_pending_orders/:outlet_id', function (req, res, next) {
   // debug("**********************mobile_pending_orders called");
   var outlet_id = req.params.outlet_id;
   console.log("**********************mobile_pending_orders called from outlet " + outlet_id);
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            debug("**********************mobile_pending_orders ", client, done, res, 'error fetching client from pool' + err);
            return;
        }
        client.query('select id,mobileno,orderno,quantity,outlet_id,order_date \
                    from mobile_pending_orders where outlet_id =$1',[outlet_id],
        function (query_err, result) {
            if (query_err)
            {
                debug("**********************mobile_pending_orders ", client, done, res, 'error running query' + query_err);
                return;
            }
            done();
            res.send(result.rows);
        });
    });
});

router.post('/activate_mobile_order', function (req, res, next) {


    var request = req.body;
    var orderdetails = {};

    var referenceno = request.referenceno;
    var mobileno = request.mobileno;
    var outletid = request.outletid;

    var hqclient_url = 'http://' + process.env.LOCAL_IP + ':' + process.env.LISTEN_PORT + '/SendActivateOrderRequest';

    debug("activate_mobile_order: " + JSON.stringify(req.body));
    debug("hqclient_url: " + hqclient_url);

    requestretry({
        url: hqclient_url,
        forever: true,
        method: "POST",
        json: {
            "referenceno": referenceno,
            "mobileno": mobileno,
            "outletid": outletid
        }
    }, function (error, response, body) {
        try
        {
            if (error || (response && response.statusCode != 200))
            {
                console.log("outlet_mobile.js :: activate_mobile_order: " + '{}: {} {}'.format(hqclient_url, error, body));
                return;
            }
        }
        catch (e)
        {
            console.log("outlet_mobile.js :: activate_mobile_order:" + e.message);
        }

        res.send("success");
    });    

});

router.post('/delete_activated_orders', function (req, res, next) {
    debug("delete_activated_orders: " + JSON.stringify(req.body));

    pg.connect(conString, function (err, client, done) {
        try
        {
            var mobileno = req.body.mobileno;
            var orderno = req.body.referenceno;
            var outlet_id = req.body.outletid;

            if (err)
            {
                debug("mobile_pending_orders ", client, done, res, 'error fetching client from pool' + err);
                return;
            }

            var queryText = 'Delete from mobile_pending_orders where mobileno=$1 and orderno=$2 and outlet_id=$3';

            client.query(queryText, [mobileno, orderno, outlet_id], function (query_err, result) {
                try
                {
                    if (query_err)
                    {
                        debug("mobile_pending_orders ", client, done, res, 'error running query' + query_err);
                        return;
                    }

                    // releasing the connection
                    done();
                    return;
                } catch (e)
                {
                    general.genericError("outlet_mobile.js :: delete_activated_orders: " + e);
                }

                res.send("success");
            });
        } catch (e)
        {
            general.genericError("outlet_mobile.js :: delete_activated_orders: " + e);
        }
    });
});

router.post('/outlet_register_status', function (req, res, next) {
    console.log("************************************************outlet_register_phases: " + JSON.stringify(req.body));
    var outlet_id = req.body.outlet_id;
    var phases = req.body.phase;
    var isautomaticEOD = req.body.isautomaticEOD;

    if (isautomaticEOD == null)
    {
        isautomaticEOD = false;
    }

    console.log("************************************************outlet_register_phases: " + "outlet_id " + outlet_id + "phases :" + phases);

    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            debug(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        console.log("************************************************outlet_register_phases  pg called");

        client.query('INSERT INTO outlet_register (outlet_id,action_time,phase,IsAutomaticRun) \
      VALUES ($1,now(), $2,$3)',
          [outlet_id, phases, isautomaticEOD],
          function (query_err, result) {
              if (query_err)
              {
                  console.log(client, done, res, 'error running query' + query_err);
                  return;
              }
              done();
              res.send('Successfully inserted');
          });
    });
});

router.post('/automatic_sod_24hr_outlet', function (req, res, next) {
    console.log("************************************************automatic_sod_24hr_outlet: " + JSON.stringify(req.body));
    var outlet_id = req.body.outlet_id;
    var phases = req.body.phase;
    
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            debug(client, done, res, 'error fetching client from pool' + err);
            return;
        }        

        client.query("select * from outlet_register where outlet_id=$1 and phase=$2 and action_time::date=current_date",
        [outlet_id, phases],
        function (query_err, result_sod) {
            if (query_err)
            {
                console.log(client, done, res, 'error running query' + query_err);
                return;
            }

            done();

            if (result_sod.rows.length == 0)
            {
                client.query("INSERT INTO outlet_register (outlet_id,action_time,phase,IsAutomaticRun) \
      VALUES ($1,now() - interval '1 day', $2,TRUE)",
                  [outlet_id, phases],
                  function (query_err, result) {
                      if (query_err)
                      {
                          console.log(client, done, res, 'error running query' + query_err);
                          return;
                      }
                      done();
                      res.send('Successfully inserted');
                  });
            }
        });
    });
});

//update po status
router.post('/update_po_status', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {
        try
        {
            var po_id = req.body.po_id;
            var status = req.body.status;

            if (err)
            {
                debug("po_status ", client, done, res, 'error fetching client from pool' + err);
                return;
            }

            client.query('update purchase_order set status=$1 where po_id=$2', [status, po_id], function (query_err, result) {
                try
                {
                    if (query_err)
                    {
                        debug("po_status ", client, done, res, 'error running query' + query_err);
                        return;
                    }

                    // releasing the connection
                    done();
                    return;
                } catch (e)
                {
                    general.genericError("outlet_mobile.js :: po_status: " + e);
                }

                res.send("successfully update PO");
            });
        } catch (e)
        {
            general.genericError("outlet_mobile.js :: po_status: " + e);
        }
    });

});

// Send Undelivered PO items details send mail to restaurant
router.post('/send_restaurant_undelivered_po_mail', function (req, res, next) {
    console.log("******** #################################### send_restaurant_undelivered_po_mail function called");

    var mail_content = "";
    var excess_mail_content = "";

    // mail content for undelivered items
    if (req.body.total_undelivered_qty > 0)
    {
        mail_content = '<html><body>';
        mail_content += '<div>';
        mail_content += 'Hi,<br/> Please find the following details of Undelivered Quantity against the PO(' + req.body.po_id + ') to <b>' + req.body.outlet_name + '</b> from your Restatrant. <br/><br/><br/><table class="reconsile" border="1" cellpadding="0" cellspacing="0" width="75%">';
        mail_content += '<tr style="background-color: #fbb713;color: #4a4b4a;font-weight: bold;text-align:center;"><th>Item Name</th><th>PO Quantity</th><th>Delivered Quantity</th><th>Undelivered Quantity</th></tr>';
        mail_content += req.body.mail_content;
        mail_content += '</table><br/><br/>';
        mail_content += '<tr><td>  If you do not accept to any details mentioned the mail above, please respond to <a href=mailto:restaurantissues@owltech.in> restaurantissues@owltech.in </a> within 24 hours on receipt of mail stating the "date of delivery" and details of differences.</td></tr>';
        mail_content += '<div><br/>Thanks,<br/>Frshly</div></body></html>';
        console.log("******** send_mail mail_content" + mail_content);
        console.log("****Restaurant Id***" + req.body.restaurant_id);
        var restaurant_id = req.body.restaurant_id;
        var restaurant_mail_id = ""; // getrestaurant_EmailID(req.body.restaurant_id, null);
    }

    // mail content for excess items 
    if (req.body.total_excess_qty > 0)
    {
        excess_mail_content = '<html><body>';
        excess_mail_content += '<div>';
        excess_mail_content += 'Hi,<br/> Please find the following details of Excess Quantity against the PO(' + req.body.po_id + ') to <b>' + req.body.outlet_name + '</b> from your Restatrant. <br/><br/><br/><table class="reconsile" border="1" cellpadding="0" cellspacing="0" width="50%">';
        excess_mail_content += '<tr style="background-color: #fbb713;color: #4a4b4a;font-weight: bold;text-align:center;"><th>Item Name</th><th>PO Quantity</th><th>Delivered Quantity</th><th>Excess Quantity</th></tr>';
        excess_mail_content += req.body.excess_mail_response;
        excess_mail_content += '</table><br/><br/>';
        excess_mail_content += '<tr><td>  If you do not accept to any details mentioned the mail above, please respond to <a href=mailto:restaurantissues@owltech.in> restaurantissues@owltech.in </a> within 24 hours on receipt of mail stating the "date of delivery" and details of differences.</td></tr>';
        excess_mail_content += '<div><br/>Thanks,<br/>Frshly</div></body></html>';
        console.log("******** send_mail excess_mail_content" + mail_content);
        console.log("****Restaurant Id***" + req.body.restaurant_id);
        var restaurant_id = req.body.restaurant_id;
        var restaurant_mail_id = ""; // getrestaurant_EmailID(req.body.restaurant_id, null);
    }

    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            console.log(err);
            return;
        }
        debugger;
        client.query(
          "select sender_email as email_id from restaurant_config where restaurant_id=$1",
          [restaurant_id],

          function (query_err, result) {
              if (query_err)
              {
                  done(client)
                  console.log(query_err);
                  return;
              }
              done();
              if (result.rows[0] != null)
              {
                  console.log(result.rows[0].email_id);
                 // restaurant_mail_id = result.rows[0].email_id;
                    restaurant_mail_id = 'salil.sharma@gofrsh.ly,prakash.chandrasekar@gofrshly.com,MIS@gofrsh.ly,jagadesh.s@shloklabs.com,vikram.t@shloklabs.com,rajasekaran.mathuram@gofrsh.ly,santhipriya.ravi@gofrshly.com';


                  console.log("****Restaurant Email Id***" + restaurant_mail_id);
                  var transporter_mail = nodemailer.createTransport({
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

                  // Send undelivered items to restaurant
                  if (req.body.total_undelivered_qty > 0)
                  {
                      var mail = {
                          from: 'no-reply@atchayam.in', // sender address
                          to: restaurant_mail_id, // list of receivers
                          subject: 'Undelivered Items Against PO Number: ' + req.body.po_id + 'to ' + req.body.outlet_name, // Subject line
                          text: mail_content,
                          html: mail_content
                      }

                      transporter_mail.sendMail(mail, function (error, response) {
                          if (error)
                          {
                              console.log(error);
                          } else
                          {
                              console.log("message sent: " + response.message);
                          }
                      });
                  }

                  // Send excess items mail to restaurant
                  if (req.body.total_excess_qty > 0)
                  {
                      var excess_mail = {
                          from: 'no-reply@atchayam.in', // sender address
                          to: restaurant_mail_id, // list of receivers
                          subject: 'Excess Items Against PO Number: ' + req.body.po_id + 'to ' + req.body.outlet_name, // Subject line
                          text: excess_mail_content,
                          html: excess_mail_content
                      }

                      transporter_mail.sendMail(excess_mail, function (error, response) {
                          if (error)
                          {
                              console.log(error);
                          } else
                          {
                              console.log("excess_mail message sent: " + response.message);
                          }
                      });
                  }
              }
          });

    });

    res.send("success");
});


// Send Undelivered PO items details send mail to restaurant
router.post('/send_pending_reconcile_po_mail', function (req, res, next) {
    console.log("******** #################################### send_pending_reconcile_po_mail function called");
    
    var item_details_content = req.body.mail_content;
    var outlet_id = req.body.outlet_id;
    var outlet_name = req.body.outlet_name;
    var city = req.body.city;

    var store_managers_mail_id = "";
    var mail_content = "";

    // mail content for pending reconcile po items    
    mail_content = '<html><body>';
    mail_content += '<div>';
    mail_content += 'Hi,<br/> Please find the following details of pending reconcile items from <b>'+ outlet_name +' </b>outlet. <br/><br/><br/><table class="reconsile" border="1" cellpadding="0" cellspacing="0" width="75%">';
    mail_content += '<tr style="background-color: #43b02a;color: #ffffff;font-weight: bold;text-align:center;"><th style=\"padding: 5px;width:50px;\">PO Id</th><th style=\"padding: 5px;width:150px;\">Restaurant Name</th><th  style=\"padding: 5px;width:150px;\">Session Name</th><th  style=\"padding: 5px;width:150px;\">Item Name</th><th style=\"padding: 5px;width:150px;\">PO Qty</th><th style=\"padding: 5px;width:150px;\">Scanned Qty</th></tr>';
    mail_content += item_details_content;
    mail_content += '</table><br/><br/>';    
    mail_content += '<div><br/>Thanks,<br/>Frshly</div></body></html>';
    console.log("******** send_pending_reconcile_items :: mail_content :: " + mail_content);    
    
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            console.log(err);
            return;
        }
        debugger;
        client.query(
          "select store_managers_mail_id as email_id from city where lower(short_name)=lower($1)",
          [city],
          function (query_err, result) {
              if (query_err)
              {
                  done(client)
                  console.log(query_err);
                  return;
              }
              done();
              if (result.rows[0] != null)
              {
                  console.log("store_managers_mail_id: " + result.rows[0].email_id);
                  store_managers_mail_id = result.rows[0].email_id;

                  var transporter_mail = nodemailer.createTransport({
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

                  // Send undelivered items to restaurant
                  // TODO - check for semicolon seperated email id's
                  if (store_managers_mail_id)
                  {
                      var mail = {
                          from: 'no-reply@atchayam.in', // sender address
                          to: store_managers_mail_id, // list of receivers
                          subject: 'Pending Reconcile Items in ' + outlet_name + ' on ' + new Date(moment().format('YYYY-MM-DD')), // Subject line
                          text: mail_content,
                          html: mail_content
                      }

                      transporter_mail.sendMail(mail, function (error, response) {
                          if (error)
                          {
                              console.log(error);
                          } else
                          {
                              console.log("message sent: " + response.message);
                          }
                      });
                  }                  
              }
          });

        res.send("success");
    }); 
});


module.exports = router;
