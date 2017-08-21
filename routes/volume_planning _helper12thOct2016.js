/*global require module*/
'use strict';

var pg = require('pg');
var config = require('../models/config');
var conString = config.dbConn;
var _ = require('underscore');
var moment = require('moment');

var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

//Query function separated to models
//Mail template file to be build


var Pivot_generation = function (data_text, city_text, from_table, callback) {
    console.log("$$^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^called pivot");
    pg.connect(conString, function (err, client, done) {
        if (err) {
            return callback(new Error(err), null);
        }
        var condent_query = "SELECT DISTINCT \
                                array_to_string(array_agg(' COALESCE(sum(case when out.short_name = ''' || out.short_name || ''' then vpa.qty end ),0) as '|| out.short_name) OVER (PARTITION BY 1), ',') AS outlet_name \
                                from "+ from_table + " vpa \
                                inner join outlet out on vpa.outlet_id=out.id \
                                where date=$1 and city_id=$2 \
                                group by session,out.short_name";
        // Get string build value based on the date filter 
        client.query(condent_query,
          [data_text, city_text], function (query_err, result) {
              done();
              if (query_err) {
                  return callback(new Error(query_err), null);

              }
              console.log("$$^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^called pivot123122323");
              if (result.rows <= 0) {
                  return callback(new Error("There is no data for selected date :" + data_text), null);
              }
              if (result.rows.length > 0) {
                  // build query for get actual data from the table 
                  var query_string = 'select vpa.session,res.name as Restaurant, \
                                   ' + result.rows[0].outlet_name + "  from " + from_table + " vpa \
                                    inner join outlet out on vpa.outlet_id=out.id \
                                    inner join restaurant res on res.id=vpa.restaurant_id \
                                    where date=$1 and city_id=$2  group by vpa.session,res.name order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                                    WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                                    WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                                    WHEN vpa.session='LateDinner' THEN 6 END"

                  client.query(query_string, [data_text, city_text], function (query_err, final_result) {
                      done();
                      if (query_err) {
                          return callback(new Error(query_err), null);
                      }

                      console.log("$$^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^Inside query_string");
                      // build query for get session wise total from the table
                      var session_total_query = 'select vpa.session, \
                                            ' + result.rows[0].outlet_name + " from " + from_table + " vpa \
                                            inner join outlet out on vpa.outlet_id=out.id \
                                            where date=$1 and city_id=$2  group by vpa.session order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                                            WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                                            WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                                            WHEN vpa.session='LateDinner' THEN 6 END"

                      client.query(session_total_query, [data_text, city_text], function (query_err, session_total_result) {
                          done();
                          if (query_err) {
                              return callback(new Error(query_err), null);
                          }
                          if (!final_result.rows) {
                              return callback(new Error('No data found in "+ from_table +"'), null);
                          } else {
                              console.log("$$^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^Inside table formation");
                              // Main html table build string variable
                              var tab = '<table id="tbl_pivot" class="table table-hover" data-pivot="Overall_Details" style="border-collapse: collapse;">'
                              // To verify if the headers already feeded into the tab 
                              var is_already_done = false
                              // To verify the content data's from the same session or from different session
                              var previous_session = ''
                              // To remaind session count value
                              var session_remainder = 0
                              // loop through the content_data 
                              _.map(final_result.rows, function (item) {
                                  var row_total = 0
                                  // If its first time here build html headers <thead> tags
                                  if (!is_already_done) {
                                      tab += '<thead><tr>'
                                      var data_keys = Object.keys(item)
                                      _.map(data_keys, function (table_head) {
                                          tab += '<th style=" background-color: #4CAF50; color: white; text-transform: uppercase;">' + table_head + '</th>'
                                      })
                                      tab += '<th style=" background-color: #4CAF50; color: white; text-transform: uppercase;">Grand Total</th></tr></thead>'
                                      is_already_done = true
                                  }

                                  tab += '<tr style="tr:nth-child(even){background-color: #f2f2f2}" >'
                                  // If session is same, here empty the session value in object
                                  if (previous_session == '' || previous_session != item.session) {
                                      previous_session = item.session
                                  } else {
                                      previous_session = item.session
                                      item.session = ''
                                  }

                                  // if session key has value in the object 
                                  // here we calculate the session wise total
                                  if (item.session != '') {
                                      tab += '<td style="padding: 8px;"><b>' + item.session + '</b></td>'
                                      _.map(session_total_result.rows[session_remainder], function (session_total) {
                                          var numeric_value = parseInt(session_total)
                                          if (!isNaN(numeric_value)) {
                                              row_total += numeric_value
                                              tab += '<td style="padding: 8px;"> <b>' + numeric_value + '</b></td>'
                                          } else {
                                              tab += '<td style="padding: 8px;"> <b>' + '' + '</b></td>'
                                          }
                                      })
                                      session_remainder += 1
                                      tab += '<td style="padding: 8px;"><b>' + row_total + '</b></td></tr>'
                                      item.session = ''
                                      row_total = 0
                                  }

                                  // for each iteration here we build the table contents
                                  _.map(item, function (content_data) {
                                      var numeric_value = parseInt(content_data)
                                      if (!isNaN(numeric_value)) {
                                          row_total += numeric_value
                                      }
                                      tab += '<td style="padding: 8px;">' + content_data + '</td>'
                                  })
                                  tab += '<td style="padding: 8px;">' + row_total + '</td></tr>'
                                  row_total = 0
                              })

                              // here build query string to get overall  total column wise from the table
                              var overall_total_query = 'select \
                                                    ' + result.rows[0].outlet_name + ' from ' + from_table + ' vpa \
                                                    inner join outlet out on vpa.outlet_id=out.id \
                                                    where date=$1 and city_id=$2 limit 1'
                              client.query(overall_total_query, [data_text, city_text], function (query_err, overall_total_result) {
                                  done();
                                  if (query_err) {
                                      return callback(new Error(query_err));
                                  }
                                  if (overall_total_result.rows) {
                                      // here we build column wise total 
                                      var overall_total = 0
                                      tab += '<tr><td><b>' + 'GRAND TOTAL' + '</b></td><td>' + '' + '</td>'
                                      _.map(overall_total_result.rows[0], function (overall_data) {
                                          var numeric_value = parseInt(overall_data)
                                          if (!isNaN(numeric_value)) {
                                              overall_total += numeric_value
                                          }
                                          tab += '<td style="padding: 8px;"><b>' + overall_data + '</b></td>'
                                      })
                                      tab += '<td style="padding: 8px;"><b>' + overall_total + '</b></td></tr>'
                                      tab += '</table>'
                                      console.log("!@!@1!@!@!@!@!@!@@!@12" + tab);

                                      // return callback(tab);

                                      return callback(null, tab);
                                  }
                              })
                          }
                      })
                  })
              }
          })
    })
}


