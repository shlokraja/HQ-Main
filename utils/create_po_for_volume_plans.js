var pg = require('pg');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var request = require('request');
var moment = require('moment');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;


function check_po_for_volume_plans(condition_string,restaurant_id)
{
    console.error('***************************check_po_for_volume_plans called');
    pg.connect(conString, function (err, client, done)
    {
        client.query('select id, vp_avail_date,mail_date,po_date,updation_date,updation_mail \
            from volume_plan_automation_master where vp_avail_date='+condition_string+' and restaurant_id ='+ restaurant_id +'',
          function (query_err, result)
          {
              if (query_err)
              {
                  console.error('error running query' + query_err, null);
                  return;
              }
              done();

              if (result.rows.length <= 0)
              {
                  console.error('*************************** no date for next day in volume plan automation');
                  return;
              }

              if (result.rows[0].mail_date && !result.rows[0].po_date)
              {
                  console.error('***************************inside result.rows[0].mail_date && !result.rows[0].po_date condtion PO_CREATION');

                  client.query('select vp_cutoff_time,po_creation_cutoff_time,cuisine_cutoff_time \
                            from application_configuration limit 1',
                         function (query_err, app_result)
                         {
                             done();
                             if (query_err)
                             {
                                 console.log("***************************updation_mail  updation error" + query_err);
                                 return;
                             }
                             if (app_result.rows.length <= 0)
                             {
                                 console.log('***********application_configuration has no data');
                                 return;
                             }
                             if (moment().format('HHmm') >= app_result.rows[0].po_creation_cutoff_time)
                             {
                                 console.error('***************************inside last condtion PO_CREATION');                                
                                 create_po(condition_string, restaurant_id);
                                 update_vp_master(result.rows[0].id);

                             }
                         });
              } else if (result.rows[0].mail_date && result.rows[0].updation_date && !result.rows[0].updation_mail)
              {                  
                  create_po(condition_string, restaurant_id);
                  update_vp_master(result.rows[0].id);
                  console.log('***********In PO result.rows[0].updation_date && !result.rows[0].updation_mail condition');

              } else if (result.rows[0].updation_date && result.rows[0].updation_mail)
              {
                  if (result.rows[0].updation_date > result.rows[0].updation_mail)
                  {                      
                      create_po(condition_string, restaurant_id);
                      update_vp_master(result.rows[0].id);
                      console.log('***********In PO result.rows[0].updation_date > result.rows[0].updation_mail');
                  }
              }

          });
    });
}


function create_po(condition_string, restaurant_id)
{
    console.log("***************************create_po()  called");
    console.log("***************************create_po() condition_string" + condition_string);
    var condition_date = condition_string != "current_date" ? moment().add(1, 'days').format('YYYY-MM-DD') : moment().format('YYYY-MM-DD');
    console.log("***************************create_po() condition_date" + condition_date);
    pg.connect(conString, function (err, client, done)
    {        
        client.query('select generate_po_for_vp_new($1,$2)', [condition_date, restaurant_id],
           function (query_err, po_result)
           {
               if (query_err)
               {
                   console.log("***************************Error while creating PO" + query_err);
                   return;
               }
               done();
           });
    });
}


function update_vp_master(vp_master_id)
{
    console.log("***************************update_vp_master()  called");
    pg.connect(conString, function (err, client, done)
    {
        client.query('update volume_plan_automation_master set po_date=now() where id=$1',
        [vp_master_id],
      function (query_err, result)
      {
          done();
          if (query_err)
          {
              console.log(client, done, res, 'error running query' + query_err);
              return;
          }
      });
    });
}

module.exports = {
    check_po_for_volume_plans: check_po_for_volume_plans
};