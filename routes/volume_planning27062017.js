/*global require module*/



var express = require('express');
var pg = require('pg');
var debug = require('debug')('Foodbox-HQ:server');
var async = require('async');
var format = require('string-format');
var router = express.Router();
var path = require('path');
var config = require('../models/config');
var conString = config.dbConn;
var json2csv = require('json2csv');
var fs = require('fs');
var _ = require('underscore');
var randomstring = require('randomstring');
var Multer = require('multer');
// var Parse = require('csv-parse');
//var csv2json = require('csv2json');
var csv = require('fast-csv');
//var jquery = require('../public/js/vendor/jquery');

var moment = require('moment');
var helper = require('../routes/helper');
var app = express();
//var upload = multer({ dest: './uploads/'});


app.use(express.static('public'));
//app.use(upload);

var context_test = '';
var reportName = "Master Reference";
var template_reportName = "Template Sheet";

var volume_planning_helper = require('../routes/volume_planning _helper');

var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'no-reply@atchayam.in',
        pass: 'Atchayam123'
    }
});

router.get('/', function (req, res, next) {

    var date = req.query.date;
    var Selectedcity = req.query.city;
    console.log("Selectedcity " + Selectedcity + " date " + date)
    async.parallel({

        city: function (callback) {
            config.query('select short_name,name from city',
                [],
                function (err, result) {
                    if (err) {
                        callback('error running query' + err, null);
                        return;
                    }
                    callback(null, result.rows);
                });

        }
    },

        function (err, results) {
            if (err) {
                //handleError(client, done, res, err);
                console.log("volume_planning: " + err);
                return;
            }
            if (Selectedcity != undefined && date != undefined) {
                var context = {
                    title: '',
                    selectedDate: date,
                    Selectedcity: Selectedcity,
                    city: results.city
                };
               // console.log("Selectedcity " + Selectedcity + " date " + date + ' In Exact path')
                res.render('volume_planning', context);
            } else {
                var context = {
                    title: '',
                    city: results.city
                };
                //console.log("Selectedcity " + Selectedcity + " date " + date + ' In else path')
                res.render('volume_planning', context);
            }
        });
});

router.get('/downloadcsv', function (req, res, next) {

    var city = req.query.city;
    var date = req.query.date;

    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log(client, done, res, 'error fetching client from pool' + err);
            return;
        }



        // var fields = ['City','Session','Outlet Id','Outlet Name','Restaurant Id','Restaurant Name','Master Id','Food Item Name','Veg/Non-veg','Price'];

        client.query("select '" + date + "' as \"Date\",City as \"City\",Session as \"Session\",outlet_name as \"Outlet\",restaurant_name as \"Restaurant\",food_item_name as \"ItemName\",' ' as \"Qty\",master_id as \"MasterID\",mrp as \"Price\",Isveg as \"Veg/NonVeg\" from vue_food_items_availability_session_whole_1 where city=$1",
            [city],
            function (query_err, result) {
                done();
                if (query_err) {
                    handleError(client, done, res, 'error running query' + query_err);
                    return;
                }

                if (result.rows.length > 0) {
                    csvOut(reportName, result, res);

                    function csvOut(reportName, reportJson, res) {

                        var fields = fields;
                        var fieldNames = _.values(reportJson.fields);
                        var data = reportJson.rows;
                        data.push(reportJson);
                        json2csv({ data: data, fields: fields },
                            function (err, csvData) {
                                if (err) {
                                    handleError(res, err);
                                }

                                var rand_string = randomstring.generate(8);
                                var rand_file = '/tmp/report-' + rand_string;
                                fs.writeFile(rand_file, csvData, function (error) {
                                    if (error) {
                                        handleError(res, error);
                                    }
                                    var repo_date = moment(date).format('DD-MM-YYYY');

                                    res.attachment(reportName + repo_date + '.csv');
                                    res.sendFile(rand_file);
                                });
                            });
                    }
                } else {
                    res.status(500).send('No data for Selected city')
                }

            });
    });
});

router.get('/downloadcsv_template', function (req, res, next) {

    var date = req.query.date;
    var city = req.query.city;

    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log(client, done, res, 'error fetching client from pool' + err);
            return;
        }

        //  client.query("select '"+ date +"' as Date,city as City,'' as Session,'' as OutletName,'' as RestaurantName,'' as FoodItemName,'' as Quantity,'' as MasterId from vue_food_items_availability_session_whole where city=$1 limit 150",

        client.query("select '" + date + "' as \"Date\",city as \"City\",'' as \"Session\",'' as \"Outlet\",'' as \"Restaurant\",'' as \"ItemName\",'' as \"Quantity\",'' as \"MasterID\" from vue_food_items_availability_session_whole_1 where city=$1 limit 1000",
            [city],
            function (query_err, result) {
                done();
                if (query_err) {
                    handleError(client, done, res, 'error running query' + query_err);
                    return;
                }

                if (result.rows.length > 0) {
                    csvOut(template_reportName, result, res);
                    //  console.log(result);

                    function csvOut(reportName, reportJson, res) {

                        var fields = fields;
                        var data = reportJson.rows;
                        data.push(reportJson);
                        json2csv({ data: data, fields: fields },
                            function (err, csvData) {
                                if (err) {
                                    handleError(res, err);
                                }

                                var rand_string = randomstring.generate(8);
                                var rand_file = '/tmp/report-' + rand_string;
                                fs.writeFile(rand_file, csvData, function (error) {
                                    // if(error){
                                    //   handleError(res, error);
                                    // }
                                    var repo_date = moment(date).format('DD-MM-YYYY');

                                    console.log('template:' + reportName + date + '.csv');
                                    res.attachment(reportName + repo_date + '.csv');
                                    res.sendFile(rand_file);
                                });
                            });
                    }
                } else {
                    res.status(500).send('No data for Selected city')
                }
            });
    });

});

