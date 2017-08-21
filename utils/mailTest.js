var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var debug = require('debug')('Foodbox-HQ:server');

// create reusable transporter object using SMTP transport
var transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'amazing.cow.atchayam@gmail.com',
        pass: 'whocares1'
    }
});

var content = "Hello this is some mail going to you";
var htmlContent = "<table><thead><tr>hello</tr></thead><tbody><td>Hello this is some mail going to you</td></tbody></table>";

var mailOptions = {
    from: 'no-reply@atchayam.in', // sender address
    to: 'agniva.quicksilver@gmail.com, agnivade@yahoo.co.in', // list of receivers
    subject: 'Please prepare POs', // Subject line
    text: content, // plaintext body
    html: htmlContent
};

transporter.sendMail(mailOptions, function(error, info){
  if(error){
      return console.log(error);
  }
  debug('Message sent: ' + info.response);
});
