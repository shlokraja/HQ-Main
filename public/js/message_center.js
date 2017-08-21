/*{ This is the data structure of the chat app
    "threads": {
        "thread1": {
            "title": "This is the title of the thread",
            "outlet_id": 1,
            "creator": "outlet/HQ/sales"
            "comments": {
                "comment1": true
            },
            "groups": [
                "HQ",
                "sales"
            ],
            "last_updated": "7/16/2015, 3:28:58 PM",
            "last_read" : "7/16/2015, 2:34:25 PM"
        }
    },
    "comments": {
        "comment1": {
            "thread_id": "thread1",
            "body": "This is a great comment",
            "timestamp": "7/16/2015, 3:28:58 PM",
            "source": "outlet/HQ/sales"
        }
    }
}*/

var commentsRef = new Firebase(CHAT_URL + "/comments");
var threadsRef = new Firebase(CHAT_URL + "/threads");
var unread_counter = 0;

// Showing the list of threads
threadsRef.on("child_added", function(snap) {
  var thread_id = snap.key();
  var thread_content = snap.val();
  var last_updated = new Date(thread_content.last_updated);
  var now = new Date();
  var MsinOneDay = 86400000;
  if (now.getTime() - last_updated.getTime() < MsinOneDay) {
    $("#threads").append("<div class=\"thread\" data-thread_id=\""+thread_id+"\">"+thread_content.title+"</div>");
  }
});


function displayComments(thread_id, thread_title) {
  $("#comments-dialog").attr("data-thread_id", thread_id);
  $("#comments-dialog .comments").empty();
  var threadCommentsRef = threadsRef.child(thread_id).child("comments");
  $("#comments-dialog #modalTitle").text('Subject: ' + thread_title);
  $("#comments-dialog .reply_text").val("");
  threadCommentsRef.once("value", function(snap) {
    snap.forEach(function(childSnapshot) {
      commentsRef.child(childSnapshot.key()).once("value", function(comment_val) {
        // Render the comment on the link page.
        var comment = comment_val.val().body;
        var comment_timestamp = comment_val.val().timestamp;
        var source = comment_val.val().source;
        if (source == "outlet") {
          $("#comments-dialog .comments").append('<div class="comment outlet_comment"><div class="source">From: '+source+'</div><div class="comment_text">'+ comment +'</div><div class="timestamp">'+comment_timestamp+'</div></div>');
        } else {
          $("#comments-dialog .comments").append('<div class="comment hq_comment"><div class="source">From: '+source+'</div><div class="comment_text">'+ comment +'</div><div class="timestamp">'+comment_timestamp+'</div></div>');
        }
      });
    });
  });
  $('#comments-dialog').foundation('reveal', 'open');
}

$("#comments-dialog .send_reply").click(function() {
  var comment_text = $("#comments-dialog .reply_text").val();
  var thread_id = $("#comments-dialog").attr("data-thread_id");
  var id = commentsRef.push();
  var comment = {"thread_id": thread_id,
      "body": comment_text,
      "timestamp": (new Date()).toLocaleString(),
      "source": "HQ"
    };
  id.set(comment, function(err) {
    if (!err) {
      var name = id.key();
      var commentsNode = "comments/" + name;
      var updateDict = {
        "last_updated": comment.timestamp
      };
      updateDict[commentsNode] = true;
      threadsRef.child("/" + thread_id).update(updateDict);
    } else {
      console.error(err);
    }
    $("#comments-dialog").foundation("reveal", "close");
  });
});


$("#compose_message").click(function() {
  // Hiding all the other modals
  // Clearing out old values
  $("#compose-message-dialog .subject").val("");
  $("#compose-message-dialog textarea").val("");
  // show the dialog
  $('#compose-message-dialog').foundation('reveal', 'open');
});

$("#compose-message-dialog .compose_reply").click(function() {
    var id = threadsRef.push();
    // take the input
    // send the data
    var group_name = $("#compose-message-dialog .roles").val();
    var outlet_id = $("#compose-message-dialog .outlet").val();
    var thread_title = $("#compose-message-dialog .subject").val();
    var ts = (new Date()).toLocaleString();
    var last_read = (new Date('2015-1-1')).toLocaleString();
    var thread_content = {
        "title": thread_title,
        "comments": {},
        "outlet_id": outlet_id,
        "groups": [group_name],
        "creator": "HQ",
        "last_updated": ts,
        "last_read": last_read
      };
    id.set(thread_content, function(err) {
      if (err) {
        console.error(err);
      }
      var comment_text = $("#compose-message-dialog textarea").val();
      var thread_id = id.key();
      var comment_id = commentsRef.push();
      var comment = {"thread_id": thread_id,
          "body": comment_text,
          "timestamp": ts,
          "source": "HQ"
        };
      comment_id.set(comment, function(err) {
        if (!err) {
          var name = comment_id.key();
          threadsRef.child("/" + thread_id + "/comments/" + name).set(true);
        } else {
          console.error(err);
        }
        // close the dialog
        $('#compose-message-dialog').foundation('reveal', 'close');
      });
    });
});