var remove_existing_vp = function (date, city, callback) {
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log(client, done, 'error fetching client from pool' + err);
            return;
        }

        client.query("delete from volume_plan_automation where date = $1 and city_id =$2",
            [date, city],
            function (query_err, data_exists_vpa_result) {
                done();
                if (query_err) {
                    console.log('Error in volume_plan_automation removal' + query_err);
                    return;
                }
                console.log('********************* Above data_exists_vpa_result ')
                if (data_exists_vpa_result) {
                    client.query("delete from volume_plan_automation_master where vp_avail_date::date = $1",
                        [date],
                        function (query_err, data_exists_vpam_result) {
                            done();
                            if (query_err) {
                                console.log('Error in volume_plan_automation_master removal' + query_err);
                                return;
                            }
                            console.log('********************* Above data_exists_vpam_result')
                            if (data_exists_vpam_result) {
                                return callback(null, 'Success')
                            }
                        });
                }
            });
    })
}

var create_vpa = function (date, city, file_path, can_overwrite, callback) {
    console.log("**************************** create_vpa params" + date + city + can_overwrite)
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log(client, done, 'error fetching client from pool' + err);
            return;
        }
        client.query("select count(*) as DataExistsCount from volume_plan_automation where date = $1 and city_id =$2",
            [date, city],
            function (query_err, data_exists_result) {
                done();
                if (query_err) {
                    console.log('error running query inside data exists query' + query_err);
                    return;
                }
                console.log('********************* Above data_exists_result')
                if (data_exists_result) {

                    var data_exists_record = data_exists_result.rows;
                    console.log('********************* Above data_exists_result' + data_exists_record[0].dataexistscount + ' can_overwrite' + can_overwrite);

                    if (data_exists_record[0].dataexistscount == 0 || can_overwrite != null) {

                        upload_vpa(file_path, date, city, function (err, response) {
                            if (err) {
                                return callback(err, null)
                            }
                            if (response) {
                                return callback(null, 'Success')
                            }
                        })
                    }
                    else {
                        return callback("Already Available", null)
                    }
                }
            });
    })
}

router.post('/upload', function (req, res, next) {
    var date = req.query.date;
    var city = req.query.city;
    var can_overwrite = req.query.can_overwrite
    var file_path = req.files.CsvDoc.path;
    console.log('************************** can_overwrite' + can_overwrite)
    if (can_overwrite != undefined) {
        console.log('************************** can_overwrite not undefined called')
        remove_existing_vp(date, city, function (err, response) {
            if (err) {
                console.log('Error while deleting existing VPA ' + err);
                return;
            }
            if (response) {
                create_vpa(date, city, file_path, can_overwrite, function (create_err, create_response) {
                    if (create_err) {
                        res.status(500).send(create_err);
                    }
                    if (create_response) {
                        res.send('Success')
                    }
                })
            }
        })
    } else {
       // console.log('************************** can_overwrite undefined called')
        create_vpa(date, city, file_path, null, function (create_err, create_response) {
            if (create_err) {
                res.status(500).send(create_err);
            }
            if (create_response) {
                res.send('Success')
            }
        })
    }
});

router.post('/download_ErrorFile', function (req, res, next) {
    //console.log("**************************download_ErrorFile called")
    var msg = req.body.errorDetails;
    var messageDetails = "";
    var a = msg.split("|"); // Delimiter is a string
    for (var i = 0; i < a.length; i++) {
        messageDetails += a[i] + "\r\n";
    }


    var rand_string = randomstring.generate(8);
    var rand_file = '/tmp/report-' + rand_string;
    fs.writeFile(rand_file, messageDetails, function (error) {
        if (error) {
            handleError(res, error);
        }
        res.attachment('ErrorDetails.txt');
        res.sendFile(rand_file);
    });
});

