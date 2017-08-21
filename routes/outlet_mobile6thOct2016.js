var express = require('express');
var router = express.Router();
var pg = require('pg');
var debug = require('debug')('Foodbox-HQ:server');
var config = require('../models/config');
var firebase = require('firebase');
var requestretry = require('requestretry');
var conString = config.dbConn;
var rootref = new firebase(process.env.FIREBASE_CONN);

/// Get Mobile pending orders
router.get('/mobile_pending_orders', function (req, res, next) {
    debug("**********************mobile_pending_orders called");
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
    console.log("************************************************outlet_register_phases: " + "outlet_id " + outlet_id + "phases :" + phases);

    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            debug(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        console.log("************************************************outlet_register_phases  pg called");

        client.query('INSERT INTO outlet_register (outlet_id,action_time,phase) \
      VALUES ($1,now(), $2)',
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
    });
});

module.exports = router;