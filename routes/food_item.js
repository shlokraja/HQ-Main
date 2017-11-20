/*global require __dirname module console*/
'use strict';

var express = require('express');
var router = express.Router();
var pg = require('pg');
var path = require('path');
var format = require('string-format');
var debug = require('debug')('Foodbox-HQ:server');
var fs = require('fs');

format.extend(String.prototype);
var config = require('../models/config');
var conString = config.dbConn;

// Handlers for food_item related code

// Listing food items
router.get('/', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        client.query('SELECT * FROM food_item', function (query_err, result) {
            if (query_err)
            {
                handleError(client, done, res, 'error running query' + query_err);
                return;
            }

            // releasing the connection
            done();

            var context = { title: 'Foodbox', food_items: result.rows };
            res.render('list_food_items', context);
        });

    });
});


// Creating a food item
router.get('/create', function (req, res, next) {
    var restaurant_id = req.query.restaurant_id;
    res.render('create_food_item', { title: 'Foodbox', restaurant_id: restaurant_id });
});

router.post('/create', function (req, res, next) {
    // insert a row in the DB.
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        client.query('INSERT into food_item \
    (name, item_tag, restaurant_id, outlet_id, expiry_time, veg, \
      heating_required, location, cuisine, side_order, ingredients1, ingredients2, ingredients3, \
     category, packaging_cost, production_cost, purchase_price, \
     selling_price, mrp, service_tax_percent, vat_percent, foodbox_fee, restaurant_fee) \
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, \
     $15, $16, $17, $18, $19, $20, $21, $22, $23) \
    returning id', [req.body.name,
            req.body.item_tag,
            req.body.restaurant_id,
            req.body.outlet_id,
            req.body.expiry_time,
            req.body.veg,
            req.body.heating_required,
            req.body.location,
            req.body.cuisine,
            req.body.side_order,
            req.body.ingredient1,
            req.body.ingredient2,
            req.body.ingredient3,
            req.body.category,
            sanitizeInteger(req.body.packaging_cost),
            sanitizeInteger(req.body.production_cost),
            sanitizeInteger(req.body.purchase_price),
            sanitizeInteger(req.body.selling_price),
            sanitizeInteger(req.body.mrp),
            sanitizeInteger(req.body.service_tax_percent),
            sanitizeInteger(req.body.vat_percent),
            sanitizeInteger(req.body.foodbox_fee),
            sanitizeInteger(req.body.restaurant_fee)],
          function (query_error, result) {
              if (query_error)
              {
                  handleError(client, done, res, 'error running query' + query_error);
                  return;
              }
              // releasing the connection
              done();

              res.redirect('/');
          });
    });
});

// Updating a food item
router.get('/update/:id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        var food_item_id = req.params.id;

        client.query('SELECT * FROM food_item \
    WHERE id=$1', [food_item_id], function (query_err, result) {
        if (query_err)
        {
            handleError(client, done, res, 'error running query' + query_err);
            return;
        }

        // releasing the connection
        done();

        res.render('update_food_item', { title: 'Foodbox', food_item: result.rows[0] });
    });

    });
});

router.post('/update/:id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        var food_item_id = req.params.id;
        client.query('UPDATE food_item \
    SET name=$1, item_tag=$2, restaurant_id=$3, outlet_id=$4, expiry_time=$5, \
    veg=$6, heating_required=$7, side_order=$8, ingredients1=$9, ingredients2=$10, ingredients3=$11, \
    location=$12, cuisine=$13, category=$14, packaging_cost=$15, \
    production_cost=$16, purchase_price=$17, selling_price=$18, \
    mrp=$19, service_tax_percent=$20, vat_percent=$21, foodbox_fee=$22, restaurant_fee=$23 \
    WHERE id=$24', [req.body.name,
            req.body.item_tag,
            req.body.restaurant_id,
            req.body.outlet_id,
            req.body.expiry_time,
            req.body.veg,
            req.body.heating_required,
            req.body.side_order,
            req.body.ingredient1,
            req.body.ingredient2,
            req.body.ingredient3,
            req.body.location,
            req.body.cuisine,
            req.body.category,
            sanitizeInteger(req.body.packaging_cost),
            sanitizeInteger(req.body.production_cost),
            sanitizeInteger(req.body.purchase_price),
            sanitizeInteger(req.body.selling_price),
            sanitizeInteger(req.body.mrp),
            sanitizeInteger(req.body.service_tax_percent),
            sanitizeInteger(req.body.vat_percent),
            sanitizeInteger(req.body.foodbox_fee),
            sanitizeInteger(req.body.restaurant_fee),
            food_item_id],
          function (query_err, result) {
              if (query_err)
              {
                  handleError(client, done, res, 'error running query' + query_err);
                  return;
              }
              // releasing the connection
              done();

              res.redirect('/');
          });

    });
});

