// This function does a query and checks if there are any
// pos to be made during this time. And sends out a mail with the details
var pg = require('pg');
var async = require('async');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;


// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

function checkPoTimings() {
  pg.connect(conString, function(err, client, done) {
    client.query('SELECT menu_band_id, \
        f.outlet_id, \
        (array_agg(r.name))[1] as rest_name, \
        f.restaurant_id as fv_id,target_ts \
      FROM menu_plans mp, restaurant r, food_item f \
      WHERE r.id=f.restaurant_id and mp.food_item_id=f.id \
      and extract(epoch from date_trunc(\'hour\', target_ts))=extract(epoch from date_trunc(\'hour\', now()))+extract(epoch from INTERVAL \'12 hours\') \
      GROUP BY menu_band_id,f.outlet_id,fv_id, target_ts',
      function(query_err, result) {
      if(query_err) {
        callback('error running query' + query_err, null);
        return;
      }
      done();

      var hasData = false;
      var content = "Please prepare POs for the following Restaurants <br />";
      content += '<table><thead><tr><th>Food Vendor</th><th>Outlet ID</th><th>Target PO Time</th><th>Link</th></tr></thead>';
      content += '<tbody>'
      result.rows.map(function(row) {
        var date = new Date(row.target_ts);
        var target_ts = getDateString(date) + '%20' + date.toLocaleTimeString();
        content += "<tr><td>" + row.rest_name +
                  "</td><td>" + row.outlet_id +
                  "</td><td>" + row.target_ts + "</td><td>";
        content += 'https://' + process.env.HQ_DOMAIN + ":" + process.env.PORT + "/po_editor?outlet_id=" +
            row.outlet_id + "&fv_id=" + row.fv_id + "&menu_band_id="
            + row.menu_band_id + "&target_ts=" + target_ts + "</td></tr>";
        hasData = true;
      });
      content += '</tbody></table>';
      debug(content);

      if (!hasData) {
        debug("No PO data to be edited. Returning.");
        return;
      }

      var mailOptions = {
          from: 'no-reply@atchayam.in', // sender address
          to: process.env.SEND_PO_ADDRESS, // list of receivers
          subject: 'Please prepare POs', // Subject line
          text: content, // plaintext body
          html: content
      };

      transporter.sendMail(mailOptions, function(error, info){
        if(error){
            return console.log(error);
        }
        debug('Message sent: ' + info.response);
      });

    });
  });
}

function getDateString(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  month = month.toString();
  var day = date.getDate();
  day = day.toString();
  return year + '-' + (month[1]?month:"0"+month[0]) + '-' + (day[1]?day:"0"+day[0]);
}

module.exports = checkPoTimings;
