/*global require __dirname module*/
'use strict';

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var multer = require('multer');
var cors = require('cors');
var cronJob = require('cron').CronJob;
var passport = require('passport');
var session = require('express-session');
var flash = require('connect-flash');
var login_report_type = "";
var routes = require('./routes/index');
var restaurant = require('./routes/restaurant');
var outlet = require('./routes/outlet');
var outlet_mobile = require('./routes/outlet_mobile');
var menu = require('./routes/menu');
var food_item = require('./routes/food_item');
var bill = require('./routes/bill');
var food_vendor = require('./routes/food_vendor');
var cash_settlement = require('./routes/cash_settlement');
var generatebill = require('./routes/generatebill');
var issue_tracker = require('./routes/issue_tracker');
var menu_planning = require('./routes/menu_planning');
var po_editor = require('./routes/po_editor');
var emergency_po = require('./routes/emergency_po');
var message_center = require('./routes/message_center');

var checkPoTimings = require('./utils/checkPoTimings');
var checkVFTimings = require('./utils/checkVFTimings');
var check_volume_plan_mail = require('./utils/check_volume_plan_mail');
var checkForEOD = require('./utils/checkForEOD');
var fv_reports = require('./routes/fv_reports');
var hq_reports = require('./routes/hq_reports');
var accounts = require('./routes/accounts');
var dbUtils = require('./models/dbUtils');
var auth = require('./routes/auth')(passport);
var ftr = require('./routes/ftr');


var volume_planning = require('./routes/volume_planning');
//var volume_plan_preview = require('./routes/volume_plan_preview');
//var edit = require('./routes/edit');
//var live_data_login = require('./routes/live_data_login');
var transaction = require('./routes/transaction');
var fin_ops_reports = require('./routes/fin_ops_reports');
var chargeback_report = require('./routes/chargeback_report');
var restaurant_recovery = require('./routes/restaurant_recovery');
var invoice = require('./routes/invoice');
var letter = require('./routes/letter');
var transit_report = require('./routes/transit_report');
var transit_payment = require('./routes/transit_payment');
// tata report integration
var tata_fin_ops_reports = require('./routes/tata_fin_ops_reports');

// var api = require('./api/api');
//var server = require('./api/server');

new cronJob('*/3 * * * *', function ()
{
    check_volume_plan_mail();
},
  true, /* Start the job right now */
  'Asia/Kolkata' /* Time zone of this job. */
);

// new cronJob('*/1 * * * *', function ()
// {
//     send_HQ_mail();    
// },
//   true, /* Start the job right now */
//   'Asia/Kolkata' /* Time zone of this job. */
// );


// Starting the cron job to check for po timings
new cronJob('0 * * * *', function(){
    checkPoTimings();
  },
  true, /* Start the job right now */
  'Asia/Kolkata' /* Time zone of this job. */
);

new cronJob('0 8 * * *', function(){
    checkVFTimings();
  },
  true, /* Start the job right now */
  'Asia/Kolkata' /* Time zone of this job. */
);

new cronJob('*/30 * * * *', function(){
    checkForEOD();
  },
  true,
  'Asia/Kolkata'
);


var app = express();

app.engine('hjs', require('hogan-express'));
if (app.get('env') === 'production') {
  app.enable('view cache');
}


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');
app.set('layout', 'layout');

app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true,parameterLimit:50000}));
app.use( bodyParser.json({limit: '50mb'}) );

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(logger('[:date[web]] ":method :url HTTP/:http-version" :status'));

// Using multer to handle file uploads
app.use(multer({
 dest: './food_images/',
 rename: function (fieldname, filename) {
    return filename.replace(/\W+/g, '-').toLowerCase() + Date.now();
  }
}));
// Enabling cors for all origins
app.use(cors());

// Auth set-up
require('./auth_config/passport')(passport);
app.use(session({secret: 'atchayamsecretreports1234',
  cookie: {maxAge: 60*60*1000},
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());


// Setting up routes here
app.use('/', routes);
app.use('/restaurant', restaurant);
app.use('/outlet', outlet);
app.use('/menu', menu);
app.use('/food_item', food_item);
app.use('/bill', bill);
app.use('/food_vendor', food_vendor);
app.use('/cash_settlement', cash_settlement);
app.use('/generatebill', generatebill);
app.use('/issue_tracker', issue_tracker);
app.use('/menu_planning', menu_planning);
app.use('/po_editor', po_editor);
app.use('/emergency_po', emergency_po);
app.use('/message_center', message_center);
app.use('/fv_reports', fv_reports);
app.use('/hq_reports', hq_reports);
app.use('/accounts', accounts);
app.use('/', auth);
app.use('/ftr', ftr);
app.use('/outlet_mobile', outlet_mobile);

app.use('/volume_planning', volume_planning);
//app.use('/volume_plan_preview', volume_plan_preview);
//app.use('/edit', edit);
//app.use('/live_data_login', live_data_login);
app.use('/transaction', transaction);
app.use('/fin_ops_reports', fin_ops_reports);
app.use('/chargeback_report', chargeback_report);
app.use('/restaurant_recovery', restaurant_recovery);
app.use('/invoice', invoice);
app.use('/letter', letter);
app.use('/transit_report', transit_report);
app.use('/transit_payment', transit_payment);
app.use('/daily_reports', tata_fin_ops_reports); //tata report integration
// app.use(timeout(18000000)); // 30 mins
// app.use(haltOnTimedout);

// function haltOnTimedout(req, res, next) {
    // if (!req.timedout) next();
// }

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

module.exports = app;
