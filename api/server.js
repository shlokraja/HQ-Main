var http = require("http");
var url = require('url');
var fs = require('fs');
var io = require('socket.io');
var clients = {};
var request = require('request');
var firebase = require('firebase');
var debug = require('debug')('hqserver:server');
var server_port = '';
var general = require('./general');
var logfile = require('fs');

// // For Local - Client
//var firebase_connection = "https://atchayam-dev.firebaseio.com";
//server_port = '9099';

// // For Local - Shlok
//var firebase_connection = "https://atcpaymentstage.firebaseio.com";
//server_port = '9500';

// // For Singapore
//var firebase_connection = "https://atp-sg-chat.firebaseio.com";
//server_port = '9099';

// // For Muthu
//var firebase_connection = "https://atp-sg-chat.firebaseio.com";
//server_port = '9099';

//// // For Live - Atchayam-gofrugal
var firebase_connection = "https://atp-chat.firebaseio.com";
server_port = '9099';

//// // For Live - Atchayam-gofrugal - Test server
//var firebase_connection = "https://atctesthq2.firebaseio.com";
//server_port = '9099';

// // For live server - Read from .bootstraprc file
//var firebase_connection = process.env.FIREBASE_CONN;
//server_port = process.env.SERVER_PORT;

var rootref = new firebase(firebase_connection);

var server = http.createServer(function (request, response) {
    try
    {
        var path = url.parse(request.url).pathname;

        switch (path)
        {
            case '/':
                response.writeHead(200, { 'Content-Type': 'text/html' });
                response.write('hello world');
                response.end();
                break;
            case '/socket.html':
                fs.readFile(__dirname + path, function (error, data) {
                    if (error)
                    {
                        response.writeHead(404);
                        response.write("opps this doesn't exist - 404");
                        response.end();
                    }
                    else
                    {
                        response.writeHead(200, { "Content-Type": "text/html" });
                        response.write(data, "utf8");
                        response.end();
                    }
                });
                break;
            default:
                response.writeHead(404);
                response.write("opps this doesn't exist - 404");
                response.end();
                break;
        }
    } catch (e)
    {
        general.genericError("server.js :: http.createServer: " + e);
    }
});

server.listen(server_port);
var listener = io.listen(server);
general.genericError("Server_Port: " + server_port);

