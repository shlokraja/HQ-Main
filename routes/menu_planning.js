/*global require __dirname module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var async = require('async');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

router.get('/:outlet_id', function(req, res, next) {
  var outlet_id = req.params.outlet_id;
  pg.connect(conString, function(err, client, done) {
    client.query('SELECT id,name from outlet',
      function(query_err, result) {
      done();
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      var context = {title: 'Foodbox',
            outlets: result.rows,
            outlet_id: outlet_id};
      res.render('menu_planning', context);
    });
  });
});

router.post('/send_plans/', function(req, res, next) {
  // update menu plans which are saved but not sent to sent
  // then first send the mail to HQ
  // then go through the list, filter the items by restaurant,
  // and send the mails to each one of them
  pg.connect(conString, function(err, client, done) {
    client.query('SELECT mb.id as menu_band_id, mb.name, mb.outlet_id, \
      food_item_id, f.name as item_name, r.name as restaurant_name, rc.sender_email, \
      o.name as outlet_name, quantity, target_ts \
      FROM menu_plans mp, menu_bands mb, restaurant r, \
        restaurant_config rc, food_item f, outlet o \
      WHERE mp.menu_band_id=mb.id and r.id=f.restaurant_id and rc.restaurant_id=r.id \
        and o.id=mb.outlet_id and f.id=mp.food_item_id and sent=\'f\' \
      ORDER BY outlet_name',
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // First send the list to HQ
      var hq_content = 'Following menu plans have been sent out <br />';
      hq_content += '<table><thead><tr><th>Outlet</th><th>Menu Band</th><th>Item</th><th>Qty</th><th>Target Time</th></tr></thead>';
      hq_content += '<tbody>'
      var hasData = false;
      var restaurant_data = {};
      result.rows.map(function(item) {
        // name, item_name, outlet_name, quantity, target_ts
        var time = new Date(item.target_ts);
        hq_content += '<tr><td>' + item.outlet_name +
                      '</td><td>' + item.name +
                      '</td><td>' + item.item_name +
                      '</td><td>' + item.quantity +
                      '</td><td>' + time.toLocaleString() + '</td></tr>';
        hasData = true;
        var r_key = item.restaurant_name + ':' + item.sender_email;
        if (restaurant_data.hasOwnProperty(r_key)) {
          restaurant_data[r_key].push({
            item_name: item.item_name,
            outlet_name: item.outlet_name,
            quantity: item.quantity,
            target_time: time.toLocaleString()
          });
        } else {
          restaurant_data[r_key] = [{
            item_name: item.item_name,
            outlet_name: item.outlet_name,
            quantity: item.quantity,
            target_time: time.toLocaleString()
          }];
        }
      });
      hq_content += '</tbody></table>';

      if (!hasData) {
        debug("No new plans saved. Returning.");
        return;
      }
      var mailOptions = {
          from: 'no-reply@atchayam.in', // sender address
          to: process.env.SEND_PLANS_ADDRESS, // list of receivers
          subject: 'Volume Forcast', // Subject line
          text: hq_content, // plaintext body
          html: hq_content
      };
      debug("Content sent from HQ- ", hq_content);

      transporter.sendMail(mailOptions, function(error, info){
        if(error){
            return console.log(error);
        }
        debug('Message sent: ' + info.response);
      });

      // Then filter the list
      // item_name, outlet_name, quantity, target_ts
      Object.keys(restaurant_data).map(function(key) {
        var rest_content = 'Following menu plans have been sent out <br />';
        rest_content += '<table><thead><tr><th>Item</th><th>Outlet</th><th>Qty</th><th>Target Time</th></tr></thead>';
        rest_content += '<tbody>'
        restaurant_data[key].map(function(item) {
          rest_content += '<tr><td>' + item.item_name +
                          '</td><td>' + item.outlet_name +
                          '</td><td>' + item.quantity +
                          '</td><td>' + item.target_time + '</td></tr>';
        });
        rest_content += '</tbody></table>';

        var sender_email = key.split(':')[1];
        debug("Message sent from Restaurant- ", rest_content, " to- ", sender_email);
        var mailOptions = {
            from: 'no-reply@atchayam.in', // sender address
            to: sender_email, // list of receivers
            subject: 'Volume Forcast', // Subject line
            text: rest_content, // plaintext body
            html: rest_content
        };

        transporter.sendMail(mailOptions, function(error, info){
          if(error){
              return console.log(error);
          }
          debug('Message sent: ' + info.response);
        });

      });

      //Then set all rows in menu_plans as sent = t
      client.query('UPDATE menu_plans set sent=\'t\' where sent=\'f\' ',
        function(query_err, result) {
        done();
        if(query_err) {
          handleError(client, done, res, 'error running query' + query_err);
          return;
        }
        res.send('success');
      });
    });
  });
});

router.get('/menu_plans/:outlet_id', function(req, res, next) {
  var outlet_id = req.params.outlet_id;
  pg.connect(conString, function(err, client, done) {
    client.query('select id,start_time,end_time,name,dates,sent from menu_bands mb left join (select menu_band_id,array_agg(target_ts::date) as dates, array_agg(sent) as sent \
        from menu_plans \
        where target_ts >=current_date and target_ts < current_date + interval \'1 week\' group by menu_band_id) tmp on mb.id=tmp.menu_band_id where outlet_id=$1',
      [outlet_id],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      var returnData = new Array();
      var now = new Date();
      var date = now.getDate();
      for (var i = 0; i < 7; i++) {
        var cur_date = new Date();
        cur_date.setDate(cur_date.getDate() + i);
        // get the date string
        var date_string = getDateString(cur_date);
        // Going through all the rows and seeing whether the
        // menu plan is prepared or not
        result.rows.map(function(item) {
          var status = 'pending';
          if (item.dates) {
            item.dates.map(function(date_item, index) {
              var date_item = new Date(date_item);
              if (getDateString(date_item) == date_string) {
                if (item.sent[index] == false) {
                  status = 'saved';
                } else {
                  status = 'sent';
                }
              }
            });
          }
          if (status == 'sent') {
            return;
          }

          returnData.push({
            start_time: item.start_time,
            end_time: item.end_time,
            name: item.name,
            id: item.id,
            date: date_string,
            status: status
          });
        });
      }
      // releasing the connection
      done();
      res.send(returnData);
    });
  });
});

router.post('/menu_plan/:menu_band_id', function(req, res, next) {
  var menu_band_id = req.params.menu_band_id;
  var target_date = req.body.targetDate;
  var menu_plan_data = req.body.menu_plan_data;

  pg.connect(conString, function(err, client, done) {
    client.query('SELECT po_time FROM po_timings \
      WHERE outlet_id = (select outlet_id from menu_bands where id=$1) \
      AND po_time >= (select start_time from menu_bands where id=$1) \
      AND po_time < coalesce((select end_time from menu_bands where id=$1 and end_time > start_time), \'23:59\')',
      [menu_band_id],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // Getting the purchase order id
      var computed_time = target_date + " " + result.rows[0].po_time;

      // Inserting the po data
      menu_plan_data.map(function(row) {
      client.query('INSERT into menu_plans \
        (menu_band_id, food_item_id, quantity, generated_ts, target_ts, sent) \
          values ($1, (select id from food_item where master_id=$2 and outlet_id=(select outlet_id from menu_bands where id=$1) limit 1), $3, now(), $4, \'f\')',
        [menu_band_id, row.food_item_id, row.qty, computed_time],
        function(query_err, result) {
        done();
        if(query_err) {
          handleError(client, done, res, 'error running query' + query_err);
          return;
        }
      });
    })
    res.send('success');
    });
  });
});

router.get('/compute_plan/:menu_band_id', function(req, res, next) {
  var menu_band_id = req.params.menu_band_id;
  var date = req.query.date;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    async.parallel({
      header_data: function(callback) {
        client.query('SELECT mb.name as band,start_time,end_time,o.name \
          FROM menu_bands mb, outlet o \
          WHERE mb.outlet_id=o.id and mb.id=$1',
          [menu_band_id],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows[0]);
        });
      },
      food_items: function(callback) {
        client.query('SELECT f.master_id as food_item_id, f.name, cuisine, veg, \
            r.short_name as fv_name, item_tag, outlet_id \
          FROM food_item f, outlet o, restaurant r \
          WHERE f.outlet_id=o.id and r.id=f.restaurant_id \
            and f.location=\'dispenser\' \
            and f.outlet_id=(select outlet_id from menu_bands where id=$1) \
            order by r.short_name',
          [menu_band_id],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows);
        });
      },
      all_products: function(callback) {
        client.query('SELECT f.master_id as id,f.name as item_name,r.name as restaurant_name,\
        mrp, foodbox_fee,veg,cuisine \
        FROM food_item f, restaurant r \
        WHERE f.restaurant_id=r.id and \
          outlet_id=(select outlet_id from menu_bands where id=$1) \
          and f.location=\'dispenser\' \
        ORDER BY id',
          [menu_band_id],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }

          // releasing the connection
          done();
          callback(null, result.rows);
        });
      }
    },
    function(err, results) {
      if (err) {
        handleError(client, done, res, err);
        return;
      }
      var context = { title: 'Foodbox',
                    header_data: results.header_data,
                    date: date,
                    friendlyDate: (new Date(date)).toDateString(),
                    menu_band_id: menu_band_id,
                    all_products: results.all_products,
                    food_items: results.food_items,
                    lambdas:{
                      veg_non_veg: function(flag){
                        return flag == "true" ? "veg" : "non-veg";
                      }
                    }};
      res.render('compute_plan', context);
    });
  });
});

router.get('/get_menu_data/:time_range', function(req, res, next) {
  var time_range = req.params.time_range;
  var menu_band_id = req.query.menu_band_id;
  if (time_range == "recent") {
    pg.connect(conString, function(err, client, done) {
    client.query('SELECT master_id as food_item_id,r.name as fv_name,r.short_name,\
            tmp.name,item_tag,veg,cuisine,tmp.sale_count,tmp_stock_count.stock_count,tmp.hour,tmp.day \
      FROM restaurant r, \
      (SELECT f.id as food_item_id,f.master_id,f.name,f.restaurant_id,f.item_tag,\
          f.veg,f.cuisine,sum(quantity) as sale_count,extract(hour from time) as hour, \
          time::date as day \
       FROM (select sales_order_id,food_item_id, sum(quantity) as quantity \
        from sales_order_items \
        group by sales_order_id,food_item_id) si, \
        sales_order s, food_item f, menu_bands mb \
        where si.sales_order_id=s.id \
          and si.food_item_id=f.id \
          and f.outlet_id=mb.outlet_id \
          and f.location=\'dispenser\' \
          and s.outlet_id=f.outlet_id \
          and mb.id=$1 \
          and s.time::date <=current_date \
          and s.time::date >= current_date - interval \'2 days\' \
          and s.time::time >=mb.start_time \
          and s.time::time <= mb.end_time \
          group by extract(hour from time),day,f.id) tmp, \
      (SELECT f.id, f.restaurant_id, sum(quantity) as stock_count,\
        extract(hour from time) as hour, time::date as day \
        FROM live_stock ls, live_stock_items lsi, food_item f, menu_bands mb \
        WHERE lsi.live_stock_id=ls.id and lsi.food_item_id=f.id \
          and f.outlet_id=ls.outlet_id and f.outlet_id=mb.outlet_id \
          and mb.id=$1 and ls.time::date <=current_date \
          and ls.time::date >=current_date - interval \'2 days\' \
          and ls.time::time >= mb.start_time \
          and ls.time::time <= mb.end_time \
        GROUP BY extract(hour from time),day,f.id ) tmp_stock_count \
        WHERE r.id=tmp.restaurant_id \
        and r.id=tmp_stock_count.restaurant_id \
        and tmp.hour=tmp_stock_count.hour \
        and tmp.day=tmp_stock_count.day \
        and tmp.food_item_id=tmp_stock_count.id \
        ORDER BY hour',
      [menu_band_id],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      res.send(result.rows);
    });
    });
  } else if (time_range == "4week") {
    pg.connect(conString, function(err, client, done) {
    client.query('SELECT tmp.master_id as food_item_id,r.name as fv_name,r.short_name, \
            tmp.name,item_tag,veg,cuisine,sale_count,tmp_stock_count.stock_count,tmp.hour,tmp.day \
      FROM restaurant r, \
      (SELECT f.id as food_item_id,f.master_id,f.name,f.restaurant_id,f.item_tag,\
          f.veg,f.cuisine,sum(quantity) as sale_count,extract(hour from time) as hour, \
          time::date as day \
       FROM (select sales_order_id,food_item_id, sum(quantity) as quantity \
        from sales_order_items \
        group by sales_order_id,food_item_id) si, \
        sales_order s, food_item f, menu_bands mb \
        where si.sales_order_id=s.id \
          and si.food_item_id=f.id \
          and f.outlet_id=mb.outlet_id \
          and f.location=\'dispenser\' \
          and s.outlet_id=f.outlet_id \
          and mb.id=$1 \
          and s.time::date <=current_date \
          and s.time::date >=current_date - interval \'1 month\' \
          and s.time::time >=mb.start_time \
          and s.time::time <= mb.end_time \
          and extract(dow from s.time)=extract(dow from current_date) \
          group by extract(hour from time),day,f.id) tmp, \
      (SELECT f.id, f.restaurant_id, sum(quantity) as stock_count,\
          extract(hour from time) as hour, time::date as day \
        from live_stock ls, live_stock_items lsi, food_item f, menu_bands mb \
        where lsi.live_stock_id=ls.id and lsi.food_item_id=f.id \
        and f.outlet_id=ls.outlet_id and f.outlet_id=mb.outlet_id and mb.id=$1 \
        and ls.time::date <=current_date \
        and ls.time::date >=current_date - interval \'1 month\' \
        and ls.time::time >= mb.start_time \
        and ls.time::time <= mb.end_time \
        and extract(dow from ls.time)=extract(dow from current_date) \
        group by extract(hour from time),day,f.id ) tmp_stock_count \
        WHERE r.id=tmp.restaurant_id \
          and r.id=tmp_stock_count.restaurant_id \
          and tmp.hour=tmp_stock_count.hour \
          and tmp.day=tmp_stock_count.day \
          and tmp.food_item_id=tmp_stock_count.id \
        ORDER BY hour',
      [menu_band_id],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      res.send(result.rows);
    });
    });
  } else if (time_range == "last_yr") {
    pg.connect(conString, function(err, client, done) {
    client.query('SELECT tmp.master_id as food_item_id,r.name as fv_name,r.short_name,\
      tmp.name,item_tag,veg,cuisine,sale_count,tmp_stock_count.stock_count,tmp.hour \
      FROM restaurant r, \
      (SELECT f.id as food_item_id,f.master_id,f.name,f.restaurant_id,f.item_tag,f.veg,\
          f.cuisine,avg(quantity) as sale_count,extract(hour from time) as hour \
        FROM (\
          select sales_order_id,food_item_id, sum(quantity) as quantity \
          from sales_order_items group by sales_order_id,food_item_id) si, \
              sales_order s, food_item f, menu_bands mb \
          where si.sales_order_id=s.id and si.food_item_id=f.id \
            and f.outlet_id=mb.outlet_id and s.outlet_id=f.outlet_id \
            and f.location=\'dispenser\' \
            and mb.id=$1 \
            and s.time::date <=current_date - interval \'1 year\' \
            and s.time::date >=current_date - interval \'1 year\' - interval \'1 month\' \
            and s.time::time >=mb.start_time \
            and s.time::time <= mb.end_time \
            and extract (dow from s.time)=extract(dow from current_date) \
            group by extract(hour from time),f.id) tmp \
      (SELECT f.id, f.restaurant_id, avg(quantity) as stock_count,extract(hour from time) as hour \
        from live_stock ls, live_stock_items lsi, food_item f, menu_bands mb \
        where lsi.live_stock_id=ls.id and lsi.food_item_id=f.id \
          and f.outlet_id=ls.outlet_id and f.outlet_id=mb.outlet_id \
          and mb.id=$1 \
          and ls.time::date <=current_date - interval \'1 year\' \
          and ls.time::date >=current_date - interval \'1 year\' - interval \'1 month\' \
          and ls.time::time >= mb.start_time and ls.time::time <= mb.end_time and extract (dow from ls.time)=extract(dow from current_date) group by extract(hour from time),f.id) tmp_stock_count \
        WHERE r.id=tmp.restaurant_id \
          and r.id=tmp_stock_count.restaurant_id \
          and tmp.hour=tmp_stock_count.hour \
          and tmp.day=tmp_stock_count.day \
          and tmp.food_item_id=tmp_stock_count.id \
        ORDER BY hour',
      [menu_band_id],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      res.send(result.rows);
    });
    });
  }
});

// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};

function getDateString(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  month = month.toString();
  var day = date.getDate();
  day = day.toString();
  return year + '-' + (month[1]?month:"0"+month[0]) + '-' + (day[1]?day:"0"+day[0]);
}

module.exports = router;
