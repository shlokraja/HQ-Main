/*global require __dirname module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var path = require('path');
var async = require('async');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var fs = require('fs');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

router.get('/', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }

    async.parallel({
      num_pending: function(callback) {
        client.query('select \
          ( SELECT count(*) \
          FROM purchase_order_final_status pf, food_item f, purchase_order p, \
            outlet o \
          WHERE pf.purchase_order_id=p.id and pf.food_item_id=f.id \
            and o.id=p.outlet_id and o.id=f.outlet_id \
            and pf.id not in \
            (select referer_id from issue_tags where issue_type=\'food_issue\') \
           AND pf.status <> \'sold\') as food_issues, \
          ( select count(*) \
            from non_food_issue \
            where id not in \
              (select referer_id \
               from issue_tags \
               where issue_type=\'non_food_issue\')) as non_food_issues',
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
      tags: function(callback) {
        client.query('select tag from tag_master_list',
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
      var firebase_link = process.env.FIREBASE_CONN;
      var context = { title: 'Foodbox',
                    num_pending: results.num_pending,
                    tags: results.tags,
                    firebase_link: firebase_link};
      res.render('issue_tracker', context);
    });
  });
});

router.get('/sort_nonfood_issues', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('SELECT nfi.id,o.name as outlet_name,type, note, \
          coalesce(reporter,\'\') as reporter,time \
          FROM non_food_issue nfi, outlet o \
          WHERE nfi.id not in \
            (select referer_id from issue_tags where issue_type=\'non_food_issue\') \
          AND nfi.outlet_id=o.id \
          LIMIT 1',
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      res.send(result.rows[0]);
    });
  });
});

router.get('/sort_food_issues', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('SELECT pf.id,r.short_name, f.name as item_name,o.name as outlet_name,\
            p.green_signal_time as time,status,problem,note \
          FROM purchase_order_final_status pf, food_item f, purchase_order p, \
            outlet o, restaurant r \
          WHERE pf.purchase_order_id=p.id and pf.food_item_id=f.id \
            and o.id=p.outlet_id and o.id=f.outlet_id \
            and f.restaurant_id=r.id and p.restaurant_id=r.id \
            and pf.id not in \
            (select referer_id from issue_tags where issue_type=\'food_issue\') \
           AND pf.status <> \'sold\' \
          LIMIT 1',
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      res.send(result.rows[0]);
    });
  });
});

router.post('/save_tag', function(req, res, next) {
  var referer_id = req.body.referer_id;
  var issue_type = req.body.issue_type;
  var tag = req.body.tag;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('INSERT INTO issue_tags \
        (referer_id,issue_type,tag) \
        VALUES ($1,$2,$3)',
      [referer_id, issue_type, tag],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }

      // releasing the connection
      done();
      res.send('success');
    });
  });
});

router.get('/get_tags', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('select tag from tag_master_list',
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
});

router.get('/non_food_issue', function(req, res, next) {
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('select id,name from outlet',
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      // releasing the connection
      done();
      var context = {title: 'Foodbox', outlets: result.rows};
      res.render('non_food_issue', context);
    });
  });
});

router.post('/non_food_issue', function(req, res, next){
  var outlet_id = req.body.outlet_id;
  var type = req.body.type;
  var note = req.body.note;
  var reporter = req.body.reporter;
  var datetime = req.body.datetime;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    client.query('INSERT INTO non_food_issue (outlet_id,type,note,reporter,time)\
      VALUES($1, $2, $3, $4, $5)',
      [outlet_id, type, note, reporter, datetime],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      done();
      res.send('success');
    });
  });
});

router.get('/act_issue', function(req, res, next) {
  var context = {title: 'Foodbox'};
  res.render('act_issues', context);
});

router.get('/act/:tag', function(req, res, next) {
  var tagString = req.params.tag;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    async.parallel({
      food_issues: function(callback) {
        client.query('SELECT pf.id,o.name,status,note,\
              green_signal_time as time,tag,pf.resolution_status \
          FROM purchase_order_final_status pf, \
            (SELECT id,referer_id,tag \
              FROM issue_tags \
              WHERE issue_type=\'food_issue\') it, \
          purchase_order p, \
          outlet o \
          WHERE pf.id=it.referer_id \
            AND p.outlet_id=o.id \
            AND p.id=pf.purchase_order_id \
            AND pf.resolution_status <> \'resolved\' \
            AND tag like \'%'+tagString+'%\'',
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
      non_food_issues: function(callback) {
        client.query('SELECT nfi.id,o.name,type,note,time,\
          tag,nfi.resolution_status,coalesce(nfi.reporter,\'\') as reporter \
          FROM non_food_issue nfi, \
            (select id,referer_id,tag \
              FROM issue_tags \
              WHERE issue_type=\'non_food_issue\') it, \
          outlet o \
          WHERE nfi.id=it.referer_id \
            and nfi.outlet_id=o.id \
            and nfi.resolution_status <> \'resolved\' \
            and tag like \'%'+tagString+'%\'',
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
      non_food_status_text: function(callback) {
        client.query('SELECT nfi.id,st.status_text,st.time \
          FROM non_food_issue nfi, \
            (select referer_id,status_text,time \
            from status_log \
            where issue_type=\'non_food_issue\') st \
          WHERE nfi.id=st.referer_id',
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
      food_status_text: function(callback) {
        client.query('SELECT pf.id,st.status_text ,st.time \
          FROM purchase_order_final_status pf, \
            (SELECT referer_id,status_text,time \
             FROM status_log \
             WHERE issue_type=\'food_issue\') st, \
            purchase_order p \
          WHERE pf.id=st.referer_id and p.id=pf.purchase_order_id',
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
      var firebase_link = process.env.FIREBASE_CONN;
      var data = { non_food_issues: results.non_food_issues,
                    food_issues: results.food_issues,
                    non_food_status_text: results.non_food_status_text,
                    food_status_text: results.food_status_text};
      res.send(data);
    });
  });
});

router.post('/status_update/:referer_id', function(req, res, next) {
  var referer_id = req.params.referer_id;
  var type = req.body.type;
  var text = req.body.text;
  var resolution_status = req.body.resolution_status;
  pg.connect(conString, function(err, client, done) {
    if(err) {
      handleError(client, done, res, 'error fetching client from pool' + err);
      return;
    }
    if (type == 'non_food_issue') {
      client.query('UPDATE non_food_issue \
        SET resolution_status=$1 \
        WHERE id=$2',
        [resolution_status, referer_id],
        function(query_err, result) {
        if(query_err) {
          handleError(client, done, res, 'error running query' + query_err);
          return;
        }
        done();
      });
    } else {
      client.query('UPDATE purchase_order_final_status \
        SET resolution_status=$1 \
        WHERE id=$2',
        [resolution_status, referer_id],
        function(query_err, result) {
        if(query_err) {
          handleError(client, done, res, 'error running query' + query_err);
          return;
        }
        done();
      });
    }

    client.query('INSERT INTO status_log \
      VALUES($1, $2, $3, now())',
      [referer_id, type, text],
      function(query_err, result) {
      if(query_err) {
        handleError(client, done, res, 'error running query' + query_err);
        return;
      }
      done();
      res.send('success');
    });
  });
});


// Some utility functions
var handleError = function(client, done, res, msg) {
  done(client);
  console.error(msg);
  res.status(500).send(msg);
};

function getItemId(barcode) {
 return parseInt(barcode.substr(8, 4),36);
}

module.exports = router;