// This will return the image of the food item given in the url
router.get('/image/:id', function (req, res, next) {
    var food_item_id = req.params.id;
    debug("Getting food_item image for- ", food_item_id);
    // getting the filepath and sending the picture
    config.query('SELECT master_id FROM food_item \
      WHERE id=$1',
      [food_item_id],
      function (err, result) {
          if (err)
          {
              console.error(err);
              res.status(500).send(err);
              return;
          }
          var master_id = result.rows[0].master_id;
          // getting the filepath and sending the picture
          var filePath = process.env.IMAGES_FOLDER;
          filePath = path.join(filePath, master_id.toString());
          filePath = path.join(filePath, '6.png');
          res.sendFile(filePath);
      });
});

// This will return the image of the food item given in the url
router.get('/tray_image/:id', function (req, res, next) {
    var food_item_id = req.params.id;
    debug("Getting tray image for- ", food_item_id);
    config.query('SELECT master_id FROM food_item \
      WHERE id=$1',
      [food_item_id],
      function (err, result) {
          if (err)
          {
              console.error(err);
              res.status(500).send(err);
              return;
          }
          var master_id = result.rows[0].master_id;
          // getting the filepath and sending the picture
          var filePath = process.env.IMAGES_FOLDER;
          filePath = path.join(filePath, master_id.toString());
          filePath = path.join(filePath, 'food_tray.png');
          res.sendFile(filePath);
      });
});

router.get('/packing_video', function (req, res, next) {
    // getting the filepath and sending the video
    var filePath = process.env.IMAGES_FOLDER;
    filePath = path.join(filePath, 'packing.mp4');
    res.sendFile(filePath);
});


// This returns the expiry times of food_items for a given outlet
router.get('/expiry_times/:outlet_id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        var outlet_id = req.params.outlet_id;

        client.query('SELECT id,expiry_time FROM food_item \
    WHERE outlet_id=$1', [outlet_id], function (query_err, result) {
        if (query_err)
        {
            handleError(client, done, res, 'error running query' + query_err);
            return;
        }

        // releasing the connection
        done();

        res.send(result.rows);
    });

    });
});

router.get('/item_name/:item_id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        var food_item_id = req.params.item_id;

        client.query('SELECT name FROM food_item \
    WHERE id=$1',
          [food_item_id],
          function (query_err, result) {
              if (query_err)
              {
                  handleError(client, done, res, 'error running query' + query_err);
                  return;
              }

              // releasing the connection
              done();

              res.send(result.rows[0]);
          });
    });
});

// Return the enum of non_food_types to show in the drop down
router.get('/issue_enum', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {
        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        //client.query('SELECT enum_range(NULL::po_final_status)',
		 client.query('SELECT enum_range(\'spoiled\'::po_final_status, \'packing\')',
              function (err, result) {
                  if (err)
                  {
                      handleError(client, done, res, 'error running query' + err);
                      return;
                  }
                  done();
                  res.send(result.rows[0].enum_range);
              });
    });
});

// This returns the expiry times of food_items for a given outlet
router.get('/veg_nonveg/:outlet_id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        var outlet_id = req.params.outlet_id;

        client.query('SELECT id,veg,master_id FROM food_item \
    WHERE outlet_id=$1',
          [outlet_id],
          function (query_err, result) {
              if (query_err)
              {
                  handleError(client, done, res, 'error running query' + query_err);
                  return;
              }

              // releasing the connection
              done();

              res.send(result.rows);
          });
    });
});