listener.sockets.on('connection', function (socket) {
    try
    {
        socket.on('add-user', function (data) {
            try
            {
                clients[data.username] = {
                    "socket": socket.id
                };

                general.genericError("Clients: " + JSON.stringify(clients));
            } catch (e)
            {
                general.genericError("server.js :: connection: " + e);
            }
        });

        socket.on('private-message', function (data) {
            try
            {
                general.genericError("private-message: " + data.username);
                if (clients[data.username])
                {
                    listener.sockets.connected[clients[data.username].socket].emit("add-message", data);
                    general.genericError("private-message Sending: " + data.content + " to " + data.username);
                } else
                {
                    general.genericError("private-message User does not exist: " + data.username);
                }
            } catch (e)
            {
                general.genericError("server.js :: private-message: " + e);
            }
        });

        // Lock Item - Send and receive data's
        socket.on('send-lockitem-data-to-server', function (data, lockitemserver) {
            try
            {
                console.log("send-lockitem-data-to-server: " + JSON.stringify(data));
                console.log("send-lockitem-data-to-server:: Outletid: " + data.outletid);

                if (clients[data.outletid])
                {
                    listener.sockets.connected[clients[data.outletid].socket].emit("send-lockitem-data-to-client", data, function (lockresult) {
                        lockitemserver({ lockresult });
                    });

                    general.genericError("send-lockitem-data-to-server:: Outletid: " + data.outletid);
                } else
                {
                    general.genericError("send-lockitem-data-to-server: User does not exist: " + data.outletid);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-lockitem-data-to-server: " + e);
            }
        });

        socket.on('lock-item-status', function (data) {
            try
            {
                console.log("lock-item-status:: Mobile No:" + data.mobileno + " Referenceno: " + data.referenceno);
                if (clients[data.hqclient])
                {
                    console.log("lock-item-status:: Mobile No:" + data.mobileno + " Referenceno: " + data.referenceno);
                    if (data.referenceno != null)
                    {
                        general.genericError("lock-item-status:: Mobile No:" + data.mobileno + " Referenceno: " + data.referenceno);
                        rootref.child('lockitemstatus').child(data.referenceno).set({ "status": data.status, "outletid": data.outletid, "hqclient": data.hqclient, "mobileno": data.mobileno, "items": data.items });
                    }
                } else
                {
                    general.genericError("lock-item-status:: User does not exist: " + data.hqclient);
                }
            } catch (e)
            {
                general.genericError("server.js :: lock-item-status: " + e);
            }
        });

        // Unlock item - Send and receive data's
        socket.on('send-releaselockitem-data-to-server', function (data, releaselockitemserver) {
            try
            {
                if (clients[data.outletid])
                {
                    listener.sockets.connected[clients[data.outletid].socket].emit("send-releaselockitem-data-to-client", data, function (releaselockresult) {
                        releaselockitemserver({ releaselockresult });
                    });
                    general.genericError("send-releaselockitem-data-to-server:: Outlet id: " + data.outletid);
                } else
                {
                    general.genericError("send-releaselockitem-data-to-server:: User does not exist: " + data.outletid);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-releaselockitem-data-to-server: " + e);
            }
        });

        socket.on('releaselock-item-status', function (data) {
            try
            {
                console.log("releaselock-item-status" + data);
                if (clients[data.hqclient])
                {
                    general.genericError("releaselock-item-status" + data);
                    rootref.child('releaselockitemstatus').child(data.referenceno).set({ "status": data.status, "outletid": data.outletid, "hqclient": data.hqclient, "mobileno": data.mobileno, "items": data.items });
                } else
                {
                    general.genericError("releaselock-item-status:: User does not exist: " + data.hqclient);
                }
            } catch (e)
            {
                general.genericError("server.js :: releaselock-item-status: " + e);
            }
        });

        // Order Process - Send and receive data's
        socket.on('send-order-request-to-server', function (data, order_data_server) {
            try
            {
                if (clients[data.outletid])
                {
                    listener.sockets.connected[clients[data.outletid].socket].emit("send-order-request-to-client", data, function (receive_order_data_client) {
                        order_data_server({ receive_order_data_client });
                    });
                    general.genericError("send-order-request-to-server: " + data.outletid);

                } else
                {
                    general.genericError("send-order-request-to-server:: User does not exist: " + data.outletid);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-order-request-to-server: " + e);
            }
        });

        socket.on('send-order-status-to-server', function (data) {
            try
            {
                console.log("clients: " + clients);
                if (clients[data.hqclient])
                {
                    if (data.bill_no != -1)
                    {
                        // refrenceno_bill_no
                        SendSMS(data.mobileno, data.orderdata.refrenceno_bill_no);
                    }
                    else
                    {
                        SendSMS(data.mobileno, "0");
                    }
                    general.genericError("send-order-status-to-server " + data.hqclient + " Referenceno: " + data.referenceno);
                    rootref.child('orderstatus').child(data.referenceno).set({ "orderdata": data.orderdata, "bill_no": data.bill_no, "mobileno": data.mobileno, "outletid": data.outletid, "item_queue": data.item_queue, "status": data.status, "message": data.message });

                }
                else
                {
                    general.genericError("send-order-status-to-server:: User does not exist: " + data.hqclient);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-order-status-to-server: " + e);
            }
        });

        //Removing the socket on disconnect
        socket.on('disconnect', function () {
            try
            {
                for (var name in clients)
                {
                    if (clients[name].socket === socket.id)
                    {
                        delete clients[name];
                        break;
                    }
                }

                general.genericError("Clients: " + JSON.stringify(clients));

            } catch (e)
            {
                general.genericError("server.js :: disconnect: " + e);
            }
        });

        socket.on('send-activate-order-request-data-to-server', function (data, activate_order_data_server) {
            try
            {
                if (clients[data.outletid])
                {
                    var orderdetails = {};

                    // read order status from firebase
                    rootref.child('orderstatus').child(data.referenceno).on('value', function (snapshot) {
                        try
                        {
                            var firebase_status;
                            var firebase_orderdata;
                            var firebase_bill_no;
                            var firebase_message;
                            var firebase_item_queue;

                            snapshot.forEach(function (childSnapshot) {
                                try
                                {
                                    var key = childSnapshot.key();
                                    var value = childSnapshot.val();

                                    switch (key)
                                    {
                                        case "status":
                                            firebase_status = value;
                                            break;
                                        case "orderdata":
                                            firebase_orderdata = value;
                                            break;
                                        case "bill_no":
                                            firebase_bill_no = value;
                                            break;
                                        case "message":
                                            firebase_message = value;
                                            break;
                                        case "item_queue":
                                            firebase_item_queue = value;
                                            break;
                                        default:
                                            break;
                                    };
                                } catch (e)
                                {
                                    general.genericError("server.js :: send-activate-order-request-data-to-server: " + e);
                                }
                            });

                            if (data.mobileno == firebase_orderdata.mobileno && firebase_orderdata.outletid == data.outletid)
                            {
                                orderdetails = {
                                    "bill_no": firebase_orderdata.bill_no,
                                    "referenceno": data.referenceno,
                                    "orderdata": firebase_orderdata,
                                    "outletid": data.outletid,
                                    "item_queue": firebase_item_queue
                                };
                            }

                            general.genericError("orderdetails: " + JSON.stringify(orderdetails));

                            listener.sockets.connected[clients[data.outletid].socket].emit("receive-activate-order-request-to-client", orderdetails, function (activate_order_result) {
                                activate_order_data_server({ activate_order_result });
                            });

                            console.log("send-activate-order-request-data-to-server - Outlet Id: " + data.outletid + " Referenceno: " + data.referenceno);
                        } catch (e)
                        {
                            general.genericError("server.js :: send-activate-order-request-data-to-server: " + e);
                        }
                    });

                } else
                {
                    console.log("send-activate-order-request-data-to-server:: User does not exist: " + data.outletid);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-activate-order-request-data-to-server: " + e);
            }
        });

        socket.on("send-test-emit-data-to-server", function (data, fn) {
            try
            {
                if (clients[data.outletid])
                {
                    listener.sockets.connected[clients[data.outletid].socket].emit("send-test-emit-request-to-client", data, function (result) {
                        if (result.exists)
                        {
                            general.genericError("send-test-emit-data-to-server: " + result.exists);
                            fn({ existsemit: true });
                        }
                    });
                    general.genericError("send-test-emit-data-to-server: " + data.outletid);

                } else
                {
                    general.genericError("send-test-emit-data-to-server:: User does not exist: " + data.outletid);
                }
            } catch (e)
            {
                general.genericError("server.js :: send-test-emit-data-to-server: " + e);
            }
        });

        socket.on("get-connected-clients-from-server", function (fn) {
            fn({ connectedclients: clients });
        });

    } catch (e)
    {
        general.genericError("server.js :: send-activate-order-request-data-to-server: " + e);
    }
});

function GenerateRandomNumber(no_of_digits) {
    try
    {
        if (no_of_digits === 7)
        {
            return Math.floor(Math.random() * 9000000) + 1000000;
        }
        else if (no_of_digits === 8)
        {
            return Math.floor(Math.random() * 90000000) + 10000000;
        }

        return Math.floor(Math.random() * 900000) + 100000;
    } catch (e)
    {
        general.genericError("server.js :: GenerateRandomNumber: " + e);
    }
}

// send sms
function SendSMS(mobileno, message) {
    try
    {
        var queryString = {
            UserName: 'atchayam',
            password: '123456',
            MobileNo: mobileno,
            SenderID: 'FOODBX',
            CDMAHeader: 'FOODBX',
            Message: 'Thanks for Order #' + message + ' \n Rs. 44 at OTP \n View your bill at http://flofl/fdf \n Call us at 04498238498 \n Enjoy your meal!'
        };
        request({
            url: 'http://whitelist.smsapi.org/SendSMS.aspx',
            qs: queryString
        }, function (sms_error, sms_response, sms_body) {
            try
            {
                if (sms_error || (sms_response && sms_response.statusCode != 200))
                {
                    return;
                }
            } catch (e)
            {
                general.genericError("server.js :: SendSMS: " + e);
            }
        });
    } catch (e)
    {
        general.genericError("server.js :: SendSMS: " + e);
    }
}