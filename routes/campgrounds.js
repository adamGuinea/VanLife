var express      = require("express"),
    router       = express.Router(),
    Campground   = require("../models/campground"),
    Comment      = require("../models/comment"),
    User         = require("../models/user"),
    Notification = require("../models/notification"),
    Review       = require("../models/review"),
    middleware   = require("../middleware"),
    darksky      = require("darksky"),
    Forecast     = require('forecast'),
    NodeGeocoder = require('node-geocoder'),
    multer       = require('multer'),
    storage      = multer.diskStorage({
                        filename: function(req, file, callback) {
                            callback(null, Date.now() + file.originalname);
                        }
                    });

var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: "thelongwayhome", 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
var geocoder = NodeGeocoder(options);


//INDEX - show all campgrounds
router.get("/", function(req, res){
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var pageNumber = pageQuery ? pageQuery : 1;
    var noMatch = null;
    if(req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        Campground.find({name: regex}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count({name: regex}).exec(function (err, count) {
                if (err) {
                    console.log(err);
                    res.redirect("back");
                } else {
                    if(allCampgrounds.length < 1) {
                        noMatch = "No campgrounds match that query, please try again.";
                    }
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: req.query.search
                    });
                }
            });
        });
    } else {
        // get all campgrounds from DB
        Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count().exec(function (err, count) {
                if (err) {
                    console.log(err);
                } else {
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: false
                    });
                }
            });
        });
    }
});


//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), async function (req, res) {

    //Local Variables 
    var name = req.body.name;
    var image = req.body.image ? req.body.image : "/images/temp.png";
    var desc = req.body.description;
    var author = {
        id: req.user._id,
        username: req.user.username
    };
    var price = req.body.price;
    
    await geocoder.geocode(req.body.location, async function(err, data) {
        if (err || data.status === 'ZERO_RESULTS') {
            console.log(err)
            req.flash('error', 'Invalid address, try typing a new address');
            return res.redirect('back');
        }
        if (err || data.status === 'REQUEST_DENIED') {
            console.log(err)
            req.flash('error', 'Something Is Wrong Your Request Was Denied');
            return res.redirect('back');
        }

        //Error handling by google docs -https://developers.google.com/places/web-service/autocomplete 
        if (err || data.status === 'OVER_QUERY_LIMIT') {
            console.log(err)
            req.flash('error', 'All Requests Used Up');
            return res.redirect('back');
        }

        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;

        await cloudinary.uploader.upload(req.file.path, async function(result) {

            image = result.secure_url;
            var newCampground = { name: name, image: image, description: desc, author: author, price: price, location: location, lat: lat, lng: lng };

            try {
                let campground = await Campground.create(newCampground);
                let user = await User.findById(req.user._id).populate('followers').exec();
                let newNotification = {
                    username: req.user.username,
                    campgroundId: campground.id
                };
                for(const follower of user.followers){
                    let notification = await Notification.create(newNotification);
                    follower.notifications.push(notification);
                    follower.save();
                }
                // redirect back to campgrounds page
                res.redirect(`/campgrounds/${campground.id}`);
            } catch(err){
                req.flash('error', err.message);
                res.redirect('back');
            }
        });
    });
});


// NEW - form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res){
    res.render("campgrounds/new");
});

// SHOW ROUTE
router.get("/:id", function(req, res){
    Campground.findById(req.params.id).populate("comments").populate({
        path: "reviews",
        options: {sort: {createdAt: -1}}
    }).exec(function(err, foundCampground){
        if(err){
            console.log(err);
        } else {
            
            var forecast = new Forecast({
              service: 'darksky',
              key: process.env.DARKSKY_API_KEY,
              units: 'celcius',
              cache: true,      // Cache API requests 
              ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/ 
                minutes: 27,
                seconds: 45
              }
              
            });
            
            forecast.get([foundCampground.lat, foundCampground.lng], function(err, weather) {
                if(err) return console.dir(err);
                
                res.render("campgrounds/show", {campground: foundCampground, weather});
            });
        }
    });
});

// edit route
router.get("/:id/edit", middleware.checkOwnership, function(req, res){
    Campground.findById(req.params.id, function(err, foundCampground){
        res.render("campgrounds/edit", {campground: foundCampground});
    });
});



// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.checkOwnership, upload.single("image"), function (req, res) {
    delete req.body.campground.rating;
    geocoder.geocode(req.body.campground.location, function (err, data) {

        if (err || data.status === 'ZERO_RESULTS') {
            req.flash('error', 'Invalid address, try typing a new address');
            return res.redirect('back');
        }

        if (err || data.status === 'REQUEST_DENIED') {
            req.flash('error', 'Something Is Wrong Your Request Was Denied');
            return res.redirect('back');
        }

        if (err || data.status === 'OVER_QUERY_LIMIT') {
            req.flash('error', 'All Requests Used Up');
            return res.redirect('back');
        }
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;

        cloudinary.uploader.upload(req.file.path, function (result) {
            if (req.file.path) {

                req.body.campground.image = result.secure_url;
            }

            var newData = { name: req.body.campground.name, image: req.body.campground.image, description: req.body.campground.description, price: req.body.campground.price, location: location, lat: lat, lng: lng };

            //Updated Data Object
            Campground.findByIdAndUpdate(req.params.id, { $set: newData }, function (err, campground) {
                if (err) {
                    req.flash("error", err.message);

                    res.redirect("back");
                }
                else {
                    req.flash("success", "Successfully Updated!");

                    res.redirect("/campgrounds/" + campground._id);
                }
            }); 
        }); 
    }); 
}); 


router.delete("/:id", middleware.checkOwnership, function (req, res) {
    Campground.findById(req.params.id, function (err, campground) {
        if (err) {
            res.redirect("/campgrounds");
        } else {
            // deletes all comments associated with the campground
            Comment.remove({"_id": {$in: campground.comments}}, function (err) {
                if (err) {
                    console.log(err);
                    return res.redirect("/campgrounds");
                }
                // deletes all reviews associated with the campground
                Review.remove({"_id": {$in: campground.reviews}}, function (err) {
                    if (err) {
                        console.log(err);
                        return res.redirect("/campgrounds");
                    }
                    //  delete the campground
                    campground.remove();
                    req.flash("success", "Campground deleted successfully!");
                    res.redirect("/campgrounds");
                });
            });
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;