var upload_vpa = function (file_path, date, city, callback) {
    console.log("*************************** upload called");
    var output = '';
    var master_ids = '';
    var outlet_value = '';
    var session_valid = '';
    var masterid_output = '';
    var menubands_output = '';
    var jsonMasterDetails = [];
    var jsonSessionDetails = [];
    var jsonSessionExcelDetails = [];

    var newPath = "";
    //console.log("~~~~~~~~~~~" + date);
    //console.log("~~~~~~~~~~~" + city);

    //console.log(output);
    fs.readFile(file_path, function (err, data) {
        console.log("Inside read file");

        var current_time = moment().format('HH:mm:ss');
        var current_date = moment().format('YYYY-MM-DD');
        newPath = process.env.CSV_FILE_PATH + "/vpa_docs" + current_date + "_" + current_time + ".csv";

        console.log('*****************************************newPath' + newPath);
        fs.writeFile(newPath, data, function (err) {
            if (err) {
                console.log("Error in file write in particular location");
                console.log(err);
            }
        });

        var count = 1;
        var linecount = 1;
        var ErrorMessage = "";
        var IsInvalid = false;
        var masterIdCount = 2;
        //var skip_first_row = 1;
        pg.connect(conString, function (err, client, done) {
            if (err) {
                console.log(client, done, 'error fetching client from pool' + err);
                return;
            }
            client.query("select array_to_string(array_agg(distinct res.name), ',') as RestaurantName from outlet out join  food_item fi on out.id = fi.outlet_id join restaurant res on res.id = fi.restaurant_id where out.city =$1",
                [city],
                function (query_err, result) {
                    done();
                    if (query_err) {
                        console.log('error running query inside output restaurant names' + query_err);
                        return;
                    }
                    if (result) {
                        output = result.rows;
                    }

                    client.query("select array_to_string(array_agg(distinct out.short_name), ',')  as OutletShortName from outlet out join  food_item fi on out.id = fi.outlet_id join restaurant res on res.id = fi.restaurant_id where out.city = $1",
                        [city],
                        function (outlet_query_err, outlet_result) {
                            done();
                            if (outlet_query_err) {
                                console.error('error running query inside upload distict outlet name' + outlet_query_err, null);
                                return;
                            }
                            if (outlet_result) {
                                outlet_value = outlet_result.rows;
                            }

                            client.query("select array_to_string(array_agg(distinct name), ',') as menu_bands from menu_bands",
                                function (menubands_query_err, menubands_result) {
                                    done();
                                    if (menubands_query_err) {
                                        console.error('error running query inside menu ba' + menubands_query_err, null);
                                        return;
                                    }
                                    if (menubands_result) {
                                        menubands_output = menubands_result.rows;
                                    }

                                    if ((output != "") && (outlet_result != "") && (menubands_output != "")) {
                                        var stream = fs.createReadStream(newPath);

                                        csv
                                            .fromStream(stream, { headers: false })

                                            .on("data", function (data) {
                                                console.log("Data Check" + data[0] + data[1] + data[2] + data[3] + data[4] + data[5] + data[6] + data[7]);
                                                        
                                                                                             
                                                //for (excel_rows = 0; excel_rows < data.length; excel_rows++)
                                                //{                                                    
                                                //    if (data.length < 6) {
                                                //        continue;
                                                //    }
                                                //}

                                               // console.log(" check Undefined"+data[7]);
                                                var full_row_values = data[0] + data[1] + data[2] + data[3] + data[4] + data[5] + data[6] + data[7];
                                                var DataValues = data[2] + data[3] + data[4] + data[5] + data[6] + data[7];
                                                // There should be exact 7 columns in the excel sheet.
                                                console.log("checking data length is:" + data.length);
                                                if (data.length == 8) {

                                                   // console.log("data length is 6");
                                                    if ((count > 1) && (DataValues.length != 0)) {

                                                        if (data[7] != undefined) {

                                                            if (data[7].trim() != '') {
                                                                if (master_ids != '') {
                                                                    master_ids += "," + data[7];
                                                                }
                                                                else {
                                                                    master_ids += data[7];
                                                                }
                                                            }
                                                            else {
                                                                ErrorMessage += " | Master Id is empty in line " + masterIdCount;
                                                            }

                                                        }
                                                        //else {
                                                        //    ErrorMessage += " | Master Id is empty in line " + masterIdCount;
                                                        //}
                                                        masterIdCount++;
                                                    }

                                                    // Fields string should be moved into Enum 12/09/2016 TBD
                                                    if (count == 1) {
                                                        if ((data[0].toLowerCase() != "date")
                                                            || (data[1].toLowerCase() != "city")
                                                            || (data[2].toLowerCase() != "session")
                                                            || (data[3].toLowerCase() != "outlet")
                                                            || (data[4].toLowerCase() != "restaurant")
                                                            || (data[5].toLowerCase() != "itemname")
                                                            || (data[6].toLowerCase() != "quantity")
                                                            || (data[7].toLowerCase() != "masterid")) {
                                                            ErrorMessage += "| Columns order or the name of the header field is wrong";
                                                        }
                                                        count++;
                                                    }
                                                    else {                                                       
                                                        var ChangeDateFormat_Excel = moment(data[0]).format("DD-MM-YYYY");
                                                        var ChangeDateFormat_Datepicker = moment(date).format("DD-MM-YYYY");
                                                        linecount++;
                                                        if (data[0] != ChangeDateFormat_Datepicker) {
                                                            ErrorMessage += " | Date Mis-match(Use dd-mm-yyyy) in line" + linecount;
                                                        }

                                                        if (data[1] != city) {
                                                            ErrorMessage += "| City Mis-Match in line" + linecount;
                                                        }

                                                        var resnames = output[0].restaurantname;
                                                        resnames = "," + resnames + ",";
                                                        //console.log("DataValues.length"+DataValues.length);
                                                        if ((resnames.indexOf("," + data[4] + ",") != -1) || (DataValues.length == 0) || (DataValues == undefined)) {
                                                        }
                                                        else {
                                                            ErrorMessage += " | Restaurant Mis-Match in line:" + linecount;
                                                        }
                                                        var outletnames = outlet_value[0].outletshortname;
                                                        outletnames = "," + outletnames + ",";

                                                        if ((outletnames.indexOf("," + data[3] + ",") != -1) || (DataValues.length == 0) || (DataValues == undefined)) {
                                                        }
                                                        else {
                                                            ErrorMessage += " | outlet Mis-Match in line:" + linecount;
                                                        }

                                                        var menuband_names = menubands_output[0].menu_bands;
                                                        outletnames = "," + menuband_names + ",";
                                                        if ((outletnames.indexOf("," + data[2] + ",") != -1) || (DataValues.length == 0) || (DataValues == undefined)) {
                                                            //console.log("data ok session");
                                                        }
                                                        else {
                                                            ErrorMessage += " | session Mis-Match in line:" + linecount;
                                                        }

                                                        if ((data[6] == null) || (data[6] == "")) {
                                                            if ((data[2] != "") && (data[3] != "") && (data[4] != "") && (data[5] != "")) {
                                                                ErrorMessage += " | Quantity is empty in line:" + linecount;
                                                            }
                                                        }
                                                        else if (!Number(data[6])) {
                                                            ErrorMessage += " | Quantity accepts only Numbers.Error in line:" + linecount;
                                                        }
                                                        jsonMasterDetails.push({ 'name': data[4], 'outlet_short_name': data[3], 'master_id': data[7] });
                                                        jsonSessionExcelDetails.push({ 'master_id': data[7], 'outlet_short_name': data[3], 'session': data[2], 'ItemName': data[5] });
                                                    }
                                                }
                                            })
                                            .on("end", function () {
                                                console.log("done");
                                                if (master_ids.trim() != "")
                                                {
                                                
                                                var x = "select r.name,out.short_name ,Master_id from food_item food inner join outlet out on food.outlet_id = out.id \
                                                                inner join restaurant r on food.restaurant_id =  r.id  \
                                                                where master_id in ("+ master_ids + ")";
                                                //console.log("master_ids :" + x);

                                                client.query("select r.name,out.short_name ,Master_id from food_item food inner join outlet out on food.outlet_id = out.id \
                                                                     inner join restaurant r on food.restaurant_id =  r.id  \
                                                                     where master_id in ("+ master_ids + ")",
                                                    function (masterid_query_err, masterid_result) {
                                                        done();
                                                        if (masterid_query_err) {
                                                            console.error('error running query inside upload distict masterid name' + masterid_query_err, null);
                                                            return;
                                                        }
                                                        if (masterid_result) {
                                                            masterid_output = masterid_result.rows;
                                                            var rownumber = 1;
                                                            var i = 0;
                                                            var j = 0;
                                                            for (i = 0; i < jsonMasterDetails.length; i++) {
                                                                if ((jsonMasterDetails[i].master_id != undefined) && (jsonMasterDetails[i].name.length != 0) && (jsonMasterDetails[i].master_id.length != 0) && (jsonMasterDetails[i].outlet_short_name.length != 0)) {
                                                                    var res_name = jsonMasterDetails[i].name;
                                                                    var shortname = jsonMasterDetails[i].outlet_short_name;
                                                                    var master = jsonMasterDetails[i].master_id;
                                                                    var exists = false;
                                                                    rownumber++;
                                                                    for (j = 0; j < masterid_output.length; j++) {
                                                                        if (masterid_output[j].name == res_name
                                                                            && masterid_output[j].short_name == shortname
                                                                            && masterid_output[j].master_id == master
                                                                        ) {
                                                                            exists = true;
                                                                            break;
                                                                        }
                                                                    }
                                                                    if (!exists) {
                                                                        ErrorMessage += " | Error in row number: " + rownumber + ",Master id is not valid for restaurant name:" + res_name + " ,outlet name:" + shortname
                                                                    }
                                                                }
                                                            }

                                                            client.query("select distinct f.master_id,rr.name, ol.short_name,r.session,f.name, \
                                                                                        case when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='sun' then o.sun \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='mon' then o.mon \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='tue' then o.tue \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='wed' then o.wed \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='thu' then o.thu \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='fri' then o.fri \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='sat' then o.sat \
                                                                                        end as outlet_valid \
                                                                                        , \
                                                                                        case when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='sun' then r.sun \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='mon' then r.mon \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='tue' then r.tue \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='wed' then r.wed \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='thu' then r.thu \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='fri' then r.fri \
                                                                                        when substring( to_char(to_date($1,'yy-mm-dd'), 'day'),1,3)='sat' then r.sat \
                                                                                        end  as  restarant_valid \
                                                                                        from food_item f \
                                                                                        inner join outlet_sessions o on o.outlet_id=f.outlet_id inner join restaurant_sessions r on \
                                                                                        r.restaurant_id=f.restaurant_id inner join restaurant rr on rr.id=f.restaurant_id  \
                                                                                        inner join outlet ol on ol.id=f.outlet_id where ol.city = $2 and master_id in ("+ master_ids + ")",
                                                                [date, city],
                                                                function (sessionValid_query_err, sessionValid_result) {
                                                                    done();
                                                                    if (sessionValid_query_err) {
                                                                        console.log('error running query in checking session outlet running or not' + query_err);
                                                                        return;
                                                                    }

                                                                    if (sessionValid_result) {
                                                                        session_valid = sessionValid_result.rows;
                                                                        jsonSessionDetails.push(sessionValid_result.rows);
                                                                        var rowno = 1;
                                                                        var x = 0;
                                                                        var y = 0;

                                                                        for (x = 0; x < jsonSessionExcelDetails.length; x++) {
                                                                            var masterId = jsonSessionExcelDetails[x].master_id;
                                                                            var outletname = jsonSessionExcelDetails[x].outlet_short_name;
                                                                            var res_session = jsonSessionExcelDetails[x].session;
                                                                            var itemname = jsonSessionExcelDetails[x].ItemName;
                                                                            rowno++;
                                                                            for (y = 0; y < session_valid.length; y++) {
                                                                                if (session_valid[y].master_id == masterId
                                                                                    && session_valid[y].short_name.toUpperCase() == outletname.toUpperCase()
                                                                                    && session_valid[y].session.toUpperCase() == res_session.toUpperCase()
                                                                                ) {
																				
																				if(session_valid[y].name != itemname) {
																					ErrorMessage += "| Error in line:" + rowno + "Item name mismatched for the master id " + masterId;
																				}
                                                                                    if ((session_valid[y].outlet_valid == true) && (session_valid[y].restarant_valid == true)) {
                                                                                        //console.log("ok");
                                                                                        break;
                                                                                    }
                                                                                    else if ((session_valid[y].outlet_valid == false) && (session_valid[y].restarant_valid == true)) {
                                                                                        ErrorMessage += "| Error in line:" + rowno + "Outlet is not running for the day";
                                                                                        break;
                                                                                    }
                                                                                    else if ((session_valid[y].outlet_valid == true) && (session_valid[y].restarant_valid == false)) {

                                                                                        ErrorMessage += "| Error in line:" + rowno + "Restaurant is not running for the day";
                                                                                        break;
                                                                                    }
                                                                                    else if ((session_valid[y].outlet_valid == false) && (session_valid[y].restarant_valid == false)) {
                                                                                        ErrorMessage += "| Error in line:" + rowno + "Both Restaurant and Outlet is not running for the day";
                                                                                        break;
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                         console.log("Volume Plan Error Message:" + ErrorMessage);
                                                                        if (ErrorMessage == "") {
                                                                            console.log("Inside ErrorMessage Blank", ErrorMessage);
                                                                            var valid_file_stream = fs.createReadStream(newPath);
                                                                            console.log("****************************************valid_file_stream");

                                                                            client.query('delete from volume_plan_automation_temp where date=$1 and city_id=$2',
                                                                                [date, city],
                                                                                function (query_err, result) {
                                                                                    done();
                                                                                    if (query_err) {
                                                                                        console.log('error running query inside delete query :' + query_err)
                                                                                        return
                                                                                    }

                                                                                    var csvStream = csv({ headers: true, ignoreEmpty: true })
                                                                                        .on('data', function (data) {
                                                                                            var date_Excel = data.Date
                                                                                            var from = date_Excel.split("-");
                                                                                            var date_conversion = from[2] + "-" + from[1] + "-" + from[0];
                                                                                            if ((data.Restaurant != "") && (data.Restaurant != null) && (data.Outlet != "") && (data.Outlet != null)) {
                                                                                                client.query('select save_volumeplan($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                                                                                                    [data.Outlet, data.Restaurant, data.ItemName, date_conversion,
                                                                                                        data.Quantity, data.Session, data.MasterID, data.City, false],
                                                                                                    function (query_err, result) {
                                                                                                        done();
                                                                                                        if (query_err) {
                                                                                                            console.log('error running query inside csv stream' + query_err)
                                                                                                            return
                                                                                                        }
                                                                                                        if (result) {
                                                                                                            // console.log('query executes successfuly' + JSON.stringify(result.rows));
                                                                                                        }

                                                                                                    })
                                                                                            }
                                                                                        })
                                                                                        .on('end', function () {
                                                                                            return callback(null, 'Success')
                                                                                        })
                                                                                    //File stream piped into csv object to read the data in the file
                                                                                    valid_file_stream.pipe(csvStream)
                                                                                })
                                                                        }
                                                                        else {
                                                                            return callback(ErrorMessage)
                                                                        }
                                                                    }
                                                                });
                                                        }
                                                        else
                                                        {
                                                            return callback(null, 'Success')
                                                        }

                                                    }); //master_ids
                                                }
                                                else
                                                {
                                                    //ErrorMessage +=" | Master Id is empty"
                                                    return callback(ErrorMessage)
                                                }
                                            });
                                    }
                                });
                        });
                });
        }); // closing of pg connect
    });
}

// Some utility functions
var handleError = function (client, done, res, msg) {
    done(client);
    console.error(msg);
    res.status(500).send(msg);
};

router.post('/save_volume_plan_details', function (req, res) {

    pg.connect(conString, function (err, client, done) {
        if (err) {
            res.send(client, done, res, 'error fetching client from pool' + err)
            return
        }
        try {
            var date_selected = req.body.selected_date
            var city_selected = req.body.city_selected
            var date_conversion = moment(date_selected).format('YYYY-MM-DD');
            save_to_actual_table(date_selected, city_selected, function (response) {

                client.query("select distinct vp.restaurant_id,vp.date as vp_avail_date  from volume_plan_automation as vp \
                                      left outer join volume_plan_automation_master as vp_master on vp.date = vp_master.vp_avail_date \
                                      and vp.restaurant_id = vp_master.restaurant_id",
                    function (query_err, master_data_result) {
                        done();
                        if (query_err) {
                            console.error('error running query' + query_err, null);
                            return;
                        }

                        console.log("*********************** master_data_result : " + master_data_result.length)
                        _.map(master_data_result.rows, function (m) {

                            //console.log("*****map loop");
                            var vp_avail_date = m.vp_avail_date;
                            var restaurant_id = m.restaurant_id;
                            if (vp_avail_date != null && restaurant_id != null) {
                                var formated_date = moment(vp_avail_date).format('YYYY-MM-DD');

                                // console.log('***********vp_avail_date in get_date_from_vp()' + vp_avail_date);
                                //console.log('***********vp_avail_date in get_date_from_vp formated_date()' + formated_date);
                                if (formated_date && restaurant_id) {

                                    console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$Volume plan automation master")

                                    // new changes start 
                                    client.query("select count(*) as count from volume_plan_automation_master where restaurant_id = $1 and vp_avail_date = $2",
                                        [restaurant_id, date_conversion],
                                        function (query_err_vpam, select_vpamdata_result) {
                                            done();
                                            if (query_err_vpam) {
                                                console.error('error running query' + query_err_vpam, null);
                                                return;
                                            }
                                            // done();
                                            //console.log("##########################################" + JSON.stringify(select_vpamdata_result.rows[0]));
                                            if (select_vpamdata_result) {
                                                if (select_vpamdata_result.rows[0].count == 0) {

                                                    var quer = "INSERT into volume_plan_automation_master(restaurant_id,vp_avail_date) \
                                                     VALUES("+ restaurant_id + "," + formated_date + ")"
                                                    //console.log("#############################Query:" + quer)

                                                    client.query('INSERT into volume_plan_automation_master(restaurant_id,vp_avail_date) \
                                                                         VALUES($1,$2)',
                                                        [restaurant_id, formated_date],
                                                        function (query_err_insert, result_insert) {
                                                            done();
                                                            if (query_err) {
                                                                console.log(client, done, res, 'error running query in insert volume_plan_automation master in volume_planning.js' + query_err_insert);
                                                                return;
                                                            }

                                                           // console.log("Successfully Inserted new restaurant in Volume_plan_automation_master");
                                                        });
                                                }
                                                else {
                                                    //console.log("Already row available in volume_plan_automation_master");
                                                    return
                                                }
                                            }
                                            else {
                                                console.log("no data available in select count query");
                                                return
                                            }
                                        });

                                    //var quer = "INSERT into volume_plan_automation_master(restaurant_id,vp_avail_date) \
                                    //VALUES("+restaurant_id+","+ formated_date +")"
                                    //console.log("#############################Query:" + quer)

                                    //  client.query('INSERT into volume_plan_automation_master(restaurant_id,vp_avail_date) \
                                    //                   VALUES($1,$2)',
                                    //  [restaurant_id, formated_date],
                                    //function (query_err, result) {
                                    //    done();
                                    //    if (query_err) {
                                    //        console.log(client, done, res, 'error running query' + query_err);
                                    //        return;
                                    //    }
                                    //});


                                    //console.log(formated_date,restaurant_id);   
                                    //vp_avail_dates.push({ restaurant_id: restaurant_id, vp_avail_date: formated_date });
                                }
                            }

                        });

                        client.query('select count(vp_id) as count from volume_plan_automation where date=$1 and city_id=$2',
                            [date_selected, city_selected],
                            function (query_err, check_result) {
                                done();
                                if (query_err) {
                                    console.log('error running query checking data in  VPA  ' + query_err)

                                }
                                if (check_result) {
                                    console.log('************************check_result.rows.length' + check_result.rows.length)
                                    if (check_result.rows[0].count > 0) {

                                        volume_planning_helper.Pivot_generation(date_selected, city_selected, helper.volume_plan_automation, function (err, response) {
                                            //console.log("************************* send_hq_mail called");
                                            if (err) {
                                                console.log("************************* send_hq_mail called err" + err);
                                            }
                                            var date_hr = moment(date_selected).format('LL ') + moment().format('LTS');
                                            var mailOptions = {
                                                from: 'no-reply@atchayam.in', // sender address
                                                to: process.env.SEND_PLANS_ADDRESS, // list of receivers
                                                subject: 'Overall volume plan details ' + date_hr + ' - ' + city_selected,
                                                text: response, // plaintext body
                                                html: response
                                            };

                                            transporter.sendMail(mailOptions, function (error, info) {
                                                if (error) {
                                                    return console.log(error);
                                                }
                                                console.log('Message sent: ' + info.response);
                                            });

                                            client.query('delete from volume_plan_automation_temp where date=$1 and city_id=$2',
                                                [date_selected, city_selected],
                                                function (query_err, result) {
                                                    done();
                                                    if (query_err) {
                                                        console.log('changed_quantity_values error running query' + query_err)
                                                        return
                                                    }
                                                    if (result) {
                                                        res.send('success');
                                                    }
                                                })
                                        });
                                    }
                                    else {
                                        res.status(500).send('There is no data to process')
                                    }
                                } else {
                                    res.status(500).send('There is no data to process')
                                }
                            })
                    });

                // client.query('select date,city from send_mail_HQ where date =$1 and city=$2',
                //     [date_selected, city_selected],
                //     function (query_err, result_data) {
                //         done();
                //         if (query_err) {
                //             console.log('changed_quantity_values error running query' + query_err)
                //             return
                //         }
                //         if (result_data) {
                //             console.log("%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%" + JSON.stringify(result_data.rows));
                //             if (result_data.rows.length>0) {
                //                 console.log("Going to update row in ");
                //                 client.query('UPDATE send_mail_HQ set updation_date=now() where date=$1 and city=$2',
                //                     [date_selected, city_selected],
                //                     function (query_err, result) {
                //                         done();
                //                         if (query_err) {
                //                             console.log('error running query in insert to send_mail_HQ :' + query_err)
                //                             return
                //                         }
                //                         if (result) {
                //                             console.log("success of update in send_HQ_Mail");
                //                             res.send('success');
                //                         } else {
                //                             res.status(500).send({ error: 'Unknown err occured ' + error.errno });
                //                         }
                //                     })
                //             } else {
                //                 console.log("Going to insert row in ");
                //                 client.query('INSERT INTO send_mail_HQ(Date, city, mail_date, updation_date) values($1,$2,null, null)',
                //                     [date_selected, city_selected],
                //                     function (query_err, result) {
                //                         done();
                //                         if (query_err) {
                //                             console.log('error running query in insert to send_mail_HQ :' + query_err)
                //                             return
                //                         }
                //                         if (result) {
                //                             console.log("success of insert in send_HQ_Mail");
                //                             res.send('success');
                //                         } else {
                //                             res.status(500).send({ error: 'Unknown err occured ' + error.errno });
                //                         }
                //                     })
                //             }
                //         } else {
                //             res.status(500).send({ error: 'Unknown err occured ' + error.errno });
                //         }
                //     })
            });
        } catch (ex) {
            res.status(500).send({ error: 'Unknown err occured ' + ex });
        }
    })
})

var save_to_actual_table = function (date, city, callback) {
    pg.connect(conString, function (err, client, done) {
        if (err) {
            res.send(client, done, res, 'error fetching client from pool' + err)
            return
        }
        client.query('INSERT INTO volume_plan_automation( \
		outlet_id, restaurant_id, food_item_id, date, qty, session, po_id, green_signal_time, master_fooditem_id, session_start, city_id) \
        (select outlet_id, restaurant_id, food_item_id, date, qty, session, po_id, green_signal_time, master_fooditem_id, session_start, city_id \
        from volume_plan_automation_temp where date=$1 and city_id=$2)',
            [date, city],
            function (query_err, result) {
                done();
                if (query_err) {
                    return callback(new Error('error running query' + query_err), null)

                }
                if (result) {

                    return callback(null, 'success');
                }
            })
    })
}

//***************************************************Volume planning preview********************************************//

router.get('/preview_volume_plan', function (req, res, next) {
    var selected_date = req.query.date;
    var selected_city = req.query.city;
    var city_fullname = req.query.selected_city;
    var table_source = req.query.table_source;

    //console.log('************* selected date' + selected_date + ' city ' + selected_city);

    volume_planning_helper.Pivot_generation(selected_date, selected_city, helper.volume_plan_automation_temp, function (err, response) {
       // console.log("************************************************ response" + response)
        var table_source = helper.volume_plan_automation_temp;
        if (err) {
            volume_planning_helper.Pivot_generation(selected_date, selected_city, helper.volume_plan_automation, function (err, response) {
                if (err) {
                    console.log("*************************************** err in volume_planning_helper.Pivot_generation call" + err)
                }
                var context = {
                    title: '',
                    date: selected_date,
                    city: selected_city,
                    city_fullname: city_fullname,
                    preview_data: response,
                    table_source: helper.volume_plan_automation
                }
                res.render('volume_plan_preview', context)
            });

        } else {
            var context = {
                title: '',
                date: selected_date,
                city: selected_city,
                city_fullname: city_fullname,
                preview_data: response,
                table_source: helper.volume_plan_automation_temp
            }
            res.render('volume_plan_preview', context)
        }
    });
});


//***************************************************Volume planning Edit********************************************//


router.get('/edit', function (req, res, next) {

    if (req.query.date == undefined && req.query.city == undefined) { res.redirect('volume_planning') }
    var selected_date = req.query.date;
    var selected_city = req.query.city;
    var selected_source = req.query.source;

    //console.log('************* selected date' + selected_date + ' city ' + selected_city + ' source' + selected_source);

    async.parallel({
        outlets: function (callback) {
            config.query('select DISTINCT vpa.outlet_id as outlet_id, out.name as outlet_name,out.short_name as outlet_short_name from ' + selected_source + ' vpa \
                    inner join outlet out on out.id=vpa.outlet_id where date=$1 and vpa.city_id=$2',
                [selected_date, selected_city],
                function (err, result) {
                    if (err) {
                        return callback(new Error('error running query' + err, null))
                    }
                    return callback(null, result.rows)
                })
        },

        fvs: function (callback) {
            config.query('select distinct vpa.restaurant_id,res.name as res_name,res.short_name as res_short_name from ' + selected_source + ' vpa \
                     inner join restaurant res on res.id=vpa.restaurant_id where date=$1 and vpa.city_id=$2 \
                     order by res.name',
                [selected_date, selected_city],
                function (err, result) {
                    if (err) {
                        return callback(new Error('error running query' + err, null))
                    }
                    return callback(null, result.rows)
                })
        },

        session: function (callback) {
            config.query('select distinct session from ' + selected_source + ' where date=$1 and city_id=$2',
                [selected_date, selected_city],
                function (err, result) {
                    if (err) {
                        return callback(new Error('error running query' + err, null))
                    }
                    return callback(null, result.rows)
                })
        }
    },

        function (err, results) {
            if (err) {
                console.log('volume_plan: ' + err)
                return
            }

            var context = {
                title: '',
                outlets: results.outlets,
                fvs: results.fvs,
                session: results.session,
                date: selected_date,
                city: selected_city,
                selected_source: selected_source
            }
            res.render('edit', context)
        })
});

// This router function used to get existing volume plan 
router.post('/get_edit_information', function (req, res) {
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('error fetching client from pool' + err)
            return
        }
        var outlet_id, restaurant_id
        var outlet_name, restaurant_name
        if (req.body.outlet_info != 0) {
            var outlet_info = req.body.outlet_info.split('_')
            outlet_id = outlet_info[1]
            outlet_name = outlet_info[0]
        } else {
            outlet_id = req.body.outlet_info
            outlet_name = req.body.outlet_info
        }

        if (req.body.restaurant_info != 0) {
            var restaurant_info = req.body.restaurant_info.split('_')
            restaurant_id = restaurant_info[1]
            restaurant_name = restaurant_info[0]
        } else {
            restaurant_id = req.body.restaurant_info
            restaurant_name = req.body.restaurant_info
        }

        var session = req.body.session
        var city = req.body.city_field
        var date = req.body.date_field
        var selected_source = req.body.selected_source

        //console.log("*************************get_edit_information selected_city" + city + ' selected_date' + date);
        var stored_query = 'select vpa.vp_id as vp_id, \
                vpa.outlet_id as Outlet_Id,out.name as outlet_Name,res.name as Restaurant_Name, \
                vpa.session as Session,vpa.master_fooditem_id as Master_Id,fi.name as Food_Item, \
                vpa.qty as Quantity \
                from ' + selected_source + ' vpa \
                inner join outlet out on out.id=vpa.outlet_id \
                inner join restaurant res on res.id=vpa.restaurant_id \
                inner join food_item fi on fi.id=vpa.food_item_id \
                where 1=1'

        if (city != 0) {
            stored_query += " and vpa.city_id = '" + city + "'"
        }

        if (outlet_id != 0) {
            stored_query += ' and vpa.outlet_id=' + outlet_id
        }
        if (restaurant_id != 0) {
            stored_query += ' and vpa.restaurant_id=' + restaurant_id
        }
        if (session != 0) {
            stored_query += " and vpa.session= '" + session + "'"
        }
        stored_query += " and vpa.date >='" + date + "'order by CASE WHEN vpa.session='EarlyBreakFast' THEN 1 \
                    WHEN vpa.session='BreakFast' THEN 2 WHEN session='Lunch' THEN 3 \
                    WHEN vpa.session='Lunch2' THEN 4 WHEN session='Dinner' THEN 5 \
                    WHEN vpa.session='LateDinner' THEN 6 END"
        //console.log("*****************************stored_query" + stored_query);
        client.query(stored_query,
            [],
            function (query_err, result) {
                done();
                if (query_err) {
                    console.log('error running query' + query_err)
                    return
                }
                if (!result.rows) {
                    console.log('No data returned')
                    return
                }

                var context = {
                    title: '',
                    data: result.rows,
                    date: date,
                    city: city,
                    session: session,
                    restaurant_name: restaurant_name,
                    outlet_name: outlet_name,
                    selected_source: selected_source
                }
                res.render('edit_screen', context)
            })
    })
});

