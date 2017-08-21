/*global require module*/
'use strict';

var express = require('express');

module.exports = function(passport) {
  var router = express.Router();
  router.get('/login', function(req, res) {
    res.render('login', {message: req.flash('loginMessage') });
  });

  router.post('/login', passport.authenticate('local-login', {
    successRedirect: '/accounts',
    failureRedirect: '/login',
    failureFlash: true
  }));

  router.get('/logout', function(req, res) {
    if(req.isAuthenticated()) {
      console.log(req.user);
      req.logout();
    }
    res.redirect('/accounts');
  });
  return router;  
};