var restaurant_pivot_generation = function (data_text, restaurant_id, restaurant_name, callback) {

    console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%called restaurant pivot");
    pg.connect(conString, function (err, client, done) {
        if (err) {
            return callback(new Error(err), null)
        }

        // Get string build value based on the date filter 
        client.query("SELECT DISTINCT \
          array_to_string(array_agg(' COALESCE(sum(case when out.short_name = ''' || out.short_name || ''' then vpa.qty end ),0) as '|| out.short_name) OVER (PARTITION BY 1), ',') AS outlet_name \
          from volume_plan_automation vpa \
          inner join outlet out on vpa.outlet_id=out.id \
          where date=$1 and vpa.outlet_id in (select distinct f.outlet_id from food_item f  inner join restaurant r on r.id=f.restaurant_id inner join outlet o on o.id=f.outlet_id where restaurant_id =$2) \
          group by session,out.short_name",
          [data_text, restaurant_id], function (query_err, result) {
              done();
              if (query_err) {
                  return callback(new Error(query_err), null)
              }
              if (result.rows.length > 0) {
                  // build query for get actual data from the table                   
                  var query_string = "select vpa.session,'(' || fi.master_id  || ')-' || fi.name as Food_item, \
                    " + result.rows[0].outlet_name + " from volume_plan_automation vpa \
                    inner join outlet out on vpa.outlet_id=out.id \
                    inner join restaurant res on res.id=vpa.restaurant_id \
                    inner join food_item fi on fi.id=vpa.food_item_id \
                    where date=$1 and res.id=$2 group by vpa.session,fi.name,fi.master_id order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                    WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                    WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                    WHEN vpa.session='LateDinner' THEN 6 END"

                  console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$" + query_string);
                  //var query_string = 'select vpa.session,fi.master_id || '-' || fi.name as Food_item, \
                  //                    ' + result.rows[0].outlet_name + " from volume_plan_automation vpa \
                  //                    inner join outlet out on vpa.outlet_id=out.id \
                  //                    inner join restaurant res on res.id=vpa.restaurant_id \
                  //                    inner join food_item fi on fi.id=vpa.food_item_id \
                  //                    where date=$1 and res.id=$2 group by vpa.session,fi.name,fi.master_id order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                  //                    WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                  //                    WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                  //                    WHEN vpa.session='LateDinner' THEN 6 END"



                  client.query(query_string, [data_text, restaurant_id], function (query_err, final_result) {
                      if (query_err) {
                          return callback(new Error(query_err), null)
                      }

                      // build query for get session wise total from the table                  
                      var session_total_query = 'select vpa.session,\
                        ' + result.rows[0].outlet_name + " from volume_plan_automation vpa \
                        inner join outlet out on vpa.outlet_id=out.id \
                        inner join restaurant res on res.id=vpa.restaurant_id \
                        inner join food_item fi on fi.id=vpa.food_item_id \
                        where date= $1 and res.id=$2 group by vpa.session, CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                        WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                        WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                        WHEN vpa.session='LateDinner' THEN 6 END"

                      client.query(session_total_query, [data_text, restaurant_id], function (query_err, session_total_result) {
                          if (query_err) {
                              return callback(new Error(query_err), null)
                          }
                          //done();

                          if (!final_result.rows) {
                              return callback(new Error('No data found in volume_plan_automation'), null)
                          } else {
                              // Main html table build string variable
                              var tab = '<table id="tbl_pivot" class="table table-hover" data-pivot="Restarant_Details">'
                              // To verify if the headers already feeded into the tab 
                              var is_already_done = false
                              // To verify the content data's from the same session or from different session
                              var previous_session = ''
                              // To remaind session count value
                              var session_remainder = 0
                              // loop through the content_data 
                              _.map(final_result.rows, function (item) {
                                  var row_total = 0
                                  // If its first time here build html headers <thead> tags
                                  if (!is_already_done) {

                                      tab += '<tr><td>Restaurant Name</td>';
                                      tab += '<td>' + restaurant_name + '</td></tr>';
                                      //  tab += '<thead>'
                                      tab += '<tr style="background-color: #43b02a;color: #ffffff;font-weight: bold;text-align:center;">'
                                      var data_keys = Object.keys(item)
                                      _.map(data_keys, function (table_head) {
                                          tab += '<th>' + table_head + '</th>'
                                      })
                                      tab += '<th>Grand Total</th></tr>'
                                      is_already_done = true
                                  }

                                  tab += '<tr>'
                                  // If session is same, here empty the session value in object
                                  if (previous_session == '' || previous_session != item.session) {
                                      previous_session = item.session
                                  } else {
                                      previous_session = item.session
                                      item.session = ''
                                  }

                                  // if session key has value in the object 
                                  // here we calculate the session wise total
                                  if (item.session != '') {
                                      tab += '<td><b>' + item.session + '</b></td>'
                                      _.map(session_total_result.rows[session_remainder], function (session_data) {

                                          var numeric_value = parseInt(session_data)

                                          //if ((!isNaN(numeric_value)) && (!(session_data.indexof('-') > 0)))
                                          //{

                                          if (!isNaN(numeric_value)) {
                                              row_total += numeric_value
                                              tab += '<td> <b>' + numeric_value + '</b></td>'
                                          } else {
                                              tab += '<td> <b>' + '' + '</b></td>'
                                          }
                                      })
                                      session_remainder += 1
                                      tab += '<td><b>' + row_total + '</b></td></tr>'
                                      item.session = ''
                                      row_total = 0
                                  }

                                  // for each iteration here we build the table contents                             
                                  _.map(item, function (content_data) {
                                      var numeric_value = parseInt(content_data)
                                      if (!isNaN(numeric_value)) {
                                          row_total += numeric_value
                                      }
                                      tab += '<td>' + content_data + '</td>'
                                  })
                                  tab += '<td>' + row_total + '</td></tr>'
                                  row_total = 0
                              })

                              // here build query string to get overall  total column wise from the table
                              var overall_total_query = 'select \
                            ' + result.rows[0].outlet_name + '  from volume_plan_automation vpa \
                            inner join outlet out on vpa.outlet_id=out.id \
                            inner join restaurant res on res.id=vpa.restaurant_id \
                            inner join food_item fi on fi.id=vpa.food_item_id \
                            where date=$1 and res.id=$2'

                              client.query(overall_total_query, [data_text, restaurant_id], function (query_err, overall_total_result) {
                                  done();
                                  if (query_err) {
                                      return callback(new Error(query_err), null)
                                  }
                                  if (overall_total_result.rows) {
                                      var overall_total = 0
                                      tab += '<tr><td><b>' + 'GRAND TOTAL' + '</b></td><td>' + '' + '</td>'
                                      // here we build column wise total 
                                      _.map(overall_total_result.rows[0], function (overall_data) {
                                          var numeric_value = parseInt(overall_data)
                                          if (!isNaN(numeric_value)) {
                                              overall_total += numeric_value
                                          }
                                          tab += '<td><b>' + overall_data + '</b></td>'
                                      })
                                      tab += '<td><b>' + overall_total + '</b></td></tr>'
                                      tab += '</table>'
                                      return callback(null, tab)
                                  }
                              })
                          }
                      })
                  })
              }
          })
    })
}

