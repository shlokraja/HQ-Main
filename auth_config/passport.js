// auth_config/passport.js

// load all the things we need
var LocalStrategy   = require('passport-local').Strategy;

var dbUtils = require('../models/dbUtils');

// expose this function to our app using module.exports
module.exports = function(passport) {

    passport.serializeUser(function (user, done) {
        done(null, user);
    });

    passport.deserializeUser(function (user1, done) {
        dbUtils.getAccountReportUser(user1.username, function(err, user){
        debugger;
        if(err) {
          console.error(err);
          return done(err);
        } else if(!user) {
          return done(new Error('User with username ' + user1.username + ' does not exist'));
        } else {
            user.login_report_type = user1.login_report_type;
            done(null, user);
        }
      });
    });

    passport.use('local-login', new LocalStrategy({
        usernameField: 'username',
        passwordField: 'password',
        passReqToCallback: true
      }, function(req, username, password, done) {
          debugger;
        login_report_type = req.body.report_type;
        /* get username and password from db */
        dbUtils.getAccountReportUserWithPasswd(username, password, function(err, user) {
          debugger;
          if(err) {
            console.error(err);
            return done(err);
          } else if(!user) {
            return done(null, false, req.flash('loginMessage', 'Wrong username or password'));
          } else {
              user["login_report_type"] = login_report_type;
            return done(null, user);
          }
        });
      }
  ));
};