// This router function used to insert the newly added row and updated Quantity of existing volume plan
router.post('/put_edit_information', function (req, res) {

    //console.log("************************* put_edit_information called :" + selected_source);

    var changed_quantity_values = req.body.changed_quantity_values
    var new_vpa_values = req.body.new_vpa_values
    var selected_date = req.body.selected_date;
    var selected_city = req.body.selected_city;

    var selected_source = req.body.selected_source;
    var soruce = selected_source == helper.volume_plan_automation ? true : false;

    save_new_row(soruce, new_vpa_values, function (err, response) {
        if (err) {
            console.log('**************inside new_vpa_values err')
            return;
        }
        if (response) {
           // console.log('**************inside new_vpa_values')

            if ((new_vpa_values != undefined) && (changed_quantity_values == undefined)) {
                pg.connect(conString, function (err, client, done) {
                    if (err) {
                        console.log('error fetching client from pool' + err)
                        return
                    }
                    _.map(new_vpa_values, function (data) {

                        //console.log("INSIDE SAVE NEW ROW::::" + data.restaurant_name);
                       // console.log("***********************Inside map of save_new_row");

                        client.query("select id as restaurant_id from restaurant where name = $1",
                            [data.restaurant_name],
                            function (select_query_err, select_result) {
                                done();
                                if (select_query_err) {
                                    console.log('error running query in update send_mail_HQ' + select_query_err)
                                    return
                                }
                                //done();
                                if (select_result) {
                                    var restaurantId = select_result.rows[0].restaurant_id;
                                    var ccc = "update volume_plan_automation_master  set updation_date=now() \
                        where vp_avail_date = '" + selected_date + "' and restaurant_id=" + restaurantId;

                                    client.query("update volume_plan_automation_master  set updation_date=now() \
                where vp_avail_date = $1 and restaurant_id=$2",
                                        [selected_date, restaurantId],
                                        function (update_query_err, updation_result) {
                                            done();
                                            if (update_query_err) {
                                                console.log('error running query in update send_mail_HQ' + update_query_err)
                                                return
                                            }

                                            console.log("Updation query executed");

                                        });

                                }
                            });
                    })
                });

            }

            update_changed_quantity(soruce, changed_quantity_values, function (err, response_up) {
                //console.log('**************inside changed_quantity_values')
                if (err) {
                    console.log('**************inside changed_quantity_values err')
                    return
                }
                if (soruce) {
                    var tmr_date = moment().add(1, 'days').format('YYYY-MM-DD');

                    //console.log("changed quantity values", JSON.stringify(changed_quantity_values));
                    //console.log("new row values", JSON.stringify(new_vpa_values));
                    //if ((new_vpa_values != null) || (new_vpa_values.length > 0) || (changed_quantity_values != null) || (changed_quantity_values > 0)) {
                    if ((new_vpa_values != null) || (changed_quantity_values != null)) {
                       // console.log("Inside update new row call in volume_planning.js")
                        pg.connect(conString, function (err, client, done) {
                            if (err) {
                                console.log('error fetching client from pool' + err)
                                return
                            }

                            var previous_date = moment(selected_date).add(-1, 'days').format('YYYY-MM-DD');
                            client.query('update send_mail_HQ set updation_date = now() where date= $1 and city =$2',
                                [selected_date, selected_city],
                                function (query_err, manual_row_validation_result) {
                                    done();
                                    if (query_err) {
                                        console.log('error running query in update send_mail_HQ' + query_err)
                                        return
                                    }

                                });
                        });
                    }
                }


                pg.connect(conString, function (err, client, done) {
                    if (err) {
                        console.log('error fetching client from pool' + err)
                        return
                    }

                    client.query('select count(vp_id) as count from volume_plan_automation where date=$1 and city_id=$2',
                        [selected_date, selected_city],
                        function (query_err, check_result) {
                            done();
                            if (query_err) {
                                console.log('error running query checking data in  VPA  ' + query_err)

                            }
                            if (check_result) {
                                //console.log('************************check_result.rows.length' + check_result.rows.length)
                                if (check_result.rows[0].count > 0) {
                                    volume_planning_helper.Pivot_generation(selected_date, selected_city, helper.volume_plan_automation, function (err, response) {
                                        //console.log("************************* send_hq_mail called");
                                        if (err) {
                                            console.log("************************* send_hq_mail called err" + err);
                                        }
                                        var date_hr = moment(selected_date).format('LL ') + moment().format('LTS');
                                        var mailOptions = {
                                            from: 'no-reply@atchayam.in', // sender address
                                            to: process.env.SEND_PLANS_ADDRESS, // list of receivers
                                            subject: 'Updated volume plan details ' + date_hr + ' - ' + selected_city,
                                            text: response, // plaintext body
                                            html: response
                                        };
                                        if (response != '' || !response != undefined || response != null) {

                                            transporter.sendMail(mailOptions, function (error, info) {
                                                if (error) {
                                                    return console.log(error);
                                                }
                                                console.log('Message sent: ' + info.response);
                                            });
                                        }
                                    });
                                }
                            }
                        })
                });

                res.send('success');
            })
        }
    });
});

