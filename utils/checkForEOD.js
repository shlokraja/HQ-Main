    // This function checks if there is any eod time in the past 30 mins, then do the do for that outlet

var pg = require('pg');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var request = require('request');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

Date.prototype.addHours = function(h) {
  this.setTime(this.getTime() + (h*60*60*1000));
  return this;
};

function checkForEOD() {
  debugger;
  var date_obj = new Date().addHours(-1); 
  //Round off the date_obj to the nearest half hour
  if (date_obj.getMinutes() >= 30) {
    date_obj.setMinutes(30);
  } else {
    date_obj.setMinutes(0); 
  }
  date_obj.setSeconds(0); 
  pg.connect(conString, function(err, client, done) {
    client.query('select id,end_of_day,name from outlet \
        WHERE active=true and end_of_day < $1 and end_of_day >= $1 - interval \'30 mins\' \
        union all \
        select id,end_of_day,name from outlet where active=true and id not in ( \
        select outlet_id from daily_cash_settlements  where creation_time::date=now()::date - interval \'1 day\') \
        and now()::time >\'05:00\'::time and now()::time <=\'05:45\'',
      [date_obj.toLocaleTimeString()],
      function(query_err, result) {
      if(query_err) {
        console.error('error running query' + query_err, null);
        return;
      }
      done();
      result.rows.map(function(item) {
        var END_OF_DAY_CALC_URL = 'https://' + process.env.HQ_DOMAIN + ':' + process.env.PORT + '/outlet/eod_calc/{}'.format(item.id);
        debug("Triggering EOD for- ", item.name);
        request({
        url: END_OF_DAY_CALC_URL,
        method: "POST",
        }, function(error, response, body) {
          if (error || (response && response.statusCode != 200)) {
            console.error('{}: {} {}'.format(END_OF_DAY_CALC_URL, error, body));
            return;
          }
          debug(body);
        });
      });
      });
  });
}

module.exports = checkForEOD;
