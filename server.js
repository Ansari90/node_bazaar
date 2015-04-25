#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var path    = require('path');
var bodyparser = require('body-parser');
var cradle  = require('cradle');
var db = new (cradle.Connection)('http://nodebazaardb.smileupps.com', 80).database('nodebazaardb');
/**
 *  Define the sample application.
 */
var SampleApp = function() {
    
    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP;
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;

        if (typeof self.ipaddress === "undefined") {
            //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
            //  allows us to run/test the app locally.
            console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
            self.ipaddress = "127.0.0.1";
        };
    };

    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating sample app ...',
                       Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };
    
    function scriptAndStyleSetup() {
        self.app.get('/css', function(req, res) {
            fs.readFile('css/bootstrap.min.css', function(err, data) {
                if(err) {
                    console.log(err);
                    return;
                }

                res.contentType('text/css');
                res.end(data.toString());
            });
        });

        self.app.get('/js', function(req, res) {
            fs.readFile('js/bootstrap.min.js', function(err, data) {
                if(err) {
                    console.log(err);
                    return;
                }

                res.contentType('application/javascript');
                res.end(data.toString());
            });
        });
    }
    
    function formSetup() {
        //Form Endpoints - These forms are on all pages
        self.app.post('/viewform', function(req, res) {
            var posts = new Array();
            var viewString, viewKey, title;

            switch(req.body.action) {
                    case 'key':
                        viewString = 'keyView/keyView';
                        viewKey = { key: req.body.key };
                        title = 'Posts with Key - ' + req.body.key;
                    break;

                    case 'title':
                        viewString = 'titleView/titleView';
                        viewKey = {};
                        title = 'Posts on: ' + req.body.title;
                    break;
            }

            db.view(viewString, viewKey, function(err, data) {
                if(err) {
                    console.log(err.toString());
                    return;
                }

                switch(req.body.action) {
                    case 'key':
                        data.forEach(function(row) {
                            row.content = row.content.substr(0, 50) + '...';
                            posts.push(row);
                        });
                    break;

                    case 'title':
                        var titleArray = req.body.title.toLowerCase().split(' '), lowerCaseRow;

                        data.forEach(function(row) {
                            lowerCaseRow = row.title.toLowerCase();

                            titleArray.forEach(function(data) {
                                if(lowerCaseRow.indexOf(data) > -1) {
                                    row.content = row.content.substr(0, 50) + '...';
                                    posts.push(row);
                                }
                            });
                        });
                    break;
                }

                res.render('postList', { 'title' : title,
                                         'posts' : posts });
            });
        });

        self.app.post('/regform', function(req, res) {    
            switch(req.body.action) {
                case 'expand':
                    db.get(req.body.id, function(err, data) {
                        if(err) {
                            console.log(err);
                        }

                        res.render('postDetails', { 'post' : data })
                    });
                break;

                case 'delete':
                    db.get(req.body.id, function(err, data) {
                        if(req.body.key == data.key) {
                            db.remove(req.body.id, function(err, res) {
                                if(err) {
                                    console.log(err);
                                }
                            });

                            res.render('postMessage', { action: 'Post Deleted!' });
                        }
                    });
                break

                case 'new':
                    db.save({
                        title: req.body.title,
                        contact: req.body.contact,
                        price: req.body.price,
                        key: req.body.key,
                        content: req.body.content,
                        date: (new Date()).toDateString()
                    }, 
                    function(err, res) {
                        if(err)
                            console.log(err.toString());
                    });

                    res.render('postMessage', { action: 'New Post Created!' });
                break;
            }
        });
    }

    function pageSetup() {
        //Page Endpoints
        //Main Page
        self.app.get('/main', function(req, res) {
            res.render('main');
        });
        self.app.get('/', function(req, res) {
            res.render('main');
        });

        //Post Creation Page, New Post Button Endpoint
        self.app.get('/create', function(req, res) {
            res.render('createPost');
        });

        //Post List
        self.app.get('/list', function(req, res) {
            var posts = new Array();

            db.view('simpleView/simpleView', function(err, data) {
                if(err) {
                    console.log(err.toString());
                    return;
                }

                data.forEach(function(row) {
                    row.content = row.content.substr(0, 50) + '...';
                    posts.push(row);
                });

                res.render('postList', { 'title' : 'All Posts', 
                                         'posts' : posts });
            });
        });
    }

    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.app = express();
        
        self.app.use(bodyparser.urlencoded({extended: false}));
        
        self.app.set('view engine', 'jade');
        self.app.set('views', path.join(__dirname, 'templates'));
        
        scriptAndStyleSetup();
        formSetup();
        pageSetup();
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        self.setupVariables();
        self.setupTerminationHandlers();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server (starts up the sample application).
     */
    self.start = function() {
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...',
                        Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