var emergency_po_mail = function (data, outlet_id, restaurant_id, target_time, callback) {
    pg.connect(conString, function (err, client, done) {
        if (err) {
            return callback(new Error(query_err), null);
        }

        client.query('select name from menu_bands where start_time<=$1 and end_time>=$1 and outlet_id=$2',
            [target_time, outlet_id], function (query_err, session_result) {
                done();
                if (query_err) {
                    console.log(" Query 1 error")
                    return callback(new Error(query_err), null);
                }
                if (session_result) {
                    var food_item_ids = _.pluck(data, 'food_item_id');
                    var query = 'select master_id,name from food_item where id in (' + food_item_ids + ') ';
                    console.log("********************************** Query" + query);
                    client.query(query,
                    [], function (query_err, data_result) {
                        done();
                        if (query_err) {
                            console.log(" Query 2 error")
                            return callback(new Error(query_err), null);
                        }
                        if (data_result) {
                            var condent_main = '<table > <tr style="background-color:#43b02a;color:#ffffff;font-weight:bold;text-align:center">  <th>session</th><th>Master ID</th><th>Item Name</th><th>Total</th> </tr>';
                            var grand_total = 0;
                            var session_remainder = true;
                            for (var i = 0; i < data_result.rows.length; i++) {

                                if (session_remainder) {
                                    condent_main += '<tr><td>' + session_result.rows[0].name + '</td>';
                                    session_remainder = false;
                                } else { condent_main += '<tr><td></td>'; }

                                _.map(data_result.rows[i], function (content_data) {
                                    condent_main += '<td style="padding: 8px;">' + content_data + '</td>'
                                })
                                condent_main += '<td>' + data[i].qty + '</td></tr>';
                                grand_total += data[i].qty;
                            }
                            condent_main += '<tr><b><td>Grand Total</td><td> </td> <td></td><td>' + grand_total + '</td></b></tr></table>';
                            console.log("Additional PO mail" + condent_main);

                            client.query('select sender_email,res.name from restaurant_config rcon \
                                            inner join restaurant res on res.id=rcon.restaurant_id \
                                            where rcon.restaurant_id=$1',
                                [restaurant_id], function (query_err, mail_id_result) {
                                    done();
                                    if (query_err) {
                                        console.log(" Query 3 error")
                                        return callback(new Error(query_err), null);
                                    }
                                    if (mail_id_result) {
                                        console.log("************************* send_resturant_mail called");

                                        get_city_for_restaurant(restaurant_id, function (err, city_response) {
                                            if (err) {
                                                console.log("*************************** get_city_for_restaurant err In emergency_po_mail:" + err);
                                                return
                                            }
                                            var date_hr_po = moment(target_time).format('LL ') + moment().format('LTS');
                                            var mailOptions = {
                                                from: 'no-reply@atchayam.in', // sender address
                                                to: mail_id_result.rows[0].sender_email + ',' + process.env.SEND_PLANS_ADDRESS, // list of receivers
                                                subject: 'Additional PO for ' + mail_id_result.rows[0].name + ' ' + date_hr_po + '-' + city_response, // Subject line
                                                text: condent_main, // plaintext body
                                                html: condent_main
                                            };

                                            transporter.sendMail(mailOptions, function (error, info) {
                                                if (error) {
                                                    console.log(" sendMail error")
                                                    return callback(new Error(error), null);
                                                }
                                                console.log('Message sent: ' + info.response);
                                            });
                                            return callback(null, 'success');

                                        });


                                    }
                                })
                        }
                    })
                }
            })
    })
}


