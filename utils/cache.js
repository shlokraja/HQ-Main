var outlets = new Array();
var lstoutlets = new Array();
var MissingBillArray = new Array();

var redis = require('redis');
var redisClient = redis.createClient({ connect_timeout: 2000, retry_max_delay: 5000 });
redisClient.on('error', function (msg) {
    console.error(msg);
});

redisClient.select(1, function(err) { 
    if(err) {
        console.error("Selecting Db Failed" + err)
    }
 });


exports.Loadoutlets = function(outletsarr)
{
    if(outletsarr!=undefined) {
        outlets = JSON.parse(JSON.stringify(outletsarr));
        lstoutlets = JSON.parse(JSON.stringify(outletsarr));
    }
}

exports.Setoutlets = function () {
    //if(outletsarr!=undefined) {
    //    outlets = outletsarr;
    //}
    if (lstoutlets != undefined) {
        if (lstoutlets.length > 0) {
            outlets = JSON.parse(JSON.stringify(lstoutlets));

        }
        else {
            redisClient.lrange("outlets_info",0, -1, function (err, res) {
                if (err) {
                    console.error("SetOutlet", err);
                    outlets = new Array();
                    lstoutlets = new Array();
                }
                else {
                    outlets = JSON.parse(JSON.stringify(outletsarr));
                    lstoutlets = JSON.parse(JSON.stringify(outletsarr));
                }
            })
        }
    }
    else {
        redisClient.lrange("outlets_info",0, -1, function (err, res) {
            if (err) {
                console.error("SetOutlet", err);
                outlets = new Array();
                lstoutlets = new Array();
            }
            else {
                outlets = JSON.parse(JSON.stringify(outletsarr));
                lstoutlets = JSON.parse(JSON.stringify(outletsarr));
            }
        })
    }
}

exports.Getoutlets = function()
{
   return lstoutlets
}

exports.GetNextoutlets = function () {
    if (outlets != undefined) {
        if (outlets.length > 0) {
            var obj = outlets.pop();
            return obj
        }
        else {
            return undefined
        }
    } else {
        return undefined
    }
}

exports.SetMissingBills = function(BillArr) {
    MissingBillArray = JSON.parse(JSON.stringify(BillArr));
}

exports.GetNextMissingBills = function () {
    if (MissingBillArray != undefined) {
        if (MissingBillArray.length > 0) {
            var obj = MissingBillArray.pop();
            return obj
        }
        else {
            return undefined
        }
    } else {
        return undefined
    }
}


