var pg = require('pg');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var request = require('request');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var moment = require('moment');
var _ = require('underscore');
var create_po_for_volume_plans = require('./create_po_for_volume_plans');
format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;
var volume_planning_helper = require('../routes/volume_planning _helper');

var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

var today = moment().format('YYYY-MM-DD');
var current_time = moment().format('HH:mm:ss');

function check_volume_plan_mail() {
    console.log("Calling Check_volume_plan_mail");
    pg.connect(conString, function (err, client, done) {
        client.query('select restaurant_id, vp_avail_date,mail_date,po_date,updation_date,updation_mail \
            from volume_plan_automation_master where vp_avail_date=current_date+1 or updation_date > updation_mail',
            //client.query('select restaurant_id, vp_avail_date,mail_date,po_date,updation_date,updation_mail \
            //    from volume_master where vp_avail_date=current_date+1 or updation_date > updation_mail',
            function (query_err, result) {
                if (query_err) {
                    console.error('error running query' + query_err, null);
                    return;
                }
                done();
                // var vp_avail_dates = [];
                //if (result.rows.length <= 0)
                //  {
                //    insert_into_vp();
                //  }
                // console.log("Out of get date"+ result.rows);

                result.rows.map(function (item) {
                    console.log("Inside results of select query");

                    var vp_avail_date = item.vp_avail_date;
                    var restaurant_id = item.restaurant_id;

                    if (vp_avail_date == undefined || vp_avail_date == 'undefined' || vp_avail_date == null) {
                        console.log('***********vp_avail_date is empty');
                        return;
                    }

                    var condition_string = moment(vp_avail_date).format('YYYYMMDD') <= moment().format('YYYYMMDD') ? 'current_date' : 'current_date+1';
                    console.log("############################################", condition_string);
                    create_po_for_volume_plans.check_po_for_volume_plans(condition_string, restaurant_id);
                    console.log("############################################After calling check_po_for_volume_plans");
                    console.log('***********vp_avail_date in check_volume_plan_mail()' + vp_avail_date);
                    console.log('***********vp_avail_date moment result check_volume_plan_mail()' + moment(vp_avail_date).format('YYYYMMDD'));
                    console.log('***********vp_avail_date in check_volume_plan_mail()' + JSON.stringify(item));

                    client.query('select vp_cutoff_time,po_creation_cutoff_time,cuisine_cutoff_time \
                            from application_configuration limit 1',
                        function (query_err, app_result) {
                            done();
                            if (query_err) {
                                console.log(client, done, res, 'error running query' + query_err);
                                return;
                            }
                            if (app_result.rows.length <= 0) {
                                console.log('***********application_configuration has no data');
                                return;
                            }

                            //  var condition_string = moment(moment.utc(vp_avail_date).format('YYYYMMDD')).isSameOrBefore(moment().format('YYYYMMDD')) ? 'current_date' : 'current_date+1';

                            console.log('***********check_volume_plan_mail() inside vp_avail_date condition');
                            console.log('***********check_volume_plan_mail() condition_string', condition_string);
                            if (item.mail_date) {
                                console.log('***********check_volume_plan_mail() inside item.mail_date true condition');
                                var is_mail_sent = false;
                                if (item.updation_date && !item.updation_mail) {
                                    send_mail("Update menu plans", condition_string, vp_avail_date, restaurant_id);
                                    is_mail_sent = true;
                                    console.log('***********item.updation_date && !item.updation_mail condition');

                                } else if (item.updation_date && item.updation_mail) {
                                    if (item.updation_date > item.updation_mail) {
                                        send_mail("Update menu plans", condition_string, vp_avail_date, restaurant_id);
                                        is_mail_sent = true;
                                        console.log('***********item.updation_date > item.updation_mail');
                                    }
                                }
                                if (is_mail_sent) {
                                    console.log("Inside mail is_mail_sent");
                                    client.query('UPDATE volume_plan_automation_master set updation_mail=now() \
                                          where restaurant_id='+ restaurant_id + ' and vp_avail_date=' + condition_string + ' ',
                                        function (query_err, result) {
                                            console.log("***************************updation_mail updated:- " + JSON.stringify(result));
                                            done();
                                            if (query_err) {
                                                console.log("***************************updation_mail  updation error" + query_err);
                                                return;
                                            }
                                        });
                                }
                            } else {
                                console.log('***********check_volume_plan_mail() inside item.mail_date else condition');

                                if (moment().format('HHmm') >= app_result.rows[0].vp_cutoff_time) {
                                    console.log('***********check_volume_plan_mail() send mail called');
                                    client.query('UPDATE volume_plan_automation_master set updation_mail=now() \
                                          where restaurant_id='+ restaurant_id + ' and vp_avail_date=' + condition_string + ' ',
                                        function (query_err, result) {
                                            console.log("***************************updation_mail updated:- " + JSON.stringify(result));
                                            done();
                                            if (query_err) {
                                                console.log("***************************updation_mail  updation error" + query_err);
                                                return;
                                            }
                                        });



                                    //send_pivot_mail(vp_avail_date,restaurant_id);

                                    send_mail('menu plans', condition_string, vp_avail_date, restaurant_id);
                                }
                            }
                        });

                });

            });

    });
}