var get_city_for_restaurant = function (restaurant_id, callback) {
    console.log('****************************** get_city_for_restaurant called')
    pg.connect(conString, function (err, client, done) {
        client.query('select distinct  c.name as city  from food_item f \
inner join restaurant r on r.id=f.restaurant_id \
inner join outlet o on o.id=f.outlet_id \
inner join city c on c.short_name=o.city \
where f.restaurant_id=$1 ', [restaurant_id],
            function (query_err, res_city) {
                done();
                if (query_err) {
                    return callback(new Error(query_err));
                }
                if (res_city.rows.length > 0) {
                    return callback(null, res_city.rows[0].city)
                } else {
                    return callback(new Error('No data found'))
                }
            });
    });
}

//var restaurant_pivot_generation = function (data_text, city_text, restaurant_id, callback) {

//    pg.connect(conString, function (err, client, done) {
//        if (err) {
//            return callback(new Error(err), null)
//        }

//        // Get string build value based on the date filter 
//        client.query("SELECT DISTINCT \
//          array_to_string(array_agg(' COALESCE(sum(case when out.short_name = ''' || out.short_name || ''' then vpa.qty end ),0) as '|| out.short_name) OVER (PARTITION BY 1), ',') AS outlet_name \
//          from volume_plan_automation vpa \
//          inner join outlet out on vpa.outlet_id=out.id \
//          where date=$1 and city_id=$2 \
//          group by session,out.short_name",
//          [data_text, city_text], function (query_err, result) {
//              done();
//              if (query_err) {
//                  return callback(new Error(query_err), null)
//              }
//              if (result.rows.length > 0) {
//                  // build query for get actual data from the table                   
//                  var query_string = 'select vpa.session,fi.name as Food_item, \
//                    ' + result.rows[0].outlet_name + " from volume_plan_automation vpa \
//                    inner join outlet out on vpa.outlet_id=out.id \
//                    inner join restaurant res on res.id=vpa.restaurant_id \
//                    inner join food_item fi on fi.id=vpa.food_item_id \
//                    where date=$1 and res.id=$2 and city_id=$3 group by vpa.session,fi.name order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
//                    WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
//                    WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
//                    WHEN vpa.session='LateDinner' THEN 6 END"