// This returns the price details and the veg/non-veg flag of food_items
// for a given outlet. More attributes can be added later
router.get('/price_info/:outlet_id', function (req, res, next) {
    pg.connect(conString, function (err, client, done) {

        if (err)
        {
            handleError(client, done, res, 'error fetching client from pool' + err);
            return;
        }
        var outlet_id = req.params.outlet_id;

// var food_item_query='SELECT f.id, f.name, f.item_tag, f.veg, f.location, f.side_order, f.master_id, \
//       f.mrp, f.service_tax_percent, f.vat_percent, f.heating_required, f.heating_reduction, f.condiment_slot, o.abatement_percent, \
//       r.id as r_id, r.name as r_name, r.address as r_address, r.tin_no as r_tin_no, r.st_no as r_st_no, r.pan_no as r_pan_no, \
//        b.discount_percent as discount_percent , \
//        (select r.id from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_id, \
//        (select r.name from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_name, \
//        (select r.address from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_address, \
//        (select r.tin_no from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_tin_no, \
//        (select id from food_item where id=b.bundle_item_id) b_id, \
//        (select name from food_item where id=b.bundle_item_id) b_name, \
//        (select mrp from food_item where id=b.bundle_item_id) b_mrp, \
//        (select service_tax_percent from food_item where id=b.bundle_item_id) b_service_tax_percent, \
//        (select abatement_percent from food_item f, outlet o where o.id=f.outlet_id and f.id=b.bundle_item_id) b_abatement_percent, \
//        (select vat_percent from food_item where id=b.bundle_item_id) b_vat_percent \
//     FROM food_item f \
//     LEFT OUTER JOIN bundles b on(f.id=b.food_item_id), \
//     restaurant r, outlet o WHERE r.id=f.restaurant_id AND \
//     o.id=f.outlet_id AND \
//     outlet_id=$1';


var food_item_query="SELECT  f.id, f.name, f.item_tag, f.veg, f.location, f.side_order, f.master_id, \
                        f.mrp, f.cgst_percent,f.sgst_percent,service_tax_percent, f.vat_percent, f.heating_required, f.heating_reduction, f.condiment_slot, o.abatement_percent, \
                        (case when ispublicsectorprioraugust and rr.id is not null  then rr.id else   r.id end ) as r_id,\
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.name else   r.name end ) as r_name,\
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.address else   r.address end ) as r_address,\
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.gstin_no else   r.gstin_no end ) as r_tin_no, \
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.st_no else   r.st_no end ) as r_st_no, \
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.pan_no else   r.pan_no end )as r_pan_no,\
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.entity_name else   r.entity_name end )as r_entity, \
                        f.cgst_percent as r_cgst_percent, \
                        f.sgst_percent as r_sgst_percent, \
                        (case when ispublicsectorprioraugust and rc.restaurant_id is not null then rcc.sender_email else   rc.sender_email end )as r_sender_email, \
                        b.discount_percent as discount_percent , \
                        (select r.id from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_id, \
                        (select r.name from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_name, \
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.cgst_percent else   r.cgst_percent end )as b_r_cgst_percent, \
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.sgst_percent else   r.sgst_percent end )as b_r_sgst_percent,\
                        (case when ispublicsectorprioraugust and rr.id is not null then rr.entity_name else   r.entity_name end )as r_entity, \
                        (select r.address from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_address, \
                        (select r.gstin_no from restaurant r, food_item f where r.id=f.restaurant_id and f.id=b.bundle_item_id) b_r_tin_no, \
                        (select id from food_item where id=b.bundle_item_id) b_id, \
                        (select name from food_item where id=b.bundle_item_id) b_name,\
                        (select mrp from food_item where id=b.bundle_item_id) b_mrp, \
                        (select service_tax_percent from food_item where id=b.bundle_item_id) b_service_tax_percent, \
                        (select abatement_percent from food_item f, outlet o where o.id=f.outlet_id and f.id=b.bundle_item_id) b_abatement_percent,\
                        (select vat_percent from food_item where id=b.bundle_item_id) b_vat_percent \
                    FROM food_item f \
                    LEFT OUTER JOIN bundles b on(f.id=b.food_item_id) \
                    inner join restaurant r on r.id=f.restaurant_id \
                    inner join restaurant_config rc on r.id = rc.restaurant_id \
                    inner join  outlet o on  o.id=f.outlet_id \
                    left join restaurant rr on rr.id=o.public_restaurant_id \
                    left join restaurant_config rcc on rcc.restaurant_id=o.public_restaurant_id \
                    WHERE  f.active=true and  outlet_id=$1";

               
        client.query(food_item_query, [outlet_id], function (query_err, result) {
        if (query_err)
        {
            handleError(client, done, res, 'error running query' + query_err);
            return;
        }

        // releasing the connection
        done();

        res.send(result.rows);
    });

    });
});


// Some utility functions 
var handleError = function (client, done, res, msg) {
    done(client);
    console.error(msg);
    res.status(500).send(msg);
};

var sanitizeInteger = function (str) {
    if (!str)
    {
        return null;
    }
    return str;
};

module.exports = router;