// This router function  used to validate the new row added by user
router.post('/validate_new_row', function (req, res) {
    var new_vpa_values = req.body.new_vpa_values
    var changed_quantity_values = req.body.changed_quantity_values

    if (new_vpa_values == undefined && changed_quantity_values != undefined) {
        res.send('success')
        return
    }
    pg.connect(conString, function (err, client, done) {
        if (err) {
            console.log('error fetching client from pool' + err)
            return
        }
        var length = new_vpa_values != undefined ? new_vpa_values.length : 0;
        var current_process = 0
        _.map(new_vpa_values, function (data) {
            client.query('select manual_row_validation($1,$2,$3,$4,$5)',
                [data.outlet_name, data.restaurant_name, data.food_item,
                    data.session, data.master_id],
                function (query_err, manual_row_validation_result) {
                    done();
                    if (query_err) {
                        console.log('error running query' + query_err)
                        return
                    }
                    if (manual_row_validation_result) {
                        //console.log("MANUAl ROW VALUES" + manual_row_validation_result.rows[0].manual_row_validation);
                        if (manual_row_validation_result.rows[0].manual_row_validation != 'SUCCESS') {
                            res.send('Error occurred in new Line no: ' + data.row_no + ' Error  ' + manual_row_validation_result.rows[0].manual_row_validation)
                        } else {
                            current_process++
                            if (current_process == length) {
                                res.send('success')
                            }
                        }
                        console.log('Query executes successfully')
                    }
                })
        })
    })
});