//                  client.query(query_string, [data_text, restaurant_id, city_text], function (query_err, final_result) {
//                      done();
//                      if (query_err) {
//                          return callback(new Error(query_err), null)
//                      }

//                      // build query for get session wise total from the table                  
//                      var session_total_query = 'select vpa.session, \
//                        ' + result.rows[0].outlet_name + " from volume_plan_automation vpa \
//                        inner join outlet out on vpa.outlet_id=out.id \
//                        inner join restaurant res on res.id=vpa.restaurant_id \
//                        inner join food_item fi on fi.id=vpa.food_item_id \
//                        where date= $1 and res.id=$2 and city_id=$3 group by vpa.session order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
//                        WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
//                        WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
//                        WHEN vpa.session='LateDinner' THEN 6 END"

//                      client.query(session_total_query, [data_text, restaurant_id, city_text], function (query_err, session_total_result) {
//                          done();
//                          if (query_err) {
//                              return callback(new Error(query_err), null)
//                          }

//                          if (!final_result.rows) {
//                              return callback(new Error('No data found in volume_plan_automation'), null)
//                          } else {
//                              // Main html table build string variable
//                              var tab = '<table id="tbl_pivot" class="table table-hover" data-pivot="Restarant_Details">'
//                              // To verify if the headers already feeded into the tab 
//                              var is_already_done = false
//                              // To verify the content data's from the same session or from different session
//                              var previous_session = ''
//                              // To remaind session count value
//                              var session_remainder = 0
//                              // loop through the content_data 
//                              _.map(final_result.rows, function (item) {
//                                  var row_total = 0
//                                  // If its first time here build html headers <thead> tags
//                                  if (!is_already_done) {
//                                      tab += '<thead><tr>'
//                                      var data_keys = Object.keys(item)
//                                      _.map(data_keys, function (table_head) {
//                                          tab += '<th>' + table_head + '</th>'
//                                      })
//                                      tab += '<th>Grand Total</th></tr></thead>'
//                                      is_already_done = true
//                                  }

