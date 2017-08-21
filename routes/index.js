/*global require module*/
'use strict';

var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Foodbox' });
});

router.post('/', function(req, res, next) {
  if (req.body.password == 'f00dIssue') {
    return res.redirect('/issue_tracker');
  } else if (req.body.password == 'f00dMenu') {
    return res.redirect('/menu_planning/1');
  } else if (req.body.password == 'f00dEmergencyPO') {
    return res.redirect('/emergency_po');
  }
  res.render('index', { title: 'Foodbox',
          failure: 'Authentication failure' });
});


module.exports = router;
