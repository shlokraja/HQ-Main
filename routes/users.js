var express = require('express');
var router = express.Router();
var pg = require('pg');
var request = require('request');
var debug = require('debug')('Foodbox-HQ:server');
var format = require('string-format');
var nodemailer = require('nodemailer');
var _ = require('underscore');
var async = require('async');
var redis = require('redis');
format.extend(String.prototype);
var config = require('../models/config');
var dbUtils = require('../models/dbUtils');
var conString = config.dbConn;
var general = require('../api/general');
var moment = require('moment');
var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    password = 'd6F3Efeq';

var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

var text_encrypt = function(text)
{
    var cipher = crypto.createCipher(algorithm, password)
    var crypted = cipher.update(text, 'utf8', 'hex')
    crypted += cipher.final('hex');
    return crypted;
}

var text_decrypt = function (text)
{
    var decipher = crypto.createDecipher(algorithm, password)
    var dec = decipher.update(text, 'hex', 'utf8')
    dec += decipher.final('utf8');
    return dec;
}

var handleError = function (client, done, res, msg)
{
    done(client);
    console.error(msg);
    res.status(500).send(msg);
};

// OUtlet Login
router.post('/Login', function (req, res, next)
{
    var password = text_encrypt(req.body.password);

    pg.connect(conString, function (err, client, done)
    {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        client.query('SELECT * from outlet_users where user_name=$1 and password=$2', [req.body.username, password], function (query_err, result)
        {
            if (query_err)
            {
                handleError(client, done, res, 'Listing Outlets :: error running query' + query_err);
                return;
            }
            if (result.rows.length > 0)
            {
                var userid = result.rows[0].user_id;
                var outletid = req.body.outlet_id;
                client.query("Insert into outlet_users_sessions (userid,logtime,action,outlet_id) values ($1,now(),'login',$2)", [userid, outletid], function (query_err, result1)
                {
                    if (query_err)
                    {
                        handleError(client, done, res, 'Listing Outlets :: error running query' + query_err);
                        return;
                    }
                    // releasing the connection
                    done();
                    res.send(result.rows);
                });
            }
            else
            {
                done();
                res.send([]);
            }
        });

    });

});

router.get('/salesdetails/:userid/:outlet_id', function (req, res, next)
{
    var userid = req.params.userid;
    var outlet_id = req.params.outlet_id;

    pg.connect(conString, function (err, client, done)
    {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        var query = 'with sales as (select food_item_id,name,poid,sum(s.quantity) as sold,sum(case when method=\'cash\' then (price) else 0 end) as cash, \
        sum(case when method=\'card\' then (price) else 0 end) as card, \
        sum(case when method=\'sodexocard\' then (price) else 0 end) as sodexocard, \
        sum(case when method=\'sodexocoupon\' then (price) else 0 end) as sodexocoupon, \
        sum(case when method=\'credit\' then (price) else 0 end) as credit , \
        sum(case when method=\'gprscard\' then price else 0 end) as gprscard, \
        sum(case when method=\'Wallet\' then price else 0 end) as wallet from\
        (select bi.food_item_id,f.name,bi.quantity,s.method,sp.amount_due,(bi.quantity*f.mrp) as price,\
        (select  substring(barcode,27,8) from sales_order_items where sales_order_id=s.id and food_item_id=bi.food_item_id limit 1)::integer as poid,\
			(select m.name from purchase_order p\
			inner join menu_bands m on m.outlet_id=p.outlet_id and p.scheduled_delivery_time::time between start_time and end_time\
			where p.outlet_id=o.id and p.id=\
			(select  substring(barcode,27,8) from sales_order_items where sales_order_id=s.id and food_item_id=bi.food_item_id limit 1)::integer) as session from sales_order s \
        inner join bill_items bi on bi.sales_order_id = s.id\
        inner join sales_order_payments sp on sp.sales_order_id = s.id\
        inner join food_item f on f.id= bi.food_item_id \
        inner join outlet o on o.id = s.outlet_id\
        where  s.outlet_id = $1 and s.userid = $2 and s.time > current_date - interval \'2 days\' and      s.time >= CASE WHEN(to_char(now(),\'yyyy-MM-dd HH24:MI\')::time < o.live_sales_sod) THEN \
        CONCAT(to_char(now() - interval \'1\' day,\'yyyy-MM-dd \'),o.live_sales_sod)::timestamp \
    else\
        CONCAT(to_char(now(),\'yyyy-MM-dd \'),o.live_sales_sod)::timestamp END \
        and s.time < CASE WHEN(to_char(now(),\'yyyy-MM-dd HH24:MI\')::time > o.automatic_eod_time) THEN \
        CONCAT(to_char(now() + interval \'1\' day,\'yyyy-MM-dd \'),o.automatic_eod_time)::timestamp \
    else \
        CONCAT(to_char(now(),\'yyyy-MM-dd \'),o.automatic_eod_time)::timestamp END and location =\'dispenser\') s\
        group by food_item_id,name,poid),\
        purchase as (select pr.po_id,pr.item_id,\
        sum(case when pr.status=\'scanned\' then (pr.quantity) else 0 end) as scanned, \
        sum(case when pr.status=\'unscanned\' then (pr.quantity) else 0 end) as unscanned, \
        sum(case when pr.status=\'damaged\' then (pr.quantity) else 0 end) as damaged, \
        sum(case when pr.status=\'expiry\' then (pr.quantity) else 0 end) as expiry, \
        sum(case when pr.status=\'undelivered\' then (pr.quantity) else 0 end) as undelivered, \
        sum(case when pr.status=\'restaurantfault\' then (pr.quantity) else 0 end) as restaurantfault,\
        sum(case when pr.status <> \'undelivered\' then (pr.quantity) else 0 end) as taken,\
        m.name as session,p.outlet_id,f.name,r.short_name as restaurantname from purchase_order p\
        inner join purchase_order_reconcile pr on pr.po_id = p.id\
        inner join food_item f on f.id = pr.item_id\
        inner join restaurant r on r.id = f.restaurant_id \
        inner join outlet outlet on outlet.id = p.outlet_id\
        inner join menu_bands m on m.outlet_id=p.outlet_id and p.scheduled_delivery_time::time between start_time and end_time\
        where p.outlet_id = $1 and  p.scheduled_delivery_time > current_date - interval \'2 days\' and p.scheduled_delivery_time>= CASE WHEN(to_char(now(),\'yyyy-MM-dd HH24:MI\')::time < outlet.live_sales_sod) THEN \
        CONCAT(to_char(now() - interval \'1\' day,\'yyyy-MM-dd \'),outlet.live_sales_sod)::timestamp \
    else \
        CONCAT(to_char(now(),\'yyyy-MM-dd \'),outlet.live_sales_sod)::timestamp END \
        and scheduled_delivery_time < CASE WHEN(to_char(now(),\'yyyy-MM-dd HH24:MI\')::time > outlet.automatic_eod_time) THEN \
        CONCAT(to_char(now() + interval \'1\' day,\'yyyy-MM-dd \'),outlet.automatic_eod_time)::timestamp \
    else \
        CONCAT(to_char(now(),\'yyyy-MM-dd \'),outlet.automatic_eod_time)::timestamp END and pr.userid = $2 and  pr.status <> \'undelivered\'\
        group by pr.po_id,pr.item_id,m.name,p.outlet_id,f.name,r.short_name\
        order by p.outlet_id,po_id,item_id)\
        select purchase.*,COALESCE(sales.sold,0) as sold ,COALESCE(sales.cash,0) as cash ,COALESCE(sales.card,0) as card ,COALESCE(sales.sodexocard,0)as sodexocard ,COALESCE(sales.sodexocoupon,0) as sodexocoupon ,COALESCE(sales.credit,0)  as credit ,COALESCE(sales.gprscard,0) as gprscard,COALESCE(sales.wallet,0) as wallet  from purchase \
        left outer join sales on sales.poid = purchase.po_id and sales.food_item_id=purchase.item_id'

        client.query(query, [outlet_id, userid], function (query_err, result)
        {
            if (query_err)
            {
                handleError(client, done, res, 'Listing Outlets :: error running query' + query_err);
                return;
            }

            // releasing the connection
            done();
            res.send(result.rows);
        });

    });

});