//                                  tab += '<tr>'
//                                  // If session is same, here empty the session value in object
//                                  if (previous_session == '' || previous_session != item.session) {
//                                      previous_session = item.session
//                                  } else {
//                                      previous_session = item.session
//                                      item.session = ''
//                                  }

//                                  // if session key has value in the object 
//                                  // here we calculate the session wise total
//                                  if (item.session != '') {
//                                      tab += '<td><b>' + item.session + '</b></td>'
//                                      _.map(session_total_result.rows[session_remainder], function (session_data) {
//                                          var numeric_value = parseInt(session_data)
//                                          if (!isNaN(numeric_value)) {
//                                              row_total += numeric_value
//                                              tab += '<td> <b>' + numeric_value + '</b></td>'
//                                          } else {
//                                              tab += '<td> <b>' + '' + '</b></td>'
//                                          }
//                                      })
//                                      session_remainder += 1
//                                      tab += '<td><b>' + row_total + '</b></td></tr>'
//                                      item.session = ''
//                                      row_total = 0
//                                  }

//                                  // for each iteration here we build the table contents                             
//                                  _.map(item, function (content_data) {
//                                      var numeric_value = parseInt(content_data)
//                                      if (!isNaN(numeric_value)) {
//                                          row_total += numeric_value
//                                      }
//                                      tab += '<td>' + content_data + '</td>'
//                                  })
//                                  tab += '<td>' + row_total + '</td></tr>'
//                                  row_total = 0
//                              })

//                              // here build query string to get overall  total column wise from the table
//                              var overall_total_query = 'select \
//                            ' + result.rows[0].outlet_name + '  from volume_plan_automation vpa \
//                            inner join outlet out on vpa.outlet_id=out.id \
//                            inner join restaurant res on res.id=vpa.restaurant_id \
//                            inner join food_item fi on fi.id=vpa.food_item_id \
//                            where date=$1 and res.id=$2 and city_id=$3'

//                              client.query(overall_total_query, [data_text, restaurant_id, city_text], function (query_err, overall_total_result) {
//                                  done();
//                                  if (query_err) {
//                                      return callback(new Error(query_err), null)
//                                  }
//                                  if (overall_total_result.rows) {
//                                      var overall_total = 0
//                                      tab += '<td><b>' + 'GRAND TOTAL' + '</b></td><td>' + '' + '</td>'
//                                      // here we build column wise total 
//                                      _.map(overall_total_result.rows[0], function (overall_data) {
//                                          var numeric_value = parseInt(overall_data)
//                                          if (!isNaN(numeric_value)) {
//                                              overall_total += numeric_value
//                                          }
//                                          tab += '<td><b>' + overall_data + '</b></td>'
//                                      })
//                                      tab += '<td><b>' + overall_total + '</b></td></tr>'
//                                      tab += '</table>'
//                                      return callback(null, tab)
//                                  }
//                              })
//                          }
//                      })
//                  })
//              }
//          })
//    })
//}

module.exports = {
    Pivot_generation: Pivot_generation,
    restaurant_pivot_generation: restaurant_pivot_generation,
    emergency_po_mail: emergency_po_mail
};

