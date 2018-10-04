var express = require("express");
var router = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware");
var NodeGeocoder = require('node-geocoder');
 
var options = {
  provider: 'google',
  httpAdapter: 'https',
  apiKey: process.env.GEOCODER_API_KEY,
  formatter: null
};
 
var geocoder = NodeGeocoder(options);

var multer = require('multer');
var storage = multer.diskStorage({
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
  cloud_name: 'thelongwayhome', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});


// index
router.get("/", function(req, res){
    // get all campgrounds from DB
    Campground.find({}, function(err, allCampgrounds){
            if(err){
                console.log(err);
            } else {
                res.render("campgrounds/index", {campgrounds: allCampgrounds, page: 'campgrounds'});
            }
    });
});


//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function (req, res) {

    //Local Variables 

    // Requests The Name
    var name = req.body.name;

    // Requests The Image 
    var image = req.body.image ? req.body.image : "/images/temp.png";

    // Requests The Description  
    var desc = req.body.description;

    // Requests The Authors ID + Username
    var author = {
        id: req.user._id,
        username: req.user.username
    };

    // Requests The Price 
    var price = req.body.price;


    //Location Code - Geocode Package
    geocoder.geocode(req.body.location, function (err, data) {

        //Error Handling For Autocomplete API Requests

        //Error handling provided by google docs -https://developers.google.com/places/web-service/autocomplete 
        if (err || data.status === 'ZERO_RESULTS') {
            req.flash('error', 'Invalid address, try typing a new address');
            return res.redirect('back');
        }

        //Error handling provided by google docs -https://developers.google.com/places/web-service/autocomplete 
        if (err || data.status === 'REQUEST_DENIED') {
            req.flash('error', 'Something Is Wrong Your Request Was Denied');
            return res.redirect('back');
        }

        //Error handling provided by google docs -https://developers.google.com/places/web-service/autocomplete 
        if (err || data.status === 'OVER_QUERY_LIMIT') {
            req.flash('error', 'All Requests Used Up');
            return res.redirect('back');
        }

        //Credit To Ian For Fixing The Geocode Problem - https://www.udemy.com/the-web-developer-bootcamp/learn/v4/questions/2788856
        var lat = data[0].latitude;
        var lng = data[0].longitude;
        var location = data[0].formattedAddress;


        //Reference: Zarko And Ian Helped Impliment the Image Upload - https://github.com/nax3t/image_upload_example

        cloudinary.uploader.upload(req.file.path, function (result) {

            //image variable needs to be here so the image can be stored and uploaded to cloudinary
            image = result.secure_url;


            //Captures All Objects And Stores Them
            var newCampground = { name: name, image: image, description: desc, author: author, price: price, location: location, lat: lat, lng: lng };

            // Create a new campground and save to DB by using the create method
            Campground.create(newCampground, function (err, newlyCreated) {
                if (err) {
                    //Logs Error
                    req.flash('error', err.message);

                    return res.redirect('back');

                }
                else {

                    //redirect back to campgrounds page

                    //Logs Error
                    console.log(newlyCreated);

                    //Flash Message 
                    req.flash("success", "Campground Added Successfully");

                    //Redirects Back To Featured Campgrounds Page
                    res.redirect("/campgrounds");
                }
            });
        });
    });
});   


// NEW - form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res){
    res.render("campgrounds/new")
});

// SHOW ROUTE
router.get("/:id", function(req, res){
    // find the campground with provided id
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground){
        if(err){
            console.log(err);
        } else {
        // render show template with that campground
        res.render("campgrounds/show", {campground: foundCampground});
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

    geocoder.geocode(req.body.campground.location, function (err, data) {

        //Error Handling For Autocomplete API Requests

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
                // add cloudinary url for image to the campground object under image property
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
    Campground.findByIdAndRemove(req.params.id, function (err) {
        if (err) {
            res.redirect("/campgrounds");
        }
        else {
            res.redirect("/campgrounds");
        }
    });
});


module.exports = router;