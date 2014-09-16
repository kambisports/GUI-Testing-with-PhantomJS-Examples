"use strict";
/*global phantom, window*/

//------------------------------------------------------------------------------
//  Run like this:
//  1.Using an embedded mongoose server:
//	  First arg is your test html file.
//    Second arg is the local file root of the test, so the webserver can find it.
//    In this example, your tests will be server by moongoose on port 31234,
//    serving files from ../some/directory
//
//   phantomjs phantom-runner.js my-test.html ../some/directory
//
//  2.Using an external server (Provide three args, second arg is ignored)
//    Third arg becomes the root of the request.
//    In this sample, your test is on http://my-server:9100/dir/my-test.html
//
//   phantomjs phantom-runner.js my-test.html dont-care http://my-server:9100/dir/
//
//------------------------------------------------------------------------------


var URI = require('../bower_components/URIjs/src/URI.js'),
	httpServerPort = 31234,
	fileName = phantom.args[0],
	rootDir = phantom.args.length > 1 && phantom.args[1],
	args2 = phantom.args.length > 2 && phantom.args[2],
	logfileDirectory = rootDir + '../smoke-output', //TODO make configurable
	httpHostAndPort = /^[^\-]/.test(args2) && args2, // overrides localwebserver
	useOtherWebServer = httpHostAndPort ? true : false,
	useMongooseWebserver = (!useOtherWebServer && rootDir) ? true : false,
	httpBase = useOtherWebServer ? httpHostAndPort : 'http://localhost:' + httpServerPort,
	httpLocation = httpBase + fileName,
	fileLocation = rootDir + fileName,
	testPage = (useMongooseWebserver || useOtherWebServer) ? httpLocation : fileLocation,

	localWebServer = function () {
		var server = require("webserver"),
			serverInstance,
			fs = require("fs"),
			root = rootDir,
			protocol = 'http:',
			port = httpServerPort,
			createServerCallback;

		createServerCallback = function (request, response) {
			var uri = URI(root + request.url),
				filename = uri.normalizePathname().pathname(),
				contentTypes = {
					'html': 'text/html',
					'js': 'text/javascript',
					'css': 'text/css',
					'png': 'image/png',
					'jpg': 'image/jpeg',
					'gif': 'image/gif',
					'svg': 'image/svg+xml',
					'swf': 'application/x-shockwave-flash'
				},
				file,
				data,
				extension;
			if (fs.exists(filename)) {
				data = fs.read(filename);
				extension = filename.split('.').pop();

				response.statusCode = 200;

				response.headers = {
					"Content-Type": contentTypes[extension] || "text/plain",
					"Content-Length": data.length,
					"Pragma": "no-cache",
					"Expires": "Wed, 11 Jan 1984 05:00:00 GMT",
					"Cache-Control": "max-age=0, no-cache, no-store, must-revalidate",
					"Access-Control-Allow-Origin": "*"
				};
				response.write(data);
			} else {
				console.log("Phantomjs webserver sends 404 for:", filename);

				response.statusCode = 404;
				response.headers = {
					"Content-Type": "text/plain"
				};
				response.write("404 Not Found\n");
			}
			response.close();
		};

		serverInstance = server.create()
			.listen(port, {'keepAlive': true}, createServerCallback);

		console.log();
		console.log("Static file server running at\n  => " + protocol + "://localhost:" + port);
	},
	waitFor = function (testFn, onReady, onTimeout, timeOutMillis) {
		var maxtimeOutMillis = timeOutMillis || 3000, //< Default Max Timout is 3s
			start = (new Date()).getTime(),
			interval = setInterval(function () {
				var nowTime = (new Date()).getTime(),
					timeEllapsedMs = nowTime - start;
				if (testFn()) {
					clearInterval(interval);
					onReady(timeEllapsedMs);
				} else if (timeEllapsedMs > maxtimeOutMillis) {
					clearInterval(interval);
					onTimeout(timeEllapsedMs);
				}
			}, 250);
	},
	page = require('webpage').create(),
	dataFromBob,
	receivedLogLines = [],
	done = function (timeMs) {
		var ok = dataFromBob && dataFromBob.ok,
			failures = [],
			errorOutput = logfileDirectory + 'chuckbob-err.png';

//		console.log(stats.nrSpecs + ' specs tested.');
//		console.log(failures.length + ' test failed for ' + testPageLocalFile);

		if (!ok) {
			console.log("----------- failed -----------");
			console.log(failures);
			console.log("------------------------------");
			//console.log("Taking print screen to " + errorOutput);
			//page.render(errorOutput);

			phantom.exit(1);
		} else {
			phantom.exit(0);
		}
	},
	pollStatus = function () {
		var shouldExit = false,
			data = page.evaluate(function () {
				return window.toPhantomFromBob;
				//Return true when we are finished
			});
		if (data) {
			if (data.logLines) {
				var previous = receivedLogLines.length;
				receivedLogLines = data.logLines;
				receivedLogLines.slice(previous).forEach(function (string) {
					console.log(string);
				});
			}
			if (data.finished) {
				dataFromBob = data;
				shouldExit = true;
			}
		}

		return shouldExit;
	},
	startTests = function () {
/*
		page.onResourceRequested = function (req) {
			console.log('requested: ' + JSON.stringify(req, undefined, 4));
		};

		page.onResourceReceived = function (res) {
			console.log('received: ' + JSON.stringify(res, undefined, 4));
		};
		*/

		page.settings.resourceTimeout = 3000;
		console.log("Opening " + testPage);

		page.onConsoleMessage = function(msg){
			console.log(msg);
		};

		page.open(testPage, function (status) {
			if (status !== "success") {
				console.log("Unable to access network");
				phantom.exit(1);
			} else {
				console.log("Status:" + status);
				waitFor(
					pollStatus,
					done,
					done,
					180 * 1000
				);
			}
		});
	};

console.log("Filename args[0]:", fileName);
console.log("Root dir args[1]:", rootDir);
console.log("http hostAndPort, optional args[2]:", httpHostAndPort);
console.log("Use embedded webserver:", useMongooseWebserver);

if (useMongooseWebserver) {
	localWebServer();
}
startTests();
