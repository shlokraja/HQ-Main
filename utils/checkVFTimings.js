// This function does a query and checks if there are any
// vf's to be made today, then sends out a mail if needed
var pg = require('pg');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var nodemailer = require('nodemailer');

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

function checkVFTimings() {
  pg.connect(conString, function(err, client, done) {
    client.query('SELECT o.name, outlet_id \
      from vf_intervals vf, outlet o \
      where vf.outlet_id=o.id and last_run_date + time_gap = current_date',
      function(query_err, result) {
      if(query_err) {
        callback('error running query' + query_err, null);
        return;
      }
      done();

      result.rows.map(function(item) {
        // update the last run date for that outlet
        client.query('UPDATE vf_intervals set last_run_date=current_date\
            WHERE outlet_id=$1',
          [item.outlet_id],
          function(query_err, result) {
          if(query_err) {
            callback('error running query' + query_err, null);
            return;
          }
          done();
        });

        // send the mail giving the link
        var content = 'Please prepare Menu Plans for {0} - {1}'.format(item.name,
             'http://' + process.env.LOCAL_IP + ":" + process.env.PORT + '/menu_planning/' + item.outlet_id);
        var mailOptions = {
          from: 'no-reply@atchayam.in', // sender address
          to: process.env.SEND_VFMP_ADDRESS, // list of receivers
          subject: 'Please prepare VFs', // Subject line
          text: content, // plaintext body
          html: content
        };
        debug("Sending mail content as {}".format(content));

        transporter.sendMail(mailOptions, function(error, info){
          if(error){
              return console.log(error);
          }
          debug('Message sent: ' + info.response);
        });
      });
      debug("VF run completed");
    });
  });
}

module.exports = checkVFTimings;
