/*global module process*/
'use strict';
var pg = require('pg');

module.exports = {
    dbConn: process.env.DB_CONN || "postgres://localhost/testdb",
    query: function(text, values, cb) {
      pg.connect(process.env.DB_CONN, function(err, client, done) {
        if (err) {
          done(client);
          cb(err, null);
          return;
        }
        client.query(text, values, function(err, result) {
          if(err){
            done(client);
            cb(err, null);
          }
          done();
          cb(null, result);
        });
      });
   }
};