router.post('/Logout', function (req, res, next)
{

    var outlet_id = req.body.outlet_id;
    var user_id = req.body.userid;
    var remarks = req.body.remarks;
    var outlet_name = req.body.outlet_name
    var username = req.body.username;
    var store_managers_mail_id = req.body.store_managers_mail_id;
    console.log(req.body);
    var mailcontent;

    mail_content = '<html> <head> <style> .tableheader { background-color: #fbb713;color: #4a4b4a;font-weight: bold;text-align:center; } </style></head><body>';
    mail_content += '<div>';
    mail_content += 'Hi,<br/> Please find the following discrepancy details from <b>' + outlet_name + ' </b>outlet. <br/><br/><br/>';
    mail_content += req.body.mailcontent;
    mail_content += '<label>Remarks :' + req.body.remarks + '</label><br/><br/><br/><div><br/>Thanks,<br/>' + username + '</div></body></html>';

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

    // Send discrepancy Mail to store managers
    console.log("HTML Content : " + mail_content);
    if (store_managers_mail_id)
    {
        var date1 = moment.utc().format('YYYY-MM-DD HH:mm:ss');
        var localTime = moment.utc(date1).toDate();

        var mail = {
            from: 'no-reply@atchayam.in', // sender address
            to: store_managers_mail_id, // list of receivers
            subject: 'Discrepancy details  in ' + outlet_name + ' on ' + moment(localTime).format('YYYY-MM-DD HH:mm:ss') + '-' + username, // Subject line
            text: mail_content,
            html: mail_content
        }
        console.log("mail Content : " + mail);

        transporter_mail.sendMail(mail, function (error, response)
        {
            if (error)
            {
                console.log(error);
            } else
            {
                console.log("message sent: " + JSON.stringify(response));
            }
        });
    }

    pg.connect(conString, function (err, client, done)
    {
        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        client.query("Insert into outlet_users_sessions (userid,logtime,action,outlet_id,remarks) values ($1,now(),'logout',$2,$3)", [user_id, outlet_id, remarks], function (query_err, result1)
        {
            if (query_err)
            {
                handleError(client, done, res, 'Listing Outlets :: error running query' + query_err);
                return;
            }
            // releasing the connection
            done();
            res.send("Logout successfully...");
        });

    });

});

module.exports = router;