GUI Testing with PhantomJS Examples
===================================

Code examples from the "GUI Testing with PhantomJS" talk by Filip Michalowski at Test Automation Forum II 4/9-2014.
http://www.meetup.com/Testautomatisering-forum-Stockholm/events/189432002/

The talk covered subject of functional testing of HTML 5 app using [Jasmine](http://jasmine.github.io/) and [Chuckbob](https://github.com/kambisports/ChuckBob) frameworks and further automation of testing with [PhantomJS](http://phantomjs.org/) and [Jenkins CI](http://jenkins-ci.org/).

See [GUI Testing with PhantomJS.pdf](https://github.com/kambisports/GUI-Testing-with-PhantomJS-Examples/blob/master/GUI%20Testing%20with%20PhantomJS.pdf) file for presentation text.

## Subject of testing
GUI of an HTML 5 / JavaScript / CSS application

* Main file: `index.html`
* Additional source files: see `scripts`, `styles` and `templates` folders

## Requirements
* Local webserver running on port 8080 on the main folder of this repo (use for instance `http-server` Node.JS module)

## How to run the app
Open [http://localhost:8080/index.html](http://localhost:8080/index.html) link in your browser.


## GUI Testing Example 1: Jasmine

Spec file: see `test/jasmine/spec/NumericKeyboardViewSpec.js` file

**Run the test**:
* in browser: open [http://localhost:8080/test/jasmine/SpecRunner.html](http://localhost:8080/test/jasmine/SpecRunner.html)
* in terminal using PhantomJS:

    execute `run-jasmine.bat` (Windows) or `run-jasmine.sh` (Mac) script from the `test` folder,
    
    if you are on Linux and have PhantomJS installed you can run the command

    `phantomjs jasmine/scripts/phantom-runner.js http://localhost:8080/test/jasmine/SpecRunner.html`


## GUI Testing Example 2: Chuckbob

Spec file: see `test/chuckbob/spec/chuckbob-spec.js` file

**Run the test**:
* in browser: open [http://localhost:8080/test/chuckbob/index-chuckbob.html](http://localhost:8080/test/chuckbob/index-chuckbob.html) and click on _**Run All**_ button
* in terminal using PhantomJS:
    
    execute `run-chuckbob.bat` (Windows) or `run-chuckbob.sh` (Mac) script from the `test` folder,

    if you are on Linux and have PhantomJS installed you can run the command:

    `phantomjs chuckbob/scripts/phantom-runner.js /index-chuckbob.html?phantomjs=true dont-care http://localhost:8080/test/chuckbob`