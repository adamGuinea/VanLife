var express = require("express")
var router = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware")


// index
router.get("/", function(req, res){
    // get all campgrounds from DB
    Campground.find({}, function(err, allCampgrounds){
            if(err){
                console.log(err);
            } else {
                res.render("campgrounds/index", {campgrounds: allCampgrounds});
        }
    });
});

// create route
router.post("/", middleware.isLoggedIn, function(req, res){
    //get data from form and add to campgrounds array
var name  = req.body.name;
var price = req.body.price;
var image = req.body.image;
var desc  = req.body.description;
var author = {
        id: req.user._id,
        username: req.user.username
    }
    var newCampground = {name: name, price: price, image: image, description: desc, author: author};
    // create new campground and save to database
    Campground.create(newCampground, function(err, newlyCreated){
        if(err){
            console.log(err);
        }else{
            //redirect back to campgrounds page
            res.redirect("/campgrounds");
        }
    })
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

// update route
router.put("/:id", middleware.checkOwnership, function(req, res){
    // find and update campground and update correct campground
    Campground.findByIdAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground){
        if(err){
            res.redirect("/campgrounds");
        } else {
                // redirect somewhere
            res.redirect("/campgrounds/" + req.params.id)
        }
    })
})

// destroy route
router.delete("/:id", middleware.checkOwnership, function(req, res){
    Campground.findByIdAndRemove(req.params.id, function(err){
        if(err){
            res.redirect("/campgrounds")
        } else {
            res.redirect('/campgrounds')
        }
    })
})


module.exports = router;