function send_pivot_mail(date_selected, restaurant_id, subject, city_response,condition_string) {
    console.log("send_pivot_mail");
    console.log("RRRRRRRRRRRRRRRRRRRRRRRRRRR" + restaurant_id);
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('error fetching client from pool' + err)
            return
        }


        client.query('select r.name as resname,rc.sender_email as senderemail from restaurant  r join restaurant_config rc on r.id = rc.restaurant_id where id =' + restaurant_id,
            function (query_err, restaurant_name_result) {
                if (query_err) {
                    console.log('error running query in taking restaurant' + query_err)
                    return
                }

                done();
                console.log("Inside restauranr pivot select query");
                if (restaurant_name_result) {
                    console.log("Inside restauranr pivot select query data available")
                    if (restaurant_name_result.rows) {

                        var rest_name = restaurant_name_result.rows[0].resname;
                        var senderEmail = restaurant_name_result.rows[0].senderemail;
                        console.log("calling restaurant pivot in check_volume_plan_mail.js")
                        volume_planning_helper.restaurant_pivot_generation(date_selected, restaurant_id, rest_name, function (err, response) {

                            if (err) {
                                console.log('Error in sending mail inside restaurant_pivot_generation  inside check_volume_plan_mail.js :' + err);
                                return;
                            }
                            var date_hr = moment(date_selected).format('LL ') + moment().format('LTS');
                            console.log("************************* send_pivot_mail called");
                            var mailOptions = {
                                from: 'no-reply@atchayam.in', // sender address                                
                                to: senderEmail,
                                cc: process.env.SEND_PLANS_ADDRESS,
                                subject: subject + 'Volume plan pivot for ' + rest_name + ' ' + date_hr + ' - ' + city_response,
                                text: response, // plaintext body
                                html: response
                            };
			    
			    //sleep(3000);
                            transporter.sendMail(mailOptions, function (error, info) {
                                if (error) {                                    
                                    return console.log(error);
                                }
                                console.log('Message sent: ' + info.response);
                                client.query('UPDATE volume_plan_automation_master set mail_date=now(),updation_mail = now() \
                                where restaurant_id= '+ restaurant_id + ' and vp_avail_date=' + condition_string + '',
                                      function (query_err, result) {
                                          console.log("***************************updated:- " + JSON.stringify(result));
                                          done();
                                          if (query_err) {
                                              console.log("*************************** updation error" + query_err);
                                              return;
                                          }
                                      });
                            });
                        });
                    } else {
                        console.log("no restaurants available in table");
                    }
                    console.log('Query executes successfully');
                }

            }) // closing of restaurant query 
    })
}
function send_mail(mail_status, condition_string, vp_avail_date) {
    // console.log("send_mail");
    if (mail_status == 'menu plans') {
        //    console.log("Inside menu plans");
        debugger;
        pg.connect(conString, function (err, client, done) {
            client.query("select vpa.date as date,sum(vpa.qty) as qty,vpa.session as session ,fi.name as food_item,res.name as Restaurant,vpa.master_fooditem_id,max(session_start) as session_start,\
rc.sender_email as sender_email \
from volume_plan_automation vpa \
inner join food_item fi on fi.id=vpa.food_item_id \
inner join restaurant res on res.id=vpa.restaurant_id \
inner join outlet olet on olet.id=vpa.outlet_id \
inner join  restaurant_config rc on rc.restaurant_id=res.id \
where vpa.date= " + condition_string + " group by vpa.session,vpa.master_fooditem_id,vpa.date,fi.name,res.name,rc.sender_email order by Restaurant, CASE WHEN session='EarlyBreakFast' THEN 1 \
WHEN session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
WHEN session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
WHEN session='LateDinner' THEN 6 END,master_fooditem_id",
                function (query_err, result) {
                    if (query_err) {
                        console.log('error running query' + query_err, null);
                        return;
                    }
                    done();

                    console.log("******query executed");

                    console.log("*********vp_avail date is" + vp_avail_date);
                    var hasData = false;
                    var hq_content = 'Following ' + mail_status + ' have been sent out for ' + moment(vp_avail_date).format('DD-MM-YYYY') + '<br />';
                    hq_content += '<table border="1"><thead><tr><th>Restaurant</th><th>Session</th><th>Master Id</th><th>Item</th><th>Qty</th></tr></thead>';
                    hq_content += '<tbody>'
                    var previous_session = '';
                    var previous_restaurant = '';
                    var today = moment().format('YYYY-MM-DD');
                    var current_time = moment().format('HH:mm:ss');

                    result.rows.map(function (item) {

                        if (moment(vp_avail_date).format('YYYY-MM-DD') == today) {
                            console.log("****In today loop for HQ");

                            if (current_time >= item.start_session) {
                                hq_content += '<tr>';

                                if (previous_restaurant != item.restaurant) {
                                    hq_content += '<td>' + item.restaurant + '</td>';
                                }
                                else {
                                    hq_content += '<td>' + "" + '</td>';
                                }

                                if (previous_session != item.session) {
                                    hq_content += '<td>' + item.session + '</td>';
                                }
                                else {
                                    hq_content += '<td>' + "" + '</td>';
                                }
                                hq_content += '<td>' + item.master_fooditem_id +
                                    '</td><td>' + item.food_item +
                                    '</td><td>' + item.qty;
                                previous_session = item.session;
                                previous_restaurant = item.restaurant;
                                hasData = true;

                            }
                            else { }

                        }
                        else {

                            hq_content += '<tr>';

                            if (previous_restaurant != item.restaurant) {
                                hq_content += '<td>' + item.restaurant + '</td>';
                            }
                            else {
                                hq_content += '<td>' + "" + '</td>';
                            }

                            if (previous_session != item.session) {
                                hq_content += '<td>' + item.session + '</td>';
                            }
                            else {
                                hq_content += '<td>' + "" + '</td>';
                            }
                            hq_content += '<td>' + item.master_fooditem_id +
                                '</td><td>' + item.food_item +
                                '</td><td>' + item.qty;
                            previous_session = item.session;
                            previous_restaurant = item.restaurant;
                            hasData = true;

                        }
                    });

                    hq_content += '</tbody></table>';

                    if (!hasData) {
                        debug("No new plans saved. Returning.");
                        return;
                    }
                    //var mailOptions = {
                    //    from: 'no-reply@atchayam.in', // sender address
                    //    to: process.env.SEND_PLANS_ADDRESS, // list of receivers
                    //    subject: '' + moment(vp_avail_date).format('DD-MM-YYYY') + ' Volume Forcast', // Subject line
                    //    text: hq_content, // plaintext body
                    //    html: hq_content
                    //};
                    ////console.log("*********************Content sent from HQ- ", hq_content);

                    //transporter.sendMail(mailOptions, function (error, info) {
                    //    if (error) {
                    //        return console.log(error);
                    //    }
                    //    console.log('Message sent: ' + info.response);
                    //});

                });
        });
    }
}