var save_new_row = function (selected_source, new_vpa_values, callback) {
    //console.log('**************save_new_row called')
    var length_of_object = new_vpa_values != undefined ? new_vpa_values.length : 0;
    //console.log('**************new_vpa_values length_of_object' + length_of_object)

    if (length_of_object <= 0) { return callback(null, 'success') }

    var current_row = 0;
    pg.connect(conString, function (err, client, done) {
        if (err) {
            return callback(new Error(err), null)
        }
        _.map(new_vpa_values, function (data) {

            client.query('select save_volumeplan($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [data.outlet_name, data.restaurant_name, data.food_item, data.date,
                    data.Quantity, data.session, data.master_id, data.city, selected_source],
                function (query_err, result) {
                    done();
                    if (query_err) {
                        return callback(new Error(query_err), null)
                    }
                    current_row++;
                    if (result) {
                        console.log('new_vpa_values Query executes successfully')
                    }
                    if (length_of_object == current_row) {
                        return callback(null, 'success');
                    }
                })
        })
    })
}
var update_changed_quantity = function (selected_source, changed_quantity_values, callback) {
    //console.log('**************update_changed_quantity called')
    var length_of_object = changed_quantity_values != undefined ? changed_quantity_values.length : 0;
    if (length_of_object <= 0) { return callback(null, 'success') }
    //console.log('**************update_changed_quantity length_of_object' + length_of_object)
    var current_row = 0;
    pg.connect(conString, function (err, client, done) {
        if (err) {
            return callback(new Error(err), null)
        }

        _.map(changed_quantity_values, function (data) {
            //console.log("***********************changed_quantity_values" + JSON.stringify(data))
            //console.log("***********************update_changed_quantity called");
            client.query('select update_volumeplan($1,$2,$3,$4,$5)',
                [data.current_quantity, data.vp_id, data.restaurant_name, data.date, selected_source],
                function (query_err, result) {
                    done();
                    if (query_err) {
                        return callback(new Error(query_err), null)
                    }
                    current_row++;
                    //console.log("Inside update_volume_plan");
                    if (result) {
                        console.log('changed_quantity_values Query executes successfully')

                    }
                    if (length_of_object == current_row) {
                        return callback(null, 'success');
                    }
                })
        })
    })
}
module.exports = router;


