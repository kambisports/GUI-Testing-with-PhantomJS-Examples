GUI Testing with PhantomJS Examples
===================================

Code examples from the "GUI Testing with PhantomJS" talk by Filip Michalowski at Test Automation Forum II 4/9-2014.
http://www.meetup.com/Testautomatisering-forum-Stockholm/events/189432002/

The talk covered subject of functional testing of HTML 5 app using [Jasmine](http://jasmine.github.io/) and [Chuckbob](https://github.com/kambisports/ChuckBob) frameworks and further automation of testing with [PhantomJS](http://phantomjs.org/) and [Jenkins CI](http://jenkins-ci.org/).

## Subject of testing
GUI of an HTML 5 / JavaScript / CSS application

* Main file: `index.html`
* Additional source files: see `scripts`, `styles` and `templates` folders

### Requirements
* Local webserver running on port 8080 on the main folder of this repo (use for instance `http-server` Node.JS module)

### How to run the app
Open [http://localhost:8080/index.html](http://localhost:8080/index.html) link in your browser.


### GUI Testing Example 1: Jasmine

Spec file: see `test/jasmine/spec/NumericKeyboardViewSpec.js` file

**Run the test**:
* in browser: open [http://localhost:8080/test/jasmine/SpecRunner.html](http://localhost:8080/test/jasmine/SpecRunner.html)
* from terminal using PhantomJS: execute `test/run-jasmine.bat` (Windows) or `test/run-jasmine.sh` (Mac) script


### GUI Testing Example 1: Chuckbob

Spec file: see `test/chuckbob/spec/chuckbob-spec.js` file

**Run the test**:
* in browser: open [http://localhost:8080/test/chuckbob/index-chuckbob.html](http://localhost:8080/test/chuckbob/index-chuckbob.html) and click on _**Run All**_ button
* from terminal using PhantomJS: execute `test/run-chuckbob.bat` (Windows) or `test/run-chuckbob.sh` (Mac) script