function send_mail(mail_status, condition_string, vp_avail_date, restaurant_id) {
    console.log("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^Sen_mail called")
    pg.connect(conString, function (err, client, done) {
        var query = "select date,sum(qty) as qty,session,restaurant,session_start,sender_email,result_data.ingredientname,result_data.uom \
                from(select date,session,Restaurant,food_item,sender_email,session_start,result.master_id,result.ingredientname,fi_qty,qty as vpa_qty,\
        ((result.fi_qty * qty)+(((result.fi_qty * qty)*result.wastage_percentage)/100)) as qty,result.uom,result.wastage_percentage from(\
        select fi_in.master_id,fi_in.ingredient_name as ingredientname ,fi_in.uom as uom,fi_in.quantity as fi_qty,fi_in.wastage_percentage as wastage_percentage,\
        vpa.date as date,sum(vpa.qty) as qty,vpa.session as session ,fi.name as food_item,res.name as restaurant,vpa.master_fooditem_id,max(session_start) as session_start,\
        rc.sender_email as sender_email \
        from volume_plan_automation vpa \
        inner join food_item fi on fi.id=vpa.food_item_id \
        inner join restaurant res on res.id=vpa.restaurant_id \
        inner join outlet olet on olet.id=vpa.outlet_id \
        inner join  restaurant_config rc on rc.restaurant_id=res.id \
        inner join food_item_ingredient fi_in on fi_in.master_id=vpa.master_fooditem_id\
        where vpa.date= " + condition_string + " and vpa.restaurant_id=" + restaurant_id + "     group by fi_in.master_id,\
        fi_in.ingredient_name,fi_in.uom,fi_in.quantity,fi_in.wastage_percentage,vpa.session,vpa.master_fooditem_id,vpa.date,fi.name,res.name,rc.sender_email order by Restaurant,\
        CASE WHEN session='EarlyBreakFast' THEN 1 \
        WHEN session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
        WHEN session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
        WHEN session='LateDinner' THEN 6 END,master_fooditem_id) as result)as result_data\
        group by date,session,Restaurant,sender_email,session_start,result_data.ingredientname,result_data.uom\
        order by session_start";
        console.log("Sen_mail called **** " + query);
        client.query(query,
            function (query_err, result) {
                if (query_err) {
                    console.log('error running query' + query_err, null);
                    return;
                }
                done();

                if (result.rows.length <= 0) {
                    console.log("*********************Focus moved to no result function- ");

                    client.query('select sender_email,restaurant.name from restaurant_config rc \
                              inner join restaurant on rc.restaurant_id= restaurant.id where rc.restaurant_id = ' + restaurant_id + '',
                        function (query_err, result) {
                            console.log("**********************selected restaurant is:- " + JSON.stringify(result));
                            done();
                            if (query_err) {
                                console.log("**************************select mail to restaurant error" + query_err);
                                return;
                            }

                            var restaurant_email = result.rows[0].sender_email;
                            var restaurant_name = result.rows[0].name;


                            console.log("*********************deleted mail sent to HQ ");
                            console.log("*********************deleted mail sent to restaurant ");
                            return;
                        });
                }
                else {
                    console.log("*********vp_avail date is" + vp_avail_date);
                    console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$Inside else part");
                    var restaurant_data = {};
                    var hasData = false;

                    var hq_content = 'Following ' + mail_status + ' have been sent out for ' + moment(vp_avail_date).format('DD-MM-YYYY') + '<br />';
                    hq_content += '<table  border="1"><thead><tr><th>Restaurant</th><th>Session</th><th>Item</th><th>Qty</th></tr></thead>';
                    hq_content += '<tbody>'
                    var previous_session = '';
                    var previous_restaurant = '';


                    result.rows.map(function (item) {

                        if (moment(vp_avail_date).format('YYYY-MM-DD') == today) {
                            console.log("****In today loop for Restaurant");
                            console.log(current_time);
                            console.log(item.session_start);
                            if (current_time <= item.session_start) {

                                hq_content += '<tr>';

                                if (previous_restaurant != item.restaurant) {
                                    hq_content += '<td>' + item.restaurant + '</td>';
                                }
                                else {
                                    hq_content += '<td>' + "" + '</td>';
                                }

                                if (previous_session != item.session) {
                                    hq_content += '<td>' + item.session + '</td>';
                                }
                                else {
                                    hq_content += '<td>' + "" + '</td>';
                                }
                                hq_content += '<td>' + item.ingredientname +
                                    '</td><td>' + item.qty;
                                previous_session = item.session;
                                previous_restaurant = item.restaurant;
                                hasData = true;

                                console.log("loop before restaurant key");

                                var r_key = item.restaurant + ':' + item.sender_email;
                                console.log(r_key);
                                if (restaurant_data.hasOwnProperty(r_key)) {
                                    restaurant_data[r_key].push({
                                        Session: item.session,
                                        item_name: item.ingredientname,
                                        quantity: item.qty,
                                        uom: item.uom

                                    });
                                } else {
                                    restaurant_data[r_key] = [{
                                        Session: item.session,
                                        item_name: item.ingredientname,
                                        quantity: item.qty,
                                        uom: item.uom

                                    }];
                                }
                            }
                            else { }

                        }
                        else {

                            hq_content += '<tr>';

                            if (previous_restaurant != item.restaurant) {
                                hq_content += '<td>' + item.restaurant + '</td>';
                            }
                            else {
                                hq_content += '<td>' + "" + '</td>';
                            }

                            if (previous_session != item.session) {
                                hq_content += '<td>' + item.session + '</td>';
                            }
                            else {
                                hq_content += '<td>' + "" + '</td>';
                            }
                            hq_content += '<td>' + item.ingredientname +
                                '</td><td>' + item.qty;
                            previous_session = item.session;
                            previous_restaurant = item.restaurant;
                            hasData = true;
                            var r_key = item.restaurant + ':' + item.sender_email;
                            if (restaurant_data.hasOwnProperty(r_key)) {
                                restaurant_data[r_key].push({
                                    Session: item.session,
                                    item_name: item.ingredientname,
                                    quantity: item.qty,
                                    uom: item.uom

                                });
                            } else {
                                restaurant_data[r_key] = [{
                                    Session: item.session,
                                    item_name: item.ingredientname,
                                    quantity: item.qty,
                                    uom: item.uom

                                }];
                            }
                        }
                    });

                    hq_content += '</tbody></table>';


                    if (!hasData) {
                        debug("No new plans saved. Returning.");
                        return;
                    }
                    var subject_to_mail = '';
                    console.log("*********Before table formation");
                    Object.keys(restaurant_data).map(function (key) {
                        console.log("*********Inside table formation");
                        var previous_session_rest = '';
                        var total = 0;
                        var rest_content = 'Following ' + mail_status + ' have been sent out  for ' + moment(vp_avail_date).format('DD-MM-YYYY') + ' <br />';
                        //rest_content += '<table><thead><tr><th>Session</th><th>Master Id</th><th>Food Item Name</th><th>Quantity</th></tr></thead>';
                        // rest_content += '<tbody>'
                        rest_content += '<table border="1" class="table table-hover" style="border-collapse: collapse;width:450px"><tr style="background-color: #fbb713;color: #ffffff;font-weight: bold;text-align:center;"><th style="width: 100px;height: 30px;">Session</th><th style="width: 500px;height: 30px;">Ingredient Name</th><th style="width: 100px;height: 30px;">Quantity</th><th style="width: 100px;height: 30px;">UOM</th></tr>';
                        restaurant_data[key].map(function (item) {
                            rest_content += '<tr>';
                            if (previous_session_rest != item.Session) {
                                rest_content += '<td>' + item.Session + '</td>';
                            }
                            else {
                                rest_content += '<td>' + "" + '</td>';
                            }
                            var item_qty;
                            var item_UOM;
                            if (item.quantity >= 1000 && item.uom == "gms") {
                                item_qty = parseFloat(item.quantity) / 1000;
                                item_qty = item_qty.toPrecision(2);
                                item_UOM = "kg";
                            }
                            else {
                                item_qty = item.quantity;
                                item_UOM = item.uom;
                            }
                            rest_content += '<td>' + item.item_name +
                                '</td><td>' + item_qty +
                                '</td><td>' + item_UOM + '</td>'
                            rest_content += '</tr>';

                            previous_session_rest = item.Session;
                            total = total + parseInt(item.quantity);
                        });
                        //rest_content += '<tr><td>Grand Total</td><td></td><td></td><td>' + total + '</td></tr></tbody></table>';

                        var sender_email = key.split(':');

                        get_city_for_restaurant(restaurant_id, function (err, city_response) {
                            if (err) {
                                console.log("*************************** get_city_for_restaurant err" + err);
                                return
                            }
                            console.log("*************************** get_city_for_restaurant city is " + city_response);
                            console.log("***************************Message sent from Restaurant- " + sender_email[1]);
                            var date_hr = moment(vp_avail_date).format('LL ') + moment().format('LTS');
                            var subject_text = 'volume plan for ' + sender_email[0] + '-' + date_hr + '-' + city_response;

                            //if (mail_status.includes('Update')) {
                            if (mail_status.indexOf('Update') > -1) {
                                subject_text = 'Updated ' + subject_text;
                                subject_to_mail = 'Updated '
                            }
                            console.log("*********sending mail for Volume plan");
                            var mailOptions = {
                                from: 'no-reply@atchayam.in', // sender address
                                to: sender_email[1], // list of receivers
                                cc: process.env.SEND_PLANS_ADDRESS,
                                subject: subject_text, // Subject line
                                text: rest_content, // plaintext body
                                html: rest_content
                            };
			    
                            //sleep(1000);
                            transporter.sendMail(mailOptions, function (error, info) {
                                if (error) {
                                    return console.log(error);
                                }
                                console.log('Message sent: ' + info.response);
                                send_pivot_mail(vp_avail_date, restaurant_id, subject_to_mail, city_response,condition_string);
                            })
                            
                        });
                    })


                    //Then set all rows in menu_plans as sent = t
                    
                }
            });
    });
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
                    return;
                }
                if (res_city.rows.length > 0) {
                    return callback(null, res_city.rows[0].city)
                } else {
                    return callback(new Error('No data found'))
                }
            });
    });
}

function sleep(milliseconds) {
  var start = new Date().getTime();
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break;
    }
  }
}

module.exports = check_volume_plan_mail