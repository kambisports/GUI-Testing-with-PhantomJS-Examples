(function () {/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("bower_components/almond/almond.js", function(){});

/** @license MIT License (c) copyright 2011-2013 original author or authors */

/**
 * A lightweight CommonJS Promises/A and when() implementation
 * when is part of the cujo.js family of libraries (http://cujojs.com/)
 *
 * Licensed under the MIT License at:
 * http://www.opensource.org/licenses/mit-license.php
 *
 * @author Brian Cavalier
 * @author John Hann
 * @version 2.7.1
 */
(function(define) { 
define('when',['require'],function (require) {

	// Public API

	when.promise   = promise;    // Create a pending promise
	when.resolve   = resolve;    // Create a resolved promise
	when.reject    = reject;     // Create a rejected promise
	when.defer     = defer;      // Create a {promise, resolver} pair

	when.join      = join;       // Join 2 or more promises

	when.all       = all;        // Resolve a list of promises
	when.map       = map;        // Array.map() for promises
	when.reduce    = reduce;     // Array.reduce() for promises
	when.settle    = settle;     // Settle a list of promises

	when.any       = any;        // One-winner race
	when.some      = some;       // Multi-winner race

	when.isPromise = isPromiseLike;  // DEPRECATED: use isPromiseLike
	when.isPromiseLike = isPromiseLike; // Is something promise-like, aka thenable

	/**
	 * Register an observer for a promise or immediate value.
	 *
	 * @param {*} promiseOrValue
	 * @param {function?} [onFulfilled] callback to be called when promiseOrValue is
	 *   successfully fulfilled.  If promiseOrValue is an immediate value, callback
	 *   will be invoked immediately.
	 * @param {function?} [onRejected] callback to be called when promiseOrValue is
	 *   rejected.
	 * @param {function?} [onProgress] callback to be called when progress updates
	 *   are issued for promiseOrValue.
	 * @returns {Promise} a new {@link Promise} that will complete with the return
	 *   value of callback or errback or the completion value of promiseOrValue if
	 *   callback and/or errback is not supplied.
	 */
	function when(promiseOrValue, onFulfilled, onRejected, onProgress) {
		// Get a trusted promise for the input promiseOrValue, and then
		// register promise handlers
		return cast(promiseOrValue).then(onFulfilled, onRejected, onProgress);
	}

	/**
	 * Creates a new promise whose fate is determined by resolver.
	 * @param {function} resolver function(resolve, reject, notify)
	 * @returns {Promise} promise whose fate is determine by resolver
	 */
	function promise(resolver) {
		return new Promise(resolver,
			monitorApi.PromiseStatus && monitorApi.PromiseStatus());
	}

	/**
	 * Trusted Promise constructor.  A Promise created from this constructor is
	 * a trusted when.js promise.  Any other duck-typed promise is considered
	 * untrusted.
	 * @constructor
	 * @returns {Promise} promise whose fate is determine by resolver
	 * @name Promise
	 */
	function Promise(resolver, status) {
		var self, value, consumers = [];

		self = this;
		this._status = status;
		this.inspect = inspect;
		this._when = _when;

		// Call the provider resolver to seal the promise's fate
		try {
			resolver(promiseResolve, promiseReject, promiseNotify);
		} catch(e) {
			promiseReject(e);
		}

		/**
		 * Returns a snapshot of this promise's current status at the instant of call
		 * @returns {{state:String}}
		 */
		function inspect() {
			return value ? value.inspect() : toPendingState();
		}

		/**
		 * Private message delivery. Queues and delivers messages to
		 * the promise's ultimate fulfillment value or rejection reason.
		 * @private
		 */
		function _when(resolve, notify, onFulfilled, onRejected, onProgress) {
			consumers ? consumers.push(deliver) : enqueue(function() { deliver(value); });

			function deliver(p) {
				p._when(resolve, notify, onFulfilled, onRejected, onProgress);
			}
		}

		/**
		 * Transition from pre-resolution state to post-resolution state, notifying
		 * all listeners of the ultimate fulfillment or rejection
		 * @param {*} val resolution value
		 */
		function promiseResolve(val) {
			if(!consumers) {
				return;
			}

			var queue = consumers;
			consumers = undef;

			enqueue(function () {
				value = coerce(self, val);
				if(status) {
					updateStatus(value, status);
				}
				runHandlers(queue, value);
			});
		}

		/**
		 * Reject this promise with the supplied reason, which will be used verbatim.
		 * @param {*} reason reason for the rejection
		 */
		function promiseReject(reason) {
			promiseResolve(new RejectedPromise(reason));
		}

		/**
		 * Issue a progress event, notifying all progress listeners
		 * @param {*} update progress event payload to pass to all listeners
		 */
		function promiseNotify(update) {
			if(consumers) {
				var queue = consumers;
				enqueue(function () {
					runHandlers(queue, new ProgressingPromise(update));
				});
			}
		}
	}

	promisePrototype = Promise.prototype;

	/**
	 * Register handlers for this promise.
	 * @param [onFulfilled] {Function} fulfillment handler
	 * @param [onRejected] {Function} rejection handler
	 * @param [onProgress] {Function} progress handler
	 * @return {Promise} new Promise
	 */
	promisePrototype.then = function(onFulfilled, onRejected, onProgress) {
		var self = this;

		return new Promise(function(resolve, reject, notify) {
			self._when(resolve, notify, onFulfilled, onRejected, onProgress);
		}, this._status && this._status.observed());
	};

	/**
	 * Register a rejection handler.  Shortcut for .then(undefined, onRejected)
	 * @param {function?} onRejected
	 * @return {Promise}
	 */
	promisePrototype['catch'] = promisePrototype.otherwise = function(onRejected) {
		return this.then(undef, onRejected);
	};

	/**
	 * Ensures that onFulfilledOrRejected will be called regardless of whether
	 * this promise is fulfilled or rejected.  onFulfilledOrRejected WILL NOT
	 * receive the promises' value or reason.  Any returned value will be disregarded.
	 * onFulfilledOrRejected may throw or return a rejected promise to signal
	 * an additional error.
	 * @param {function} onFulfilledOrRejected handler to be called regardless of
	 *  fulfillment or rejection
	 * @returns {Promise}
	 */
	promisePrototype['finally'] = promisePrototype.ensure = function(onFulfilledOrRejected) {
		return typeof onFulfilledOrRejected === 'function'
			? this.then(injectHandler, injectHandler)['yield'](this)
			: this;

		function injectHandler() {
			return resolve(onFulfilledOrRejected());
		}
	};

	/**
	 * Terminate a promise chain by handling the ultimate fulfillment value or
	 * rejection reason, and assuming responsibility for all errors.  if an
	 * error propagates out of handleResult or handleFatalError, it will be
	 * rethrown to the host, resulting in a loud stack track on most platforms
	 * and a crash on some.
	 * @param {function?} handleResult
	 * @param {function?} handleError
	 * @returns {undefined}
	 */
	promisePrototype.done = function(handleResult, handleError) {
		this.then(handleResult, handleError)['catch'](crash);
	};

	/**
	 * Shortcut for .then(function() { return value; })
	 * @param  {*} value
	 * @return {Promise} a promise that:
	 *  - is fulfilled if value is not a promise, or
	 *  - if value is a promise, will fulfill with its value, or reject
	 *    with its reason.
	 */
	promisePrototype['yield'] = function(value) {
		return this.then(function() {
			return value;
		});
	};

	/**
	 * Runs a side effect when this promise fulfills, without changing the
	 * fulfillment value.
	 * @param {function} onFulfilledSideEffect
	 * @returns {Promise}
	 */
	promisePrototype.tap = function(onFulfilledSideEffect) {
		return this.then(onFulfilledSideEffect)['yield'](this);
	};

	/**
	 * Assumes that this promise will fulfill with an array, and arranges
	 * for the onFulfilled to be called with the array as its argument list
	 * i.e. onFulfilled.apply(undefined, array).
	 * @param {function} onFulfilled function to receive spread arguments
	 * @return {Promise}
	 */
	promisePrototype.spread = function(onFulfilled) {
		return this.then(function(array) {
			// array may contain promises, so resolve its contents.
			return all(array, function(array) {
				return onFulfilled.apply(undef, array);
			});
		});
	};

	/**
	 * Shortcut for .then(onFulfilledOrRejected, onFulfilledOrRejected)
	 * @deprecated
	 */
	promisePrototype.always = function(onFulfilledOrRejected, onProgress) {
		return this.then(onFulfilledOrRejected, onFulfilledOrRejected, onProgress);
	};

	/**
	 * Casts x to a trusted promise. If x is already a trusted promise, it is
	 * returned, otherwise a new trusted Promise which follows x is returned.
	 * @param {*} x
	 * @returns {Promise}
	 */
	function cast(x) {
		return x instanceof Promise ? x : resolve(x);
	}

	/**
	 * Returns a resolved promise. The returned promise will be
	 *  - fulfilled with promiseOrValue if it is a value, or
	 *  - if promiseOrValue is a promise
	 *    - fulfilled with promiseOrValue's value after it is fulfilled
	 *    - rejected with promiseOrValue's reason after it is rejected
	 * In contract to cast(x), this always creates a new Promise
	 * @param  {*} value
	 * @return {Promise}
	 */
	function resolve(value) {
		return promise(function(resolve) {
			resolve(value);
		});
	}

	/**
	 * Returns a rejected promise for the supplied promiseOrValue.  The returned
	 * promise will be rejected with:
	 * - promiseOrValue, if it is a value, or
	 * - if promiseOrValue is a promise
	 *   - promiseOrValue's value after it is fulfilled
	 *   - promiseOrValue's reason after it is rejected
	 * @param {*} promiseOrValue the rejected value of the returned {@link Promise}
	 * @return {Promise} rejected {@link Promise}
	 */
	function reject(promiseOrValue) {
		return when(promiseOrValue, function(e) {
			return new RejectedPromise(e);
		});
	}

	/**
	 * Creates a {promise, resolver} pair, either or both of which
	 * may be given out safely to consumers.
	 * The resolver has resolve, reject, and progress.  The promise
	 * has then plus extended promise API.
	 *
	 * @return {{
	 * promise: Promise,
	 * resolve: function:Promise,
	 * reject: function:Promise,
	 * notify: function:Promise
	 * resolver: {
	 *	resolve: function:Promise,
	 *	reject: function:Promise,
	 *	notify: function:Promise
	 * }}}
	 */
	function defer() {
		var deferred, pending, resolved;

		// Optimize object shape
		deferred = {
			promise: undef, resolve: undef, reject: undef, notify: undef,
			resolver: { resolve: undef, reject: undef, notify: undef }
		};

		deferred.promise = pending = promise(makeDeferred);

		return deferred;

		function makeDeferred(resolvePending, rejectPending, notifyPending) {
			deferred.resolve = deferred.resolver.resolve = function(value) {
				if(resolved) {
					return resolve(value);
				}
				resolved = true;
				resolvePending(value);
				return pending;
			};

			deferred.reject  = deferred.resolver.reject  = function(reason) {
				if(resolved) {
					return resolve(new RejectedPromise(reason));
				}
				resolved = true;
				rejectPending(reason);
				return pending;
			};

			deferred.notify  = deferred.resolver.notify  = function(update) {
				notifyPending(update);
				return update;
			};
		}
	}

	/**
	 * Run a queue of functions as quickly as possible, passing
	 * value to each.
	 */
	function runHandlers(queue, value) {
		for (var i = 0; i < queue.length; i++) {
			queue[i](value);
		}
	}

	/**
	 * Coerces x to a trusted Promise
	 * @param {*} x thing to coerce
	 * @returns {*} Guaranteed to return a trusted Promise.  If x
	 *   is trusted, returns x, otherwise, returns a new, trusted, already-resolved
	 *   Promise whose resolution value is:
	 *   * the resolution value of x if it's a foreign promise, or
	 *   * x if it's a value
	 */
	function coerce(self, x) {
		if (x === self) {
			return new RejectedPromise(new TypeError());
		}

		if (x instanceof Promise) {
			return x;
		}

		try {
			var untrustedThen = x === Object(x) && x.then;

			return typeof untrustedThen === 'function'
				? assimilate(untrustedThen, x)
				: new FulfilledPromise(x);
		} catch(e) {
			return new RejectedPromise(e);
		}
	}

	/**
	 * Safely assimilates a foreign thenable by wrapping it in a trusted promise
	 * @param {function} untrustedThen x's then() method
	 * @param {object|function} x thenable
	 * @returns {Promise}
	 */
	function assimilate(untrustedThen, x) {
		return promise(function (resolve, reject) {
			fcall(untrustedThen, x, resolve, reject);
		});
	}

	makePromisePrototype = Object.create ||
		function(o) {
			function PromisePrototype() {}
			PromisePrototype.prototype = o;
			return new PromisePrototype();
		};

	/**
	 * Creates a fulfilled, local promise as a proxy for a value
	 * NOTE: must never be exposed
	 * @private
	 * @param {*} value fulfillment value
	 * @returns {Promise}
	 */
	function FulfilledPromise(value) {
		this.value = value;
	}

	FulfilledPromise.prototype = makePromisePrototype(promisePrototype);

	FulfilledPromise.prototype.inspect = function() {
		return toFulfilledState(this.value);
	};

	FulfilledPromise.prototype._when = function(resolve, _, onFulfilled) {
		try {
			resolve(typeof onFulfilled === 'function' ? onFulfilled(this.value) : this.value);
		} catch(e) {
			resolve(new RejectedPromise(e));
		}
	};

	/**
	 * Creates a rejected, local promise as a proxy for a value
	 * NOTE: must never be exposed
	 * @private
	 * @param {*} reason rejection reason
	 * @returns {Promise}
	 */
	function RejectedPromise(reason) {
		this.value = reason;
	}

	RejectedPromise.prototype = makePromisePrototype(promisePrototype);

	RejectedPromise.prototype.inspect = function() {
		return toRejectedState(this.value);
	};

	RejectedPromise.prototype._when = function(resolve, _, __, onRejected) {
		try {
			resolve(typeof onRejected === 'function' ? onRejected(this.value) : this);
		} catch(e) {
			resolve(new RejectedPromise(e));
		}
	};

	/**
	 * Create a progress promise with the supplied update.
	 * @private
	 * @param {*} value progress update value
	 * @return {Promise} progress promise
	 */
	function ProgressingPromise(value) {
		this.value = value;
	}

	ProgressingPromise.prototype = makePromisePrototype(promisePrototype);

	ProgressingPromise.prototype._when = function(_, notify, f, r, u) {
		try {
			notify(typeof u === 'function' ? u(this.value) : this.value);
		} catch(e) {
			notify(e);
		}
	};

	/**
	 * Update a PromiseStatus monitor object with the outcome
	 * of the supplied value promise.
	 * @param {Promise} value
	 * @param {PromiseStatus} status
	 */
	function updateStatus(value, status) {
		value.then(statusFulfilled, statusRejected);

		function statusFulfilled() { status.fulfilled(); }
		function statusRejected(r) { status.rejected(r); }
	}

	/**
	 * Determines if x is promise-like, i.e. a thenable object
	 * NOTE: Will return true for *any thenable object*, and isn't truly
	 * safe, since it may attempt to access the `then` property of x (i.e.
	 *  clever/malicious getters may do weird things)
	 * @param {*} x anything
	 * @returns {boolean} true if x is promise-like
	 */
	function isPromiseLike(x) {
		return x && typeof x.then === 'function';
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * howMany of the supplied promisesOrValues have resolved, or will reject when
	 * it becomes impossible for howMany to resolve, for example, when
	 * (promisesOrValues.length - howMany) + 1 input promises reject.
	 *
	 * @param {Array} promisesOrValues array of anything, may contain a mix
	 *      of promises and values
	 * @param howMany {number} number of promisesOrValues to resolve
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise} promise that will resolve to an array of howMany values that
	 *  resolved first, or will reject with an array of
	 *  (promisesOrValues.length - howMany) + 1 rejection reasons.
	 */
	function some(promisesOrValues, howMany, onFulfilled, onRejected, onProgress) {

		return when(promisesOrValues, function(promisesOrValues) {

			return promise(resolveSome).then(onFulfilled, onRejected, onProgress);

			function resolveSome(resolve, reject, notify) {
				var toResolve, toReject, values, reasons, fulfillOne, rejectOne, len, i;

				len = promisesOrValues.length >>> 0;

				toResolve = Math.max(0, Math.min(howMany, len));
				values = [];

				toReject = (len - toResolve) + 1;
				reasons = [];

				// No items in the input, resolve immediately
				if (!toResolve) {
					resolve(values);

				} else {
					rejectOne = function(reason) {
						reasons.push(reason);
						if(!--toReject) {
							fulfillOne = rejectOne = identity;
							reject(reasons);
						}
					};

					fulfillOne = function(val) {
						// This orders the values based on promise resolution order
						values.push(val);
						if (!--toResolve) {
							fulfillOne = rejectOne = identity;
							resolve(values);
						}
					};

					for(i = 0; i < len; ++i) {
						if(i in promisesOrValues) {
							when(promisesOrValues[i], fulfiller, rejecter, notify);
						}
					}
				}

				function rejecter(reason) {
					rejectOne(reason);
				}

				function fulfiller(val) {
					fulfillOne(val);
				}
			}
		});
	}

	/**
	 * Initiates a competitive race, returning a promise that will resolve when
	 * any one of the supplied promisesOrValues has resolved or will reject when
	 * *all* promisesOrValues have rejected.
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise} promise that will resolve to the value that resolved first, or
	 * will reject with an array of all rejected inputs.
	 */
	function any(promisesOrValues, onFulfilled, onRejected, onProgress) {

		function unwrapSingleResult(val) {
			return onFulfilled ? onFulfilled(val[0]) : val[0];
		}

		return some(promisesOrValues, 1, unwrapSingleResult, onRejected, onProgress);
	}

	/**
	 * Return a promise that will resolve only once all the supplied promisesOrValues
	 * have resolved. The resolution value of the returned promise will be an array
	 * containing the resolution values of each of the promisesOrValues.
	 * @memberOf when
	 *
	 * @param {Array|Promise} promisesOrValues array of anything, may contain a mix
	 *      of {@link Promise}s and values
	 * @param {function?} [onFulfilled] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onRejected] DEPRECATED, use returnedPromise.then()
	 * @param {function?} [onProgress] DEPRECATED, use returnedPromise.then()
	 * @returns {Promise}
	 */
	function all(promisesOrValues, onFulfilled, onRejected, onProgress) {
		return _map(promisesOrValues, identity).then(onFulfilled, onRejected, onProgress);
	}

	/**
	 * Joins multiple promises into a single returned promise.
	 * @return {Promise} a promise that will fulfill when *all* the input promises
	 * have fulfilled, or will reject when *any one* of the input promises rejects.
	 */
	function join(/* ...promises */) {
		return _map(arguments, identity);
	}

	/**
	 * Settles all input promises such that they are guaranteed not to
	 * be pending once the returned promise fulfills. The returned promise
	 * will always fulfill, except in the case where `array` is a promise
	 * that rejects.
	 * @param {Array|Promise} array or promise for array of promises to settle
	 * @returns {Promise} promise that always fulfills with an array of
	 *  outcome snapshots for each input promise.
	 */
	function settle(array) {
		return _map(array, toFulfilledState, toRejectedState);
	}

	/**
	 * Promise-aware array map function, similar to `Array.prototype.map()`,
	 * but input array may contain promises or values.
	 * @param {Array|Promise} array array of anything, may contain promises and values
	 * @param {function} mapFunc map function which may return a promise or value
	 * @returns {Promise} promise that will fulfill with an array of mapped values
	 *  or reject if any input promise rejects.
	 */
	function map(array, mapFunc) {
		return _map(array, mapFunc);
	}

	/**
	 * Internal map that allows a fallback to handle rejections
	 * @param {Array|Promise} array array of anything, may contain promises and values
	 * @param {function} mapFunc map function which may return a promise or value
	 * @param {function?} fallback function to handle rejected promises
	 * @returns {Promise} promise that will fulfill with an array of mapped values
	 *  or reject if any input promise rejects.
	 */
	function _map(array, mapFunc, fallback) {
		return when(array, function(array) {

			return new Promise(resolveMap);

			function resolveMap(resolve, reject, notify) {
				var results, len, toResolve, i;

				// Since we know the resulting length, we can preallocate the results
				// array to avoid array expansions.
				toResolve = len = array.length >>> 0;
				results = [];

				if(!toResolve) {
					resolve(results);
					return;
				}

				// Since mapFunc may be async, get all invocations of it into flight
				for(i = 0; i < len; i++) {
					if(i in array) {
						resolveOne(array[i], i);
					} else {
						--toResolve;
					}
				}

				function resolveOne(item, i) {
					when(item, mapFunc, fallback).then(function(mapped) {
						results[i] = mapped;

						if(!--toResolve) {
							resolve(results);
						}
					}, reject, notify);
				}
			}
		});
	}

	/**
	 * Traditional reduce function, similar to `Array.prototype.reduce()`, but
	 * input may contain promises and/or values, and reduceFunc
	 * may return either a value or a promise, *and* initialValue may
	 * be a promise for the starting value.
	 *
	 * @param {Array|Promise} promise array or promise for an array of anything,
	 *      may contain a mix of promises and values.
	 * @param {function} reduceFunc reduce function reduce(currentValue, nextValue, index, total),
	 *      where total is the total number of items being reduced, and will be the same
	 *      in each call to reduceFunc.
	 * @returns {Promise} that will resolve to the final reduced value
	 */
	function reduce(promise, reduceFunc /*, initialValue */) {
		var args = fcall(slice, arguments, 1);

		return when(promise, function(array) {
			var total;

			total = array.length;

			// Wrap the supplied reduceFunc with one that handles promises and then
			// delegates to the supplied.
			args[0] = function (current, val, i) {
				return when(current, function (c) {
					return when(val, function (value) {
						return reduceFunc(c, value, i, total);
					});
				});
			};

			return reduceArray.apply(array, args);
		});
	}

	// Snapshot states

	/**
	 * Creates a fulfilled state snapshot
	 * @private
	 * @param {*} x any value
	 * @returns {{state:'fulfilled',value:*}}
	 */
	function toFulfilledState(x) {
		return { state: 'fulfilled', value: x };
	}

	/**
	 * Creates a rejected state snapshot
	 * @private
	 * @param {*} x any reason
	 * @returns {{state:'rejected',reason:*}}
	 */
	function toRejectedState(x) {
		return { state: 'rejected', reason: x };
	}

	/**
	 * Creates a pending state snapshot
	 * @private
	 * @returns {{state:'pending'}}
	 */
	function toPendingState() {
		return { state: 'pending' };
	}

	//
	// Internals, utilities, etc.
	//

	var promisePrototype, makePromisePrototype, reduceArray, slice, fcall, nextTick, handlerQueue,
		funcProto, call, arrayProto, monitorApi,
		capturedSetTimeout, cjsRequire, MutationObs, undef;

	cjsRequire = require;

	//
	// Shared handler queue processing
	//
	// Credit to Twisol (https://github.com/Twisol) for suggesting
	// this type of extensible queue + trampoline approach for
	// next-tick conflation.

	handlerQueue = [];

	/**
	 * Enqueue a task. If the queue is not currently scheduled to be
	 * drained, schedule it.
	 * @param {function} task
	 */
	function enqueue(task) {
		if(handlerQueue.push(task) === 1) {
			nextTick(drainQueue);
		}
	}

	/**
	 * Drain the handler queue entirely, being careful to allow the
	 * queue to be extended while it is being processed, and to continue
	 * processing until it is truly empty.
	 */
	function drainQueue() {
		runHandlers(handlerQueue);
		handlerQueue = [];
	}

	// Allow attaching the monitor to when() if env has no console
	monitorApi = typeof console !== 'undefined' ? console : when;

	// Sniff "best" async scheduling option
	// Prefer process.nextTick or MutationObserver, then check for
	// vertx and finally fall back to setTimeout
	/*global process,document,setTimeout,MutationObserver,WebKitMutationObserver*/
	if (typeof process === 'object' && process.nextTick) {
		nextTick = process.nextTick;
	} else if(MutationObs =
		(typeof MutationObserver === 'function' && MutationObserver) ||
			(typeof WebKitMutationObserver === 'function' && WebKitMutationObserver)) {
		nextTick = (function(document, MutationObserver, drainQueue) {
			var el = document.createElement('div');
			new MutationObserver(drainQueue).observe(el, { attributes: true });

			return function() {
				el.setAttribute('x', 'x');
			};
		}(document, MutationObs, drainQueue));
	} else {
		try {
			// vert.x 1.x || 2.x
			nextTick = cjsRequire('vertx').runOnLoop || cjsRequire('vertx').runOnContext;
		} catch(ignore) {
			// capture setTimeout to avoid being caught by fake timers
			// used in time based tests
			capturedSetTimeout = setTimeout;
			nextTick = function(t) { capturedSetTimeout(t, 0); };
		}
	}

	//
	// Capture/polyfill function and array utils
	//

	// Safe function calls
	funcProto = Function.prototype;
	call = funcProto.call;
	fcall = funcProto.bind
		? call.bind(call)
		: function(f, context) {
			return f.apply(context, slice.call(arguments, 2));
		};

	// Safe array ops
	arrayProto = [];
	slice = arrayProto.slice;

	// ES5 reduce implementation if native not available
	// See: http://es5.github.com/#x15.4.4.21 as there are many
	// specifics and edge cases.  ES5 dictates that reduce.length === 1
	// This implementation deviates from ES5 spec in the following ways:
	// 1. It does not check if reduceFunc is a Callable
	reduceArray = arrayProto.reduce ||
		function(reduceFunc /*, initialValue */) {
			/*jshint maxcomplexity: 7*/
			var arr, args, reduced, len, i;

			i = 0;
			arr = Object(this);
			len = arr.length >>> 0;
			args = arguments;

			// If no initialValue, use first item of array (we know length !== 0 here)
			// and adjust i to start at second item
			if(args.length <= 1) {
				// Skip to the first real element in the array
				for(;;) {
					if(i in arr) {
						reduced = arr[i++];
						break;
					}

					// If we reached the end of the array without finding any real
					// elements, it's a TypeError
					if(++i >= len) {
						throw new TypeError();
					}
				}
			} else {
				// If initialValue provided, use it
				reduced = args[1];
			}

			// Do the actual reduce
			for(;i < len; ++i) {
				if(i in arr) {
					reduced = reduceFunc(reduced, arr[i], i, arr);
				}
			}

			return reduced;
		};

	function identity(x) {
		return x;
	}

	function crash(fatalError) {
		if(typeof monitorApi.reportUnhandled === 'function') {
			monitorApi.reportUnhandled();
		} else {
			enqueue(function() {
				throw fatalError;
			});
		}

		throw fatalError;
	}

	return when;
});
})(typeof define === 'function' && define.amd ? define : function (factory) { module.exports = factory(require); });

/*! http://mths.be/punycode v1.2.3 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    length,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.3',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('bower_components/URIjs/src/punycode',[],function() {
			return punycode;
		});
	}	else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

/*!
 * URI.js - Mutating URLs
 * IPv6 Support
 *
 * Version: 1.12.1
 *
 * Author: Rodney Rehm
 * Web: http://medialize.github.com/URI.js/
 *
 * Licensed under
 *   MIT License http://www.opensource.org/licenses/mit-license
 *   GPL v3 http://opensource.org/licenses/GPL-3.0
 *
 */
(function (root, factory) {
    // https://github.com/umdjs/umd/blob/master/returnExports.js
    if (typeof exports === 'object') {
        // Node
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define('bower_components/URIjs/src/IPv6',factory);
    } else {
        // Browser globals (root is window)
        root.IPv6 = factory(root);
    }
}(this, function (root) {


/*
var _in = "fe80:0000:0000:0000:0204:61ff:fe9d:f156";
var _out = IPv6.best(_in);
var _expected = "fe80::204:61ff:fe9d:f156";

console.log(_in, _out, _expected, _out === _expected);
*/

// save current IPv6 variable, if any
var _IPv6 = root && root.IPv6;

function best(address) {
    // based on:
    // Javascript to test an IPv6 address for proper format, and to
    // present the "best text representation" according to IETF Draft RFC at
    // http://tools.ietf.org/html/draft-ietf-6man-text-addr-representation-04
    // 8 Feb 2010 Rich Brown, Dartware, LLC
    // Please feel free to use this code as long as you provide a link to
    // http://www.intermapper.com
    // http://intermapper.com/support/tools/IPV6-Validator.aspx
    // http://download.dartware.com/thirdparty/ipv6validator.js

    var _address = address.toLowerCase();
    var segments = _address.split(':');
    var length = segments.length;
    var total = 8;

    // trim colons (:: or ::a:b:c… or …a:b:c::)
    if (segments[0] === '' && segments[1] === '' && segments[2] === '') {
        // must have been ::
        // remove first two items
        segments.shift();
        segments.shift();
    } else if (segments[0] === '' && segments[1] === '') {
        // must have been ::xxxx
        // remove the first item
        segments.shift();
    } else if (segments[length - 1] === '' && segments[length - 2] === '') {
        // must have been xxxx::
        segments.pop();
    }

    length = segments.length;

    // adjust total segments for IPv4 trailer
    if (segments[length - 1].indexOf('.') !== -1) {
        // found a "." which means IPv4
        total = 7;
    }

    // fill empty segments them with "0000"
    var pos;
    for (pos = 0; pos < length; pos++) {
        if (segments[pos] === '') {
            break;
        }
    }

    if (pos < total) {
        segments.splice(pos, 1, '0000');
        while (segments.length < total) {
            segments.splice(pos, 0, '0000');
        }

        length = segments.length;
    }

    // strip leading zeros
    var _segments;
    for (var i = 0; i < total; i++) {
        _segments = segments[i].split("");
        for (var j = 0; j < 3 ; j++) {
            if (_segments[0] === '0' && _segments.length > 1) {
                _segments.splice(0,1);
            } else {
                break;
            }
        }

        segments[i] = _segments.join("");
    }

    // find longest sequence of zeroes and coalesce them into one segment
    var best = -1;
    var _best = 0;
    var _current = 0;
    var current = -1;
    var inzeroes = false;
    // i; already declared

    for (i = 0; i < total; i++) {
        if (inzeroes) {
            if (segments[i] === '0') {
                _current += 1;
            } else {
                inzeroes = false;
                if (_current > _best) {
                    best = current;
                    _best = _current;
                }
            }
        } else {
            if (segments[i] == '0') {
                inzeroes = true;
                current = i;
                _current = 1;
            }
        }
    }

    if (_current > _best) {
        best = current;
        _best = _current;
    }

    if (_best > 1) {
        segments.splice(best, _best, "");
    }

    length = segments.length;

    // assemble remaining segments
    var result = '';
    if (segments[0] === '')  {
        beststr = ":";
    }

    for (i = 0; i < length; i++) {
        result += segments[i];
        if (i === length - 1) {
            break;
        }

        result += ':';
    }

    if (segments[length - 1] === '') {
        result += ":";
    }

    return result;
};

function noConflict(){
    if (root.IPv6 === this) {
        root.IPv6 = _IPv6;
    }
    
    return this;
};

return {
    best: best,
    noConflict: noConflict
};
}));

/*!
 * URI.js - Mutating URLs
 * Second Level Domain (SLD) Support
 *
 * Version: 1.12.1
 *
 * Author: Rodney Rehm
 * Web: http://medialize.github.com/URI.js/
 *
 * Licensed under
 *   MIT License http://www.opensource.org/licenses/mit-license
 *   GPL v3 http://opensource.org/licenses/GPL-3.0
 *
 */

(function (root, factory) {
    // https://github.com/umdjs/umd/blob/master/returnExports.js
    if (typeof exports === 'object') {
        // Node
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define('bower_components/URIjs/src/SecondLevelDomains',factory);
    } else {
        // Browser globals (root is window)
        root.SecondLevelDomains = factory(root);
    }
}(this, function (root) {


// save current SecondLevelDomains variable, if any
var _SecondLevelDomains = root && root.SecondLevelDomains;

var hasOwn = Object.prototype.hasOwnProperty;
var SLD = {
    // list of known Second Level Domains
    // converted list of SLDs from https://github.com/gavingmiller/second-level-domains
    // ----
    // publicsuffix.org is more current and actually used by a couple of browsers internally.
    // downside is it also contains domains like "dyndns.org" - which is fine for the security
    // issues browser have to deal with (SOP for cookies, etc) - but is way overboard for URI.js
    // ----
    list: {
        "ac":"com|gov|mil|net|org",
        "ae":"ac|co|gov|mil|name|net|org|pro|sch",
        "af":"com|edu|gov|net|org",
        "al":"com|edu|gov|mil|net|org",
        "ao":"co|ed|gv|it|og|pb",
        "ar":"com|edu|gob|gov|int|mil|net|org|tur",
        "at":"ac|co|gv|or",
        "au":"asn|com|csiro|edu|gov|id|net|org",
        "ba":"co|com|edu|gov|mil|net|org|rs|unbi|unmo|unsa|untz|unze",
        "bb":"biz|co|com|edu|gov|info|net|org|store|tv",
        "bh":"biz|cc|com|edu|gov|info|net|org",
        "bn":"com|edu|gov|net|org",
        "bo":"com|edu|gob|gov|int|mil|net|org|tv",
        "br":"adm|adv|agr|am|arq|art|ato|b|bio|blog|bmd|cim|cng|cnt|com|coop|ecn|edu|eng|esp|etc|eti|far|flog|fm|fnd|fot|fst|g12|ggf|gov|imb|ind|inf|jor|jus|lel|mat|med|mil|mus|net|nom|not|ntr|odo|org|ppg|pro|psc|psi|qsl|rec|slg|srv|tmp|trd|tur|tv|vet|vlog|wiki|zlg",
        "bs":"com|edu|gov|net|org",
        "bz":"du|et|om|ov|rg",
        "ca":"ab|bc|mb|nb|nf|nl|ns|nt|nu|on|pe|qc|sk|yk",
        "ck":"biz|co|edu|gen|gov|info|net|org",
        "cn":"ac|ah|bj|com|cq|edu|fj|gd|gov|gs|gx|gz|ha|hb|he|hi|hl|hn|jl|js|jx|ln|mil|net|nm|nx|org|qh|sc|sd|sh|sn|sx|tj|tw|xj|xz|yn|zj",
        "co":"com|edu|gov|mil|net|nom|org",
        "cr":"ac|c|co|ed|fi|go|or|sa",
        "cy":"ac|biz|com|ekloges|gov|ltd|name|net|org|parliament|press|pro|tm",
        "do":"art|com|edu|gob|gov|mil|net|org|sld|web",
        "dz":"art|asso|com|edu|gov|net|org|pol",
        "ec":"com|edu|fin|gov|info|med|mil|net|org|pro",
        "eg":"com|edu|eun|gov|mil|name|net|org|sci",
        "er":"com|edu|gov|ind|mil|net|org|rochest|w",
        "es":"com|edu|gob|nom|org",
        "et":"biz|com|edu|gov|info|name|net|org",
        "fj":"ac|biz|com|info|mil|name|net|org|pro",
        "fk":"ac|co|gov|net|nom|org",
        "fr":"asso|com|f|gouv|nom|prd|presse|tm",
        "gg":"co|net|org",
        "gh":"com|edu|gov|mil|org",
        "gn":"ac|com|gov|net|org",
        "gr":"com|edu|gov|mil|net|org",
        "gt":"com|edu|gob|ind|mil|net|org",
        "gu":"com|edu|gov|net|org",
        "hk":"com|edu|gov|idv|net|org",
        "id":"ac|co|go|mil|net|or|sch|web",
        "il":"ac|co|gov|idf|k12|muni|net|org",
        "in":"ac|co|edu|ernet|firm|gen|gov|i|ind|mil|net|nic|org|res",
        "iq":"com|edu|gov|i|mil|net|org",
        "ir":"ac|co|dnssec|gov|i|id|net|org|sch",
        "it":"edu|gov",
        "je":"co|net|org",
        "jo":"com|edu|gov|mil|name|net|org|sch",
        "jp":"ac|ad|co|ed|go|gr|lg|ne|or",
        "ke":"ac|co|go|info|me|mobi|ne|or|sc",
        "kh":"com|edu|gov|mil|net|org|per",
        "ki":"biz|com|de|edu|gov|info|mob|net|org|tel",
        "km":"asso|com|coop|edu|gouv|k|medecin|mil|nom|notaires|pharmaciens|presse|tm|veterinaire",
        "kn":"edu|gov|net|org",
        "kr":"ac|busan|chungbuk|chungnam|co|daegu|daejeon|es|gangwon|go|gwangju|gyeongbuk|gyeonggi|gyeongnam|hs|incheon|jeju|jeonbuk|jeonnam|k|kg|mil|ms|ne|or|pe|re|sc|seoul|ulsan",
        "kw":"com|edu|gov|net|org",
        "ky":"com|edu|gov|net|org",
        "kz":"com|edu|gov|mil|net|org",
        "lb":"com|edu|gov|net|org",
        "lk":"assn|com|edu|gov|grp|hotel|int|ltd|net|ngo|org|sch|soc|web",
        "lr":"com|edu|gov|net|org",
        "lv":"asn|com|conf|edu|gov|id|mil|net|org",
        "ly":"com|edu|gov|id|med|net|org|plc|sch",
        "ma":"ac|co|gov|m|net|org|press",
        "mc":"asso|tm",
        "me":"ac|co|edu|gov|its|net|org|priv",
        "mg":"com|edu|gov|mil|nom|org|prd|tm",
        "mk":"com|edu|gov|inf|name|net|org|pro",
        "ml":"com|edu|gov|net|org|presse",
        "mn":"edu|gov|org",
        "mo":"com|edu|gov|net|org",
        "mt":"com|edu|gov|net|org",
        "mv":"aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|pro",
        "mw":"ac|co|com|coop|edu|gov|int|museum|net|org",
        "mx":"com|edu|gob|net|org",
        "my":"com|edu|gov|mil|name|net|org|sch",
        "nf":"arts|com|firm|info|net|other|per|rec|store|web",
        "ng":"biz|com|edu|gov|mil|mobi|name|net|org|sch",
        "ni":"ac|co|com|edu|gob|mil|net|nom|org",
        "np":"com|edu|gov|mil|net|org",
        "nr":"biz|com|edu|gov|info|net|org",
        "om":"ac|biz|co|com|edu|gov|med|mil|museum|net|org|pro|sch",
        "pe":"com|edu|gob|mil|net|nom|org|sld",
        "ph":"com|edu|gov|i|mil|net|ngo|org",
        "pk":"biz|com|edu|fam|gob|gok|gon|gop|gos|gov|net|org|web",
        "pl":"art|bialystok|biz|com|edu|gda|gdansk|gorzow|gov|info|katowice|krakow|lodz|lublin|mil|net|ngo|olsztyn|org|poznan|pwr|radom|slupsk|szczecin|torun|warszawa|waw|wroc|wroclaw|zgora",
        "pr":"ac|biz|com|edu|est|gov|info|isla|name|net|org|pro|prof",
        "ps":"com|edu|gov|net|org|plo|sec",
        "pw":"belau|co|ed|go|ne|or",
        "ro":"arts|com|firm|info|nom|nt|org|rec|store|tm|www",
        "rs":"ac|co|edu|gov|in|org",
        "sb":"com|edu|gov|net|org",
        "sc":"com|edu|gov|net|org",
        "sh":"co|com|edu|gov|net|nom|org",
        "sl":"com|edu|gov|net|org",
        "st":"co|com|consulado|edu|embaixada|gov|mil|net|org|principe|saotome|store",
        "sv":"com|edu|gob|org|red",
        "sz":"ac|co|org",
        "tr":"av|bbs|bel|biz|com|dr|edu|gen|gov|info|k12|name|net|org|pol|tel|tsk|tv|web",
        "tt":"aero|biz|cat|co|com|coop|edu|gov|info|int|jobs|mil|mobi|museum|name|net|org|pro|tel|travel",
        "tw":"club|com|ebiz|edu|game|gov|idv|mil|net|org",
        "mu":"ac|co|com|gov|net|or|org",
        "mz":"ac|co|edu|gov|org",
        "na":"co|com",
        "nz":"ac|co|cri|geek|gen|govt|health|iwi|maori|mil|net|org|parliament|school",
        "pa":"abo|ac|com|edu|gob|ing|med|net|nom|org|sld",
        "pt":"com|edu|gov|int|net|nome|org|publ",
        "py":"com|edu|gov|mil|net|org",
        "qa":"com|edu|gov|mil|net|org",
        "re":"asso|com|nom",
        "ru":"ac|adygeya|altai|amur|arkhangelsk|astrakhan|bashkiria|belgorod|bir|bryansk|buryatia|cbg|chel|chelyabinsk|chita|chukotka|chuvashia|com|dagestan|e-burg|edu|gov|grozny|int|irkutsk|ivanovo|izhevsk|jar|joshkar-ola|kalmykia|kaluga|kamchatka|karelia|kazan|kchr|kemerovo|khabarovsk|khakassia|khv|kirov|koenig|komi|kostroma|kranoyarsk|kuban|kurgan|kursk|lipetsk|magadan|mari|mari-el|marine|mil|mordovia|mosreg|msk|murmansk|nalchik|net|nnov|nov|novosibirsk|nsk|omsk|orenburg|org|oryol|penza|perm|pp|pskov|ptz|rnd|ryazan|sakhalin|samara|saratov|simbirsk|smolensk|spb|stavropol|stv|surgut|tambov|tatarstan|tom|tomsk|tsaritsyn|tsk|tula|tuva|tver|tyumen|udm|udmurtia|ulan-ude|vladikavkaz|vladimir|vladivostok|volgograd|vologda|voronezh|vrn|vyatka|yakutia|yamal|yekaterinburg|yuzhno-sakhalinsk",
        "rw":"ac|co|com|edu|gouv|gov|int|mil|net",
        "sa":"com|edu|gov|med|net|org|pub|sch",
        "sd":"com|edu|gov|info|med|net|org|tv",
        "se":"a|ac|b|bd|c|d|e|f|g|h|i|k|l|m|n|o|org|p|parti|pp|press|r|s|t|tm|u|w|x|y|z",
        "sg":"com|edu|gov|idn|net|org|per",
        "sn":"art|com|edu|gouv|org|perso|univ",
        "sy":"com|edu|gov|mil|net|news|org",
        "th":"ac|co|go|in|mi|net|or",
        "tj":"ac|biz|co|com|edu|go|gov|info|int|mil|name|net|nic|org|test|web",
        "tn":"agrinet|com|defense|edunet|ens|fin|gov|ind|info|intl|mincom|nat|net|org|perso|rnrt|rns|rnu|tourism",
        "tz":"ac|co|go|ne|or",
        "ua":"biz|cherkassy|chernigov|chernovtsy|ck|cn|co|com|crimea|cv|dn|dnepropetrovsk|donetsk|dp|edu|gov|if|in|ivano-frankivsk|kh|kharkov|kherson|khmelnitskiy|kiev|kirovograd|km|kr|ks|kv|lg|lugansk|lutsk|lviv|me|mk|net|nikolaev|od|odessa|org|pl|poltava|pp|rovno|rv|sebastopol|sumy|te|ternopil|uzhgorod|vinnica|vn|zaporizhzhe|zhitomir|zp|zt",
        "ug":"ac|co|go|ne|or|org|sc",
        "uk":"ac|bl|british-library|co|cym|gov|govt|icnet|jet|lea|ltd|me|mil|mod|national-library-scotland|nel|net|nhs|nic|nls|org|orgn|parliament|plc|police|sch|scot|soc",
        "us":"dni|fed|isa|kids|nsn",
        "uy":"com|edu|gub|mil|net|org",
        "ve":"co|com|edu|gob|info|mil|net|org|web",
        "vi":"co|com|k12|net|org",
        "vn":"ac|biz|com|edu|gov|health|info|int|name|net|org|pro",
        "ye":"co|com|gov|ltd|me|net|org|plc",
        "yu":"ac|co|edu|gov|org",
        "za":"ac|agric|alt|bourse|city|co|cybernet|db|edu|gov|grondar|iaccess|imt|inca|landesign|law|mil|net|ngo|nis|nom|olivetti|org|pix|school|tm|web",
        "zm":"ac|co|com|edu|gov|net|org|sch"
    },
    // SLD expression for each TLD
    //expressions: {},
    // SLD expression for all TLDs
    has_expression: null,
    is_expression: null,
    // validate domain is a known SLD
    has: function(domain) {
        return !!domain.match(SLD.has_expression);
    },
    is: function(domain) {
        return !!domain.match(SLD.is_expression);
    },
    get: function(domain) {
        var t = domain.match(SLD.has_expression);
        return t && t[1] || null;
    },
    noConflict: function(){
      if (root.SecondLevelDomains === this) {
        root.SecondLevelDomains = _SecondLevelDomains;
      }
      return this;
    },
    init: function() {
        var t = '';
        for (var tld in SLD.list) {
            if (!hasOwn.call(SLD.list, tld)) {
                continue;
            }

            var expression = '(' + SLD.list[tld] + ')\.' + tld;
            //SLD.expressions[tld] = new RegExp('\.' + expression + '$', 'i');
            t += '|(' + expression + ')';
        }

        SLD.has_expression = new RegExp('\\.(' + t.substr(1) + ')$', 'i');
        SLD.is_expression = new RegExp('^(' + t.substr(1) + ')$', 'i');
    }
};

SLD.init();

return SLD;
}));

/*!
 * URI.js - Mutating URLs
 *
 * Version: 1.12.1
 *
 * Author: Rodney Rehm
 * Web: http://medialize.github.com/URI.js/
 *
 * Licensed under
 *   MIT License http://www.opensource.org/licenses/mit-license
 *   GPL v3 http://opensource.org/licenses/GPL-3.0
 *
 */
(function (root, factory) {
    // https://github.com/umdjs/umd/blob/master/returnExports.js
    if (typeof exports === 'object') {
        // Node
        module.exports = factory(require('./punycode'), require('./IPv6'), require('./SecondLevelDomains'));
    } else if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define('bower_components/URIjs/src/URI',['./punycode', './IPv6', './SecondLevelDomains'], factory);
    } else {
        // Browser globals (root is window)
        root.URI = factory(root.punycode, root.IPv6, root.SecondLevelDomains, root);
    }
}(this, function (punycode, IPv6, SLD, root) {


// save current URI variable, if any
var _URI = root && root.URI;

function URI(url, base) {
    // Allow instantiation without the 'new' keyword
    if (!(this instanceof URI)) {
        return new URI(url, base);
    }

    if (url === undefined) {
        if (typeof location !== 'undefined') {
            url = location.href + "";
        } else {
            url = "";
        }
    }

    this.href(url);

    // resolve to base according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#constructor
    if (base !== undefined) {
        return this.absoluteTo(base);
    }

    return this;
};

URI.version = '1.12.1';

var p = URI.prototype;
var hasOwn = Object.prototype.hasOwnProperty;

function escapeRegEx(string) {
    // https://github.com/medialize/URI.js/commit/85ac21783c11f8ccab06106dba9735a31a86924d#commitcomment-821963
    return string.replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
}

function getType(value) {
    // IE8 doesn't return [Object Undefined] but [Object Object] for undefined value
    if (value === undefined) {
        return 'Undefined';
    }

    return String(Object.prototype.toString.call(value)).slice(8, -1);
}

function isArray(obj) {
    return getType(obj) === "Array";
}

function filterArrayValues(data, value) {
    var lookup = {};
    var i, length;

    if (isArray(value)) {
        for (i = 0, length = value.length; i < length; i++) {
            lookup[value[i]] = true;
        }
    } else {
        lookup[value] = true;
    }

    for (i = 0, length = data.length; i < length; i++) {
        if (lookup[data[i]] !== undefined) {
            data.splice(i, 1);
            length--;
            i--;
        }
    }

    return data;
}

function arrayContains(list, value) {
    var i, length;
    
    // value may be string, number, array, regexp
    if (isArray(value)) {
        // Note: this can be optimized to O(n) (instead of current O(m * n))
        for (i = 0, length = value.length; i < length; i++) {
            if (!arrayContains(list, value[i])) {
                return false;
            }
        }
        
        return true;
    }
    
    var _type = getType(value);
    for (i = 0, length = list.length; i < length; i++) {
        if (_type === 'RegExp') {
            if (typeof list[i] === 'string' && list[i].match(value)) {
                return true;
            }
        } else if (list[i] === value) {
            return true;
        }
    }

    return false;
}

function arraysEqual(one, two) {
    if (!isArray(one) || !isArray(two)) {
        return false;
    }
    
    // arrays can't be equal if they have different amount of content
    if (one.length !== two.length) {
        return false;
    }

    one.sort();
    two.sort();

    for (var i = 0, l = one.length; i < l; i++) {
        if (one[i] !== two[i]) {
            return false;
        }
    }
    
    return true;
}

URI._parts = function() {
    return {
        protocol: null,
        username: null,
        password: null,
        hostname: null,
        urn: null,
        port: null,
        path: null,
        query: null,
        fragment: null,
        // state
        duplicateQueryParameters: URI.duplicateQueryParameters,
        escapeQuerySpace: URI.escapeQuerySpace
    };
};
// state: allow duplicate query parameters (a=1&a=1)
URI.duplicateQueryParameters = false;
// state: replaces + with %20 (space in query strings)
URI.escapeQuerySpace = true;
// static properties
URI.protocol_expression = /^[a-z][a-z0-9.+-]*$/i;
URI.idn_expression = /[^a-z0-9\.-]/i;
URI.punycode_expression = /(xn--)/i;
// well, 333.444.555.666 matches, but it sure ain't no IPv4 - do we care?
URI.ip4_expression = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
// credits to Rich Brown
// source: http://forums.intermapper.com/viewtopic.php?p=1096#1096
// specification: http://www.ietf.org/rfc/rfc4291.txt
URI.ip6_expression = /^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/;
// expression used is "gruber revised" (@gruber v2) determined to be the
// best solution in a regex-golf we did a couple of ages ago at
// * http://mathiasbynens.be/demo/url-regex
// * http://rodneyrehm.de/t/url-regex.html
URI.find_uri_expression = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/ig;
URI.findUri = {
    // valid "scheme://" or "www."
    start: /\b(?:([a-z][a-z0-9.+-]*:\/\/)|www\.)/gi,
    // everything up to the next whitespace
    end: /[\s\r\n]|$/,
    // trim trailing punctuation captured by end RegExp
    trim: /[`!()\[\]{};:'".,<>?«»“”„‘’]+$/
};
// http://www.iana.org/assignments/uri-schemes.html
// http://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers#Well-known_ports
URI.defaultPorts = {
    http: "80",
    https: "443",
    ftp: "21",
    gopher: "70",
    ws: "80",
    wss: "443"
};
// allowed hostname characters according to RFC 3986
// ALPHA DIGIT "-" "." "_" "~" "!" "$" "&" "'" "(" ")" "*" "+" "," ";" "=" %encoded
// I've never seen a (non-IDN) hostname other than: ALPHA DIGIT . -
URI.invalid_hostname_characters = /[^a-zA-Z0-9\.-]/;
// map DOM Elements to their URI attribute
URI.domAttributes = {
    'a': 'href',
    'blockquote': 'cite',
    'link': 'href',
    'base': 'href',
    'script': 'src',
    'form': 'action',
    'img': 'src',
    'area': 'href',
    'iframe': 'src',
    'embed': 'src',
    'source': 'src',
    'track': 'src',
    'input': 'src' // but only if type="image"
};
URI.getDomAttribute = function(node) {
    if (!node || !node.nodeName) {
        return undefined;
    }
    
    var nodeName = node.nodeName.toLowerCase();
    // <input> should only expose src for type="image"
    if (nodeName === 'input' && node.type !== 'image') {
        return undefined;
    }
    
    return URI.domAttributes[nodeName];
};

function escapeForDumbFirefox36(value) {
    // https://github.com/medialize/URI.js/issues/91
    return escape(value);
}

// encoding / decoding according to RFC3986
function strictEncodeURIComponent(string) {
    // see https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/encodeURIComponent
    return encodeURIComponent(string)
        .replace(/[!'()*]/g, escapeForDumbFirefox36)
        .replace(/\*/g, "%2A");
}
URI.encode = strictEncodeURIComponent;
URI.decode = decodeURIComponent;
URI.iso8859 = function() {
    URI.encode = escape;
    URI.decode = unescape;
};
URI.unicode = function() {
    URI.encode = strictEncodeURIComponent;
    URI.decode = decodeURIComponent;
};
URI.characters = {
    pathname: {
        encode: {
            // RFC3986 2.1: For consistency, URI producers and normalizers should
            // use uppercase hexadecimal digits for all percent-encodings.
            expression: /%(24|26|2B|2C|3B|3D|3A|40)/ig,
            map: {
                // -._~!'()*
                "%24": "$",
                "%26": "&",
                "%2B": "+",
                "%2C": ",",
                "%3B": ";",
                "%3D": "=",
                "%3A": ":",
                "%40": "@"
            }
        },
        decode: {
            expression: /[\/\?#]/g,
            map: {
                "/": "%2F",
                "?": "%3F",
                "#": "%23"
            }
        }
    },
    reserved: {
        encode: {
            // RFC3986 2.1: For consistency, URI producers and normalizers should
            // use uppercase hexadecimal digits for all percent-encodings.
            expression: /%(21|23|24|26|27|28|29|2A|2B|2C|2F|3A|3B|3D|3F|40|5B|5D)/ig,
            map: {
                // gen-delims
                "%3A": ":",
                "%2F": "/",
                "%3F": "?",
                "%23": "#",
                "%5B": "[",
                "%5D": "]",
                "%40": "@",
                // sub-delims
                "%21": "!",
                "%24": "$",
                "%26": "&",
                "%27": "'",
                "%28": "(",
                "%29": ")",
                "%2A": "*",
                "%2B": "+",
                "%2C": ",",
                "%3B": ";",
                "%3D": "="
            }
        }
    }
};
URI.encodeQuery = function(string, escapeQuerySpace) {
    var escaped = URI.encode(string + "");
    if (escapeQuerySpace === undefined) {
        escapeQuerySpace = URI.escapeQuerySpace;
    }

    return escapeQuerySpace ? escaped.replace(/%20/g, '+') : escaped;
};
URI.decodeQuery = function(string, escapeQuerySpace) {
    string += "";
    if (escapeQuerySpace === undefined) {
        escapeQuerySpace = URI.escapeQuerySpace;
    }

    try {
        return URI.decode(escapeQuerySpace ? string.replace(/\+/g, '%20') : string);
    } catch(e) {
        // we're not going to mess with weird encodings,
        // give up and return the undecoded original string
        // see https://github.com/medialize/URI.js/issues/87
        // see https://github.com/medialize/URI.js/issues/92
        return string;
    }
};
URI.recodePath = function(string) {
    var segments = (string + "").split('/');
    for (var i = 0, length = segments.length; i < length; i++) {
        segments[i] = URI.encodePathSegment(URI.decode(segments[i]));
    }

    return segments.join('/');
};
URI.decodePath = function(string) {
    var segments = (string + "").split('/');
    for (var i = 0, length = segments.length; i < length; i++) {
        segments[i] = URI.decodePathSegment(segments[i]);
    }

    return segments.join('/');
};
// generate encode/decode path functions
var _parts = {'encode':'encode', 'decode':'decode'};
var _part;
var generateAccessor = function(_group, _part) {
    return function(string) {
        return URI[_part](string + "").replace(URI.characters[_group][_part].expression, function(c) {
            return URI.characters[_group][_part].map[c];
        });
    };
};

for (_part in _parts) {
    URI[_part + "PathSegment"] = generateAccessor("pathname", _parts[_part]);
}

URI.encodeReserved = generateAccessor("reserved", "encode");

URI.parse = function(string, parts) {
    var pos;
    if (!parts) {
        parts = {};
    }
    // [protocol"://"[username[":"password]"@"]hostname[":"port]"/"?][path]["?"querystring]["#"fragment]

    // extract fragment
    pos = string.indexOf('#');
    if (pos > -1) {
        // escaping?
        parts.fragment = string.substring(pos + 1) || null;
        string = string.substring(0, pos);
    }

    // extract query
    pos = string.indexOf('?');
    if (pos > -1) {
        // escaping?
        parts.query = string.substring(pos + 1) || null;
        string = string.substring(0, pos);
    }

    // extract protocol
    if (string.substring(0, 2) === '//') {
        // relative-scheme
        parts.protocol = null;
        string = string.substring(2);
        // extract "user:pass@host:port"
        string = URI.parseAuthority(string, parts);
    } else {
        pos = string.indexOf(':');
        if (pos > -1) {
            parts.protocol = string.substring(0, pos) || null;
            if (parts.protocol && !parts.protocol.match(URI.protocol_expression)) {
                // : may be within the path
                parts.protocol = undefined;
            } else if (parts.protocol === 'file') {
                // the file scheme: does not contain an authority
                string = string.substring(pos + 3);
            } else if (string.substring(pos + 1, pos + 3) === '//') {
                string = string.substring(pos + 3);

                // extract "user:pass@host:port"
                string = URI.parseAuthority(string, parts);
            } else {
                string = string.substring(pos + 1);
                parts.urn = true;
            }
        }
    }

    // what's left must be the path
    parts.path = string;

    // and we're done
    return parts;
};
URI.parseHost = function(string, parts) {
    // extract host:port
    var pos = string.indexOf('/');
    var bracketPos;
    var t;

    if (pos === -1) {
        pos = string.length;
    }

    if (string.charAt(0) === "[") {
        // IPv6 host - http://tools.ietf.org/html/draft-ietf-6man-text-addr-representation-04#section-6
        // I claim most client software breaks on IPv6 anyways. To simplify things, URI only accepts
        // IPv6+port in the format [2001:db8::1]:80 (for the time being)
        bracketPos = string.indexOf(']');
        parts.hostname = string.substring(1, bracketPos) || null;
        parts.port = string.substring(bracketPos+2, pos) || null;
    } else if (string.indexOf(':') !== string.lastIndexOf(':')) {
        // IPv6 host contains multiple colons - but no port
        // this notation is actually not allowed by RFC 3986, but we're a liberal parser
        parts.hostname = string.substring(0, pos) || null;
        parts.port = null;
    } else {
        t = string.substring(0, pos).split(':');
        parts.hostname = t[0] || null;
        parts.port = t[1] || null;
    }

    if (parts.hostname && string.substring(pos).charAt(0) !== '/') {
        pos++;
        string = "/" + string;
    }

    return string.substring(pos) || '/';
};
URI.parseAuthority = function(string, parts) {
    string = URI.parseUserinfo(string, parts);
    return URI.parseHost(string, parts);
};
URI.parseUserinfo = function(string, parts) {
    // extract username:password
    var firstSlash = string.indexOf('/');
    var pos = firstSlash > -1 
        ? string.lastIndexOf('@', firstSlash) 
        : string.indexOf('@');
    var t;

    // authority@ must come before /path
    if (pos > -1 && (firstSlash === -1 || pos < firstSlash)) {
        t = string.substring(0, pos).split(':');
        parts.username = t[0] ? URI.decode(t[0]) : null;
        t.shift();
        parts.password = t[0] ? URI.decode(t.join(':')) : null;
        string = string.substring(pos + 1);
    } else {
        parts.username = null;
        parts.password = null;
    }

    return string;
};
URI.parseQuery = function(string, escapeQuerySpace) {
    if (!string) {
        return {};
    }

    // throw out the funky business - "?"[name"="value"&"]+
    string = string.replace(/&+/g, '&').replace(/^\?*&*|&+$/g, '');

    if (!string) {
        return {};
    }

    var items = {};
    var splits = string.split('&');
    var length = splits.length;
    var v, name, value;

    for (var i = 0; i < length; i++) {
        v = splits[i].split('=');
        name = URI.decodeQuery(v.shift(), escapeQuerySpace);
        // no "=" is null according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#collect-url-parameters
        value = v.length ? URI.decodeQuery(v.join('='), escapeQuerySpace) : null;

        if (items[name]) {
            if (typeof items[name] === "string") {
                items[name] = [items[name]];
            }

            items[name].push(value);
        } else {
            items[name] = value;
        }
    }

    return items;
};

URI.build = function(parts) {
    var t = "";

    if (parts.protocol) {
        t += parts.protocol + ":";
    }

    if (!parts.urn && (t || parts.hostname)) {
        t += '//';
    }

    t += (URI.buildAuthority(parts) || '');

    if (typeof parts.path === "string") {
        if (parts.path.charAt(0) !== '/' && typeof parts.hostname === "string") {
            t += '/';
        }

        t += parts.path;
    }

    if (typeof parts.query === "string" && parts.query) {
        t += '?' + parts.query;
    }

    if (typeof parts.fragment === "string" && parts.fragment) {
        t += '#' + parts.fragment;
    }
    return t;
};
URI.buildHost = function(parts) {
    var t = "";

    if (!parts.hostname) {
        return "";
    } else if (URI.ip6_expression.test(parts.hostname)) {
        if (parts.port) {
            t += "[" + parts.hostname + "]:" + parts.port;
        } else {
            // don't know if we should always wrap IPv6 in []
            // the RFC explicitly says SHOULD, not MUST.
            t += parts.hostname;
        }
    } else {
        t += parts.hostname;
        if (parts.port) {
            t += ':' + parts.port;
        }
    }

    return t;
};
URI.buildAuthority = function(parts) {
    return URI.buildUserinfo(parts) + URI.buildHost(parts);
};
URI.buildUserinfo = function(parts) {
    var t = "";

    if (parts.username) {
        t += URI.encode(parts.username);

        if (parts.password) {
            t += ':' + URI.encode(parts.password);
        }

        t += "@";
    }

    return t;
};
URI.buildQuery = function(data, duplicateQueryParameters, escapeQuerySpace) {
    // according to http://tools.ietf.org/html/rfc3986 or http://labs.apache.org/webarch/uri/rfc/rfc3986.html
    // being »-._~!$&'()*+,;=:@/?« %HEX and alnum are allowed
    // the RFC explicitly states ?/foo being a valid use case, no mention of parameter syntax!
    // URI.js treats the query string as being application/x-www-form-urlencoded
    // see http://www.w3.org/TR/REC-html40/interact/forms.html#form-content-type

    var t = "";
    var unique, key, i, length;
    for (key in data) {
        if (hasOwn.call(data, key) && key) {
            if (isArray(data[key])) {
                unique = {};
                for (i = 0, length = data[key].length; i < length; i++) {
                    if (data[key][i] !== undefined && unique[data[key][i] + ""] === undefined) {
                        t += "&" + URI.buildQueryParameter(key, data[key][i], escapeQuerySpace);
                        if (duplicateQueryParameters !== true) {
                            unique[data[key][i] + ""] = true;
                        }
                    }
                }
            } else if (data[key] !== undefined) {
                t += '&' + URI.buildQueryParameter(key, data[key], escapeQuerySpace);
            }
        }
    }

    return t.substring(1);
};
URI.buildQueryParameter = function(name, value, escapeQuerySpace) {
    // http://www.w3.org/TR/REC-html40/interact/forms.html#form-content-type -- application/x-www-form-urlencoded
    // don't append "=" for null values, according to http://dvcs.w3.org/hg/url/raw-file/tip/Overview.html#url-parameter-serialization
    return URI.encodeQuery(name, escapeQuerySpace) + (value !== null ? "=" + URI.encodeQuery(value, escapeQuerySpace) : "");
};

URI.addQuery = function(data, name, value) {
    if (typeof name === "object") {
        for (var key in name) {
            if (hasOwn.call(name, key)) {
                URI.addQuery(data, key, name[key]);
            }
        }
    } else if (typeof name === "string") {
        if (data[name] === undefined) {
            data[name] = value;
            return;
        } else if (typeof data[name] === "string") {
            data[name] = [data[name]];
        }

        if (!isArray(value)) {
            value = [value];
        }

        data[name] = data[name].concat(value);
    } else {
        throw new TypeError("URI.addQuery() accepts an object, string as the name parameter");
    }
};
URI.removeQuery = function(data, name, value) {
    var i, length, key;
    
    if (isArray(name)) {
        for (i = 0, length = name.length; i < length; i++) {
            data[name[i]] = undefined;
        }
    } else if (typeof name === "object") {
        for (key in name) {
            if (hasOwn.call(name, key)) {
                URI.removeQuery(data, key, name[key]);
            }
        }
    } else if (typeof name === "string") {
        if (value !== undefined) {
            if (data[name] === value) {
                data[name] = undefined;
            } else if (isArray(data[name])) {
                data[name] = filterArrayValues(data[name], value);
            }
        } else {
            data[name] = undefined;
        }
    } else {
        throw new TypeError("URI.addQuery() accepts an object, string as the first parameter");
    }
};
URI.hasQuery = function(data, name, value, withinArray) {
    if (typeof name === "object") {
        for (var key in name) {
            if (hasOwn.call(name, key)) {
                if (!URI.hasQuery(data, key, name[key])) {
                    return false;
                }
            }
        }
        
        return true;
    } else if (typeof name !== "string") {
        throw new TypeError("URI.hasQuery() accepts an object, string as the name parameter");
    }

    switch (getType(value)) {
        case 'Undefined':
            // true if exists (but may be empty)
            return name in data; // data[name] !== undefined;

        case 'Boolean':
            // true if exists and non-empty
            var _booly = Boolean(isArray(data[name]) ? data[name].length : data[name]);
            return value === _booly;

        case 'Function':
            // allow complex comparison
            return !!value(data[name], name, data);

        case 'Array':
            if (!isArray(data[name])) {
                return false;
            }

            var op = withinArray ? arrayContains : arraysEqual;
            return op(data[name], value);

        case 'RegExp':
            if (!isArray(data[name])) {
                return Boolean(data[name] && data[name].match(value));
            }

            if (!withinArray) {
                return false;
            }

            return arrayContains(data[name], value);

        case 'Number':
            value = String(value);
            // omit break;
        case 'String':
            if (!isArray(data[name])) {
                return data[name] === value;
            }

            if (!withinArray) {
                return false;
            }

            return arrayContains(data[name], value);

        default:
            throw new TypeError("URI.hasQuery() accepts undefined, boolean, string, number, RegExp, Function as the value parameter");
    }
};


URI.commonPath = function(one, two) {
    var length = Math.min(one.length, two.length);
    var pos;

    // find first non-matching character
    for (pos = 0; pos < length; pos++) {
        if (one.charAt(pos) !== two.charAt(pos)) {
            pos--;
            break;
        }
    }

    if (pos < 1) {
        return one.charAt(0) === two.charAt(0) && one.charAt(0) === '/' ? '/' : '';
    }
    
    // revert to last /
    if (one.charAt(pos) !== '/' || two.charAt(pos) !== '/') {
        pos = one.substring(0, pos).lastIndexOf('/');
    }

    return one.substring(0, pos + 1);
};

URI.withinString = function(string, callback, options) {
    options || (options = {});
    var _start = options.start || URI.findUri.start;
    var _end = options.end || URI.findUri.end;
    var _trim = options.trim || URI.findUri.trim;
    var _attributeOpen = /[a-z0-9-]=["']?$/i;

    _start.lastIndex = 0;
    while (true) {
        var match = _start.exec(string);
        if (!match) {
            break;
        }
        
        var start = match.index;
        if (options.ignoreHtml) {
            // attribut(e=["']?$)
            var attributeOpen = string.slice(Math.max(start - 3, 0), start);
            if (attributeOpen && _attributeOpen.test(attributeOpen)) {
                continue;
            }
        }
        
        var end = start + string.slice(start).search(_end);
        var slice = string.slice(start, end).replace(_trim, '');
        if (options.ignore && options.ignore.test(slice)) {
            continue;
        }
        
        end = start + slice.length;
        var result = callback(slice, start, end, string);
        string = string.slice(0, start) + result + string.slice(end);
        _start.lastIndex = start + result.length;
    }

    _start.lastIndex = 0;
    return string;
};

URI.ensureValidHostname = function(v) {
    // Theoretically URIs allow percent-encoding in Hostnames (according to RFC 3986)
    // they are not part of DNS and therefore ignored by URI.js

    if (v.match(URI.invalid_hostname_characters)) {
        // test punycode
        if (!punycode) {
            throw new TypeError("Hostname '" + v + "' contains characters other than [A-Z0-9.-] and Punycode.js is not available");
        }

        if (punycode.toASCII(v).match(URI.invalid_hostname_characters)) {
            throw new TypeError("Hostname '" + v + "' contains characters other than [A-Z0-9.-]");
        }
    }
};

// noConflict
URI.noConflict = function(removeAll) {
    if (removeAll) {
        var unconflicted = {
            URI: this.noConflict()
        };

        if (URITemplate && typeof URITemplate.noConflict == "function") {
            unconflicted.URITemplate = URITemplate.noConflict();
        }

        if (IPv6 && typeof IPv6.noConflict == "function") {
            unconflicted.IPv6 = IPv6.noConflict();
        }

        if (SecondLevelDomains && typeof SecondLevelDomains.noConflict == "function") {
            unconflicted.SecondLevelDomains = SecondLevelDomains.noConflict();
        }

        return unconflicted;
    } else if (root.URI === this) {
        root.URI = _URI;
    }

    return this;
};

p.build = function(deferBuild) {
    if (deferBuild === true) {
        this._deferred_build = true;
    } else if (deferBuild === undefined || this._deferred_build) {
        this._string = URI.build(this._parts);
        this._deferred_build = false;
    }

    return this;
};

p.clone = function() {
    return new URI(this);
};

p.valueOf = p.toString = function() {
    return this.build(false)._string;
};

// generate simple accessors
_parts = {protocol: 'protocol', username: 'username', password: 'password', hostname: 'hostname',  port: 'port'};
generateAccessor = function(_part){
    return function(v, build) {
        if (v === undefined) {
            return this._parts[_part] || "";
        } else {
            this._parts[_part] = v || null;
            this.build(!build);
            return this;
        }
    };
};

for (_part in _parts) {                                                                                                                                                                                        
    p[_part] = generateAccessor(_parts[_part]);
}

// generate accessors with optionally prefixed input
_parts = {query: '?', fragment: '#'};
generateAccessor = function(_part, _key){
    return function(v, build) {
        if (v === undefined) {
            return this._parts[_part] || "";
        } else {
            if (v !== null) {
                v = v + "";
                if (v.charAt(0) === _key) {
                    v = v.substring(1);
                }
            }

            this._parts[_part] = v;
            this.build(!build);
            return this;
        }
    };
};

for (_part in _parts) {
    p[_part] = generateAccessor(_part, _parts[_part]);
}

// generate accessors with prefixed output
_parts = {search: ['?', 'query'], hash: ['#', 'fragment']};
generateAccessor = function(_part, _key){
    return function(v, build) {
        var t = this[_part](v, build);
        return typeof t === "string" && t.length ? (_key + t) : t;
    };
};

for (_part in _parts) {
    p[_part] = generateAccessor(_parts[_part][1], _parts[_part][0]);
}

p.pathname = function(v, build) {
    if (v === undefined || v === true) {
        var res = this._parts.path || (this._parts.hostname ? '/' : '');
        return v ? URI.decodePath(res) : res;
    } else {
        this._parts.path = v ? URI.recodePath(v) : "/";
        this.build(!build);
        return this;
    }
};
p.path = p.pathname;
p.href = function(href, build) {
    var key;
    
    if (href === undefined) {
        return this.toString();
    }

    this._string = "";
    this._parts = URI._parts();

    var _URI = href instanceof URI;
    var _object = typeof href === "object" && (href.hostname || href.path || href.pathname);
    if (href.nodeName) {
        var attribute = URI.getDomAttribute(href);
        href = href[attribute] || "";
        _object = false;
    }
    
    // window.location is reported to be an object, but it's not the sort
    // of object we're looking for: 
    // * location.protocol ends with a colon
    // * location.query != object.search
    // * location.hash != object.fragment
    // simply serializing the unknown object should do the trick 
    // (for location, not for everything...)
    if (!_URI && _object && href.pathname !== undefined) {
        href = href.toString();
    }

    if (typeof href === "string") {
        this._parts = URI.parse(href, this._parts);
    } else if (_URI || _object) {
        var src = _URI ? href._parts : href;
        for (key in src) {
            if (hasOwn.call(this._parts, key)) {
                this._parts[key] = src[key];
            }
        }
    } else {
        throw new TypeError("invalid input");
    }

    this.build(!build);
    return this;
};

// identification accessors
p.is = function(what) {
    var ip = false;
    var ip4 = false;
    var ip6 = false;
    var name = false;
    var sld = false;
    var idn = false;
    var punycode = false;
    var relative = !this._parts.urn;

    if (this._parts.hostname) {
        relative = false;
        ip4 = URI.ip4_expression.test(this._parts.hostname);
        ip6 = URI.ip6_expression.test(this._parts.hostname);
        ip = ip4 || ip6;
        name = !ip;
        sld = name && SLD && SLD.has(this._parts.hostname);
        idn = name && URI.idn_expression.test(this._parts.hostname);
        punycode = name && URI.punycode_expression.test(this._parts.hostname);
    }

    switch (what.toLowerCase()) {
        case 'relative':
            return relative;

        case 'absolute':
            return !relative;

        // hostname identification
        case 'domain':
        case 'name':
            return name;

        case 'sld':
            return sld;

        case 'ip':
            return ip;

        case 'ip4':
        case 'ipv4':
        case 'inet4':
            return ip4;

        case 'ip6':
        case 'ipv6':
        case 'inet6':
            return ip6;

        case 'idn':
            return idn;

        case 'url':
            return !this._parts.urn;

        case 'urn':
            return !!this._parts.urn;

        case 'punycode':
            return punycode;
    }

    return null;
};

// component specific input validation
var _protocol = p.protocol;
var _port = p.port;
var _hostname = p.hostname;

p.protocol = function(v, build) {
    if (v !== undefined) {
        if (v) {
            // accept trailing ://
            v = v.replace(/:(\/\/)?$/, '');

            if (!v.match(URI.protocol_expression)) {
                throw new TypeError("Protocol '" + v + "' contains characters other than [A-Z0-9.+-] or doesn't start with [A-Z]");
            }
        }
    }
    return _protocol.call(this, v, build);
};
p.scheme = p.protocol;
p.port = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v !== undefined) {
        if (v === 0) {
            v = null;
        }

        if (v) {
            v += "";
            if (v.charAt(0) === ":") {
                v = v.substring(1);
            }

            if (v.match(/[^0-9]/)) {
                throw new TypeError("Port '" + v + "' contains characters other than [0-9]");
            }
        }
    }
    return _port.call(this, v, build);
};
p.hostname = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v !== undefined) {
        var x = {};
        URI.parseHost(v, x);
        v = x.hostname;
    }
    return _hostname.call(this, v, build);
};

// compound accessors
p.host = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined) {
        return this._parts.hostname ? URI.buildHost(this._parts) : "";
    } else {
        URI.parseHost(v, this._parts);
        this.build(!build);
        return this;
    }
};
p.authority = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined) {
        return this._parts.hostname ? URI.buildAuthority(this._parts) : "";
    } else {
        URI.parseAuthority(v, this._parts);
        this.build(!build);
        return this;
    }
};
p.userinfo = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined) {
        if (!this._parts.username) {
            return "";
        }

        var t = URI.buildUserinfo(this._parts);
        return t.substring(0, t.length -1);
    } else {
        if (v[v.length-1] !== '@') {
            v += '@';
        }

        URI.parseUserinfo(v, this._parts);
        this.build(!build);
        return this;
    }
};
p.resource = function(v, build) {
    var parts;
    
    if (v === undefined) {
        return this.path() + this.search() + this.hash();
    }
    
    parts = URI.parse(v);
    this._parts.path = parts.path;
    this._parts.query = parts.query;
    this._parts.fragment = parts.fragment;
    this.build(!build);
    return this;
};

// fraction accessors
p.subdomain = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    // convenience, return "www" from "www.example.org"
    if (v === undefined) {
        if (!this._parts.hostname || this.is('IP')) {
            return "";
        }

        // grab domain and add another segment
        var end = this._parts.hostname.length - this.domain().length - 1;
        return this._parts.hostname.substring(0, end) || "";
    } else {
        var e = this._parts.hostname.length - this.domain().length;
        var sub = this._parts.hostname.substring(0, e);
        var replace = new RegExp('^' + escapeRegEx(sub));

        if (v && v.charAt(v.length - 1) !== '.') {
            v += ".";
        }

        if (v) {
            URI.ensureValidHostname(v);
        }

        this._parts.hostname = this._parts.hostname.replace(replace, v);
        this.build(!build);
        return this;
    }
};
p.domain = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (typeof v === 'boolean') {
        build = v;
        v = undefined;
    }

    // convenience, return "example.org" from "www.example.org"
    if (v === undefined) {
        if (!this._parts.hostname || this.is('IP')) {
            return "";
        }

        // if hostname consists of 1 or 2 segments, it must be the domain
        var t = this._parts.hostname.match(/\./g);
        if (t && t.length < 2) {
            return this._parts.hostname;
        }

        // grab tld and add another segment
        var end = this._parts.hostname.length - this.tld(build).length - 1;
        end = this._parts.hostname.lastIndexOf('.', end -1) + 1;
        return this._parts.hostname.substring(end) || "";
    } else {
        if (!v) {
            throw new TypeError("cannot set domain empty");
        }

        URI.ensureValidHostname(v);

        if (!this._parts.hostname || this.is('IP')) {
            this._parts.hostname = v;
        } else {
            var replace = new RegExp(escapeRegEx(this.domain()) + "$");
            this._parts.hostname = this._parts.hostname.replace(replace, v);
        }

        this.build(!build);
        return this;
    }
};
p.tld = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (typeof v === 'boolean') {
        build = v;
        v = undefined;
    }

    // return "org" from "www.example.org"
    if (v === undefined) {
        if (!this._parts.hostname || this.is('IP')) {
            return "";
        }

        var pos = this._parts.hostname.lastIndexOf('.');
        var tld = this._parts.hostname.substring(pos + 1);

        if (build !== true && SLD && SLD.list[tld.toLowerCase()]) {
            return SLD.get(this._parts.hostname) || tld;
        }

        return tld;
    } else {
        var replace;
        
        if (!v) {
            throw new TypeError("cannot set TLD empty");
        } else if (v.match(/[^a-zA-Z0-9-]/)) {
            if (SLD && SLD.is(v)) {
                replace = new RegExp(escapeRegEx(this.tld()) + "$");
                this._parts.hostname = this._parts.hostname.replace(replace, v);
            } else {
                throw new TypeError("TLD '" + v + "' contains characters other than [A-Z0-9]");
            }
        } else if (!this._parts.hostname || this.is('IP')) {
            throw new ReferenceError("cannot set TLD on non-domain host");
        } else {
            replace = new RegExp(escapeRegEx(this.tld()) + "$");
            this._parts.hostname = this._parts.hostname.replace(replace, v);
        }

        this.build(!build);
        return this;
    }
};
p.directory = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined || v === true) {
        if (!this._parts.path && !this._parts.hostname) {
            return '';
        }

        if (this._parts.path === '/') {
            return '/';
        }

        var end = this._parts.path.length - this.filename().length - 1;
        var res = this._parts.path.substring(0, end) || (this._parts.hostname ? "/" : "");

        return v ? URI.decodePath(res) : res;

    } else {
        var e = this._parts.path.length - this.filename().length;
        var directory = this._parts.path.substring(0, e);
        var replace = new RegExp('^' + escapeRegEx(directory));

        // fully qualifier directories begin with a slash
        if (!this.is('relative')) {
            if (!v) {
                v = '/';
            }

            if (v.charAt(0) !== '/') {
                v = "/" + v;
            }
        }

        // directories always end with a slash
        if (v && v.charAt(v.length - 1) !== '/') {
            v += '/';
        }

        v = URI.recodePath(v);
        this._parts.path = this._parts.path.replace(replace, v);
        this.build(!build);
        return this;
    }
};
p.filename = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined || v === true) {
        if (!this._parts.path || this._parts.path === '/') {
            return "";
        }

        var pos = this._parts.path.lastIndexOf('/');
        var res = this._parts.path.substring(pos+1);

        return v ? URI.decodePathSegment(res) : res;
    } else {
        var mutatedDirectory = false;
        
        if (v.charAt(0) === '/') {
            v = v.substring(1);
        }

        if (v.match(/\.?\//)) {
            mutatedDirectory = true;
        }

        var replace = new RegExp(escapeRegEx(this.filename()) + "$");
        v = URI.recodePath(v);
        this._parts.path = this._parts.path.replace(replace, v);

        if (mutatedDirectory) {
            this.normalizePath(build);
        } else {
            this.build(!build);
        }

        return this;
    }
};
p.suffix = function(v, build) {
    if (this._parts.urn) {
        return v === undefined ? '' : this;
    }

    if (v === undefined || v === true) {
        if (!this._parts.path || this._parts.path === '/') {
            return "";
        }

        var filename = this.filename();
        var pos = filename.lastIndexOf('.');
        var s, res;

        if (pos === -1) {
            return "";
        }

        // suffix may only contain alnum characters (yup, I made this up.)
        s = filename.substring(pos+1);
        res = (/^[a-z0-9%]+$/i).test(s) ? s : "";
        return v ? URI.decodePathSegment(res) : res;
    } else {
        if (v.charAt(0) === '.') {
            v = v.substring(1);
        }

        var suffix = this.suffix();
        var replace;

        if (!suffix) {
            if (!v) {
                return this;
            }

            this._parts.path += '.' + URI.recodePath(v);
        } else if (!v) {
            replace = new RegExp(escapeRegEx("." + suffix) + "$");
        } else {
            replace = new RegExp(escapeRegEx(suffix) + "$");
        }

        if (replace) {
            v = URI.recodePath(v);
            this._parts.path = this._parts.path.replace(replace, v);
        }

        this.build(!build);
        return this;
    }
};
p.segment = function(segment, v, build) {
    var separator = this._parts.urn ? ':' : '/';
    var path = this.path();
    var absolute = path.substring(0, 1) === '/';
    var segments = path.split(separator);

    if (segment !== undefined && typeof segment !== 'number') {
        build = v;
        v = segment;
        segment = undefined;
    }

    if (segment !== undefined && typeof segment !== 'number') {
        throw new Error("Bad segment '" + segment + "', must be 0-based integer");
    }

    if (absolute) {
        segments.shift();
    }

    if (segment < 0) {
        // allow negative indexes to address from the end
        segment = Math.max(segments.length + segment, 0);
    }

    if (v === undefined) {
        return segment === undefined
            ? segments
            : segments[segment];
    } else if (segment === null || segments[segment] === undefined) {
        if (isArray(v)) {
            segments = [];
            // collapse empty elements within array
            for (var i=0, l=v.length; i < l; i++) {
                if (!v[i].length && (!segments.length || !segments[segments.length -1].length)) {
                    continue;
                }
                
                if (segments.length && !segments[segments.length -1].length) {
                    segments.pop();
                }
                
                segments.push(v[i]);
            }
        } else if (v || (typeof v === "string")) {
            if (segments[segments.length -1] === "") {
                // empty trailing elements have to be overwritten
                // to prevent results such as /foo//bar
                segments[segments.length -1] = v;
            } else {
                segments.push(v);
            }
        }
    } else {
        if (v || (typeof v === "string" && v.length)) {
            segments[segment] = v;
        } else {
            segments.splice(segment, 1);
        }
    }

    if (absolute) {
        segments.unshift("");
    }

    return this.path(segments.join(separator), build);
};
p.segmentCoded = function(segment, v, build) {
    var segments, i, l;

    if (typeof segment !== 'number') {
        build = v;
        v = segment;
        segment = undefined;
    }

    if (v === undefined) {
        segments = this.segment(segment, v, build);
        if (!isArray(segments)) {
            segments = segments !== undefined ? URI.decode(segments) : undefined;
        } else {
            for (i = 0, l = segments.length; i < l; i++) {
                segments[i] = URI.decode(segments[i]);
            }
        }

        return segments;
    }

    if (!isArray(v)) {
        v = typeof v === 'string' ? URI.encode(v) : v;
    } else {
        for (i = 0, l = v.length; i < l; i++) {
            v[i] = URI.decode(v[i]);
        }
    }

    return this.segment(segment, v, build);
};

// mutating query string
var q = p.query;
p.query = function(v, build) {
    if (v === true) {
        return URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    } else if (typeof v === "function") {
        var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
        var result = v.call(this, data);
        this._parts.query = URI.buildQuery(result || data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
        this.build(!build);
        return this;
    } else if (v !== undefined && typeof v !== "string") {
        this._parts.query = URI.buildQuery(v, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
        this.build(!build);
        return this;
    } else {
        return q.call(this, v, build);
    }
};
p.setQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    
    if (typeof name === "object") {
        for (var key in name) {
            if (hasOwn.call(name, key)) {
                data[key] = name[key];
            }
        }
    } else if (typeof name === "string") {
        data[name] = value !== undefined ? value : null;
    } else {
        throw new TypeError("URI.addQuery() accepts an object, string as the name parameter");
    }
    
    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== "string") {
        build = value;
    }

    this.build(!build);
    return this;
};
p.addQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    URI.addQuery(data, name, value === undefined ? null : value);
    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== "string") {
        build = value;
    }

    this.build(!build);
    return this;
};
p.removeQuery = function(name, value, build) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    URI.removeQuery(data, name, value);
    this._parts.query = URI.buildQuery(data, this._parts.duplicateQueryParameters, this._parts.escapeQuerySpace);
    if (typeof name !== "string") {
        build = value;
    }

    this.build(!build);
    return this;
};
p.hasQuery = function(name, value, withinArray) {
    var data = URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace);
    return URI.hasQuery(data, name, value, withinArray);
};
p.setSearch = p.setQuery;
p.addSearch = p.addQuery;
p.removeSearch = p.removeQuery;
p.hasSearch = p.hasQuery;

// sanitizing URLs
p.normalize = function() {
    if (this._parts.urn) {
        return this
            .normalizeProtocol(false)
            .normalizeQuery(false)
            .normalizeFragment(false)
            .build();
    }

    return this
        .normalizeProtocol(false)
        .normalizeHostname(false)
        .normalizePort(false)
        .normalizePath(false)
        .normalizeQuery(false)
        .normalizeFragment(false)
        .build();
};
p.normalizeProtocol = function(build) {
    if (typeof this._parts.protocol === "string") {
        this._parts.protocol = this._parts.protocol.toLowerCase();
        this.build(!build);
    }

    return this;
};
p.normalizeHostname = function(build) {
    if (this._parts.hostname) {
        if (this.is('IDN') && punycode) {
            this._parts.hostname = punycode.toASCII(this._parts.hostname);
        } else if (this.is('IPv6') && IPv6) {
            this._parts.hostname = IPv6.best(this._parts.hostname);
        }

        this._parts.hostname = this._parts.hostname.toLowerCase();
        this.build(!build);
    }

    return this;
};
p.normalizePort = function(build) {
    // remove port of it's the protocol's default
    if (typeof this._parts.protocol === "string" && this._parts.port === URI.defaultPorts[this._parts.protocol]) {
        this._parts.port = null;
        this.build(!build);
    }

    return this;
};
p.normalizePath = function(build) {
    if (this._parts.urn) {
        return this;
    }

    if (!this._parts.path || this._parts.path === '/') {
        return this;
    }

    var _was_relative;
    var _path = this._parts.path;
    var _leadingParents = '';
    var _parent, _pos;

    // handle relative paths
    if (_path.charAt(0) !== '/') {
        _was_relative = true;
        _path = '/' + _path;
    }

    // resolve simples
    _path = _path
        .replace(/(\/(\.\/)+)|(\/\.$)/g, '/')
        .replace(/\/{2,}/g, '/');

    // remember leading parents
    if (_was_relative) {
        _leadingParents = _path.substring(1).match(/^(\.\.\/)+/) || '';
        if (_leadingParents) {
            _leadingParents = _leadingParents[0];
        }
    }

    // resolve parents
    while (true) {
        _parent = _path.indexOf('/..');
        if (_parent === -1) {
            // no more ../ to resolve
            break;
        } else if (_parent === 0) {
            // top level cannot be relative, skip it
            _path = _path.substring(3);
            continue;
        }

        _pos = _path.substring(0, _parent).lastIndexOf('/');
        if (_pos === -1) {
            _pos = _parent;
        }
        _path = _path.substring(0, _pos) + _path.substring(_parent + 3);
    }

    // revert to relative
    if (_was_relative && this.is('relative')) {
        _path = _leadingParents + _path.substring(1);
    }

    _path = URI.recodePath(_path);
    this._parts.path = _path;
    this.build(!build);
    return this;
};
p.normalizePathname = p.normalizePath;
p.normalizeQuery = function(build) {
    if (typeof this._parts.query === "string") {
        if (!this._parts.query.length) {
            this._parts.query = null;
        } else {
            this.query(URI.parseQuery(this._parts.query, this._parts.escapeQuerySpace));
        }

        this.build(!build);
    }

    return this;
};
p.normalizeFragment = function(build) {
    if (!this._parts.fragment) {
        this._parts.fragment = null;
        this.build(!build);
    }

    return this;
};
p.normalizeSearch = p.normalizeQuery;
p.normalizeHash = p.normalizeFragment;

p.iso8859 = function() {
    // expect unicode input, iso8859 output
    var e = URI.encode;
    var d = URI.decode;

    URI.encode = escape;
    URI.decode = decodeURIComponent;
    this.normalize();
    URI.encode = e;
    URI.decode = d;
    return this;
};

p.unicode = function() {
    // expect iso8859 input, unicode output
    var e = URI.encode;
    var d = URI.decode;

    URI.encode = strictEncodeURIComponent;
    URI.decode = unescape;
    this.normalize();
    URI.encode = e;
    URI.decode = d;
    return this;
};

p.readable = function() {
    var uri = this.clone();
    // removing username, password, because they shouldn't be displayed according to RFC 3986
    uri.username("").password("").normalize();
    var t = '';
    if (uri._parts.protocol) {
        t += uri._parts.protocol + '://';
    }

    if (uri._parts.hostname) {
        if (uri.is('punycode') && punycode) {
            t += punycode.toUnicode(uri._parts.hostname);
            if (uri._parts.port) {
                t += ":" + uri._parts.port;
            }
        } else {
            t += uri.host();
        }
    }

    if (uri._parts.hostname && uri._parts.path && uri._parts.path.charAt(0) !== '/') {
        t += '/';
    }

    t += uri.path(true);
    if (uri._parts.query) {
        var q = '';
        for (var i = 0, qp = uri._parts.query.split('&'), l = qp.length; i < l; i++) {
            var kv = (qp[i] || "").split('=');
            q += '&' + URI.decodeQuery(kv[0], this._parts.escapeQuerySpace)
                .replace(/&/g, '%26');

            if (kv[1] !== undefined) {
                q += "=" + URI.decodeQuery(kv[1], this._parts.escapeQuerySpace)
                    .replace(/&/g, '%26');
            }
        }
        t += '?' + q.substring(1);
    }

    t += URI.decodeQuery(uri.hash(), true);
    return t;
};

// resolving relative and absolute URLs
p.absoluteTo = function(base) {
    var resolved = this.clone();
    var properties = ['protocol', 'username', 'password', 'hostname', 'port'];
    var basedir, i, p;

    if (this._parts.urn) {
        throw new Error('URNs do not have any generally defined hierarchical components');
    }

    if (!(base instanceof URI)) {
        base = new URI(base);
    }
    
    if (!resolved._parts.protocol) {
        resolved._parts.protocol = base._parts.protocol;
    }
    
    if (this._parts.hostname) {
        return resolved;
    }

    for (i = 0; p = properties[i]; i++) {
        resolved._parts[p] = base._parts[p];
    }
    
    if (!resolved._parts.path) {
        resolved._parts.path = base._parts.path;
        if (!resolved._parts.query) {
            resolved._parts.query = base._parts.query;
        }
    } else if (resolved._parts.path.substring(-2) === '..') {
        resolved._parts.path += '/';
    }
    
    if (resolved.path().charAt(0) !== '/') {
        basedir = base.directory();
        resolved._parts.path = (basedir ? (basedir + '/') : '') + resolved._parts.path;
        resolved.normalizePath();
    }

    resolved.build();
    return resolved;
};
p.relativeTo = function(base) {
    var relative = this.clone().normalize();
    var relativeParts, baseParts, common, relativePath, basePath;

    if (relative._parts.urn) {
        throw new Error('URNs do not have any generally defined hierarchical components');
    }

    base = new URI(base).normalize();
    relativeParts = relative._parts;
    baseParts = base._parts;
    relativePath = relative.path();
    basePath = base.path();

    if (relativePath.charAt(0) !== '/') {
        throw new Error('URI is already relative');
    }

    if (basePath.charAt(0) !== '/') {
        throw new Error('Cannot calculate a URI relative to another relative URI');
    }

    if (relativeParts.protocol === baseParts.protocol) {
        relativeParts.protocol = null;
    }

    if (relativeParts.username !== baseParts.username || relativeParts.password !== baseParts.password) {
        return relative.build();
    }

    if (relativeParts.protocol !== null || relativeParts.username !== null || relativeParts.password !== null) {
        return relative.build();
    }

    if (relativeParts.hostname === baseParts.hostname && relativeParts.port === baseParts.port) {
        relativeParts.hostname = null;
        relativeParts.port = null;
    } else {
        return relative.build();
    }

    if (relativePath === basePath) {
        relativeParts.path = '';
        return relative.build();
    }
    
    // determine common sub path
    common = URI.commonPath(relative.path(), base.path());

    // If the paths have nothing in common, return a relative URL with the absolute path.
    if (!common) {
        return relative.build();
    }

    var parents = baseParts.path
        .substring(common.length)
        .replace(/[^\/]*$/, '')
        .replace(/.*?\//g, '../');

    relativeParts.path = parents + relativeParts.path.substring(common.length);

    return relative.build();
};

// comparing URIs
p.equals = function(uri) {
    var one = this.clone();
    var two = new URI(uri);
    var one_map = {};
    var two_map = {};
    var checked = {};
    var one_query, two_query, key;

    one.normalize();
    two.normalize();

    // exact match
    if (one.toString() === two.toString()) {
        return true;
    }

    // extract query string
    one_query = one.query();
    two_query = two.query();
    one.query("");
    two.query("");

    // definitely not equal if not even non-query parts match
    if (one.toString() !== two.toString()) {
        return false;
    }

    // query parameters have the same length, even if they're permuted
    if (one_query.length !== two_query.length) {
        return false;
    }

    one_map = URI.parseQuery(one_query, this._parts.escapeQuerySpace);
    two_map = URI.parseQuery(two_query, this._parts.escapeQuerySpace);

    for (key in one_map) {
        if (hasOwn.call(one_map, key)) {
            if (!isArray(one_map[key])) {
                if (one_map[key] !== two_map[key]) {
                    return false;
                }
            } else if (!arraysEqual(one_map[key], two_map[key])) {
                return false;
            }

            checked[key] = true;
        }
    }

    for (key in two_map) {
        if (hasOwn.call(two_map, key)) {
            if (!checked[key]) {
                // two contains a parameter not present in one
                return false;
            }
        }
    }

    return true;
};

// state
p.duplicateQueryParameters = function(v) {
    this._parts.duplicateQueryParameters = !!v;
    return this;
};

p.escapeQuerySpace = function(v) {
    this._parts.escapeQuerySpace = !!v;
    return this;
};

return URI;
}));

/**
 * @license RequireJS text 2.0.12 Copyright (c) 2010-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/text for details
 */
/*jslint regexp: true */
/*global require, XMLHttpRequest, ActiveXObject,
  define, window, process, Packages,
  java, location, Components, FileUtils */

define('bower_components/requirejs-text/text',['module'], function (module) {
    

    var text, fs, Cc, Ci, xpcIsWindows,
        progIds = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'],
        xmlRegExp = /^\s*<\?xml(\s)+version=[\'\"](\d)*.(\d)*[\'\"](\s)*\?>/im,
        bodyRegExp = /<body[^>]*>\s*([\s\S]+)\s*<\/body>/im,
        hasLocation = typeof location !== 'undefined' && location.href,
        defaultProtocol = hasLocation && location.protocol && location.protocol.replace(/\:/, ''),
        defaultHostName = hasLocation && location.hostname,
        defaultPort = hasLocation && (location.port || undefined),
        buildMap = {},
        masterConfig = (module.config && module.config()) || {};

    text = {
        version: '2.0.12',

        strip: function (content) {
            //Strips <?xml ...?> declarations so that external SVG and XML
            //documents can be added to a document without worry. Also, if the string
            //is an HTML document, only the part inside the body tag is returned.
            if (content) {
                content = content.replace(xmlRegExp, "");
                var matches = content.match(bodyRegExp);
                if (matches) {
                    content = matches[1];
                }
            } else {
                content = "";
            }
            return content;
        },

        jsEscape: function (content) {
            return content.replace(/(['\\])/g, '\\$1')
                .replace(/[\f]/g, "\\f")
                .replace(/[\b]/g, "\\b")
                .replace(/[\n]/g, "\\n")
                .replace(/[\t]/g, "\\t")
                .replace(/[\r]/g, "\\r")
                .replace(/[\u2028]/g, "\\u2028")
                .replace(/[\u2029]/g, "\\u2029");
        },

        createXhr: masterConfig.createXhr || function () {
            //Would love to dump the ActiveX crap in here. Need IE 6 to die first.
            var xhr, i, progId;
            if (typeof XMLHttpRequest !== "undefined") {
                return new XMLHttpRequest();
            } else if (typeof ActiveXObject !== "undefined") {
                for (i = 0; i < 3; i += 1) {
                    progId = progIds[i];
                    try {
                        xhr = new ActiveXObject(progId);
                    } catch (e) {}

                    if (xhr) {
                        progIds = [progId];  // so faster next time
                        break;
                    }
                }
            }

            return xhr;
        },

        /**
         * Parses a resource name into its component parts. Resource names
         * look like: module/name.ext!strip, where the !strip part is
         * optional.
         * @param {String} name the resource name
         * @returns {Object} with properties "moduleName", "ext" and "strip"
         * where strip is a boolean.
         */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.indexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1, name.length);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },

        xdRegExp: /^((\w+)\:)?\/\/([^\/\\]+)/,

        /**
         * Is an URL on another domain. Only works for browser use, returns
         * false in non-browser environments. Only used to know if an
         * optimized .js version of a text resource should be loaded
         * instead.
         * @param {String} url
         * @returns Boolean
         */
        useXhr: function (url, protocol, hostname, port) {
            var uProtocol, uHostName, uPort,
                match = text.xdRegExp.exec(url);
            if (!match) {
                return true;
            }
            uProtocol = match[2];
            uHostName = match[3];

            uHostName = uHostName.split(':');
            uPort = uHostName[1];
            uHostName = uHostName[0];

            return (!uProtocol || uProtocol === protocol) &&
                   (!uHostName || uHostName.toLowerCase() === hostname.toLowerCase()) &&
                   ((!uPort && !uHostName) || uPort === port);
        },

        finishLoad: function (name, strip, content, onLoad) {
            content = strip ? text.strip(content) : content;
            if (masterConfig.isBuild) {
                buildMap[name] = content;
            }
            onLoad(content);
        },

        load: function (name, req, onLoad, config) {
            //Name has format: some.module.filext!strip
            //The strip part is optional.
            //if strip is present, then that means only get the string contents
            //inside a body tag in an HTML string. For XML/SVG content it means
            //removing the <?xml ...?> declarations so the content can be inserted
            //into the current doc without problems.

            // Do not bother with the work if a build and text will
            // not be inlined.
            if (config && config.isBuild && !config.inlineText) {
                onLoad();
                return;
            }

            masterConfig.isBuild = config && config.isBuild;

            var parsed = text.parseName(name),
                nonStripName = parsed.moduleName +
                    (parsed.ext ? '.' + parsed.ext : ''),
                url = req.toUrl(nonStripName),
                useXhr = (masterConfig.useXhr) ||
                         text.useXhr;

            // Do not load if it is an empty: url
            if (url.indexOf('empty:') === 0) {
                onLoad();
                return;
            }

            //Load the text. Use XHR if possible and in a browser.
            if (!hasLocation || useXhr(url, defaultProtocol, defaultHostName, defaultPort)) {
                text.get(url, function (content) {
                    text.finishLoad(name, parsed.strip, content, onLoad);
                }, function (err) {
                    if (onLoad.error) {
                        onLoad.error(err);
                    }
                });
            } else {
                //Need to fetch the resource across domains. Assume
                //the resource has been optimized into a JS module. Fetch
                //by the module name + extension, but do not include the
                //!strip part to avoid file system issues.
                req([nonStripName], function (content) {
                    text.finishLoad(parsed.moduleName + '.' + parsed.ext,
                                    parsed.strip, content, onLoad);
                });
            }
        },

        write: function (pluginName, moduleName, write, config) {
            if (buildMap.hasOwnProperty(moduleName)) {
                var content = text.jsEscape(buildMap[moduleName]);
                write.asModule(pluginName + "!" + moduleName,
                               "define(function () { return '" +
                                   content +
                               "';});\n");
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            var parsed = text.parseName(moduleName),
                extPart = parsed.ext ? '.' + parsed.ext : '',
                nonStripName = parsed.moduleName + extPart,
                //Use a '.js' file name so that it indicates it is a
                //script that can be loaded across domains.
                fileName = req.toUrl(parsed.moduleName + extPart) + '.js';

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            text.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                text.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }
    };

    if (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'])) {
        //Using special require.nodeRequire, something added by r.js.
        fs = require.nodeRequire('fs');

        text.get = function (url, callback, errback) {
            try {
                var file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file.indexOf('\uFEFF') === 0) {
                    file = file.substring(1);
                }
                callback(file);
            } catch (e) {
                if (errback) {
                    errback(e);
                }
            }
        };
    } else if (masterConfig.env === 'xhr' || (!masterConfig.env &&
            text.createXhr())) {
        text.get = function (url, callback, errback, headers) {
            var xhr = text.createXhr(), header;
            xhr.open('GET', url, true);

            //Allow plugins direct access to xhr headers
            if (headers) {
                for (header in headers) {
                    if (headers.hasOwnProperty(header)) {
                        xhr.setRequestHeader(header.toLowerCase(), headers[header]);
                    }
                }
            }

            //Allow overrides specified in config
            if (masterConfig.onXhr) {
                masterConfig.onXhr(xhr, url);
            }

            xhr.onreadystatechange = function (evt) {
                var status, err;
                //Do not explicitly handle errors, those should be
                //visible via console output in the browser.
                if (xhr.readyState === 4) {
                    status = xhr.status || 0;
                    if (status > 399 && status < 600) {
                        //An http 4xx or 5xx error. Signal an error.
                        err = new Error(url + ' HTTP status: ' + status);
                        err.xhr = xhr;
                        if (errback) {
                            errback(err);
                        }
                    } else {
                        callback(xhr.responseText);
                    }

                    if (masterConfig.onXhrComplete) {
                        masterConfig.onXhrComplete(xhr, url);
                    }
                }
            };
            xhr.send(null);
        };
    } else if (masterConfig.env === 'rhino' || (!masterConfig.env &&
            typeof Packages !== 'undefined' && typeof java !== 'undefined')) {
        //Why Java, why is this so awkward?
        text.get = function (url, callback) {
            var stringBuffer, line,
                encoding = "utf-8",
                file = new java.io.File(url),
                lineSeparator = java.lang.System.getProperty("line.separator"),
                input = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(file), encoding)),
                content = '';
            try {
                stringBuffer = new java.lang.StringBuffer();
                line = input.readLine();

                // Byte Order Mark (BOM) - The Unicode Standard, version 3.0, page 324
                // http://www.unicode.org/faq/utf_bom.html

                // Note that when we use utf-8, the BOM should appear as "EF BB BF", but it doesn't due to this bug in the JDK:
                // http://bugs.sun.com/bugdatabase/view_bug.do?bug_id=4508058
                if (line && line.length() && line.charAt(0) === 0xfeff) {
                    // Eat the BOM, since we've already found the encoding on this file,
                    // and we plan to concatenating this buffer with others; the BOM should
                    // only appear at the top of a file.
                    line = line.substring(1);
                }

                if (line !== null) {
                    stringBuffer.append(line);
                }

                while ((line = input.readLine()) !== null) {
                    stringBuffer.append(lineSeparator);
                    stringBuffer.append(line);
                }
                //Make sure we return a JavaScript string and not a Java string.
                content = String(stringBuffer.toString()); //String
            } finally {
                input.close();
            }
            callback(content);
        };
    } else if (masterConfig.env === 'xpconnect' || (!masterConfig.env &&
            typeof Components !== 'undefined' && Components.classes &&
            Components.interfaces)) {
        //Avert your gaze!
        Cc = Components.classes;
        Ci = Components.interfaces;
        Components.utils['import']('resource://gre/modules/FileUtils.jsm');
        xpcIsWindows = ('@mozilla.org/windows-registry-key;1' in Cc);

        text.get = function (url, callback) {
            var inStream, convertStream, fileObj,
                readData = {};

            if (xpcIsWindows) {
                url = url.replace(/\//g, '\\');
            }

            fileObj = new FileUtils.File(url);

            //XPCOM, you so crazy
            try {
                inStream = Cc['@mozilla.org/network/file-input-stream;1']
                           .createInstance(Ci.nsIFileInputStream);
                inStream.init(fileObj, 1, 0, false);

                convertStream = Cc['@mozilla.org/intl/converter-input-stream;1']
                                .createInstance(Ci.nsIConverterInputStream);
                convertStream.init(inStream, "utf-8", inStream.available(),
                Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER);

                convertStream.readString(inStream.available(), readData);
                convertStream.close();
                inStream.close();
                callback(readData.value);
            } catch (e) {
                throw new Error((fileObj && fileObj.path || '') + ': ' + e);
            }
        };
    }
    return text;
});


define('bower_components/requirejs-text/text!script/gui-template.html!strip',[],function () { return '<div class="chuckbob">\n    <a class="chuckbob__toggler" href="#">Hide</a>\n    <div class="chuckbob__container">\n    <h1>ChuckBob</h1>\n\t  <select class="chuckbob__tests-list"></select>\n\n\n\t  <fieldset class="chuckbob__single-step-controls">\n\t\t<label>Single step</label>\n\t\t<button class="chuckbob__single-step">Start</button>\n\t\t<button class="chuckbob__step">Step</button>\n\t\t<button class="chuckbob__resume">Resume</button>\n\t  </fieldset>\n\n  \t  <fieldset class="chuckbob__run-controls">\n\t\t<label>Run</label>\n\t\t<button class="chuckbob__run-button">All</button>\n\t\t<button class="chuckbob__run-single-button">Selected</button>\n\t\t<button class="chuckbob__restart-button">Reload</button>\n\t  </fieldset>\n\t  <h2>Result:<span class="chuckbob__result">(run to see)</span></h2>\n\t  <textarea class="chuckbob__test-log"></textarea>\n\n  \t  <fieldset class="chuckbox__exit-controls">\n\t\t<button class="chuckbob__exit-button" title="Go to original url">Home</button>\n\t\t<button class="chuckbob__abort-button" title="Close this window">Abort</button>\n\t  </fieldset>\n\n\t  <!--Title: Sad Trombone\n\t  About: This is the sad trombone sound effect great for telling someone they screwed up or have just messed something up big. bookmark and play for your pals..in good humor of course.\n\t  License: Attribution 3.0 | Recorded by Joe Lamb\n\t  http://soundbible.com/1830-Sad-Trombone.html\n\t  -->\n\t  <audio class="chuckbob__fail-sound" src="data:audio/mp3;base64,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F5lYcBxnJQYACoQwgQ0QRP5EljzFoymis1dgMAl+TCA5svkysYARmCKCraqxaeaZKxAGGgjdYPUrhiCp//vSADAABslVz2u6Y2zDaQntd1hcliUfT61h67LYo+n1rD139wE4SohrkhCMic+mMCylJhDYKa0CJyI1mWywyecxQ8PH3ueoTlpVRQekToKPJJaM/46RrFL69cdP0okdXMd9YFizLN42+xNebmnuRbO2z6dt9zZ3t+WIe78ox////////////////////////////////////////7QAjklu1tsZZgAgFMBwAM8IKMEgBYJGzAcQRYYnrMaR5M2T7IsTKw4cZycEAAaEMIGNEEVkQtakx6Kqqr1UMCgFA0xAGdYNDbYKOgeiA3OXy0KVF0FpiiBaCPMTUPYi3alfSBJyBb159KeHrecxZlsooY5My12aGPSrtiGpDg/PJbY5nVsxr86WlylEvsV71NnPSmNU8tw3ylzr7qyfPOXc3Uq7rZdnNUVetnvV3uPbtm/qwPKhkEDIWLg4sEAUPizv/rhIJkm231saTKFZ2EAngEPH/bIYhUhRACmIwCYgreVVIOubEmwJcSOyHFctxIo19NRWlFViiA5pUWXPH97+tFkyU93/riyiljrRQEcvggEQyDmddyV7yAePZ2raGRYMKErV22s8ZP1gx5H0R+1sbuJAkXoDIsXfOXnq+hUYG6kJ7BVi03vVLOt5fXvfM8GFEa5bQMU8TT+B8702RgZWJJhwoXCwNBcRih7eL2P12ln2DUwkEuTbb62NJpC22EAnkDnj/tkMUqQGPApiMAn8dNNpB1zYabAlxJ7Icly3Efhy1YFQpCscQ2YFJ1b4nTQzRzk+mSpW/doL0I+LWS4C2QAUKZcD+ZFfdD2BxSkCeEzqB01p56kT5gnW5v6s6nWHzYptMUNKQniid5eR2uSsJ7h6+UDXGVEabbm+5+tivjPGOL9wM4eLtr9Za3+q6vW9YFyqulKfoe1KhIlBNvtf/P/SBbQ8+1h/7KSU7Nt//tY2kyx6Uix5XFEJSc76BsnLjG46hJWHAoEVqKG4OFioTIAFQKDq39TJWLZqwEzZmblM8TCcvKCnodBoqpFwt3HiCvZXgnqQJuznWvHg40mThMECh7krojGfqgWkmfZeHNRkrptpJQoVVqM/WX1WxyaoJzq9wbr/+9IAPgAHykXV6zh67Lio+r1nD12V5Q9PrWHruvqkafWcPbZ2PMKC/P9YjQYZ4Lzfdnbni5w/hrmBfe495Kz6zDzt5TWp7hACtnwMsmh4AcNeHiNRG59rkc3atKP//////////////////////////////////////////////////////////////////////////////////////////+klOzbf/7WNpQqcykaPK5IhKTphQNk5cY3nS/qw4FEhKk0NwkWCX0iAyJMdW/qZK7bMy+zjLTgZuiYT90csbBGGerEYo0sXoNNUuBAVEcarP9EE0cXBZYFIhKjfqJlfm7APttR5SLlyMOOvxzsTqqiPpnja26c0VpVq942KpvjNSHw3p9R0/P2pdyI9aouVVGfH/iVz+4clXPEsHGItfiNrNfFAYiB9AEICjxEImYZempS37TSpmWTXACk3JbdrY0EBqDTYSqfQNi0XOk8VpirEQEfGtMtCxTKGSMhLlJQNNfZKttnqQlLqaazUcIqFPVsTdaNkTqQ/Lp2OQqiXA3QIYANE9BGgWAjapJUpHjUarCPUXJNJQ41FNQurWaw5HJIGgzCSzt7fCfH0dMdDHjliFV8rD1fOo584a4yqbFwzOEVrRK4cErD0rWhLYkdPX1aw966shON4WoT6UBVzKD4bDe3NmiAb8oAEm5LbtbGkXpHQGwlV8WBi1s5mFEIqxEBPjTzLQoKZRyRkJbJKBkr7JVts8Rd5dTLWSjhFWpot0aLG1zPJDdNi+EDRRWhuiNgKEuVEIvYojIVzMyiDwjlSW4tysUBY1WhEAnsqbOxyakMWg1Ksfr6iuhBOYbEv3ftSda2Q/XODo+byx8KmA50XENU2nZE+pV2qdxKTUfSsudwJ2SRoe2g4xPXE0CDDfYkusJKDoqVEkMhuREXvrKzixZqa1KEgYRIBcktsiRCXLRmjmDiOIwArYrw5GwRYVv+ieupTmgVnUKgfEt+TIcR9zAB2XfVslEANeCxlBG2Z4mZONpAb3dh2ViMKd6qqZwkEQYIiTgLebBOZVVdmcZi/hfJBLx1cdrtADVQC4UYjRbyePbulw5KA/G5iVR1Oo79XnP/70gA+AAaOSFFrmHrsuiqqTW8PbZkpQUmt4w27KynpNbxht6rEOZW/CmiVfS0tK3Zdtzx2u6SR3k7FF1AZ22HqA2x2aaI8xrEG+9494VmMRJGhQGhgOEwgDqAWAh+ju6f////////////////////////////////9lEkpyW22NIq9epR8xptTQaQzQ+GVGheGyz6PyMckQ7lBnnqpXosPxEy5EOw+yjCOO8IgMQZMp0PEfRajY5FGKshT3bm1lVzcKytq4rEbgBwd0cOFqGvk6bIcWEpeboTgiKEGuG8McMCIXEwjkO4hB6adLZ1RYdmNI6S0O8Km4L5+rmrEBuety6tBblxGPyOxMqtxiuaeW7lTTzzfH9Le1574pHvrd7T73TFJc0nvqSTGo+W7+cUmvewnCiCm5Nt9Y0EFAABo7GeDgkBwLCzpJpGKbAAKDmxRmChCEjgoqvgv+mvWpW0Rhmkpwxc5exZmBjpMF6wudajFXyoLrKU+B6SmQ6cvEGBgUu6kqps6y6otTwLWflQJgKEtGlnqsK+YbXY5BfFfTNhQwdNW1McHBltMik0Ri8ukeNqw7kvjNeP3834uS+EvvDGUSikIoZA+sNZOyzePxWcjMBNehrtLqlsYxe5LaaCKbmEbtWtUuePyzC7Kr2P7wy/f/vHv5WP2J4BLQogpuTbbWNBAYAANHY0AMDBOBX7OopEYpsAA4OcFGYKC4SMCiq+C76a9albRGGPIvhz7FFxuYCmmwXTC51iM1ai6lVTFIAikl8SlTCDAwIXdT9SKdZc0GQC8lakjUtZezWOymWz8OQhgLSoUFhCY0eV5oKw9DTrug9+41ILsOwmH6r/N3lleMT8NwmboKOYnGWzrToZgqHnscOvLOOTHIGfapdoKW/8XmqWNTVNZqu3P7y1jq/vKvfqa7fw/Kz39b5vCxzVrL+3+hWBAgApSy7WtEMQSVKoAY69GUAAQDrQObJUIFSDIQHJbBoNQFjeIdbAIrpB2rgmlHduyPIVMlrFGnvyJTkaQiC79vW6zB7bdAIxMTJnIm1p76FVgKmLDVQMQVp0qjz+q2NYkcIaHDMVc6iVODHBwmIMMZAsZ43JR5oINeJuy//vSAD4AB2JH0Ot4wu7Eqnodbxht1mEzT6zh7brwKKm1nD22/7LpsollG0aMUUBsoR/Ynaa3TwpS+5flGde3EJZN50dHYp4a+cxd7LtS7Z+Kcu4S2ty5E72sce7mM8ZvE7R/mGe7Ak4IAZf//////////////////////////////////////////////////////9AAApOy3WtELsSVJQAx1+DAxXa0DnStCBUgqEByewaDS94/iHWwCLKNc9cIis/jzKQqZLWHGhwcLTn0JBdt+2xqfd+otgwIWhNKCjSX7kibiu2bvgkLAOKhymrJFbGEJ8S6EwLDEIaeCIIHOQ7i8lTM/lyRuU296ci93Iha8J1y27OltyWGKDuXMy7F13XpbUxVprEC/VztxvDsji/2Jdr6lN+p3Cr8MyrdyV91zWt25/Cbl89veu91//rn/z9/nz+VcAEUyCS0ppdrY0FerWTRPv0ewjQ62ZH6B7lqomAwnTTlxS0PZAg2v6P3C66TUegwhSG7QQjPTNtLqQxp0K9uOXL9Vni22sWUYx6aRavAgCCdryYTJV0ntMX9FIA/EOkVhms5iEuHrFjYkeqmR+sqOAuW1RJWO3wj5iPVKpXqGFwPKrJBjMDG7Vadve7LIoWNcs8KdHo9dQVV5f3OsmUOvPHfVxHprO9XhY1mn/35briqykXaNvjABLSllutbRS5UuaScLo+BDxCWBHxIdnaSpkQIDacDAgIt+QDI1fR+4WrHhR6Ckpxa6qo6sCLL9QK7zoS+20i1Nx1bCd7KIdWemyudvEwGHxptnVb1PMKHqpQHAYygimCeY/A6hNxS9OSqTR3qU60kfq+gzEfol8XdqP2C/ZUIMQvT81EJZqw7KtjgT5ix1iHPDlhP3OPuFEg4ozuDVs/m3EkKNHrN/bbO83Atr7+8a+d/2vJJRKAGXZ9f1GQUm25LdbGkmCgiHAkwHRAIDPofmdGSYyc6H4hK25ufJQfqljBf0uw8tM/QkP9pzyes4KUy1JyRLRhViX1LM4z4DTa/CTuBToUSokzJQ836vTbESoyDtOo61AukSUDQSw7H70oTlYywueNR28yE4cEaGnn7PeXkBORiesT/+9IAPgAG90fUa3h67L/KGo1vD22XkSdNTeMNuxIrKam8YbakkR7Io0MVri+syxkU9VrEzKH2SDOlvfEGLd89cdQ6xIMa987fXjutnlkjoNC5hosYdZ3Lydn0HtX///////////////////////////////////////////////////////7IKTbclutjSR9QRDASYHqgUBnyEBM+LExk5x0BEZe3dz4JBeqWGC7pdh5aZ+hI/4pfyKs1lAgtS9ImAwq9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PWpStx2mFmJslfpMsoC52iwlly35cl4biTT+v4VR2uwQQlHGJI4YZ2RGL9lMYJqLK200lPzNW2ivMQ4ygs9QqZKWpISF/V9jyUSlMFKQnI0zJ3pSw2WxbOxel2UaiGNbOM81RP5YzmKletlep7tNLalNrlyzzmNeN2Oy7LU5xo28rSQeoVoAJbcsu20iBECD9FRBEK/iCSDWF8RcRADrTb/ByRotSIAlCBKJMyAU6uUMhVVPXTtESVYZh40qVWO0tsxTj8WR3JitSlYyTDytcLS8NAa4/soKg7OW6Dph0lSN/GviSjFaWYJqY62VO5V8zK3vQlvtBDiAECTJDKwpIPlLVGyZNxpM5TNWmxpW6XU6wsIjUbqRjuU9KJuYtSGtMWH8lFyUUkRpMqKvuYq37mqXO3Uu51r81MV72Rt8ec8Zcs/3xFSEAFpyOW2toIwQTQDuSUWMTJHU4aloEpAoCPu6q5cO2FixxZtSHy3qo8KghTS9pBMtHqZQmNB3SmY7FradsDNCmmfm5mtqrJX0+UOmiUWk7/PBDNpwy0cQ9/UYZyG2CFmnerOjB89WYONBmICROdBqDwsPRqkr+qnjEVtP//vSAD4ACHJO0es4w26yyno9Zxht1lkdQ6znC7qwIWg1jOF35HJBWl2Nqvh3PGxutQ453sZ3kzlvOm/9dszNi1/Z/d/C3uvnc7lds471hz9Z7tZVMtDLImZqv//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////gAAacjltraCLEF3CVQmCxiZJGkzUyEYAGEg1yU8ladrLEliVZiHy1qk/pAuuz2kD0z+EyKAaDu6aEs2vpOw8x6oxk4QrdSOQ3j9PITViHpcypomNG1ssnOZvyljqyrAAQQND8Avtk3ZlY8W00ZTKw1GJrBqDVH1THmn4vvpnYlVNVqfhT9rY1qkd/X0tnHu+buaw1leq8y5ew1/LVTmqnN1qKrj/NZYd/X4f+HP53HV33F2WSUm7Jda0QoxuoK4GOA68fGqRpNrbdS3Y8jLpSWVabivkBAq9zjIqJA2a0C9kXvjIxwhIVU8ZRCcyvcJQk8tyGHNVltm6MBxRhQFMtafU6OM1aIfYc764LSOImaVwQqYu7m1xHZZMqetlKG0EtObnDtNTpbpQ2a6nr9FQrSm6HB52StpDsVwt3YfsZXblfL6aD7VvG72XVavP7b3jrWq9nDe6HdJjdxq/XHop+Rzu8wx/BhAEpuyWyJEJYTNQd4DnRehFmpBv+vkElRJtVTEFWrioqZA6NNuHRGU61tIwCAQ/Tjph3kBA1C/ohCY5K5UQkJBYQy6k1QqHnbcNxRVAxsU2iyhhlC0CvKofZpF2ujRo/GmHKYwXOtGdG/ZjKg1qmjs7nmytUNeXuThdpYCs1a9t+aSUyHHLO3e1lhcs913WsLHd4brZaqdt5f9fC9xORCsmhlmu/wIGY2NdkLGUU7bbbdY0QoRnwZUIhG5wAK4IDoqtsysSUNZhYADB0o32gELhqbU7xGdPAFx0iJW5PXS0SfdZyGWJMXU0DCEaZfgp0IRduhZkPQQ16CKWStfY1nDDiF5YyztLxUkPSOUAwFR82yQO4EWdB3YLwlKQb14OzXntZYV57e7v/+9IAPgAITkZQ6znC7rOqCh1nOG2WCUU7rGXtssknp/WMvbd2O2MZic7am6Tt6rRa5lPzN/C/Sc5Vx7R6w/n/3v5/3D8uUnZ6F2rsMO57/fjv///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9lFKW223WtEKIX8BlpCxmboCugcNDr1gRVRtsyjQc2lHAUEiEVIqXvEaFrwYPEPK1pFEyzSl8Ya4ywmEhtLQwhmaZyR0G1lMpCh0DQY+1aBeOGndK5pxC4LFYCUoXZXooACxsbzRoPjFaUOzBlLtGuOyBHlr8D0kRlj8VmqPxFYm8MYr0ljPszFMsdwdd+cp61+ewps9VLms/q75v9a1vLu87/e/j3X4a1+P4f/83+uXKSylMAEuSSSWNEAipDlISkHgRt9wg6hLOIUhgRTfxZCgokGw9bpZQMPd9mZ6tSeQszGA5VlFzOTDG5G/RACyWnQIGCaTC6hSCtqUKPky0oppQsLfpGlhJFhDCYIJnWSAG2dSfGaIud6cE/BoHicRXNaLZDtFihv2qka7+aFCe6exYbfiCtTR4dIC02TSruedMZYFJGetrfu9oF8fMTV7W97yvvilL2k+7b19f5vjf17TVDlMkpOSWS2RIgmJDFIQ0GqQ+4YLGViVI8wMMTDjDdEeUa3DasgkEg4fes5UotOrBjCb/T0PmQWLF5SpJVmsrVmAI6kc3eTpzoU/xa6as3y5MPRBn4jiobDOOpEtJ7HlFYitC16bkWOBnXZxolHsC5J0q7URS+kUWrEdDM1ilUahW6KlN3b40Bxvamo0JupCYFZS88dnfzxKRJPe7PTeaQcz7pdsntLqemcUvfWL5jwmMMgwQZJbctsusiRCLDXpISvCRrvSgh1EBKEoODnSYl9Y2QKjU0XUUHTQgpzFhQmiu31gVSuUkNmKkuOrL2vPlUZUOhyl/WFlzJ98VhT8JVjddrycUrmEdzbVDEkRpukJPsrFZQmbZAXSvOldaYldZ2zKiRiW2WKzk9Ml61qluUf/70gA+AAg4UNBrOXturilp/WMvbdbNU0Gs5e260SPoNZ1hd2nTxqVbU/7rOX3p8fWb1xG3l9EfQ49d41jEJvd42+iWtDtGviPS+sfPzj5riuvKqXSpGf////////////////////////////////////////////////////////////////////////////////////////////////////////////////////9gBNySS2yJEEyF1UBKxGmNVCXqMq7g5ctKMtxf8cbGvn7Z4h+hVBzkiXleFYjo2E1XM9xEunf9xntpWVDJLYX5T9BhEP2XZA5sDw68zzyGMKKmW2IUboO1D0CcRDHb4n6QhLbkS19U5mpdnohbWvIcozJVDWeqNTzjNGcWmGyKZWSVli1mWnsaHl7A1iJTFaMVp6+7++Kwuzwnjtq0+tisbUlM3+4Wa3GlBQJ2qscySm3b7tZGiESZdSGLmjROFQY4UybunMLkVhIiYWwQUIV9Sw6WAFKkuaAIzUvf5pQgTLequQIlKENSquWhe1ryZQUFbg7tZDij42hKADhmvM4W2v1+35RlIZJiBs6zdLq+P6IhL2Arlw2wp2JZyrWFUq5iO5/lG5ULnGmlT0Z8sOCYZE8nl5hYXKA8Xlc0uDczJJsjJWzJBpetrZ14tM7i2zWmLXiQcZx9fFsVr84x/jPpm+MS4rZJTbt22siRBEDLqQx80IIoVBjhVJw5WYXYrKREYWtQUFKSpX5IACNyfMoDH6fb/TZAFT5hbYSdYxKBmXmaFp8IfJHAwbQK5jpADVgVQIWBBnGbxabySh2BQa4asD0kpzeVSmaiVuQzVrWUppH7kUJ7Bkrj9JLn+n4OxpJTD1JPv/KI1Vn+wVZn7+HNWq/L9HVy/tythfoP/P8rfL3LnbNzP71rO1evdxr4RsMXXRojTeAWxfRlguS37WyJEJALcco4Fm7hgCixS0RLtDQ4NfcxO0wgzNQaI6S0DAAVURWe0FSN85aPYQGCqW2LdHi2nunFCTBEYs7j/EU6qasLFguGySMTSCKlfKngq7Z4Do+kgdiimLyEPRoPyE00co1q2AbD6mhWkqIuLpcXoR0gFg4O//vSAD4ACWFV0Gs5Y2yt6eoNZyxt1MUfP63hi7p+Iih1rLF3FioyoZE7LW+zy6//dl6N3Jo8xR6F6tbPLGGpOKP2Z6rrM2yX9v09fb9m/0/3/N53rz7P//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+ywHJbtrZGiEmFeOUcCzohgCqRG8nnA6MjK2rJ2mIKZqTGH2YAYAieiX0CmsA2z/rDqZhxMaa0frJddoUCg0h2m0tFCbO0kWvCEeD3JsocoZg626XKWoDtlhaN4xyJBKiH4eCAZKSuSCU+LGFJqoR1Go4dahPGTxxUcL0CA5NkYeNRnRNsVsqgoaVzl5WTnqC4cWPaU+YUzEGRWmk3sx87jFM7fntt012YUESzjAJhguS3W2yJEDwQsduhgKgcsFBguvMxgYkkrAxaAl1GlKFLEA1fRQYWuvJVzfM4AVmjLpY4DBq7LPu2AFV4YcdhMQZ4+71Odg+ODsxlMC46tg3J7h8nPtgDor1ZOiensvFR4W1J8dlNZhaVEBGdGY/FY2JRKajTFUSS4mmTKCBczWq9f2fVmvM3W0dhr1Vrse/zcP+zZ29X9S+kRyZg1hlGclBWzk1uMspy2666RohIBl6+DE9D5AhIOnuahU9UNhBUFPU+VaVWmPS4BdoaHZExZ+ncBRT4OS9hbld6gcrCgUGwE7bMb68F1xJocKdNm8R8pjmPkiuZVMgOCkmgsFoli0VCUcKHUiizJ4d5C+veedi1VAvOnXaL15VYSoS+zlPXtr2F9ErKhlKvemKsLzUTvfWnxX/7MNwxUbDiTDK/v/rHSaTGOGSUrv/tta2glyyJfJqbpfmNuIQn0FIIWsTCGGkIALCAc1GJzGMNIhkgeiwUBaoDTvqBAKaGhypEb2cMEsxduT2xZeirpDHGiOxAsrjzAJDeUwcSBcAHA4wMmyhMBey5KSEYaGCgrKkQBAFOFjoeFLHRgHH13FkyAPichNj/+9IAPgAH1FXR61hLbKeJej1rDG3XdVdNrGXtswmq6bWMvbalaCBBNKWt5Keq3BW7yrSu51FW/JK6hPLWZax8FZ/fUZ7cXQY8qnnuo5t/W//////////////////////////////////////////////////////////////////////////////////////////////////////////////2SUrv/tta2gjSvJZJq75emNuoMoS7EELWJhjKSUEIBQGaTDX4yhtIDHGkQCYLuCEMOGIyuDVBWwv+1hWm5KVPuRMqcNSjEobEriWv80prEHQywBoFmZMy1wBx3VD8lx1gt+vtAfsxHRghupkJNpEPzMpn1CXdkmFsvtHQ4k+ezLfTMhbXtUxu1K0rE/e2YoZhuuZbTXlm3dW9EOn/2bdfkAo3LhsIyWiklu////7SIFBEKHbPlykcUZGA/MNfsLOIoPi19GNBEiOKkmciIhaUgFMQJqigJUphTpl/gabL0KILfV9IjK1QyZiYADi8PRKBZGxNY8WYUoas6w0Nty4KhDSSHpFUZ2ISfyyuWtAHeTpSpRXtZ0H+TBxSTEZKMdHRHmoijiTh+nkzs67Trm/T1XDEZsms/b3OFEj6Z2XR7MsaA/jZfd4xvqss+9OUSJejh5n6j+PnddX1j/53vf+PnPzDzSS3f///9pGChBfh2z9cpPFGRgPy7X7C0CaD1s7KBjIAkGIyTSXFCXjIBzGCbgmKS2uXBpcILlu+gMgl5YKdFsCxHsVOFBWJv8+EZ3A6v6z9KCuM4ENQoWw/SNq1NsB9pJcsyARS2nEifaYOVXnuaGiMPUMPNxPdEqlGnSfqGPSbuJ5oaYxmw2dnfH/LOrGV5BcmWEyKnd2mLqE57Xoe4DlmKwqx7iLHXN268OE/xEkj2+4d9e97bq8vXHiv9zT1w3zbYISd1221rZCmhIBU6C24so77ohFwoINcFCifMcgFF0S9Zh8KqBym5FoSijg33lTWYuGRHuNSYJFWlRV5G5IEn0YIhQrXI20SuirlTiUb9rLYqow8tSGahmsQsKJSx3pEu1FYu1WvsyqnQ2dvOWKS6Ge6tbG9GsmoqomcEv/70gA+AAeRVdFrWHtss6kaLWsPbddlV0/s4e2y+6sp/Zw9tkOBTnIhh9nO2x5sv7IbFgXZ2x3CtDgNjBer6Q5H0CE920wWCS+2B5drYYUPeYWfj+3zjOt5xjX3v/G9/WYf//////////////////////////////////////////////////////////////////////////+wQk5rdtrWyEwCoBYwFuRZB33RCMBQQa4KFlLZI8KLqEVinBqgcZeSA0mo6MZeVr0nRFRghSxLqpmCvEqkpF/k9EJCvmwMoU2pGuOUgfSKPxVPFyZH36lNAVClgK1ra10njtUZKTqQpdG/HS6/K1qAz0yzNbc5rLCex+GLhgkWnjO4yySOMB/V87ds0RigQKMtnjleA+PyNR4X3DPDZYzlfc0KPZmfK2LK2xiv4LdJbWd50+0ERNFV3j//aRgSBR+ck8ax5mXqOAlNZUcNGhd1psAQgPHajBAODSMhSgCWw2w4RyHATaaxE5QFp7TGANUX1GluP0VSMOi8TYytdy21WRSudYTkVO+r7HUyJwvZwLJ7qqyublaqWI5yWrR1HYiVYzQEYbhdx1uCbNnCveItjWHjCrVjEeG9bsUpFuxt0qw4sMW0jL4uJHu39HB0eb60OLbV1FDntaj5xgQHsP5znWLZkjYnxX7hS7zvWPGwgiJoqu8f/7SNCQKCzknnaPOy9RwEprKjhp0KbUzRAhAeO1GABItZwUmAltdyiWwoR/URiKS7XLvSBhDZHHVA+AqJc0P0tCrVB7DWUYsecdBIueBZ4eUzxC3TWrVy1IeoHitSDOW1Q7I1BXlhEPdDDL3EuXdyirgt9Yq6V7k+OSMed269IrYv0pWe0GDRei2fwNPcLbA6fLcbUHDI+tSNaHiBBYdWdatmBPqFTU9sYpe2b6xBxie9IPvY5uqy9qyABKbb7fWxoF+QAAaWZyiLF34UPA2IMBrvBAoWGNbZ8Kgi6bBSA4NGVNBUNKUua5BUOCKBCUBWD6GV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"></audio>\n\t  <!--\n\t  Title: Small Crowd Applause\n\t  About: A small crowd in a theater applauding for a few seconds.\n\t  License: Attribution 3.0 | Recorded by Yannick Lemieux\n\t  http://soundbible.com/1964-Small-Crowd-Applause.html\n\t  -->\n\t  <audio class="chuckbob__success-sound" src="data:audio/mp3;base64,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"></audio>\n<style>\n .chuckbob {\n   z-index: 999999;\n   background-color: rgba(70,13,13,0.73);\n   color: rgb(245, 207, 15);\n   border: 10px solid rgb(119, 50, 12);\n   border-radius: 5px;\n   padding: 10px;\n   position: absolute;\n   top: 0;\n   left: 0;\n   max-width: 500px;\n   min-width: 390px;\n   font-family: monospace;\n   font-size: 12px;\n   line-height: 14px;\n }\n .chuckbob button {\n   font-family: monospace;\n   border-radius: 5px;\n   background-color: rgb(119, 50, 12);\n   color: #fff;\n   padding: 5px;\n }\n\n .chuckbob button[disabled] {\n   opacity: 0.5;\n }\n\n.chuckbob h1 {\n  font-size: 18px;\n}\n\n .chuckbob a {\n  color: rgb(245, 207, 15);\n  font-family: monospace;\n  padding: 10px;\n }\n\n .chuckbob fieldset {\n   border: 2px solid rgb(252, 120, 0);\n   margin: 4px;\n   border-radius: 8px;\n }\n\n .chuckbob--hidden {\n  display: none;\n }\n\n .chuckbob .chuckbox__exit-controls {\n   border: 0;\n }\n\n .chuckbob__result {\n   color: white;\n   padding: 4px;\n }\n\n .chuckbob__result--ok {\n   background-color: rgb(3, 150, 15);\n }\n\n .chuckbob__result--success {\n   background-color: rgb(173, 6, 6);\n }\n\n .chuckbob__test-log {\n   bottom: 0;\n   width: 100%;\n   height: 200px;\n   background-color: rgb(119, 50, 12);\n   color: rgb(230, 189, 189);\n   overflow-y: scroll;\n   font: monospace;\n   margin-bottom:\n }\n\n.chuckbob__toggler {\n  float : right;\n}\n\n .chuckbob__tests-list {\n   margin: 5px 20px;\n   display: block;\n }\n\n</style>\n  </div>\n\t</div>\n  ';});

/*!
 * jQuery JavaScript Library v1.11.0
 * http://jquery.com/
 *
 * Includes Sizzle.js
 * http://sizzlejs.com/
 *
 * Copyright 2005, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-23T21:02Z
 */

(function( global, factory ) {

	if ( typeof module === "object" && typeof module.exports === "object" ) {
		// For CommonJS and CommonJS-like environments where a proper window is present,
		// execute the factory and get jQuery
		// For environments that do not inherently posses a window with a document
		// (such as Node.js), expose a jQuery-making factory as module.exports
		// This accentuates the need for the creation of a real window
		// e.g. var jQuery = require("jquery")(window);
		// See ticket #14549 for more info
		module.exports = global.document ?
			factory( global, true ) :
			function( w ) {
				if ( !w.document ) {
					throw new Error( "jQuery requires a window with a document" );
				}
				return factory( w );
			};
	} else {
		factory( global );
	}

// Pass this if window is not defined yet
}(typeof window !== "undefined" ? window : this, function( window, noGlobal ) {

// Can't do this because several apps including ASP.NET trace
// the stack via arguments.caller.callee and Firefox dies if
// you try to trace through "use strict" call chains. (#13335)
// Support: Firefox 18+
//

var deletedIds = [];

var slice = deletedIds.slice;

var concat = deletedIds.concat;

var push = deletedIds.push;

var indexOf = deletedIds.indexOf;

var class2type = {};

var toString = class2type.toString;

var hasOwn = class2type.hasOwnProperty;

var trim = "".trim;

var support = {};



var
	version = "1.11.0",

	// Define a local copy of jQuery
	jQuery = function( selector, context ) {
		// The jQuery object is actually just the init constructor 'enhanced'
		// Need init if jQuery is called (just allow error to be thrown if not included)
		return new jQuery.fn.init( selector, context );
	},

	// Make sure we trim BOM and NBSP (here's looking at you, Safari 5.0 and IE)
	rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,

	// Matches dashed string for camelizing
	rmsPrefix = /^-ms-/,
	rdashAlpha = /-([\da-z])/gi,

	// Used by jQuery.camelCase as callback to replace()
	fcamelCase = function( all, letter ) {
		return letter.toUpperCase();
	};

jQuery.fn = jQuery.prototype = {
	// The current version of jQuery being used
	jquery: version,

	constructor: jQuery,

	// Start with an empty selector
	selector: "",

	// The default length of a jQuery object is 0
	length: 0,

	toArray: function() {
		return slice.call( this );
	},

	// Get the Nth element in the matched element set OR
	// Get the whole matched element set as a clean array
	get: function( num ) {
		return num != null ?

			// Return a 'clean' array
			( num < 0 ? this[ num + this.length ] : this[ num ] ) :

			// Return just the object
			slice.call( this );
	},

	// Take an array of elements and push it onto the stack
	// (returning the new matched element set)
	pushStack: function( elems ) {

		// Build a new jQuery matched element set
		var ret = jQuery.merge( this.constructor(), elems );

		// Add the old object onto the stack (as a reference)
		ret.prevObject = this;
		ret.context = this.context;

		// Return the newly-formed element set
		return ret;
	},

	// Execute a callback for every element in the matched set.
	// (You can seed the arguments with an array of args, but this is
	// only used internally.)
	each: function( callback, args ) {
		return jQuery.each( this, callback, args );
	},

	map: function( callback ) {
		return this.pushStack( jQuery.map(this, function( elem, i ) {
			return callback.call( elem, i, elem );
		}));
	},

	slice: function() {
		return this.pushStack( slice.apply( this, arguments ) );
	},

	first: function() {
		return this.eq( 0 );
	},

	last: function() {
		return this.eq( -1 );
	},

	eq: function( i ) {
		var len = this.length,
			j = +i + ( i < 0 ? len : 0 );
		return this.pushStack( j >= 0 && j < len ? [ this[j] ] : [] );
	},

	end: function() {
		return this.prevObject || this.constructor(null);
	},

	// For internal use only.
	// Behaves like an Array's method, not like a jQuery method.
	push: push,
	sort: deletedIds.sort,
	splice: deletedIds.splice
};

jQuery.extend = jQuery.fn.extend = function() {
	var src, copyIsArray, copy, name, options, clone,
		target = arguments[0] || {},
		i = 1,
		length = arguments.length,
		deep = false;

	// Handle a deep copy situation
	if ( typeof target === "boolean" ) {
		deep = target;

		// skip the boolean and the target
		target = arguments[ i ] || {};
		i++;
	}

	// Handle case when target is a string or something (possible in deep copy)
	if ( typeof target !== "object" && !jQuery.isFunction(target) ) {
		target = {};
	}

	// extend jQuery itself if only one argument is passed
	if ( i === length ) {
		target = this;
		i--;
	}

	for ( ; i < length; i++ ) {
		// Only deal with non-null/undefined values
		if ( (options = arguments[ i ]) != null ) {
			// Extend the base object
			for ( name in options ) {
				src = target[ name ];
				copy = options[ name ];

				// Prevent never-ending loop
				if ( target === copy ) {
					continue;
				}

				// Recurse if we're merging plain objects or arrays
				if ( deep && copy && ( jQuery.isPlainObject(copy) || (copyIsArray = jQuery.isArray(copy)) ) ) {
					if ( copyIsArray ) {
						copyIsArray = false;
						clone = src && jQuery.isArray(src) ? src : [];

					} else {
						clone = src && jQuery.isPlainObject(src) ? src : {};
					}

					// Never move original objects, clone them
					target[ name ] = jQuery.extend( deep, clone, copy );

				// Don't bring in undefined values
				} else if ( copy !== undefined ) {
					target[ name ] = copy;
				}
			}
		}
	}

	// Return the modified object
	return target;
};

jQuery.extend({
	// Unique for each copy of jQuery on the page
	expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

	// Assume jQuery is ready without the ready module
	isReady: true,

	error: function( msg ) {
		throw new Error( msg );
	},

	noop: function() {},

	// See test/unit/core.js for details concerning isFunction.
	// Since version 1.3, DOM methods and functions like alert
	// aren't supported. They return false on IE (#2968).
	isFunction: function( obj ) {
		return jQuery.type(obj) === "function";
	},

	isArray: Array.isArray || function( obj ) {
		return jQuery.type(obj) === "array";
	},

	isWindow: function( obj ) {
		/* jshint eqeqeq: false */
		return obj != null && obj == obj.window;
	},

	isNumeric: function( obj ) {
		// parseFloat NaNs numeric-cast false positives (null|true|false|"")
		// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
		// subtraction forces infinities to NaN
		return obj - parseFloat( obj ) >= 0;
	},

	isEmptyObject: function( obj ) {
		var name;
		for ( name in obj ) {
			return false;
		}
		return true;
	},

	isPlainObject: function( obj ) {
		var key;

		// Must be an Object.
		// Because of IE, we also have to check the presence of the constructor property.
		// Make sure that DOM nodes and window objects don't pass through, as well
		if ( !obj || jQuery.type(obj) !== "object" || obj.nodeType || jQuery.isWindow( obj ) ) {
			return false;
		}

		try {
			// Not own constructor property must be Object
			if ( obj.constructor &&
				!hasOwn.call(obj, "constructor") &&
				!hasOwn.call(obj.constructor.prototype, "isPrototypeOf") ) {
				return false;
			}
		} catch ( e ) {
			// IE8,9 Will throw exceptions on certain host objects #9897
			return false;
		}

		// Support: IE<9
		// Handle iteration over inherited properties before own properties.
		if ( support.ownLast ) {
			for ( key in obj ) {
				return hasOwn.call( obj, key );
			}
		}

		// Own properties are enumerated firstly, so to speed up,
		// if last one is own, then all properties are own.
		for ( key in obj ) {}

		return key === undefined || hasOwn.call( obj, key );
	},

	type: function( obj ) {
		if ( obj == null ) {
			return obj + "";
		}
		return typeof obj === "object" || typeof obj === "function" ?
			class2type[ toString.call(obj) ] || "object" :
			typeof obj;
	},

	// Evaluates a script in a global context
	// Workarounds based on findings by Jim Driscoll
	// http://weblogs.java.net/blog/driscoll/archive/2009/09/08/eval-javascript-global-context
	globalEval: function( data ) {
		if ( data && jQuery.trim( data ) ) {
			// We use execScript on Internet Explorer
			// We use an anonymous function so that context is window
			// rather than jQuery in Firefox
			( window.execScript || function( data ) {
				window[ "eval" ].call( window, data );
			} )( data );
		}
	},

	// Convert dashed to camelCase; used by the css and data modules
	// Microsoft forgot to hump their vendor prefix (#9572)
	camelCase: function( string ) {
		return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
	},

	nodeName: function( elem, name ) {
		return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();
	},

	// args is for internal usage only
	each: function( obj, callback, args ) {
		var value,
			i = 0,
			length = obj.length,
			isArray = isArraylike( obj );

		if ( args ) {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.apply( obj[ i ], args );

					if ( value === false ) {
						break;
					}
				}
			}

		// A special, fast, case for the most common use of each
		} else {
			if ( isArray ) {
				for ( ; i < length; i++ ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			} else {
				for ( i in obj ) {
					value = callback.call( obj[ i ], i, obj[ i ] );

					if ( value === false ) {
						break;
					}
				}
			}
		}

		return obj;
	},

	// Use native String.trim function wherever possible
	trim: trim && !trim.call("\uFEFF\xA0") ?
		function( text ) {
			return text == null ?
				"" :
				trim.call( text );
		} :

		// Otherwise use our own trimming functionality
		function( text ) {
			return text == null ?
				"" :
				( text + "" ).replace( rtrim, "" );
		},

	// results is for internal usage only
	makeArray: function( arr, results ) {
		var ret = results || [];

		if ( arr != null ) {
			if ( isArraylike( Object(arr) ) ) {
				jQuery.merge( ret,
					typeof arr === "string" ?
					[ arr ] : arr
				);
			} else {
				push.call( ret, arr );
			}
		}

		return ret;
	},

	inArray: function( elem, arr, i ) {
		var len;

		if ( arr ) {
			if ( indexOf ) {
				return indexOf.call( arr, elem, i );
			}

			len = arr.length;
			i = i ? i < 0 ? Math.max( 0, len + i ) : i : 0;

			for ( ; i < len; i++ ) {
				// Skip accessing in sparse arrays
				if ( i in arr && arr[ i ] === elem ) {
					return i;
				}
			}
		}

		return -1;
	},

	merge: function( first, second ) {
		var len = +second.length,
			j = 0,
			i = first.length;

		while ( j < len ) {
			first[ i++ ] = second[ j++ ];
		}

		// Support: IE<9
		// Workaround casting of .length to NaN on otherwise arraylike objects (e.g., NodeLists)
		if ( len !== len ) {
			while ( second[j] !== undefined ) {
				first[ i++ ] = second[ j++ ];
			}
		}

		first.length = i;

		return first;
	},

	grep: function( elems, callback, invert ) {
		var callbackInverse,
			matches = [],
			i = 0,
			length = elems.length,
			callbackExpect = !invert;

		// Go through the array, only saving the items
		// that pass the validator function
		for ( ; i < length; i++ ) {
			callbackInverse = !callback( elems[ i ], i );
			if ( callbackInverse !== callbackExpect ) {
				matches.push( elems[ i ] );
			}
		}

		return matches;
	},

	// arg is for internal usage only
	map: function( elems, callback, arg ) {
		var value,
			i = 0,
			length = elems.length,
			isArray = isArraylike( elems ),
			ret = [];

		// Go through the array, translating each of the items to their new values
		if ( isArray ) {
			for ( ; i < length; i++ ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}

		// Go through every key on the object,
		} else {
			for ( i in elems ) {
				value = callback( elems[ i ], i, arg );

				if ( value != null ) {
					ret.push( value );
				}
			}
		}

		// Flatten any nested arrays
		return concat.apply( [], ret );
	},

	// A global GUID counter for objects
	guid: 1,

	// Bind a function to a context, optionally partially applying any
	// arguments.
	proxy: function( fn, context ) {
		var args, proxy, tmp;

		if ( typeof context === "string" ) {
			tmp = fn[ context ];
			context = fn;
			fn = tmp;
		}

		// Quick check to determine if target is callable, in the spec
		// this throws a TypeError, but we will just return undefined.
		if ( !jQuery.isFunction( fn ) ) {
			return undefined;
		}

		// Simulated bind
		args = slice.call( arguments, 2 );
		proxy = function() {
			return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
		};

		// Set the guid of unique handler to the same of original handler, so it can be removed
		proxy.guid = fn.guid = fn.guid || jQuery.guid++;

		return proxy;
	},

	now: function() {
		return +( new Date() );
	},

	// jQuery.support is not used in Core but other projects attach their
	// properties to it so it needs to exist.
	support: support
});

// Populate the class2type map
jQuery.each("Boolean Number String Function Array Date RegExp Object Error".split(" "), function(i, name) {
	class2type[ "[object " + name + "]" ] = name.toLowerCase();
});

function isArraylike( obj ) {
	var length = obj.length,
		type = jQuery.type( obj );

	if ( type === "function" || jQuery.isWindow( obj ) ) {
		return false;
	}

	if ( obj.nodeType === 1 && length ) {
		return true;
	}

	return type === "array" || length === 0 ||
		typeof length === "number" && length > 0 && ( length - 1 ) in obj;
}
var Sizzle =
/*!
 * Sizzle CSS Selector Engine v1.10.16
 * http://sizzlejs.com/
 *
 * Copyright 2013 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-01-13
 */
(function( window ) {

var i,
	support,
	Expr,
	getText,
	isXML,
	compile,
	outermostContext,
	sortInput,
	hasDuplicate,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	sortOrder = function( a, b ) {
		if ( a === b ) {
			hasDuplicate = true;
		}
		return 0;
	},

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Instance methods
	hasOwn = ({}).hasOwnProperty,
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},

	booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:([*^$|!~]?=)" + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

	rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		"bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rnative = /^[^{]+\{\s*\[native \w/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rsibling = /[+~]/,
	rescape = /'|\\/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
	funescape = function( _, escaped, escapedWhitespace ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		// Support: Firefox
		// Workaround erroneous numeric interpretation of +"0x"
		return high !== high || escapedWhitespace ?
			escaped :
			high < 0 ?
				// BMP codepoint
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( documentIsHTML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document (jQuery #6963)
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName && context.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
			nid = old = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var keys = [];

	function cache( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key + " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key + " " ] = value);
	}
	return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// Remove from its parent by default
		if ( div.parentNode ) {
			div.parentNode.removeChild( div );
		}
		// release memory in IE
		div = null;
	}
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
	var arr = attrs.split("|"),
		i = attrs.length;

	while ( i-- ) {
		Expr.attrHandle[ arr[i] ] = handler;
	}
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
			( ~b.sourceIndex || MAX_NEGATIVE ) -
			( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
	return context && typeof context.getElementsByTagName !== strundefined && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var hasCompare,
		doc = node ? node.ownerDocument || node : preferredDoc,
		parent = doc.defaultView;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsHTML = !isXML( doc );

	// Support: IE>8
	// If iframe document is assigned to "document" variable and if iframe has been reloaded,
	// IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
	// IE6-8 do not support the defaultView property so parent will be undefined
	if ( parent && parent !== parent.top ) {
		// IE11 does not have attachEvent, so all must suffer
		if ( parent.addEventListener ) {
			parent.addEventListener( "unload", function() {
				setDocument();
			}, false );
		} else if ( parent.attachEvent ) {
			parent.attachEvent( "onunload", function() {
				setDocument();
			});
		}
	}

	/* Attributes
	---------------------------------------------------------------------- */

	// Support: IE<8
	// Verify that getAttribute really returns attributes and not properties (excepting IE8 booleans)
	support.attributes = assert(function( div ) {
		div.className = "i";
		return !div.getAttribute("className");
	});

	/* getElement(s)By*
	---------------------------------------------------------------------- */

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if getElementsByClassName can be trusted
	support.getElementsByClassName = rnative.test( doc.getElementsByClassName ) && assert(function( div ) {
		div.innerHTML = "<div class='a'></div><div class='a i'></div>";

		// Support: Safari<4
		// Catch class over-caching
		div.firstChild.className = "i";
		// Support: Opera<10
		// Catch gEBCN failure to find non-leading classes
		return div.getElementsByClassName("i").length === 2;
	});

	// Support: IE<10
	// Check if getElementById returns elements by name
	// The broken getElementById methods don't pick up programatically-set names,
	// so use a roundabout getElementsByName test
	support.getById = assert(function( div ) {
		docElem.appendChild( div ).id = expando;
		return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
	});

	// ID find and filter
	if ( support.getById ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		// Support: IE6/7
		// getElementById is not reliable as a find shortcut
		delete Expr.find["ID"];

		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	/* QSA/matchesSelector
	---------------------------------------------------------------------- */

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21)
	// We allow this because of a bug in IE8/9 that throws an error
	// whenever `document.activeElement` is accessed on an iframe
	// So, we allow :focus to pass through QSA all the time to avoid the IE error
	// See http://bugs.jquery.com/ticket/13378
	rbuggyQSA = [];

	if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select t=''><option selected=''></option></select>";

			// Support: IE8, Opera 10-12
			// Nothing should be selected when empty strings follow ^= or $= or *=
			if ( div.querySelectorAll("[t^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
			}

			// Support: IE8
			// Boolean attributes and "value" are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {
			// Support: Windows 8 Native Apps
			// The type and name attributes are restricted during .innerHTML assignment
			var input = doc.createElement("input");
			input.setAttribute( "type", "hidden" );
			div.appendChild( input ).setAttribute( "name", "D" );

			// Support: IE8
			// Enforce case-sensitivity of name attribute
			if ( div.querySelectorAll("[name=d]").length ) {
				rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = rnative.test( (matches = docElem.webkitMatchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	/* Contains
	---------------------------------------------------------------------- */
	hasCompare = rnative.test( docElem.compareDocumentPosition );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = hasCompare || rnative.test( docElem.contains ) ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	/* Sorting
	---------------------------------------------------------------------- */

	// Document order sorting
	sortOrder = hasCompare ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		// Sort on method existence if only one input has compareDocumentPosition
		var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
		if ( compare ) {
			return compare;
		}

		// Calculate position if both inputs belong to the same document
		compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
			a.compareDocumentPosition( b ) :

			// Otherwise we know they are disconnected
			1;

		// Disconnected nodes
		if ( compare & 1 ||
			(!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

			// Choose the first element that is related to our preferred document
			if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
				return -1;
			}
			if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
				return 1;
			}

			// Maintain original order
			return sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;
		}

		return compare & 4 ? -1 : 1;
	} :
	function( a, b ) {
		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Parentless nodes are either documents or disconnected
		if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				sortInput ?
				( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return doc;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	if ( support.matchesSelector && documentIsHTML &&
		( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
		( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	var fn = Expr.attrHandle[ name.toLowerCase() ],
		// Don't get fooled by Object.prototype properties (jQuery #13807)
		val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
			fn( elem, name, !documentIsHTML ) :
			undefined;

	return val !== undefined ?
		val :
		support.attributes || !documentIsHTML ?
			elem.getAttribute( name ) :
			(val = elem.getAttributeNode(name)) && val.specified ?
				val.value :
				null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	// Clear input after sorting to release objects
	// See https://github.com/jquery/sizzle/pull/225
	sortInput = null;

	return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		while ( (node = elem[i++]) ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (jQuery #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	attrHandle: {},

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[3] && match[4] !== undefined ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeNameSelector ) {
			var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
			return nodeNameSelector === "*" ?
				function() { return true; } :
				function( elem ) {
					return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
				};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== strundefined && elem.getAttribute("class") || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
			//   but not by others (comment: 8; processing instruction: 7; etc.)
			// nodeType < 6 works because attributes (2) do not appear as children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeType < 6 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&

				// Support: IE<8
				// New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( (tokens = []) );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push({
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			});
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push({
					value: matched,
					type: type,
					matches: match
				});
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var oldCache, outerCache,
				newCache = [ dirruns, doneName ];

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (oldCache = outerCache[ dir ]) &&
							oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

							// Assign to newCache so results back-propagate to previous elements
							return (newCache[ 2 ] = oldCache[ 2 ]);
						} else {
							// Reuse newcache so results back-propagate to previous elements
							outerCache[ dir ] = newCache;

							// A match means we're done; a fail means we have to keep checking
							if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector(
						// If the preceding token was a descendant combinator, insert an implicit any-element `*`
						tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
					).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	var bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, outermost ) {
			var elem, j, matcher,
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				setMatched = [],
				contextBackup = outermostContext,
				// We must always have either seed elements or outermost context
				elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
				len = elems.length;

			if ( outermost ) {
				outermostContext = context !== document && context;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			// Support: IE<9, Safari
			// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
			for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					support.getById && context.nodeType === 9 && documentIsHTML &&
					Expr.relative[ tokens[1].type ] ) {

				context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
				if ( !context ) {
					return results;
				}
				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, seed );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector ) && testContext( context.parentNode ) || context
	);
	return results;
}

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome<14
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
	// Should return 1, but returns 4 (following)
	return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
	div.innerHTML = "<a href='#'></a>";
	return div.firstChild.getAttribute("href") === "#" ;
}) ) {
	addHandle( "type|href|height|width", function( elem, name, isXML ) {
		if ( !isXML ) {
			return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
		}
	});
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
	div.innerHTML = "<input/>";
	div.firstChild.setAttribute( "value", "" );
	return div.firstChild.getAttribute( "value" ) === "";
}) ) {
	addHandle( "value", function( elem, name, isXML ) {
		if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
			return elem.defaultValue;
		}
	});
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
	return div.getAttribute("disabled") == null;
}) ) {
	addHandle( booleans, function( elem, name, isXML ) {
		var val;
		if ( !isXML ) {
			return elem[ name ] === true ? name.toLowerCase() :
					(val = elem.getAttributeNode( name )) && val.specified ?
					val.value :
				null;
		}
	});
}

return Sizzle;

})( window );



jQuery.find = Sizzle;
jQuery.expr = Sizzle.selectors;
jQuery.expr[":"] = jQuery.expr.pseudos;
jQuery.unique = Sizzle.uniqueSort;
jQuery.text = Sizzle.getText;
jQuery.isXMLDoc = Sizzle.isXML;
jQuery.contains = Sizzle.contains;



var rneedsContext = jQuery.expr.match.needsContext;

var rsingleTag = (/^<(\w+)\s*\/?>(?:<\/\1>|)$/);



var risSimple = /^.[^:#\[\.,]*$/;

// Implement the identical functionality for filter and not
function winnow( elements, qualifier, not ) {
	if ( jQuery.isFunction( qualifier ) ) {
		return jQuery.grep( elements, function( elem, i ) {
			/* jshint -W018 */
			return !!qualifier.call( elem, i, elem ) !== not;
		});

	}

	if ( qualifier.nodeType ) {
		return jQuery.grep( elements, function( elem ) {
			return ( elem === qualifier ) !== not;
		});

	}

	if ( typeof qualifier === "string" ) {
		if ( risSimple.test( qualifier ) ) {
			return jQuery.filter( qualifier, elements, not );
		}

		qualifier = jQuery.filter( qualifier, elements );
	}

	return jQuery.grep( elements, function( elem ) {
		return ( jQuery.inArray( elem, qualifier ) >= 0 ) !== not;
	});
}

jQuery.filter = function( expr, elems, not ) {
	var elem = elems[ 0 ];

	if ( not ) {
		expr = ":not(" + expr + ")";
	}

	return elems.length === 1 && elem.nodeType === 1 ?
		jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [] :
		jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
			return elem.nodeType === 1;
		}));
};

jQuery.fn.extend({
	find: function( selector ) {
		var i,
			ret = [],
			self = this,
			len = self.length;

		if ( typeof selector !== "string" ) {
			return this.pushStack( jQuery( selector ).filter(function() {
				for ( i = 0; i < len; i++ ) {
					if ( jQuery.contains( self[ i ], this ) ) {
						return true;
					}
				}
			}) );
		}

		for ( i = 0; i < len; i++ ) {
			jQuery.find( selector, self[ i ], ret );
		}

		// Needed because $( selector, context ) becomes $( context ).find( selector )
		ret = this.pushStack( len > 1 ? jQuery.unique( ret ) : ret );
		ret.selector = this.selector ? this.selector + " " + selector : selector;
		return ret;
	},
	filter: function( selector ) {
		return this.pushStack( winnow(this, selector || [], false) );
	},
	not: function( selector ) {
		return this.pushStack( winnow(this, selector || [], true) );
	},
	is: function( selector ) {
		return !!winnow(
			this,

			// If this is a positional/relative selector, check membership in the returned set
			// so $("p:first").is("p:last") won't return true for a doc with two "p".
			typeof selector === "string" && rneedsContext.test( selector ) ?
				jQuery( selector ) :
				selector || [],
			false
		).length;
	}
});


// Initialize a jQuery object


// A central reference to the root jQuery(document)
var rootjQuery,

	// Use the correct document accordingly with window argument (sandbox)
	document = window.document,

	// A simple way to check for HTML strings
	// Prioritize #id over <tag> to avoid XSS via location.hash (#9521)
	// Strict HTML recognition (#11290: must start with <)
	rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]*))$/,

	init = jQuery.fn.init = function( selector, context ) {
		var match, elem;

		// HANDLE: $(""), $(null), $(undefined), $(false)
		if ( !selector ) {
			return this;
		}

		// Handle HTML strings
		if ( typeof selector === "string" ) {
			if ( selector.charAt(0) === "<" && selector.charAt( selector.length - 1 ) === ">" && selector.length >= 3 ) {
				// Assume that strings that start and end with <> are HTML and skip the regex check
				match = [ null, selector, null ];

			} else {
				match = rquickExpr.exec( selector );
			}

			// Match html or make sure no context is specified for #id
			if ( match && (match[1] || !context) ) {

				// HANDLE: $(html) -> $(array)
				if ( match[1] ) {
					context = context instanceof jQuery ? context[0] : context;

					// scripts is true for back-compat
					// Intentionally let the error be thrown if parseHTML is not present
					jQuery.merge( this, jQuery.parseHTML(
						match[1],
						context && context.nodeType ? context.ownerDocument || context : document,
						true
					) );

					// HANDLE: $(html, props)
					if ( rsingleTag.test( match[1] ) && jQuery.isPlainObject( context ) ) {
						for ( match in context ) {
							// Properties of context are called as methods if possible
							if ( jQuery.isFunction( this[ match ] ) ) {
								this[ match ]( context[ match ] );

							// ...and otherwise set as attributes
							} else {
								this.attr( match, context[ match ] );
							}
						}
					}

					return this;

				// HANDLE: $(#id)
				} else {
					elem = document.getElementById( match[2] );

					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE and Opera return items
						// by name instead of ID
						if ( elem.id !== match[2] ) {
							return rootjQuery.find( selector );
						}

						// Otherwise, we inject the element directly into the jQuery object
						this.length = 1;
						this[0] = elem;
					}

					this.context = document;
					this.selector = selector;
					return this;
				}

			// HANDLE: $(expr, $(...))
			} else if ( !context || context.jquery ) {
				return ( context || rootjQuery ).find( selector );

			// HANDLE: $(expr, context)
			// (which is just equivalent to: $(context).find(expr)
			} else {
				return this.constructor( context ).find( selector );
			}

		// HANDLE: $(DOMElement)
		} else if ( selector.nodeType ) {
			this.context = this[0] = selector;
			this.length = 1;
			return this;

		// HANDLE: $(function)
		// Shortcut for document ready
		} else if ( jQuery.isFunction( selector ) ) {
			return typeof rootjQuery.ready !== "undefined" ?
				rootjQuery.ready( selector ) :
				// Execute immediately if ready is not present
				selector( jQuery );
		}

		if ( selector.selector !== undefined ) {
			this.selector = selector.selector;
			this.context = selector.context;
		}

		return jQuery.makeArray( selector, this );
	};

// Give the init function the jQuery prototype for later instantiation
init.prototype = jQuery.fn;

// Initialize central reference
rootjQuery = jQuery( document );


var rparentsprev = /^(?:parents|prev(?:Until|All))/,
	// methods guaranteed to produce a unique set when starting from a unique set
	guaranteedUnique = {
		children: true,
		contents: true,
		next: true,
		prev: true
	};

jQuery.extend({
	dir: function( elem, dir, until ) {
		var matched = [],
			cur = elem[ dir ];

		while ( cur && cur.nodeType !== 9 && (until === undefined || cur.nodeType !== 1 || !jQuery( cur ).is( until )) ) {
			if ( cur.nodeType === 1 ) {
				matched.push( cur );
			}
			cur = cur[dir];
		}
		return matched;
	},

	sibling: function( n, elem ) {
		var r = [];

		for ( ; n; n = n.nextSibling ) {
			if ( n.nodeType === 1 && n !== elem ) {
				r.push( n );
			}
		}

		return r;
	}
});

jQuery.fn.extend({
	has: function( target ) {
		var i,
			targets = jQuery( target, this ),
			len = targets.length;

		return this.filter(function() {
			for ( i = 0; i < len; i++ ) {
				if ( jQuery.contains( this, targets[i] ) ) {
					return true;
				}
			}
		});
	},

	closest: function( selectors, context ) {
		var cur,
			i = 0,
			l = this.length,
			matched = [],
			pos = rneedsContext.test( selectors ) || typeof selectors !== "string" ?
				jQuery( selectors, context || this.context ) :
				0;

		for ( ; i < l; i++ ) {
			for ( cur = this[i]; cur && cur !== context; cur = cur.parentNode ) {
				// Always skip document fragments
				if ( cur.nodeType < 11 && (pos ?
					pos.index(cur) > -1 :

					// Don't pass non-elements to Sizzle
					cur.nodeType === 1 &&
						jQuery.find.matchesSelector(cur, selectors)) ) {

					matched.push( cur );
					break;
				}
			}
		}

		return this.pushStack( matched.length > 1 ? jQuery.unique( matched ) : matched );
	},

	// Determine the position of an element within
	// the matched set of elements
	index: function( elem ) {

		// No argument, return index in parent
		if ( !elem ) {
			return ( this[0] && this[0].parentNode ) ? this.first().prevAll().length : -1;
		}

		// index in selector
		if ( typeof elem === "string" ) {
			return jQuery.inArray( this[0], jQuery( elem ) );
		}

		// Locate the position of the desired element
		return jQuery.inArray(
			// If it receives a jQuery object, the first element is used
			elem.jquery ? elem[0] : elem, this );
	},

	add: function( selector, context ) {
		return this.pushStack(
			jQuery.unique(
				jQuery.merge( this.get(), jQuery( selector, context ) )
			)
		);
	},

	addBack: function( selector ) {
		return this.add( selector == null ?
			this.prevObject : this.prevObject.filter(selector)
		);
	}
});

function sibling( cur, dir ) {
	do {
		cur = cur[ dir ];
	} while ( cur && cur.nodeType !== 1 );

	return cur;
}

jQuery.each({
	parent: function( elem ) {
		var parent = elem.parentNode;
		return parent && parent.nodeType !== 11 ? parent : null;
	},
	parents: function( elem ) {
		return jQuery.dir( elem, "parentNode" );
	},
	parentsUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "parentNode", until );
	},
	next: function( elem ) {
		return sibling( elem, "nextSibling" );
	},
	prev: function( elem ) {
		return sibling( elem, "previousSibling" );
	},
	nextAll: function( elem ) {
		return jQuery.dir( elem, "nextSibling" );
	},
	prevAll: function( elem ) {
		return jQuery.dir( elem, "previousSibling" );
	},
	nextUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "nextSibling", until );
	},
	prevUntil: function( elem, i, until ) {
		return jQuery.dir( elem, "previousSibling", until );
	},
	siblings: function( elem ) {
		return jQuery.sibling( ( elem.parentNode || {} ).firstChild, elem );
	},
	children: function( elem ) {
		return jQuery.sibling( elem.firstChild );
	},
	contents: function( elem ) {
		return jQuery.nodeName( elem, "iframe" ) ?
			elem.contentDocument || elem.contentWindow.document :
			jQuery.merge( [], elem.childNodes );
	}
}, function( name, fn ) {
	jQuery.fn[ name ] = function( until, selector ) {
		var ret = jQuery.map( this, fn, until );

		if ( name.slice( -5 ) !== "Until" ) {
			selector = until;
		}

		if ( selector && typeof selector === "string" ) {
			ret = jQuery.filter( selector, ret );
		}

		if ( this.length > 1 ) {
			// Remove duplicates
			if ( !guaranteedUnique[ name ] ) {
				ret = jQuery.unique( ret );
			}

			// Reverse order for parents* and prev-derivatives
			if ( rparentsprev.test( name ) ) {
				ret = ret.reverse();
			}
		}

		return this.pushStack( ret );
	};
});
var rnotwhite = (/\S+/g);



// String to Object options format cache
var optionsCache = {};

// Convert String-formatted options into Object-formatted ones and store in cache
function createOptions( options ) {
	var object = optionsCache[ options ] = {};
	jQuery.each( options.match( rnotwhite ) || [], function( _, flag ) {
		object[ flag ] = true;
	});
	return object;
}

/*
 * Create a callback list using the following parameters:
 *
 *	options: an optional list of space-separated options that will change how
 *			the callback list behaves or a more traditional option object
 *
 * By default a callback list will act like an event callback list and can be
 * "fired" multiple times.
 *
 * Possible options:
 *
 *	once:			will ensure the callback list can only be fired once (like a Deferred)
 *
 *	memory:			will keep track of previous values and will call any callback added
 *					after the list has been fired right away with the latest "memorized"
 *					values (like a Deferred)
 *
 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
 *
 *	stopOnFalse:	interrupt callings when a callback returns false
 *
 */
jQuery.Callbacks = function( options ) {

	// Convert options from String-formatted to Object-formatted if needed
	// (we check in cache first)
	options = typeof options === "string" ?
		( optionsCache[ options ] || createOptions( options ) ) :
		jQuery.extend( {}, options );

	var // Flag to know if list is currently firing
		firing,
		// Last fire value (for non-forgettable lists)
		memory,
		// Flag to know if list was already fired
		fired,
		// End of the loop when firing
		firingLength,
		// Index of currently firing callback (modified by remove if needed)
		firingIndex,
		// First callback to fire (used internally by add and fireWith)
		firingStart,
		// Actual callback list
		list = [],
		// Stack of fire calls for repeatable lists
		stack = !options.once && [],
		// Fire callbacks
		fire = function( data ) {
			memory = options.memory && data;
			fired = true;
			firingIndex = firingStart || 0;
			firingStart = 0;
			firingLength = list.length;
			firing = true;
			for ( ; list && firingIndex < firingLength; firingIndex++ ) {
				if ( list[ firingIndex ].apply( data[ 0 ], data[ 1 ] ) === false && options.stopOnFalse ) {
					memory = false; // To prevent further calls using add
					break;
				}
			}
			firing = false;
			if ( list ) {
				if ( stack ) {
					if ( stack.length ) {
						fire( stack.shift() );
					}
				} else if ( memory ) {
					list = [];
				} else {
					self.disable();
				}
			}
		},
		// Actual Callbacks object
		self = {
			// Add a callback or a collection of callbacks to the list
			add: function() {
				if ( list ) {
					// First, we save the current length
					var start = list.length;
					(function add( args ) {
						jQuery.each( args, function( _, arg ) {
							var type = jQuery.type( arg );
							if ( type === "function" ) {
								if ( !options.unique || !self.has( arg ) ) {
									list.push( arg );
								}
							} else if ( arg && arg.length && type !== "string" ) {
								// Inspect recursively
								add( arg );
							}
						});
					})( arguments );
					// Do we need to add the callbacks to the
					// current firing batch?
					if ( firing ) {
						firingLength = list.length;
					// With memory, if we're not firing then
					// we should call right away
					} else if ( memory ) {
						firingStart = start;
						fire( memory );
					}
				}
				return this;
			},
			// Remove a callback from the list
			remove: function() {
				if ( list ) {
					jQuery.each( arguments, function( _, arg ) {
						var index;
						while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
							list.splice( index, 1 );
							// Handle firing indexes
							if ( firing ) {
								if ( index <= firingLength ) {
									firingLength--;
								}
								if ( index <= firingIndex ) {
									firingIndex--;
								}
							}
						}
					});
				}
				return this;
			},
			// Check if a given callback is in the list.
			// If no argument is given, return whether or not list has callbacks attached.
			has: function( fn ) {
				return fn ? jQuery.inArray( fn, list ) > -1 : !!( list && list.length );
			},
			// Remove all callbacks from the list
			empty: function() {
				list = [];
				firingLength = 0;
				return this;
			},
			// Have the list do nothing anymore
			disable: function() {
				list = stack = memory = undefined;
				return this;
			},
			// Is it disabled?
			disabled: function() {
				return !list;
			},
			// Lock the list in its current state
			lock: function() {
				stack = undefined;
				if ( !memory ) {
					self.disable();
				}
				return this;
			},
			// Is it locked?
			locked: function() {
				return !stack;
			},
			// Call all callbacks with the given context and arguments
			fireWith: function( context, args ) {
				if ( list && ( !fired || stack ) ) {
					args = args || [];
					args = [ context, args.slice ? args.slice() : args ];
					if ( firing ) {
						stack.push( args );
					} else {
						fire( args );
					}
				}
				return this;
			},
			// Call all the callbacks with the given arguments
			fire: function() {
				self.fireWith( this, arguments );
				return this;
			},
			// To know if the callbacks have already been called at least once
			fired: function() {
				return !!fired;
			}
		};

	return self;
};


jQuery.extend({

	Deferred: function( func ) {
		var tuples = [
				// action, add listener, listener list, final state
				[ "resolve", "done", jQuery.Callbacks("once memory"), "resolved" ],
				[ "reject", "fail", jQuery.Callbacks("once memory"), "rejected" ],
				[ "notify", "progress", jQuery.Callbacks("memory") ]
			],
			state = "pending",
			promise = {
				state: function() {
					return state;
				},
				always: function() {
					deferred.done( arguments ).fail( arguments );
					return this;
				},
				then: function( /* fnDone, fnFail, fnProgress */ ) {
					var fns = arguments;
					return jQuery.Deferred(function( newDefer ) {
						jQuery.each( tuples, function( i, tuple ) {
							var fn = jQuery.isFunction( fns[ i ] ) && fns[ i ];
							// deferred[ done | fail | progress ] for forwarding actions to newDefer
							deferred[ tuple[1] ](function() {
								var returned = fn && fn.apply( this, arguments );
								if ( returned && jQuery.isFunction( returned.promise ) ) {
									returned.promise()
										.done( newDefer.resolve )
										.fail( newDefer.reject )
										.progress( newDefer.notify );
								} else {
									newDefer[ tuple[ 0 ] + "With" ]( this === promise ? newDefer.promise() : this, fn ? [ returned ] : arguments );
								}
							});
						});
						fns = null;
					}).promise();
				},
				// Get a promise for this deferred
				// If obj is provided, the promise aspect is added to the object
				promise: function( obj ) {
					return obj != null ? jQuery.extend( obj, promise ) : promise;
				}
			},
			deferred = {};

		// Keep pipe for back-compat
		promise.pipe = promise.then;

		// Add list-specific methods
		jQuery.each( tuples, function( i, tuple ) {
			var list = tuple[ 2 ],
				stateString = tuple[ 3 ];

			// promise[ done | fail | progress ] = list.add
			promise[ tuple[1] ] = list.add;

			// Handle state
			if ( stateString ) {
				list.add(function() {
					// state = [ resolved | rejected ]
					state = stateString;

				// [ reject_list | resolve_list ].disable; progress_list.lock
				}, tuples[ i ^ 1 ][ 2 ].disable, tuples[ 2 ][ 2 ].lock );
			}

			// deferred[ resolve | reject | notify ]
			deferred[ tuple[0] ] = function() {
				deferred[ tuple[0] + "With" ]( this === deferred ? promise : this, arguments );
				return this;
			};
			deferred[ tuple[0] + "With" ] = list.fireWith;
		});

		// Make the deferred a promise
		promise.promise( deferred );

		// Call given func if any
		if ( func ) {
			func.call( deferred, deferred );
		}

		// All done!
		return deferred;
	},

	// Deferred helper
	when: function( subordinate /* , ..., subordinateN */ ) {
		var i = 0,
			resolveValues = slice.call( arguments ),
			length = resolveValues.length,

			// the count of uncompleted subordinates
			remaining = length !== 1 || ( subordinate && jQuery.isFunction( subordinate.promise ) ) ? length : 0,

			// the master Deferred. If resolveValues consist of only a single Deferred, just use that.
			deferred = remaining === 1 ? subordinate : jQuery.Deferred(),

			// Update function for both resolve and progress values
			updateFunc = function( i, contexts, values ) {
				return function( value ) {
					contexts[ i ] = this;
					values[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
					if ( values === progressValues ) {
						deferred.notifyWith( contexts, values );

					} else if ( !(--remaining) ) {
						deferred.resolveWith( contexts, values );
					}
				};
			},

			progressValues, progressContexts, resolveContexts;

		// add listeners to Deferred subordinates; treat others as resolved
		if ( length > 1 ) {
			progressValues = new Array( length );
			progressContexts = new Array( length );
			resolveContexts = new Array( length );
			for ( ; i < length; i++ ) {
				if ( resolveValues[ i ] && jQuery.isFunction( resolveValues[ i ].promise ) ) {
					resolveValues[ i ].promise()
						.done( updateFunc( i, resolveContexts, resolveValues ) )
						.fail( deferred.reject )
						.progress( updateFunc( i, progressContexts, progressValues ) );
				} else {
					--remaining;
				}
			}
		}

		// if we're not waiting on anything, resolve the master
		if ( !remaining ) {
			deferred.resolveWith( resolveContexts, resolveValues );
		}

		return deferred.promise();
	}
});


// The deferred used on DOM ready
var readyList;

jQuery.fn.ready = function( fn ) {
	// Add the callback
	jQuery.ready.promise().done( fn );

	return this;
};

jQuery.extend({
	// Is the DOM ready to be used? Set to true once it occurs.
	isReady: false,

	// A counter to track how many items to wait for before
	// the ready event fires. See #6781
	readyWait: 1,

	// Hold (or release) the ready event
	holdReady: function( hold ) {
		if ( hold ) {
			jQuery.readyWait++;
		} else {
			jQuery.ready( true );
		}
	},

	// Handle when the DOM is ready
	ready: function( wait ) {

		// Abort if there are pending holds or we're already ready
		if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
			return;
		}

		// Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
		if ( !document.body ) {
			return setTimeout( jQuery.ready );
		}

		// Remember that the DOM is ready
		jQuery.isReady = true;

		// If a normal DOM Ready event fired, decrement, and wait if need be
		if ( wait !== true && --jQuery.readyWait > 0 ) {
			return;
		}

		// If there are functions bound, to execute
		readyList.resolveWith( document, [ jQuery ] );

		// Trigger any bound ready events
		if ( jQuery.fn.trigger ) {
			jQuery( document ).trigger("ready").off("ready");
		}
	}
});

/**
 * Clean-up method for dom ready events
 */
function detach() {
	if ( document.addEventListener ) {
		document.removeEventListener( "DOMContentLoaded", completed, false );
		window.removeEventListener( "load", completed, false );

	} else {
		document.detachEvent( "onreadystatechange", completed );
		window.detachEvent( "onload", completed );
	}
}

/**
 * The ready event handler and self cleanup method
 */
function completed() {
	// readyState === "complete" is good enough for us to call the dom ready in oldIE
	if ( document.addEventListener || event.type === "load" || document.readyState === "complete" ) {
		detach();
		jQuery.ready();
	}
}

jQuery.ready.promise = function( obj ) {
	if ( !readyList ) {

		readyList = jQuery.Deferred();

		// Catch cases where $(document).ready() is called after the browser event has already occurred.
		// we once tried to use readyState "interactive" here, but it caused issues like the one
		// discovered by ChrisS here: http://bugs.jquery.com/ticket/12282#comment:15
		if ( document.readyState === "complete" ) {
			// Handle it asynchronously to allow scripts the opportunity to delay ready
			setTimeout( jQuery.ready );

		// Standards-based browsers support DOMContentLoaded
		} else if ( document.addEventListener ) {
			// Use the handy event callback
			document.addEventListener( "DOMContentLoaded", completed, false );

			// A fallback to window.onload, that will always work
			window.addEventListener( "load", completed, false );

		// If IE event model is used
		} else {
			// Ensure firing before onload, maybe late but safe also for iframes
			document.attachEvent( "onreadystatechange", completed );

			// A fallback to window.onload, that will always work
			window.attachEvent( "onload", completed );

			// If IE and not a frame
			// continually check to see if the document is ready
			var top = false;

			try {
				top = window.frameElement == null && document.documentElement;
			} catch(e) {}

			if ( top && top.doScroll ) {
				(function doScrollCheck() {
					if ( !jQuery.isReady ) {

						try {
							// Use the trick by Diego Perini
							// http://javascript.nwbox.com/IEContentLoaded/
							top.doScroll("left");
						} catch(e) {
							return setTimeout( doScrollCheck, 50 );
						}

						// detach all dom ready events
						detach();

						// and execute any waiting functions
						jQuery.ready();
					}
				})();
			}
		}
	}
	return readyList.promise( obj );
};


var strundefined = typeof undefined;



// Support: IE<9
// Iteration over object's inherited properties before its own
var i;
for ( i in jQuery( support ) ) {
	break;
}
support.ownLast = i !== "0";

// Note: most support tests are defined in their respective modules.
// false until the test is run
support.inlineBlockNeedsLayout = false;

jQuery(function() {
	// We need to execute this one support test ASAP because we need to know
	// if body.style.zoom needs to be set.

	var container, div,
		body = document.getElementsByTagName("body")[0];

	if ( !body ) {
		// Return for frameset docs that don't have a body
		return;
	}

	// Setup
	container = document.createElement( "div" );
	container.style.cssText = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px;margin-top:1px";

	div = document.createElement( "div" );
	body.appendChild( container ).appendChild( div );

	if ( typeof div.style.zoom !== strundefined ) {
		// Support: IE<8
		// Check if natively block-level elements act like inline-block
		// elements when setting their display to 'inline' and giving
		// them layout
		div.style.cssText = "border:0;margin:0;width:1px;padding:1px;display:inline;zoom:1";

		if ( (support.inlineBlockNeedsLayout = ( div.offsetWidth === 3 )) ) {
			// Prevent IE 6 from affecting layout for positioned elements #11048
			// Prevent IE from shrinking the body in IE 7 mode #12869
			// Support: IE<8
			body.style.zoom = 1;
		}
	}

	body.removeChild( container );

	// Null elements to avoid leaks in IE
	container = div = null;
});




(function() {
	var div = document.createElement( "div" );

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


/**
 * Determines whether an object can have data
 */
jQuery.acceptData = function( elem ) {
	var noData = jQuery.noData[ (elem.nodeName + " ").toLowerCase() ],
		nodeType = +elem.nodeType || 1;

	// Do not set data on non-element DOM nodes because it will not be cleared (#8335).
	return nodeType !== 1 && nodeType !== 9 ?
		false :

		// Nodes accept data unless otherwise specified; rejection can be conditional
		!noData || noData !== true && elem.getAttribute("classid") === noData;
};


var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
	rmultiDash = /([A-Z])/g;

function dataAttr( elem, key, data ) {
	// If nothing was found internally, try to fetch any
	// data from the HTML5 data-* attribute
	if ( data === undefined && elem.nodeType === 1 ) {

		var name = "data-" + key.replace( rmultiDash, "-$1" ).toLowerCase();

		data = elem.getAttribute( name );

		if ( typeof data === "string" ) {
			try {
				data = data === "true" ? true :
					data === "false" ? false :
					data === "null" ? null :
					// Only convert to a number if it doesn't change the string
					+data + "" === data ? +data :
					rbrace.test( data ) ? jQuery.parseJSON( data ) :
					data;
			} catch( e ) {}

			// Make sure we set the data so it isn't changed later
			jQuery.data( elem, key, data );

		} else {
			data = undefined;
		}
	}

	return data;
}

// checks a cache object for emptiness
function isEmptyDataObject( obj ) {
	var name;
	for ( name in obj ) {

		// if the public data object is empty, the private is still empty
		if ( name === "data" && jQuery.isEmptyObject( obj[name] ) ) {
			continue;
		}
		if ( name !== "toJSON" ) {
			return false;
		}
	}

	return true;
}

function internalData( elem, name, data, pvt /* Internal Use Only */ ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var ret, thisCache,
		internalKey = jQuery.expando,

		// We have to handle DOM nodes and JS objects differently because IE6-7
		// can't GC object references properly across the DOM-JS boundary
		isNode = elem.nodeType,

		// Only DOM nodes need the global jQuery cache; JS object data is
		// attached directly to the object so GC can occur automatically
		cache = isNode ? jQuery.cache : elem,

		// Only defining an ID for JS objects if its cache already exists allows
		// the code to shortcut on the same path as a DOM node with no cache
		id = isNode ? elem[ internalKey ] : elem[ internalKey ] && internalKey;

	// Avoid doing any more work than we need to when trying to get data on an
	// object that has no data at all
	if ( (!id || !cache[id] || (!pvt && !cache[id].data)) && data === undefined && typeof name === "string" ) {
		return;
	}

	if ( !id ) {
		// Only DOM nodes need a new unique ID for each element since their data
		// ends up in the global cache
		if ( isNode ) {
			id = elem[ internalKey ] = deletedIds.pop() || jQuery.guid++;
		} else {
			id = internalKey;
		}
	}

	if ( !cache[ id ] ) {
		// Avoid exposing jQuery metadata on plain JS objects when the object
		// is serialized using JSON.stringify
		cache[ id ] = isNode ? {} : { toJSON: jQuery.noop };
	}

	// An object can be passed to jQuery.data instead of a key/value pair; this gets
	// shallow copied over onto the existing cache
	if ( typeof name === "object" || typeof name === "function" ) {
		if ( pvt ) {
			cache[ id ] = jQuery.extend( cache[ id ], name );
		} else {
			cache[ id ].data = jQuery.extend( cache[ id ].data, name );
		}
	}

	thisCache = cache[ id ];

	// jQuery data() is stored in a separate object inside the object's internal data
	// cache in order to avoid key collisions between internal data and user-defined
	// data.
	if ( !pvt ) {
		if ( !thisCache.data ) {
			thisCache.data = {};
		}

		thisCache = thisCache.data;
	}

	if ( data !== undefined ) {
		thisCache[ jQuery.camelCase( name ) ] = data;
	}

	// Check for both converted-to-camel and non-converted data property names
	// If a data property was specified
	if ( typeof name === "string" ) {

		// First Try to find as-is property data
		ret = thisCache[ name ];

		// Test for null|undefined property data
		if ( ret == null ) {

			// Try to find the camelCased property
			ret = thisCache[ jQuery.camelCase( name ) ];
		}
	} else {
		ret = thisCache;
	}

	return ret;
}

function internalRemoveData( elem, name, pvt ) {
	if ( !jQuery.acceptData( elem ) ) {
		return;
	}

	var thisCache, i,
		isNode = elem.nodeType,

		// See jQuery.data for more information
		cache = isNode ? jQuery.cache : elem,
		id = isNode ? elem[ jQuery.expando ] : jQuery.expando;

	// If there is already no cache entry for this object, there is no
	// purpose in continuing
	if ( !cache[ id ] ) {
		return;
	}

	if ( name ) {

		thisCache = pvt ? cache[ id ] : cache[ id ].data;

		if ( thisCache ) {

			// Support array or space separated string names for data keys
			if ( !jQuery.isArray( name ) ) {

				// try the string as a key before any manipulation
				if ( name in thisCache ) {
					name = [ name ];
				} else {

					// split the camel cased version by spaces unless a key with the spaces exists
					name = jQuery.camelCase( name );
					if ( name in thisCache ) {
						name = [ name ];
					} else {
						name = name.split(" ");
					}
				}
			} else {
				// If "name" is an array of keys...
				// When data is initially created, via ("key", "val") signature,
				// keys will be converted to camelCase.
				// Since there is no way to tell _how_ a key was added, remove
				// both plain key and camelCase key. #12786
				// This will only penalize the array argument path.
				name = name.concat( jQuery.map( name, jQuery.camelCase ) );
			}

			i = name.length;
			while ( i-- ) {
				delete thisCache[ name[i] ];
			}

			// If there is no data left in the cache, we want to continue
			// and let the cache object itself get destroyed
			if ( pvt ? !isEmptyDataObject(thisCache) : !jQuery.isEmptyObject(thisCache) ) {
				return;
			}
		}
	}

	// See jQuery.data for more information
	if ( !pvt ) {
		delete cache[ id ].data;

		// Don't destroy the parent cache unless the internal data object
		// had been the only thing left in it
		if ( !isEmptyDataObject( cache[ id ] ) ) {
			return;
		}
	}

	// Destroy the cache
	if ( isNode ) {
		jQuery.cleanData( [ elem ], true );

	// Use delete when supported for expandos or `cache` is not a window per isWindow (#10080)
	/* jshint eqeqeq: false */
	} else if ( support.deleteExpando || cache != cache.window ) {
		/* jshint eqeqeq: true */
		delete cache[ id ];

	// When all else fails, null
	} else {
		cache[ id ] = null;
	}
}

jQuery.extend({
	cache: {},

	// The following elements (space-suffixed to avoid Object.prototype collisions)
	// throw uncatchable exceptions if you attempt to set expando properties
	noData: {
		"applet ": true,
		"embed ": true,
		// ...but Flash objects (which have this classid) *can* handle expandos
		"object ": "clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"
	},

	hasData: function( elem ) {
		elem = elem.nodeType ? jQuery.cache[ elem[jQuery.expando] ] : elem[ jQuery.expando ];
		return !!elem && !isEmptyDataObject( elem );
	},

	data: function( elem, name, data ) {
		return internalData( elem, name, data );
	},

	removeData: function( elem, name ) {
		return internalRemoveData( elem, name );
	},

	// For internal use only.
	_data: function( elem, name, data ) {
		return internalData( elem, name, data, true );
	},

	_removeData: function( elem, name ) {
		return internalRemoveData( elem, name, true );
	}
});

jQuery.fn.extend({
	data: function( key, value ) {
		var i, name, data,
			elem = this[0],
			attrs = elem && elem.attributes;

		// Special expections of .data basically thwart jQuery.access,
		// so implement the relevant behavior ourselves

		// Gets all values
		if ( key === undefined ) {
			if ( this.length ) {
				data = jQuery.data( elem );

				if ( elem.nodeType === 1 && !jQuery._data( elem, "parsedAttrs" ) ) {
					i = attrs.length;
					while ( i-- ) {
						name = attrs[i].name;

						if ( name.indexOf("data-") === 0 ) {
							name = jQuery.camelCase( name.slice(5) );

							dataAttr( elem, name, data[ name ] );
						}
					}
					jQuery._data( elem, "parsedAttrs", true );
				}
			}

			return data;
		}

		// Sets multiple values
		if ( typeof key === "object" ) {
			return this.each(function() {
				jQuery.data( this, key );
			});
		}

		return arguments.length > 1 ?

			// Sets one value
			this.each(function() {
				jQuery.data( this, key, value );
			}) :

			// Gets one value
			// Try to fetch any internally stored data first
			elem ? dataAttr( elem, key, jQuery.data( elem, key ) ) : undefined;
	},

	removeData: function( key ) {
		return this.each(function() {
			jQuery.removeData( this, key );
		});
	}
});


jQuery.extend({
	queue: function( elem, type, data ) {
		var queue;

		if ( elem ) {
			type = ( type || "fx" ) + "queue";
			queue = jQuery._data( elem, type );

			// Speed up dequeue by getting out quickly if this is just a lookup
			if ( data ) {
				if ( !queue || jQuery.isArray(data) ) {
					queue = jQuery._data( elem, type, jQuery.makeArray(data) );
				} else {
					queue.push( data );
				}
			}
			return queue || [];
		}
	},

	dequeue: function( elem, type ) {
		type = type || "fx";

		var queue = jQuery.queue( elem, type ),
			startLength = queue.length,
			fn = queue.shift(),
			hooks = jQuery._queueHooks( elem, type ),
			next = function() {
				jQuery.dequeue( elem, type );
			};

		// If the fx queue is dequeued, always remove the progress sentinel
		if ( fn === "inprogress" ) {
			fn = queue.shift();
			startLength--;
		}

		if ( fn ) {

			// Add a progress sentinel to prevent the fx queue from being
			// automatically dequeued
			if ( type === "fx" ) {
				queue.unshift( "inprogress" );
			}

			// clear up the last queue stop function
			delete hooks.stop;
			fn.call( elem, next, hooks );
		}

		if ( !startLength && hooks ) {
			hooks.empty.fire();
		}
	},

	// not intended for public consumption - generates a queueHooks object, or returns the current one
	_queueHooks: function( elem, type ) {
		var key = type + "queueHooks";
		return jQuery._data( elem, key ) || jQuery._data( elem, key, {
			empty: jQuery.Callbacks("once memory").add(function() {
				jQuery._removeData( elem, type + "queue" );
				jQuery._removeData( elem, key );
			})
		});
	}
});

jQuery.fn.extend({
	queue: function( type, data ) {
		var setter = 2;

		if ( typeof type !== "string" ) {
			data = type;
			type = "fx";
			setter--;
		}

		if ( arguments.length < setter ) {
			return jQuery.queue( this[0], type );
		}

		return data === undefined ?
			this :
			this.each(function() {
				var queue = jQuery.queue( this, type, data );

				// ensure a hooks for this queue
				jQuery._queueHooks( this, type );

				if ( type === "fx" && queue[0] !== "inprogress" ) {
					jQuery.dequeue( this, type );
				}
			});
	},
	dequeue: function( type ) {
		return this.each(function() {
			jQuery.dequeue( this, type );
		});
	},
	clearQueue: function( type ) {
		return this.queue( type || "fx", [] );
	},
	// Get a promise resolved when queues of a certain type
	// are emptied (fx is the type by default)
	promise: function( type, obj ) {
		var tmp,
			count = 1,
			defer = jQuery.Deferred(),
			elements = this,
			i = this.length,
			resolve = function() {
				if ( !( --count ) ) {
					defer.resolveWith( elements, [ elements ] );
				}
			};

		if ( typeof type !== "string" ) {
			obj = type;
			type = undefined;
		}
		type = type || "fx";

		while ( i-- ) {
			tmp = jQuery._data( elements[ i ], type + "queueHooks" );
			if ( tmp && tmp.empty ) {
				count++;
				tmp.empty.add( resolve );
			}
		}
		resolve();
		return defer.promise( obj );
	}
});
var pnum = (/[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/).source;

var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

var isHidden = function( elem, el ) {
		// isHidden might be called from jQuery#filter function;
		// in that case, element will be second argument
		elem = el || elem;
		return jQuery.css( elem, "display" ) === "none" || !jQuery.contains( elem.ownerDocument, elem );
	};



// Multifunctional method to get and set values of a collection
// The value/s can optionally be executed if it's a function
var access = jQuery.access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
	var i = 0,
		length = elems.length,
		bulk = key == null;

	// Sets many values
	if ( jQuery.type( key ) === "object" ) {
		chainable = true;
		for ( i in key ) {
			jQuery.access( elems, fn, i, key[i], true, emptyGet, raw );
		}

	// Sets one value
	} else if ( value !== undefined ) {
		chainable = true;

		if ( !jQuery.isFunction( value ) ) {
			raw = true;
		}

		if ( bulk ) {
			// Bulk operations run against the entire set
			if ( raw ) {
				fn.call( elems, value );
				fn = null;

			// ...except when executing function values
			} else {
				bulk = fn;
				fn = function( elem, key, value ) {
					return bulk.call( jQuery( elem ), value );
				};
			}
		}

		if ( fn ) {
			for ( ; i < length; i++ ) {
				fn( elems[i], key, raw ? value : value.call( elems[i], i, fn( elems[i], key ) ) );
			}
		}
	}

	return chainable ?
		elems :

		// Gets
		bulk ?
			fn.call( elems ) :
			length ? fn( elems[0], key ) : emptyGet;
};
var rcheckableType = (/^(?:checkbox|radio)$/i);



(function() {
	var fragment = document.createDocumentFragment(),
		div = document.createElement("div"),
		input = document.createElement("input");

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a>";

	// IE strips leading whitespace when .innerHTML is used
	support.leadingWhitespace = div.firstChild.nodeType === 3;

	// Make sure that tbody elements aren't automatically inserted
	// IE will insert them into empty tables
	support.tbody = !div.getElementsByTagName( "tbody" ).length;

	// Make sure that link elements get serialized correctly by innerHTML
	// This requires a wrapper element in IE
	support.htmlSerialize = !!div.getElementsByTagName( "link" ).length;

	// Makes sure cloning an html5 element does not cause problems
	// Where outerHTML is undefined, this still works
	support.html5Clone =
		document.createElement( "nav" ).cloneNode( true ).outerHTML !== "<:nav></:nav>";

	// Check if a disconnected checkbox will retain its checked
	// value of true after appended to the DOM (IE6/7)
	input.type = "checkbox";
	input.checked = true;
	fragment.appendChild( input );
	support.appendChecked = input.checked;

	// Make sure textarea (and checkbox) defaultValue is properly cloned
	// Support: IE6-IE11+
	div.innerHTML = "<textarea>x</textarea>";
	support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

	// #11217 - WebKit loses check when the name is after the checked attribute
	fragment.appendChild( div );
	div.innerHTML = "<input type='radio' checked='checked' name='t'/>";

	// Support: Safari 5.1, iOS 5.1, Android 4.x, Android 2.3
	// old WebKit doesn't clone checked state correctly in fragments
	support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

	// Support: IE<9
	// Opera does not clone events (and typeof div.attachEvent === undefined).
	// IE9-10 clones events bound via attachEvent, but they don't trigger with .click()
	support.noCloneEvent = true;
	if ( div.attachEvent ) {
		div.attachEvent( "onclick", function() {
			support.noCloneEvent = false;
		});

		div.cloneNode( true ).click();
	}

	// Execute the test only if not already executed in another module.
	if (support.deleteExpando == null) {
		// Support: IE<9
		support.deleteExpando = true;
		try {
			delete div.test;
		} catch( e ) {
			support.deleteExpando = false;
		}
	}

	// Null elements to avoid leaks in IE.
	fragment = div = input = null;
})();


(function() {
	var i, eventName,
		div = document.createElement( "div" );

	// Support: IE<9 (lack submit/change bubble), Firefox 23+ (lack focusin event)
	for ( i in { submit: true, change: true, focusin: true }) {
		eventName = "on" + i;

		if ( !(support[ i + "Bubbles" ] = eventName in window) ) {
			// Beware of CSP restrictions (https://developer.mozilla.org/en/Security/CSP)
			div.setAttribute( eventName, "t" );
			support[ i + "Bubbles" ] = div.attributes[ eventName ].expando === false;
		}
	}

	// Null elements to avoid leaks in IE.
	div = null;
})();


var rformElems = /^(?:input|select|textarea)$/i,
	rkeyEvent = /^key/,
	rmouseEvent = /^(?:mouse|contextmenu)|click/,
	rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
	rtypenamespace = /^([^.]*)(?:\.(.+)|)$/;

function returnTrue() {
	return true;
}

function returnFalse() {
	return false;
}

function safeActiveElement() {
	try {
		return document.activeElement;
	} catch ( err ) { }
}

/*
 * Helper functions for managing events -- not part of the public interface.
 * Props to Dean Edwards' addEvent library for many of the ideas.
 */
jQuery.event = {

	global: {},

	add: function( elem, types, handler, data, selector ) {
		var tmp, events, t, handleObjIn,
			special, eventHandle, handleObj,
			handlers, type, namespaces, origType,
			elemData = jQuery._data( elem );

		// Don't attach events to noData or text/comment nodes (but allow plain objects)
		if ( !elemData ) {
			return;
		}

		// Caller can pass in an object of custom data in lieu of the handler
		if ( handler.handler ) {
			handleObjIn = handler;
			handler = handleObjIn.handler;
			selector = handleObjIn.selector;
		}

		// Make sure that the handler has a unique ID, used to find/remove it later
		if ( !handler.guid ) {
			handler.guid = jQuery.guid++;
		}

		// Init the element's event structure and main handler, if this is the first
		if ( !(events = elemData.events) ) {
			events = elemData.events = {};
		}
		if ( !(eventHandle = elemData.handle) ) {
			eventHandle = elemData.handle = function( e ) {
				// Discard the second event of a jQuery.event.trigger() and
				// when an event is called after a page has unloaded
				return typeof jQuery !== strundefined && (!e || jQuery.event.triggered !== e.type) ?
					jQuery.event.dispatch.apply( eventHandle.elem, arguments ) :
					undefined;
			};
			// Add elem as a property of the handle fn to prevent a memory leak with IE non-native events
			eventHandle.elem = elem;
		}

		// Handle multiple events separated by a space
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// There *must* be a type, no attaching namespace-only handlers
			if ( !type ) {
				continue;
			}

			// If event changes its type, use the special event handlers for the changed type
			special = jQuery.event.special[ type ] || {};

			// If selector defined, determine special event api type, otherwise given type
			type = ( selector ? special.delegateType : special.bindType ) || type;

			// Update special based on newly reset type
			special = jQuery.event.special[ type ] || {};

			// handleObj is passed to all event handlers
			handleObj = jQuery.extend({
				type: type,
				origType: origType,
				data: data,
				handler: handler,
				guid: handler.guid,
				selector: selector,
				needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
				namespace: namespaces.join(".")
			}, handleObjIn );

			// Init the event handler queue if we're the first
			if ( !(handlers = events[ type ]) ) {
				handlers = events[ type ] = [];
				handlers.delegateCount = 0;

				// Only use addEventListener/attachEvent if the special events handler returns false
				if ( !special.setup || special.setup.call( elem, data, namespaces, eventHandle ) === false ) {
					// Bind the global event handler to the element
					if ( elem.addEventListener ) {
						elem.addEventListener( type, eventHandle, false );

					} else if ( elem.attachEvent ) {
						elem.attachEvent( "on" + type, eventHandle );
					}
				}
			}

			if ( special.add ) {
				special.add.call( elem, handleObj );

				if ( !handleObj.handler.guid ) {
					handleObj.handler.guid = handler.guid;
				}
			}

			// Add to the element's handler list, delegates in front
			if ( selector ) {
				handlers.splice( handlers.delegateCount++, 0, handleObj );
			} else {
				handlers.push( handleObj );
			}

			// Keep track of which events have ever been used, for event optimization
			jQuery.event.global[ type ] = true;
		}

		// Nullify elem to prevent memory leaks in IE
		elem = null;
	},

	// Detach an event or set of events from an element
	remove: function( elem, types, handler, selector, mappedTypes ) {
		var j, handleObj, tmp,
			origCount, t, events,
			special, handlers, type,
			namespaces, origType,
			elemData = jQuery.hasData( elem ) && jQuery._data( elem );

		if ( !elemData || !(events = elemData.events) ) {
			return;
		}

		// Once for each type.namespace in types; type may be omitted
		types = ( types || "" ).match( rnotwhite ) || [ "" ];
		t = types.length;
		while ( t-- ) {
			tmp = rtypenamespace.exec( types[t] ) || [];
			type = origType = tmp[1];
			namespaces = ( tmp[2] || "" ).split( "." ).sort();

			// Unbind all events (on this namespace, if provided) for the element
			if ( !type ) {
				for ( type in events ) {
					jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
				}
				continue;
			}

			special = jQuery.event.special[ type ] || {};
			type = ( selector ? special.delegateType : special.bindType ) || type;
			handlers = events[ type ] || [];
			tmp = tmp[2] && new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" );

			// Remove matching events
			origCount = j = handlers.length;
			while ( j-- ) {
				handleObj = handlers[ j ];

				if ( ( mappedTypes || origType === handleObj.origType ) &&
					( !handler || handler.guid === handleObj.guid ) &&
					( !tmp || tmp.test( handleObj.namespace ) ) &&
					( !selector || selector === handleObj.selector || selector === "**" && handleObj.selector ) ) {
					handlers.splice( j, 1 );

					if ( handleObj.selector ) {
						handlers.delegateCount--;
					}
					if ( special.remove ) {
						special.remove.call( elem, handleObj );
					}
				}
			}

			// Remove generic event handler if we removed something and no more handlers exist
			// (avoids potential for endless recursion during removal of special event handlers)
			if ( origCount && !handlers.length ) {
				if ( !special.teardown || special.teardown.call( elem, namespaces, elemData.handle ) === false ) {
					jQuery.removeEvent( elem, type, elemData.handle );
				}

				delete events[ type ];
			}
		}

		// Remove the expando if it's no longer used
		if ( jQuery.isEmptyObject( events ) ) {
			delete elemData.handle;

			// removeData also checks for emptiness and clears the expando if empty
			// so use it instead of delete
			jQuery._removeData( elem, "events" );
		}
	},

	trigger: function( event, data, elem, onlyHandlers ) {
		var handle, ontype, cur,
			bubbleType, special, tmp, i,
			eventPath = [ elem || document ],
			type = hasOwn.call( event, "type" ) ? event.type : event,
			namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split(".") : [];

		cur = tmp = elem = elem || document;

		// Don't do events on text and comment nodes
		if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
			return;
		}

		// focus/blur morphs to focusin/out; ensure we're not firing them right now
		if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
			return;
		}

		if ( type.indexOf(".") >= 0 ) {
			// Namespaced trigger; create a regexp to match event type in handle()
			namespaces = type.split(".");
			type = namespaces.shift();
			namespaces.sort();
		}
		ontype = type.indexOf(":") < 0 && "on" + type;

		// Caller can pass in a jQuery.Event object, Object, or just an event type string
		event = event[ jQuery.expando ] ?
			event :
			new jQuery.Event( type, typeof event === "object" && event );

		// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
		event.isTrigger = onlyHandlers ? 2 : 3;
		event.namespace = namespaces.join(".");
		event.namespace_re = event.namespace ?
			new RegExp( "(^|\\.)" + namespaces.join("\\.(?:.*\\.|)") + "(\\.|$)" ) :
			null;

		// Clean up the event in case it is being reused
		event.result = undefined;
		if ( !event.target ) {
			event.target = elem;
		}

		// Clone any incoming data and prepend the event, creating the handler arg list
		data = data == null ?
			[ event ] :
			jQuery.makeArray( data, [ event ] );

		// Allow special events to draw outside the lines
		special = jQuery.event.special[ type ] || {};
		if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
			return;
		}

		// Determine event propagation path in advance, per W3C events spec (#9951)
		// Bubble up to document, then to window; watch for a global ownerDocument var (#9724)
		if ( !onlyHandlers && !special.noBubble && !jQuery.isWindow( elem ) ) {

			bubbleType = special.delegateType || type;
			if ( !rfocusMorph.test( bubbleType + type ) ) {
				cur = cur.parentNode;
			}
			for ( ; cur; cur = cur.parentNode ) {
				eventPath.push( cur );
				tmp = cur;
			}

			// Only add window if we got to document (e.g., not plain obj or detached DOM)
			if ( tmp === (elem.ownerDocument || document) ) {
				eventPath.push( tmp.defaultView || tmp.parentWindow || window );
			}
		}

		// Fire handlers on the event path
		i = 0;
		while ( (cur = eventPath[i++]) && !event.isPropagationStopped() ) {

			event.type = i > 1 ?
				bubbleType :
				special.bindType || type;

			// jQuery handler
			handle = ( jQuery._data( cur, "events" ) || {} )[ event.type ] && jQuery._data( cur, "handle" );
			if ( handle ) {
				handle.apply( cur, data );
			}

			// Native handler
			handle = ontype && cur[ ontype ];
			if ( handle && handle.apply && jQuery.acceptData( cur ) ) {
				event.result = handle.apply( cur, data );
				if ( event.result === false ) {
					event.preventDefault();
				}
			}
		}
		event.type = type;

		// If nobody prevented the default action, do it now
		if ( !onlyHandlers && !event.isDefaultPrevented() ) {

			if ( (!special._default || special._default.apply( eventPath.pop(), data ) === false) &&
				jQuery.acceptData( elem ) ) {

				// Call a native DOM method on the target with the same name name as the event.
				// Can't use an .isFunction() check here because IE6/7 fails that test.
				// Don't do default actions on window, that's where global variables be (#6170)
				if ( ontype && elem[ type ] && !jQuery.isWindow( elem ) ) {

					// Don't re-trigger an onFOO event when we call its FOO() method
					tmp = elem[ ontype ];

					if ( tmp ) {
						elem[ ontype ] = null;
					}

					// Prevent re-triggering of the same event, since we already bubbled it above
					jQuery.event.triggered = type;
					try {
						elem[ type ]();
					} catch ( e ) {
						// IE<9 dies on focus/blur to hidden element (#1486,#12518)
						// only reproducible on winXP IE8 native, not IE9 in IE8 mode
					}
					jQuery.event.triggered = undefined;

					if ( tmp ) {
						elem[ ontype ] = tmp;
					}
				}
			}
		}

		return event.result;
	},

	dispatch: function( event ) {

		// Make a writable jQuery.Event from the native event object
		event = jQuery.event.fix( event );

		var i, ret, handleObj, matched, j,
			handlerQueue = [],
			args = slice.call( arguments ),
			handlers = ( jQuery._data( this, "events" ) || {} )[ event.type ] || [],
			special = jQuery.event.special[ event.type ] || {};

		// Use the fix-ed jQuery.Event rather than the (read-only) native event
		args[0] = event;
		event.delegateTarget = this;

		// Call the preDispatch hook for the mapped type, and let it bail if desired
		if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
			return;
		}

		// Determine handlers
		handlerQueue = jQuery.event.handlers.call( this, event, handlers );

		// Run delegates first; they may want to stop propagation beneath us
		i = 0;
		while ( (matched = handlerQueue[ i++ ]) && !event.isPropagationStopped() ) {
			event.currentTarget = matched.elem;

			j = 0;
			while ( (handleObj = matched.handlers[ j++ ]) && !event.isImmediatePropagationStopped() ) {

				// Triggered event must either 1) have no namespace, or
				// 2) have namespace(s) a subset or equal to those in the bound event (both can have no namespace).
				if ( !event.namespace_re || event.namespace_re.test( handleObj.namespace ) ) {

					event.handleObj = handleObj;
					event.data = handleObj.data;

					ret = ( (jQuery.event.special[ handleObj.origType ] || {}).handle || handleObj.handler )
							.apply( matched.elem, args );

					if ( ret !== undefined ) {
						if ( (event.result = ret) === false ) {
							event.preventDefault();
							event.stopPropagation();
						}
					}
				}
			}
		}

		// Call the postDispatch hook for the mapped type
		if ( special.postDispatch ) {
			special.postDispatch.call( this, event );
		}

		return event.result;
	},

	handlers: function( event, handlers ) {
		var sel, handleObj, matches, i,
			handlerQueue = [],
			delegateCount = handlers.delegateCount,
			cur = event.target;

		// Find delegate handlers
		// Black-hole SVG <use> instance trees (#13180)
		// Avoid non-left-click bubbling in Firefox (#3861)
		if ( delegateCount && cur.nodeType && (!event.button || event.type !== "click") ) {

			/* jshint eqeqeq: false */
			for ( ; cur != this; cur = cur.parentNode || this ) {
				/* jshint eqeqeq: true */

				// Don't check non-elements (#13208)
				// Don't process clicks on disabled elements (#6911, #8165, #11382, #11764)
				if ( cur.nodeType === 1 && (cur.disabled !== true || event.type !== "click") ) {
					matches = [];
					for ( i = 0; i < delegateCount; i++ ) {
						handleObj = handlers[ i ];

						// Don't conflict with Object.prototype properties (#13203)
						sel = handleObj.selector + " ";

						if ( matches[ sel ] === undefined ) {
							matches[ sel ] = handleObj.needsContext ?
								jQuery( sel, this ).index( cur ) >= 0 :
								jQuery.find( sel, this, null, [ cur ] ).length;
						}
						if ( matches[ sel ] ) {
							matches.push( handleObj );
						}
					}
					if ( matches.length ) {
						handlerQueue.push({ elem: cur, handlers: matches });
					}
				}
			}
		}

		// Add the remaining (directly-bound) handlers
		if ( delegateCount < handlers.length ) {
			handlerQueue.push({ elem: this, handlers: handlers.slice( delegateCount ) });
		}

		return handlerQueue;
	},

	fix: function( event ) {
		if ( event[ jQuery.expando ] ) {
			return event;
		}

		// Create a writable copy of the event object and normalize some properties
		var i, prop, copy,
			type = event.type,
			originalEvent = event,
			fixHook = this.fixHooks[ type ];

		if ( !fixHook ) {
			this.fixHooks[ type ] = fixHook =
				rmouseEvent.test( type ) ? this.mouseHooks :
				rkeyEvent.test( type ) ? this.keyHooks :
				{};
		}
		copy = fixHook.props ? this.props.concat( fixHook.props ) : this.props;

		event = new jQuery.Event( originalEvent );

		i = copy.length;
		while ( i-- ) {
			prop = copy[ i ];
			event[ prop ] = originalEvent[ prop ];
		}

		// Support: IE<9
		// Fix target property (#1925)
		if ( !event.target ) {
			event.target = originalEvent.srcElement || document;
		}

		// Support: Chrome 23+, Safari?
		// Target should not be a text node (#504, #13143)
		if ( event.target.nodeType === 3 ) {
			event.target = event.target.parentNode;
		}

		// Support: IE<9
		// For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
		event.metaKey = !!event.metaKey;

		return fixHook.filter ? fixHook.filter( event, originalEvent ) : event;
	},

	// Includes some event props shared by KeyEvent and MouseEvent
	props: "altKey bubbles cancelable ctrlKey currentTarget eventPhase metaKey relatedTarget shiftKey target timeStamp view which".split(" "),

	fixHooks: {},

	keyHooks: {
		props: "char charCode key keyCode".split(" "),
		filter: function( event, original ) {

			// Add which for key events
			if ( event.which == null ) {
				event.which = original.charCode != null ? original.charCode : original.keyCode;
			}

			return event;
		}
	},

	mouseHooks: {
		props: "button buttons clientX clientY fromElement offsetX offsetY pageX pageY screenX screenY toElement".split(" "),
		filter: function( event, original ) {
			var body, eventDoc, doc,
				button = original.button,
				fromElement = original.fromElement;

			// Calculate pageX/Y if missing and clientX/Y available
			if ( event.pageX == null && original.clientX != null ) {
				eventDoc = event.target.ownerDocument || document;
				doc = eventDoc.documentElement;
				body = eventDoc.body;

				event.pageX = original.clientX + ( doc && doc.scrollLeft || body && body.scrollLeft || 0 ) - ( doc && doc.clientLeft || body && body.clientLeft || 0 );
				event.pageY = original.clientY + ( doc && doc.scrollTop  || body && body.scrollTop  || 0 ) - ( doc && doc.clientTop  || body && body.clientTop  || 0 );
			}

			// Add relatedTarget, if necessary
			if ( !event.relatedTarget && fromElement ) {
				event.relatedTarget = fromElement === event.target ? original.toElement : fromElement;
			}

			// Add which for click: 1 === left; 2 === middle; 3 === right
			// Note: button is not normalized, so don't use it
			if ( !event.which && button !== undefined ) {
				event.which = ( button & 1 ? 1 : ( button & 2 ? 3 : ( button & 4 ? 2 : 0 ) ) );
			}

			return event;
		}
	},

	special: {
		load: {
			// Prevent triggered image.load events from bubbling to window.load
			noBubble: true
		},
		focus: {
			// Fire native event if possible so blur/focus sequence is correct
			trigger: function() {
				if ( this !== safeActiveElement() && this.focus ) {
					try {
						this.focus();
						return false;
					} catch ( e ) {
						// Support: IE<9
						// If we error on focus to hidden element (#1486, #12518),
						// let .trigger() run the handlers
					}
				}
			},
			delegateType: "focusin"
		},
		blur: {
			trigger: function() {
				if ( this === safeActiveElement() && this.blur ) {
					this.blur();
					return false;
				}
			},
			delegateType: "focusout"
		},
		click: {
			// For checkbox, fire native event so checked state will be right
			trigger: function() {
				if ( jQuery.nodeName( this, "input" ) && this.type === "checkbox" && this.click ) {
					this.click();
					return false;
				}
			},

			// For cross-browser consistency, don't fire native .click() on links
			_default: function( event ) {
				return jQuery.nodeName( event.target, "a" );
			}
		},

		beforeunload: {
			postDispatch: function( event ) {

				// Even when returnValue equals to undefined Firefox will still show alert
				if ( event.result !== undefined ) {
					event.originalEvent.returnValue = event.result;
				}
			}
		}
	},

	simulate: function( type, elem, event, bubble ) {
		// Piggyback on a donor event to simulate a different one.
		// Fake originalEvent to avoid donor's stopPropagation, but if the
		// simulated event prevents default then we do the same on the donor.
		var e = jQuery.extend(
			new jQuery.Event(),
			event,
			{
				type: type,
				isSimulated: true,
				originalEvent: {}
			}
		);
		if ( bubble ) {
			jQuery.event.trigger( e, null, elem );
		} else {
			jQuery.event.dispatch.call( elem, e );
		}
		if ( e.isDefaultPrevented() ) {
			event.preventDefault();
		}
	}
};

jQuery.removeEvent = document.removeEventListener ?
	function( elem, type, handle ) {
		if ( elem.removeEventListener ) {
			elem.removeEventListener( type, handle, false );
		}
	} :
	function( elem, type, handle ) {
		var name = "on" + type;

		if ( elem.detachEvent ) {

			// #8545, #7054, preventing memory leaks for custom events in IE6-8
			// detachEvent needed property on element, by name of that event, to properly expose it to GC
			if ( typeof elem[ name ] === strundefined ) {
				elem[ name ] = null;
			}

			elem.detachEvent( name, handle );
		}
	};

jQuery.Event = function( src, props ) {
	// Allow instantiation without the 'new' keyword
	if ( !(this instanceof jQuery.Event) ) {
		return new jQuery.Event( src, props );
	}

	// Event object
	if ( src && src.type ) {
		this.originalEvent = src;
		this.type = src.type;

		// Events bubbling up the document may have been marked as prevented
		// by a handler lower down the tree; reflect the correct value.
		this.isDefaultPrevented = src.defaultPrevented ||
				src.defaultPrevented === undefined && (
				// Support: IE < 9
				src.returnValue === false ||
				// Support: Android < 4.0
				src.getPreventDefault && src.getPreventDefault() ) ?
			returnTrue :
			returnFalse;

	// Event type
	} else {
		this.type = src;
	}

	// Put explicitly provided properties onto the event object
	if ( props ) {
		jQuery.extend( this, props );
	}

	// Create a timestamp if incoming event doesn't have one
	this.timeStamp = src && src.timeStamp || jQuery.now();

	// Mark it as fixed
	this[ jQuery.expando ] = true;
};

// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
// http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
jQuery.Event.prototype = {
	isDefaultPrevented: returnFalse,
	isPropagationStopped: returnFalse,
	isImmediatePropagationStopped: returnFalse,

	preventDefault: function() {
		var e = this.originalEvent;

		this.isDefaultPrevented = returnTrue;
		if ( !e ) {
			return;
		}

		// If preventDefault exists, run it on the original event
		if ( e.preventDefault ) {
			e.preventDefault();

		// Support: IE
		// Otherwise set the returnValue property of the original event to false
		} else {
			e.returnValue = false;
		}
	},
	stopPropagation: function() {
		var e = this.originalEvent;

		this.isPropagationStopped = returnTrue;
		if ( !e ) {
			return;
		}
		// If stopPropagation exists, run it on the original event
		if ( e.stopPropagation ) {
			e.stopPropagation();
		}

		// Support: IE
		// Set the cancelBubble property of the original event to true
		e.cancelBubble = true;
	},
	stopImmediatePropagation: function() {
		this.isImmediatePropagationStopped = returnTrue;
		this.stopPropagation();
	}
};

// Create mouseenter/leave events using mouseover/out and event-time checks
jQuery.each({
	mouseenter: "mouseover",
	mouseleave: "mouseout"
}, function( orig, fix ) {
	jQuery.event.special[ orig ] = {
		delegateType: fix,
		bindType: fix,

		handle: function( event ) {
			var ret,
				target = this,
				related = event.relatedTarget,
				handleObj = event.handleObj;

			// For mousenter/leave call the handler if related is outside the target.
			// NB: No relatedTarget if the mouse left/entered the browser window
			if ( !related || (related !== target && !jQuery.contains( target, related )) ) {
				event.type = handleObj.origType;
				ret = handleObj.handler.apply( this, arguments );
				event.type = fix;
			}
			return ret;
		}
	};
});

// IE submit delegation
if ( !support.submitBubbles ) {

	jQuery.event.special.submit = {
		setup: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Lazy-add a submit handler when a descendant form may potentially be submitted
			jQuery.event.add( this, "click._submit keypress._submit", function( e ) {
				// Node name check avoids a VML-related crash in IE (#9807)
				var elem = e.target,
					form = jQuery.nodeName( elem, "input" ) || jQuery.nodeName( elem, "button" ) ? elem.form : undefined;
				if ( form && !jQuery._data( form, "submitBubbles" ) ) {
					jQuery.event.add( form, "submit._submit", function( event ) {
						event._submit_bubble = true;
					});
					jQuery._data( form, "submitBubbles", true );
				}
			});
			// return undefined since we don't need an event listener
		},

		postDispatch: function( event ) {
			// If form was submitted by the user, bubble the event up the tree
			if ( event._submit_bubble ) {
				delete event._submit_bubble;
				if ( this.parentNode && !event.isTrigger ) {
					jQuery.event.simulate( "submit", this.parentNode, event, true );
				}
			}
		},

		teardown: function() {
			// Only need this for delegated form submit events
			if ( jQuery.nodeName( this, "form" ) ) {
				return false;
			}

			// Remove delegated handlers; cleanData eventually reaps submit handlers attached above
			jQuery.event.remove( this, "._submit" );
		}
	};
}

// IE change delegation and checkbox/radio fix
if ( !support.changeBubbles ) {

	jQuery.event.special.change = {

		setup: function() {

			if ( rformElems.test( this.nodeName ) ) {
				// IE doesn't fire change on a check/radio until blur; trigger it on click
				// after a propertychange. Eat the blur-change in special.change.handle.
				// This still fires onchange a second time for check/radio after blur.
				if ( this.type === "checkbox" || this.type === "radio" ) {
					jQuery.event.add( this, "propertychange._change", function( event ) {
						if ( event.originalEvent.propertyName === "checked" ) {
							this._just_changed = true;
						}
					});
					jQuery.event.add( this, "click._change", function( event ) {
						if ( this._just_changed && !event.isTrigger ) {
							this._just_changed = false;
						}
						// Allow triggered, simulated change events (#11500)
						jQuery.event.simulate( "change", this, event, true );
					});
				}
				return false;
			}
			// Delegated event; lazy-add a change handler on descendant inputs
			jQuery.event.add( this, "beforeactivate._change", function( e ) {
				var elem = e.target;

				if ( rformElems.test( elem.nodeName ) && !jQuery._data( elem, "changeBubbles" ) ) {
					jQuery.event.add( elem, "change._change", function( event ) {
						if ( this.parentNode && !event.isSimulated && !event.isTrigger ) {
							jQuery.event.simulate( "change", this.parentNode, event, true );
						}
					});
					jQuery._data( elem, "changeBubbles", true );
				}
			});
		},

		handle: function( event ) {
			var elem = event.target;

			// Swallow native change events from checkbox/radio, we already triggered them above
			if ( this !== elem || event.isSimulated || event.isTrigger || (elem.type !== "radio" && elem.type !== "checkbox") ) {
				return event.handleObj.handler.apply( this, arguments );
			}
		},

		teardown: function() {
			jQuery.event.remove( this, "._change" );

			return !rformElems.test( this.nodeName );
		}
	};
}

// Create "bubbling" focus and blur events
if ( !support.focusinBubbles ) {
	jQuery.each({ focus: "focusin", blur: "focusout" }, function( orig, fix ) {

		// Attach a single capturing handler on the document while someone wants focusin/focusout
		var handler = function( event ) {
				jQuery.event.simulate( fix, event.target, jQuery.event.fix( event ), true );
			};

		jQuery.event.special[ fix ] = {
			setup: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix );

				if ( !attaches ) {
					doc.addEventListener( orig, handler, true );
				}
				jQuery._data( doc, fix, ( attaches || 0 ) + 1 );
			},
			teardown: function() {
				var doc = this.ownerDocument || this,
					attaches = jQuery._data( doc, fix ) - 1;

				if ( !attaches ) {
					doc.removeEventListener( orig, handler, true );
					jQuery._removeData( doc, fix );
				} else {
					jQuery._data( doc, fix, attaches );
				}
			}
		};
	});
}

jQuery.fn.extend({

	on: function( types, selector, data, fn, /*INTERNAL*/ one ) {
		var type, origFn;

		// Types can be a map of types/handlers
		if ( typeof types === "object" ) {
			// ( types-Object, selector, data )
			if ( typeof selector !== "string" ) {
				// ( types-Object, data )
				data = data || selector;
				selector = undefined;
			}
			for ( type in types ) {
				this.on( type, selector, data, types[ type ], one );
			}
			return this;
		}

		if ( data == null && fn == null ) {
			// ( types, fn )
			fn = selector;
			data = selector = undefined;
		} else if ( fn == null ) {
			if ( typeof selector === "string" ) {
				// ( types, selector, fn )
				fn = data;
				data = undefined;
			} else {
				// ( types, data, fn )
				fn = data;
				data = selector;
				selector = undefined;
			}
		}
		if ( fn === false ) {
			fn = returnFalse;
		} else if ( !fn ) {
			return this;
		}

		if ( one === 1 ) {
			origFn = fn;
			fn = function( event ) {
				// Can use an empty set, since event contains the info
				jQuery().off( event );
				return origFn.apply( this, arguments );
			};
			// Use same guid so caller can remove using origFn
			fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
		}
		return this.each( function() {
			jQuery.event.add( this, types, fn, data, selector );
		});
	},
	one: function( types, selector, data, fn ) {
		return this.on( types, selector, data, fn, 1 );
	},
	off: function( types, selector, fn ) {
		var handleObj, type;
		if ( types && types.preventDefault && types.handleObj ) {
			// ( event )  dispatched jQuery.Event
			handleObj = types.handleObj;
			jQuery( types.delegateTarget ).off(
				handleObj.namespace ? handleObj.origType + "." + handleObj.namespace : handleObj.origType,
				handleObj.selector,
				handleObj.handler
			);
			return this;
		}
		if ( typeof types === "object" ) {
			// ( types-object [, selector] )
			for ( type in types ) {
				this.off( type, selector, types[ type ] );
			}
			return this;
		}
		if ( selector === false || typeof selector === "function" ) {
			// ( types [, fn] )
			fn = selector;
			selector = undefined;
		}
		if ( fn === false ) {
			fn = returnFalse;
		}
		return this.each(function() {
			jQuery.event.remove( this, types, fn, selector );
		});
	},

	trigger: function( type, data ) {
		return this.each(function() {
			jQuery.event.trigger( type, data, this );
		});
	},
	triggerHandler: function( type, data ) {
		var elem = this[0];
		if ( elem ) {
			return jQuery.event.trigger( type, data, elem, true );
		}
	}
});


function createSafeFragment( document ) {
	var list = nodeNames.split( "|" ),
		safeFrag = document.createDocumentFragment();

	if ( safeFrag.createElement ) {
		while ( list.length ) {
			safeFrag.createElement(
				list.pop()
			);
		}
	}
	return safeFrag;
}

var nodeNames = "abbr|article|aside|audio|bdi|canvas|data|datalist|details|figcaption|figure|footer|" +
		"header|hgroup|mark|meter|nav|output|progress|section|summary|time|video",
	rinlinejQuery = / jQuery\d+="(?:null|\d+)"/g,
	rnoshimcache = new RegExp("<(?:" + nodeNames + ")[\\s/>]", "i"),
	rleadingWhitespace = /^\s+/,
	rxhtmlTag = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:]+)[^>]*)\/>/gi,
	rtagName = /<([\w:]+)/,
	rtbody = /<tbody/i,
	rhtml = /<|&#?\w+;/,
	rnoInnerhtml = /<(?:script|style|link)/i,
	// checked="checked" or checked
	rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,
	rscriptType = /^$|\/(?:java|ecma)script/i,
	rscriptTypeMasked = /^true\/(.*)/,
	rcleanScript = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g,

	// We have to close these tags to support XHTML (#13200)
	wrapMap = {
		option: [ 1, "<select multiple='multiple'>", "</select>" ],
		legend: [ 1, "<fieldset>", "</fieldset>" ],
		area: [ 1, "<map>", "</map>" ],
		param: [ 1, "<object>", "</object>" ],
		thead: [ 1, "<table>", "</table>" ],
		tr: [ 2, "<table><tbody>", "</tbody></table>" ],
		col: [ 2, "<table><tbody></tbody><colgroup>", "</colgroup></table>" ],
		td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

		// IE6-8 can't serialize link, script, style, or any html5 (NoScope) tags,
		// unless wrapped in a div with non-breaking characters in front of it.
		_default: support.htmlSerialize ? [ 0, "", "" ] : [ 1, "X<div>", "</div>"  ]
	},
	safeFragment = createSafeFragment( document ),
	fragmentDiv = safeFragment.appendChild( document.createElement("div") );

wrapMap.optgroup = wrapMap.option;
wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
wrapMap.th = wrapMap.td;

function getAll( context, tag ) {
	var elems, elem,
		i = 0,
		found = typeof context.getElementsByTagName !== strundefined ? context.getElementsByTagName( tag || "*" ) :
			typeof context.querySelectorAll !== strundefined ? context.querySelectorAll( tag || "*" ) :
			undefined;

	if ( !found ) {
		for ( found = [], elems = context.childNodes || context; (elem = elems[i]) != null; i++ ) {
			if ( !tag || jQuery.nodeName( elem, tag ) ) {
				found.push( elem );
			} else {
				jQuery.merge( found, getAll( elem, tag ) );
			}
		}
	}

	return tag === undefined || tag && jQuery.nodeName( context, tag ) ?
		jQuery.merge( [ context ], found ) :
		found;
}

// Used in buildFragment, fixes the defaultChecked property
function fixDefaultChecked( elem ) {
	if ( rcheckableType.test( elem.type ) ) {
		elem.defaultChecked = elem.checked;
	}
}

// Support: IE<8
// Manipulating tables requires a tbody
function manipulationTarget( elem, content ) {
	return jQuery.nodeName( elem, "table" ) &&
		jQuery.nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ?

		elem.getElementsByTagName("tbody")[0] ||
			elem.appendChild( elem.ownerDocument.createElement("tbody") ) :
		elem;
}

// Replace/restore the type attribute of script elements for safe DOM manipulation
function disableScript( elem ) {
	elem.type = (jQuery.find.attr( elem, "type" ) !== null) + "/" + elem.type;
	return elem;
}
function restoreScript( elem ) {
	var match = rscriptTypeMasked.exec( elem.type );
	if ( match ) {
		elem.type = match[1];
	} else {
		elem.removeAttribute("type");
	}
	return elem;
}

// Mark scripts as having already been evaluated
function setGlobalEval( elems, refElements ) {
	var elem,
		i = 0;
	for ( ; (elem = elems[i]) != null; i++ ) {
		jQuery._data( elem, "globalEval", !refElements || jQuery._data( refElements[i], "globalEval" ) );
	}
}

function cloneCopyEvent( src, dest ) {

	if ( dest.nodeType !== 1 || !jQuery.hasData( src ) ) {
		return;
	}

	var type, i, l,
		oldData = jQuery._data( src ),
		curData = jQuery._data( dest, oldData ),
		events = oldData.events;

	if ( events ) {
		delete curData.handle;
		curData.events = {};

		for ( type in events ) {
			for ( i = 0, l = events[ type ].length; i < l; i++ ) {
				jQuery.event.add( dest, type, events[ type ][ i ] );
			}
		}
	}

	// make the cloned public data object a copy from the original
	if ( curData.data ) {
		curData.data = jQuery.extend( {}, curData.data );
	}
}

function fixCloneNodeIssues( src, dest ) {
	var nodeName, e, data;

	// We do not need to do anything for non-Elements
	if ( dest.nodeType !== 1 ) {
		return;
	}

	nodeName = dest.nodeName.toLowerCase();

	// IE6-8 copies events bound via attachEvent when using cloneNode.
	if ( !support.noCloneEvent && dest[ jQuery.expando ] ) {
		data = jQuery._data( dest );

		for ( e in data.events ) {
			jQuery.removeEvent( dest, e, data.handle );
		}

		// Event data gets referenced instead of copied if the expando gets copied too
		dest.removeAttribute( jQuery.expando );
	}

	// IE blanks contents when cloning scripts, and tries to evaluate newly-set text
	if ( nodeName === "script" && dest.text !== src.text ) {
		disableScript( dest ).text = src.text;
		restoreScript( dest );

	// IE6-10 improperly clones children of object elements using classid.
	// IE10 throws NoModificationAllowedError if parent is null, #12132.
	} else if ( nodeName === "object" ) {
		if ( dest.parentNode ) {
			dest.outerHTML = src.outerHTML;
		}

		// This path appears unavoidable for IE9. When cloning an object
		// element in IE9, the outerHTML strategy above is not sufficient.
		// If the src has innerHTML and the destination does not,
		// copy the src.innerHTML into the dest.innerHTML. #10324
		if ( support.html5Clone && ( src.innerHTML && !jQuery.trim(dest.innerHTML) ) ) {
			dest.innerHTML = src.innerHTML;
		}

	} else if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
		// IE6-8 fails to persist the checked state of a cloned checkbox
		// or radio button. Worse, IE6-7 fail to give the cloned element
		// a checked appearance if the defaultChecked value isn't also set

		dest.defaultChecked = dest.checked = src.checked;

		// IE6-7 get confused and end up setting the value of a cloned
		// checkbox/radio button to an empty string instead of "on"
		if ( dest.value !== src.value ) {
			dest.value = src.value;
		}

	// IE6-8 fails to return the selected option to the default selected
	// state when cloning options
	} else if ( nodeName === "option" ) {
		dest.defaultSelected = dest.selected = src.defaultSelected;

	// IE6-8 fails to set the defaultValue to the correct value when
	// cloning other types of input fields
	} else if ( nodeName === "input" || nodeName === "textarea" ) {
		dest.defaultValue = src.defaultValue;
	}
}

jQuery.extend({
	clone: function( elem, dataAndEvents, deepDataAndEvents ) {
		var destElements, node, clone, i, srcElements,
			inPage = jQuery.contains( elem.ownerDocument, elem );

		if ( support.html5Clone || jQuery.isXMLDoc(elem) || !rnoshimcache.test( "<" + elem.nodeName + ">" ) ) {
			clone = elem.cloneNode( true );

		// IE<=8 does not properly clone detached, unknown element nodes
		} else {
			fragmentDiv.innerHTML = elem.outerHTML;
			fragmentDiv.removeChild( clone = fragmentDiv.firstChild );
		}

		if ( (!support.noCloneEvent || !support.noCloneChecked) &&
				(elem.nodeType === 1 || elem.nodeType === 11) && !jQuery.isXMLDoc(elem) ) {

			// We eschew Sizzle here for performance reasons: http://jsperf.com/getall-vs-sizzle/2
			destElements = getAll( clone );
			srcElements = getAll( elem );

			// Fix all IE cloning issues
			for ( i = 0; (node = srcElements[i]) != null; ++i ) {
				// Ensure that the destination node is not null; Fixes #9587
				if ( destElements[i] ) {
					fixCloneNodeIssues( node, destElements[i] );
				}
			}
		}

		// Copy the events from the original to the clone
		if ( dataAndEvents ) {
			if ( deepDataAndEvents ) {
				srcElements = srcElements || getAll( elem );
				destElements = destElements || getAll( clone );

				for ( i = 0; (node = srcElements[i]) != null; i++ ) {
					cloneCopyEvent( node, destElements[i] );
				}
			} else {
				cloneCopyEvent( elem, clone );
			}
		}

		// Preserve script evaluation history
		destElements = getAll( clone, "script" );
		if ( destElements.length > 0 ) {
			setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
		}

		destElements = srcElements = node = null;

		// Return the cloned set
		return clone;
	},

	buildFragment: function( elems, context, scripts, selection ) {
		var j, elem, contains,
			tmp, tag, tbody, wrap,
			l = elems.length,

			// Ensure a safe fragment
			safe = createSafeFragment( context ),

			nodes = [],
			i = 0;

		for ( ; i < l; i++ ) {
			elem = elems[ i ];

			if ( elem || elem === 0 ) {

				// Add nodes directly
				if ( jQuery.type( elem ) === "object" ) {
					jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

				// Convert non-html into a text node
				} else if ( !rhtml.test( elem ) ) {
					nodes.push( context.createTextNode( elem ) );

				// Convert html into DOM nodes
				} else {
					tmp = tmp || safe.appendChild( context.createElement("div") );

					// Deserialize a standard representation
					tag = (rtagName.exec( elem ) || [ "", "" ])[ 1 ].toLowerCase();
					wrap = wrapMap[ tag ] || wrapMap._default;

					tmp.innerHTML = wrap[1] + elem.replace( rxhtmlTag, "<$1></$2>" ) + wrap[2];

					// Descend through wrappers to the right content
					j = wrap[0];
					while ( j-- ) {
						tmp = tmp.lastChild;
					}

					// Manually add leading whitespace removed by IE
					if ( !support.leadingWhitespace && rleadingWhitespace.test( elem ) ) {
						nodes.push( context.createTextNode( rleadingWhitespace.exec( elem )[0] ) );
					}

					// Remove IE's autoinserted <tbody> from table fragments
					if ( !support.tbody ) {

						// String was a <table>, *may* have spurious <tbody>
						elem = tag === "table" && !rtbody.test( elem ) ?
							tmp.firstChild :

							// String was a bare <thead> or <tfoot>
							wrap[1] === "<table>" && !rtbody.test( elem ) ?
								tmp :
								0;

						j = elem && elem.childNodes.length;
						while ( j-- ) {
							if ( jQuery.nodeName( (tbody = elem.childNodes[j]), "tbody" ) && !tbody.childNodes.length ) {
								elem.removeChild( tbody );
							}
						}
					}

					jQuery.merge( nodes, tmp.childNodes );

					// Fix #12392 for WebKit and IE > 9
					tmp.textContent = "";

					// Fix #12392 for oldIE
					while ( tmp.firstChild ) {
						tmp.removeChild( tmp.firstChild );
					}

					// Remember the top-level container for proper cleanup
					tmp = safe.lastChild;
				}
			}
		}

		// Fix #11356: Clear elements from fragment
		if ( tmp ) {
			safe.removeChild( tmp );
		}

		// Reset defaultChecked for any radios and checkboxes
		// about to be appended to the DOM in IE 6/7 (#8060)
		if ( !support.appendChecked ) {
			jQuery.grep( getAll( nodes, "input" ), fixDefaultChecked );
		}

		i = 0;
		while ( (elem = nodes[ i++ ]) ) {

			// #4087 - If origin and destination elements are the same, and this is
			// that element, do not do anything
			if ( selection && jQuery.inArray( elem, selection ) !== -1 ) {
				continue;
			}

			contains = jQuery.contains( elem.ownerDocument, elem );

			// Append to fragment
			tmp = getAll( safe.appendChild( elem ), "script" );

			// Preserve script evaluation history
			if ( contains ) {
				setGlobalEval( tmp );
			}

			// Capture executables
			if ( scripts ) {
				j = 0;
				while ( (elem = tmp[ j++ ]) ) {
					if ( rscriptType.test( elem.type || "" ) ) {
						scripts.push( elem );
					}
				}
			}
		}

		tmp = null;

		return safe;
	},

	cleanData: function( elems, /* internal */ acceptData ) {
		var elem, type, id, data,
			i = 0,
			internalKey = jQuery.expando,
			cache = jQuery.cache,
			deleteExpando = support.deleteExpando,
			special = jQuery.event.special;

		for ( ; (elem = elems[i]) != null; i++ ) {
			if ( acceptData || jQuery.acceptData( elem ) ) {

				id = elem[ internalKey ];
				data = id && cache[ id ];

				if ( data ) {
					if ( data.events ) {
						for ( type in data.events ) {
							if ( special[ type ] ) {
								jQuery.event.remove( elem, type );

							// This is a shortcut to avoid jQuery.event.remove's overhead
							} else {
								jQuery.removeEvent( elem, type, data.handle );
							}
						}
					}

					// Remove cache only if it was not already removed by jQuery.event.remove
					if ( cache[ id ] ) {

						delete cache[ id ];

						// IE does not allow us to delete expando properties from nodes,
						// nor does it have a removeAttribute function on Document nodes;
						// we must handle all of these cases
						if ( deleteExpando ) {
							delete elem[ internalKey ];

						} else if ( typeof elem.removeAttribute !== strundefined ) {
							elem.removeAttribute( internalKey );

						} else {
							elem[ internalKey ] = null;
						}

						deletedIds.push( id );
					}
				}
			}
		}
	}
});

jQuery.fn.extend({
	text: function( value ) {
		return access( this, function( value ) {
			return value === undefined ?
				jQuery.text( this ) :
				this.empty().append( ( this[0] && this[0].ownerDocument || document ).createTextNode( value ) );
		}, null, value, arguments.length );
	},

	append: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.appendChild( elem );
			}
		});
	},

	prepend: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
				var target = manipulationTarget( this, elem );
				target.insertBefore( elem, target.firstChild );
			}
		});
	},

	before: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this );
			}
		});
	},

	after: function() {
		return this.domManip( arguments, function( elem ) {
			if ( this.parentNode ) {
				this.parentNode.insertBefore( elem, this.nextSibling );
			}
		});
	},

	remove: function( selector, keepData /* Internal Use Only */ ) {
		var elem,
			elems = selector ? jQuery.filter( selector, this ) : this,
			i = 0;

		for ( ; (elem = elems[i]) != null; i++ ) {

			if ( !keepData && elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem ) );
			}

			if ( elem.parentNode ) {
				if ( keepData && jQuery.contains( elem.ownerDocument, elem ) ) {
					setGlobalEval( getAll( elem, "script" ) );
				}
				elem.parentNode.removeChild( elem );
			}
		}

		return this;
	},

	empty: function() {
		var elem,
			i = 0;

		for ( ; (elem = this[i]) != null; i++ ) {
			// Remove element nodes and prevent memory leaks
			if ( elem.nodeType === 1 ) {
				jQuery.cleanData( getAll( elem, false ) );
			}

			// Remove any remaining nodes
			while ( elem.firstChild ) {
				elem.removeChild( elem.firstChild );
			}

			// If this is a select, ensure that it displays empty (#12336)
			// Support: IE<9
			if ( elem.options && jQuery.nodeName( elem, "select" ) ) {
				elem.options.length = 0;
			}
		}

		return this;
	},

	clone: function( dataAndEvents, deepDataAndEvents ) {
		dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
		deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

		return this.map(function() {
			return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
		});
	},

	html: function( value ) {
		return access( this, function( value ) {
			var elem = this[ 0 ] || {},
				i = 0,
				l = this.length;

			if ( value === undefined ) {
				return elem.nodeType === 1 ?
					elem.innerHTML.replace( rinlinejQuery, "" ) :
					undefined;
			}

			// See if we can take a shortcut and just use innerHTML
			if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
				( support.htmlSerialize || !rnoshimcache.test( value )  ) &&
				( support.leadingWhitespace || !rleadingWhitespace.test( value ) ) &&
				!wrapMap[ (rtagName.exec( value ) || [ "", "" ])[ 1 ].toLowerCase() ] ) {

				value = value.replace( rxhtmlTag, "<$1></$2>" );

				try {
					for (; i < l; i++ ) {
						// Remove element nodes and prevent memory leaks
						elem = this[i] || {};
						if ( elem.nodeType === 1 ) {
							jQuery.cleanData( getAll( elem, false ) );
							elem.innerHTML = value;
						}
					}

					elem = 0;

				// If using innerHTML throws an exception, use the fallback method
				} catch(e) {}
			}

			if ( elem ) {
				this.empty().append( value );
			}
		}, null, value, arguments.length );
	},

	replaceWith: function() {
		var arg = arguments[ 0 ];

		// Make the changes, replacing each context element with the new content
		this.domManip( arguments, function( elem ) {
			arg = this.parentNode;

			jQuery.cleanData( getAll( this ) );

			if ( arg ) {
				arg.replaceChild( elem, this );
			}
		});

		// Force removal if there was no new content (e.g., from empty arguments)
		return arg && (arg.length || arg.nodeType) ? this : this.remove();
	},

	detach: function( selector ) {
		return this.remove( selector, true );
	},

	domManip: function( args, callback ) {

		// Flatten any nested arrays
		args = concat.apply( [], args );

		var first, node, hasScripts,
			scripts, doc, fragment,
			i = 0,
			l = this.length,
			set = this,
			iNoClone = l - 1,
			value = args[0],
			isFunction = jQuery.isFunction( value );

		// We can't cloneNode fragments that contain checked, in WebKit
		if ( isFunction ||
				( l > 1 && typeof value === "string" &&
					!support.checkClone && rchecked.test( value ) ) ) {
			return this.each(function( index ) {
				var self = set.eq( index );
				if ( isFunction ) {
					args[0] = value.call( this, index, self.html() );
				}
				self.domManip( args, callback );
			});
		}

		if ( l ) {
			fragment = jQuery.buildFragment( args, this[ 0 ].ownerDocument, false, this );
			first = fragment.firstChild;

			if ( fragment.childNodes.length === 1 ) {
				fragment = first;
			}

			if ( first ) {
				scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
				hasScripts = scripts.length;

				// Use the original fragment for the last item instead of the first because it can end up
				// being emptied incorrectly in certain situations (#8070).
				for ( ; i < l; i++ ) {
					node = fragment;

					if ( i !== iNoClone ) {
						node = jQuery.clone( node, true, true );

						// Keep references to cloned scripts for later restoration
						if ( hasScripts ) {
							jQuery.merge( scripts, getAll( node, "script" ) );
						}
					}

					callback.call( this[i], node, i );
				}

				if ( hasScripts ) {
					doc = scripts[ scripts.length - 1 ].ownerDocument;

					// Reenable scripts
					jQuery.map( scripts, restoreScript );

					// Evaluate executable scripts on first document insertion
					for ( i = 0; i < hasScripts; i++ ) {
						node = scripts[ i ];
						if ( rscriptType.test( node.type || "" ) &&
							!jQuery._data( node, "globalEval" ) && jQuery.contains( doc, node ) ) {

							if ( node.src ) {
								// Optional AJAX dependency, but won't run scripts if not present
								if ( jQuery._evalUrl ) {
									jQuery._evalUrl( node.src );
								}
							} else {
								jQuery.globalEval( ( node.text || node.textContent || node.innerHTML || "" ).replace( rcleanScript, "" ) );
							}
						}
					}
				}

				// Fix #11809: Avoid leaking memory
				fragment = first = null;
			}
		}

		return this;
	}
});

jQuery.each({
	appendTo: "append",
	prependTo: "prepend",
	insertBefore: "before",
	insertAfter: "after",
	replaceAll: "replaceWith"
}, function( name, original ) {
	jQuery.fn[ name ] = function( selector ) {
		var elems,
			i = 0,
			ret = [],
			insert = jQuery( selector ),
			last = insert.length - 1;

		for ( ; i <= last; i++ ) {
			elems = i === last ? this : this.clone(true);
			jQuery( insert[i] )[ original ]( elems );

			// Modern browsers can apply jQuery collections as arrays, but oldIE needs a .get()
			push.apply( ret, elems.get() );
		}

		return this.pushStack( ret );
	};
});


var iframe,
	elemdisplay = {};

/**
 * Retrieve the actual display of a element
 * @param {String} name nodeName of the element
 * @param {Object} doc Document object
 */
// Called only from within defaultDisplay
function actualDisplay( name, doc ) {
	var elem = jQuery( doc.createElement( name ) ).appendTo( doc.body ),

		// getDefaultComputedStyle might be reliably used only on attached element
		display = window.getDefaultComputedStyle ?

			// Use of this method is a temporary fix (more like optmization) until something better comes along,
			// since it was removed from specification and supported only in FF
			window.getDefaultComputedStyle( elem[ 0 ] ).display : jQuery.css( elem[ 0 ], "display" );

	// We don't have any data stored on the element,
	// so use "detach" method as fast way to get rid of the element
	elem.detach();

	return display;
}

/**
 * Try to determine the default display value of an element
 * @param {String} nodeName
 */
function defaultDisplay( nodeName ) {
	var doc = document,
		display = elemdisplay[ nodeName ];

	if ( !display ) {
		display = actualDisplay( nodeName, doc );

		// If the simple way fails, read from inside an iframe
		if ( display === "none" || !display ) {

			// Use the already-created iframe if possible
			iframe = (iframe || jQuery( "<iframe frameborder='0' width='0' height='0'/>" )).appendTo( doc.documentElement );

			// Always write a new HTML skeleton so Webkit and Firefox don't choke on reuse
			doc = ( iframe[ 0 ].contentWindow || iframe[ 0 ].contentDocument ).document;

			// Support: IE
			doc.write();
			doc.close();

			display = actualDisplay( nodeName, doc );
			iframe.detach();
		}

		// Store the correct default display
		elemdisplay[ nodeName ] = display;
	}

	return display;
}


(function() {
	var a, shrinkWrapBlocksVal,
		div = document.createElement( "div" ),
		divReset =
			"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;" +
			"display:block;padding:0;margin:0;border:0";

	// Setup
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName( "a" )[ 0 ];

	a.style.cssText = "float:left;opacity:.5";

	// Make sure that element opacity exists
	// (IE uses filter instead)
	// Use a regex to work around a WebKit issue. See #5145
	support.opacity = /^0.5/.test( a.style.opacity );

	// Verify style float existence
	// (IE uses styleFloat instead of cssFloat)
	support.cssFloat = !!a.style.cssFloat;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Null elements to avoid leaks in IE.
	a = div = null;

	support.shrinkWrapBlocks = function() {
		var body, container, div, containerStyles;

		if ( shrinkWrapBlocksVal == null ) {
			body = document.getElementsByTagName( "body" )[ 0 ];
			if ( !body ) {
				// Test fired too early or in an unsupported environment, exit.
				return;
			}

			containerStyles = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px";
			container = document.createElement( "div" );
			div = document.createElement( "div" );

			body.appendChild( container ).appendChild( div );

			// Will be changed later if needed.
			shrinkWrapBlocksVal = false;

			if ( typeof div.style.zoom !== strundefined ) {
				// Support: IE6
				// Check if elements with layout shrink-wrap their children
				div.style.cssText = divReset + ";width:1px;padding:1px;zoom:1";
				div.innerHTML = "<div></div>";
				div.firstChild.style.width = "5px";
				shrinkWrapBlocksVal = div.offsetWidth !== 3;
			}

			body.removeChild( container );

			// Null elements to avoid leaks in IE.
			body = container = div = null;
		}

		return shrinkWrapBlocksVal;
	};

})();
var rmargin = (/^margin/);

var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );



var getStyles, curCSS,
	rposition = /^(top|right|bottom|left)$/;

if ( window.getComputedStyle ) {
	getStyles = function( elem ) {
		return elem.ownerDocument.defaultView.getComputedStyle( elem, null );
	};

	curCSS = function( elem, name, computed ) {
		var width, minWidth, maxWidth, ret,
			style = elem.style;

		computed = computed || getStyles( elem );

		// getPropertyValue is only needed for .css('filter') in IE9, see #12537
		ret = computed ? computed.getPropertyValue( name ) || computed[ name ] : undefined;

		if ( computed ) {

			if ( ret === "" && !jQuery.contains( elem.ownerDocument, elem ) ) {
				ret = jQuery.style( elem, name );
			}

			// A tribute to the "awesome hack by Dean Edwards"
			// Chrome < 17 and Safari 5.0 uses "computed value" instead of "used value" for margin-right
			// Safari 5.1.7 (at least) returns percentage for a larger set of values, but width seems to be reliably pixels
			// this is against the CSSOM draft spec: http://dev.w3.org/csswg/cssom/#resolved-values
			if ( rnumnonpx.test( ret ) && rmargin.test( name ) ) {

				// Remember the original values
				width = style.width;
				minWidth = style.minWidth;
				maxWidth = style.maxWidth;

				// Put in the new values to get a computed value out
				style.minWidth = style.maxWidth = style.width = ret;
				ret = computed.width;

				// Revert the changed values
				style.width = width;
				style.minWidth = minWidth;
				style.maxWidth = maxWidth;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "";
	};
} else if ( document.documentElement.currentStyle ) {
	getStyles = function( elem ) {
		return elem.currentStyle;
	};

	curCSS = function( elem, name, computed ) {
		var left, rs, rsLeft, ret,
			style = elem.style;

		computed = computed || getStyles( elem );
		ret = computed ? computed[ name ] : undefined;

		// Avoid setting ret to empty string here
		// so we don't default to auto
		if ( ret == null && style && style[ name ] ) {
			ret = style[ name ];
		}

		// From the awesome hack by Dean Edwards
		// http://erik.eae.net/archives/2007/07/27/18.54.15/#comment-102291

		// If we're not dealing with a regular pixel number
		// but a number that has a weird ending, we need to convert it to pixels
		// but not position css attributes, as those are proportional to the parent element instead
		// and we can't measure the parent instead because it might trigger a "stacking dolls" problem
		if ( rnumnonpx.test( ret ) && !rposition.test( name ) ) {

			// Remember the original values
			left = style.left;
			rs = elem.runtimeStyle;
			rsLeft = rs && rs.left;

			// Put in the new values to get a computed value out
			if ( rsLeft ) {
				rs.left = elem.currentStyle.left;
			}
			style.left = name === "fontSize" ? "1em" : ret;
			ret = style.pixelLeft + "px";

			// Revert the changed values
			style.left = left;
			if ( rsLeft ) {
				rs.left = rsLeft;
			}
		}

		// Support: IE
		// IE returns zIndex value as an integer.
		return ret === undefined ?
			ret :
			ret + "" || "auto";
	};
}




function addGetHookIf( conditionFn, hookFn ) {
	// Define the hook, we'll check on the first run if it's really needed.
	return {
		get: function() {
			var condition = conditionFn();

			if ( condition == null ) {
				// The test was not ready at this point; screw the hook this time
				// but check again when needed next time.
				return;
			}

			if ( condition ) {
				// Hook not needed (or it's not possible to use it due to missing dependency),
				// remove it.
				// Since there are no other hooks for marginRight, remove the whole object.
				delete this.get;
				return;
			}

			// Hook needed; redefine it so that the support test is not executed again.

			return (this.get = hookFn).apply( this, arguments );
		}
	};
}


(function() {
	var a, reliableHiddenOffsetsVal, boxSizingVal, boxSizingReliableVal,
		pixelPositionVal, reliableMarginRightVal,
		div = document.createElement( "div" ),
		containerStyles = "border:0;width:0;height:0;position:absolute;top:0;left:-9999px",
		divReset =
			"-webkit-box-sizing:content-box;-moz-box-sizing:content-box;box-sizing:content-box;" +
			"display:block;padding:0;margin:0;border:0";

	// Setup
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName( "a" )[ 0 ];

	a.style.cssText = "float:left;opacity:.5";

	// Make sure that element opacity exists
	// (IE uses filter instead)
	// Use a regex to work around a WebKit issue. See #5145
	support.opacity = /^0.5/.test( a.style.opacity );

	// Verify style float existence
	// (IE uses styleFloat instead of cssFloat)
	support.cssFloat = !!a.style.cssFloat;

	div.style.backgroundClip = "content-box";
	div.cloneNode( true ).style.backgroundClip = "";
	support.clearCloneStyle = div.style.backgroundClip === "content-box";

	// Null elements to avoid leaks in IE.
	a = div = null;

	jQuery.extend(support, {
		reliableHiddenOffsets: function() {
			if ( reliableHiddenOffsetsVal != null ) {
				return reliableHiddenOffsetsVal;
			}

			var container, tds, isSupported,
				div = document.createElement( "div" ),
				body = document.getElementsByTagName( "body" )[ 0 ];

			if ( !body ) {
				// Return for frameset docs that don't have a body
				return;
			}

			// Setup
			div.setAttribute( "className", "t" );
			div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";

			container = document.createElement( "div" );
			container.style.cssText = containerStyles;

			body.appendChild( container ).appendChild( div );

			// Support: IE8
			// Check if table cells still have offsetWidth/Height when they are set
			// to display:none and there are still other visible table cells in a
			// table row; if so, offsetWidth/Height are not reliable for use when
			// determining if an element has been hidden directly using
			// display:none (it is still safe to use offsets if a parent element is
			// hidden; don safety goggles and see bug #4512 for more information).
			div.innerHTML = "<table><tr><td></td><td>t</td></tr></table>";
			tds = div.getElementsByTagName( "td" );
			tds[ 0 ].style.cssText = "padding:0;margin:0;border:0;display:none";
			isSupported = ( tds[ 0 ].offsetHeight === 0 );

			tds[ 0 ].style.display = "";
			tds[ 1 ].style.display = "none";

			// Support: IE8
			// Check if empty table cells still have offsetWidth/Height
			reliableHiddenOffsetsVal = isSupported && ( tds[ 0 ].offsetHeight === 0 );

			body.removeChild( container );

			// Null elements to avoid leaks in IE.
			div = body = null;

			return reliableHiddenOffsetsVal;
		},

		boxSizing: function() {
			if ( boxSizingVal == null ) {
				computeStyleTests();
			}
			return boxSizingVal;
		},

		boxSizingReliable: function() {
			if ( boxSizingReliableVal == null ) {
				computeStyleTests();
			}
			return boxSizingReliableVal;
		},

		pixelPosition: function() {
			if ( pixelPositionVal == null ) {
				computeStyleTests();
			}
			return pixelPositionVal;
		},

		reliableMarginRight: function() {
			var body, container, div, marginDiv;

			// Use window.getComputedStyle because jsdom on node.js will break without it.
			if ( reliableMarginRightVal == null && window.getComputedStyle ) {
				body = document.getElementsByTagName( "body" )[ 0 ];
				if ( !body ) {
					// Test fired too early or in an unsupported environment, exit.
					return;
				}

				container = document.createElement( "div" );
				div = document.createElement( "div" );
				container.style.cssText = containerStyles;

				body.appendChild( container ).appendChild( div );

				// Check if div with explicit width and no margin-right incorrectly
				// gets computed margin-right based on width of container. (#3333)
				// Fails in WebKit before Feb 2011 nightlies
				// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
				marginDiv = div.appendChild( document.createElement( "div" ) );
				marginDiv.style.cssText = div.style.cssText = divReset;
				marginDiv.style.marginRight = marginDiv.style.width = "0";
				div.style.width = "1px";

				reliableMarginRightVal =
					!parseFloat( ( window.getComputedStyle( marginDiv, null ) || {} ).marginRight );

				body.removeChild( container );
			}

			return reliableMarginRightVal;
		}
	});

	function computeStyleTests() {
		var container, div,
			body = document.getElementsByTagName( "body" )[ 0 ];

		if ( !body ) {
			// Test fired too early or in an unsupported environment, exit.
			return;
		}

		container = document.createElement( "div" );
		div = document.createElement( "div" );
		container.style.cssText = containerStyles;

		body.appendChild( container ).appendChild( div );

		div.style.cssText =
			"-webkit-box-sizing:border-box;-moz-box-sizing:border-box;box-sizing:border-box;" +
				"position:absolute;display:block;padding:1px;border:1px;width:4px;" +
				"margin-top:1%;top:1%";

		// Workaround failing boxSizing test due to offsetWidth returning wrong value
		// with some non-1 values of body zoom, ticket #13543
		jQuery.swap( body, body.style.zoom != null ? { zoom: 1 } : {}, function() {
			boxSizingVal = div.offsetWidth === 4;
		});

		// Will be changed later if needed.
		boxSizingReliableVal = true;
		pixelPositionVal = false;
		reliableMarginRightVal = true;

		// Use window.getComputedStyle because jsdom on node.js will break without it.
		if ( window.getComputedStyle ) {
			pixelPositionVal = ( window.getComputedStyle( div, null ) || {} ).top !== "1%";
			boxSizingReliableVal =
				( window.getComputedStyle( div, null ) || { width: "4px" } ).width === "4px";
		}

		body.removeChild( container );

		// Null elements to avoid leaks in IE.
		div = body = null;
	}

})();


// A method for quickly swapping in/out CSS properties to get correct calculations.
jQuery.swap = function( elem, options, callback, args ) {
	var ret, name,
		old = {};

	// Remember the old values, and insert the new ones
	for ( name in options ) {
		old[ name ] = elem.style[ name ];
		elem.style[ name ] = options[ name ];
	}

	ret = callback.apply( elem, args || [] );

	// Revert the old values
	for ( name in options ) {
		elem.style[ name ] = old[ name ];
	}

	return ret;
};


var
		ralpha = /alpha\([^)]*\)/i,
	ropacity = /opacity\s*=\s*([^)]*)/,

	// swappable if display is none or starts with table except "table", "table-cell", or "table-caption"
	// see here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
	rdisplayswap = /^(none|table(?!-c[ea]).+)/,
	rnumsplit = new RegExp( "^(" + pnum + ")(.*)$", "i" ),
	rrelNum = new RegExp( "^([+-])=(" + pnum + ")", "i" ),

	cssShow = { position: "absolute", visibility: "hidden", display: "block" },
	cssNormalTransform = {
		letterSpacing: 0,
		fontWeight: 400
	},

	cssPrefixes = [ "Webkit", "O", "Moz", "ms" ];


// return a css property mapped to a potentially vendor prefixed property
function vendorPropName( style, name ) {

	// shortcut for names that are not vendor prefixed
	if ( name in style ) {
		return name;
	}

	// check for vendor prefixed names
	var capName = name.charAt(0).toUpperCase() + name.slice(1),
		origName = name,
		i = cssPrefixes.length;

	while ( i-- ) {
		name = cssPrefixes[ i ] + capName;
		if ( name in style ) {
			return name;
		}
	}

	return origName;
}

function showHide( elements, show ) {
	var display, elem, hidden,
		values = [],
		index = 0,
		length = elements.length;

	for ( ; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}

		values[ index ] = jQuery._data( elem, "olddisplay" );
		display = elem.style.display;
		if ( show ) {
			// Reset the inline display of this element to learn if it is
			// being hidden by cascaded rules or not
			if ( !values[ index ] && display === "none" ) {
				elem.style.display = "";
			}

			// Set elements which have been overridden with display: none
			// in a stylesheet to whatever the default browser style is
			// for such an element
			if ( elem.style.display === "" && isHidden( elem ) ) {
				values[ index ] = jQuery._data( elem, "olddisplay", defaultDisplay(elem.nodeName) );
			}
		} else {

			if ( !values[ index ] ) {
				hidden = isHidden( elem );

				if ( display && display !== "none" || !hidden ) {
					jQuery._data( elem, "olddisplay", hidden ? display : jQuery.css( elem, "display" ) );
				}
			}
		}
	}

	// Set the display of most of the elements in a second loop
	// to avoid the constant reflow
	for ( index = 0; index < length; index++ ) {
		elem = elements[ index ];
		if ( !elem.style ) {
			continue;
		}
		if ( !show || elem.style.display === "none" || elem.style.display === "" ) {
			elem.style.display = show ? values[ index ] || "" : "none";
		}
	}

	return elements;
}

function setPositiveNumber( elem, value, subtract ) {
	var matches = rnumsplit.exec( value );
	return matches ?
		// Guard against undefined "subtract", e.g., when used as in cssHooks
		Math.max( 0, matches[ 1 ] - ( subtract || 0 ) ) + ( matches[ 2 ] || "px" ) :
		value;
}

function augmentWidthOrHeight( elem, name, extra, isBorderBox, styles ) {
	var i = extra === ( isBorderBox ? "border" : "content" ) ?
		// If we already have the right measurement, avoid augmentation
		4 :
		// Otherwise initialize for horizontal or vertical properties
		name === "width" ? 1 : 0,

		val = 0;

	for ( ; i < 4; i += 2 ) {
		// both box models exclude margin, so add it if we want it
		if ( extra === "margin" ) {
			val += jQuery.css( elem, extra + cssExpand[ i ], true, styles );
		}

		if ( isBorderBox ) {
			// border-box includes padding, so remove it if we want content
			if ( extra === "content" ) {
				val -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
			}

			// at this point, extra isn't border nor margin, so remove border
			if ( extra !== "margin" ) {
				val -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		} else {
			// at this point, extra isn't content, so add padding
			val += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

			// at this point, extra isn't content nor padding, so add border
			if ( extra !== "padding" ) {
				val += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
			}
		}
	}

	return val;
}

function getWidthOrHeight( elem, name, extra ) {

	// Start with offset property, which is equivalent to the border-box value
	var valueIsBorderBox = true,
		val = name === "width" ? elem.offsetWidth : elem.offsetHeight,
		styles = getStyles( elem ),
		isBorderBox = support.boxSizing() && jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

	// some non-html elements return undefined for offsetWidth, so check for null/undefined
	// svg - https://bugzilla.mozilla.org/show_bug.cgi?id=649285
	// MathML - https://bugzilla.mozilla.org/show_bug.cgi?id=491668
	if ( val <= 0 || val == null ) {
		// Fall back to computed then uncomputed css if necessary
		val = curCSS( elem, name, styles );
		if ( val < 0 || val == null ) {
			val = elem.style[ name ];
		}

		// Computed unit is not pixels. Stop here and return.
		if ( rnumnonpx.test(val) ) {
			return val;
		}

		// we need the check for style in case a browser which returns unreliable values
		// for getComputedStyle silently falls back to the reliable elem.style
		valueIsBorderBox = isBorderBox && ( support.boxSizingReliable() || val === elem.style[ name ] );

		// Normalize "", auto, and prepare for extra
		val = parseFloat( val ) || 0;
	}

	// use the active box-sizing model to add/subtract irrelevant styles
	return ( val +
		augmentWidthOrHeight(
			elem,
			name,
			extra || ( isBorderBox ? "border" : "content" ),
			valueIsBorderBox,
			styles
		)
	) + "px";
}

jQuery.extend({
	// Add in style property hooks for overriding the default
	// behavior of getting and setting a style property
	cssHooks: {
		opacity: {
			get: function( elem, computed ) {
				if ( computed ) {
					// We should always get a number back from opacity
					var ret = curCSS( elem, "opacity" );
					return ret === "" ? "1" : ret;
				}
			}
		}
	},

	// Don't automatically add "px" to these possibly-unitless properties
	cssNumber: {
		"columnCount": true,
		"fillOpacity": true,
		"fontWeight": true,
		"lineHeight": true,
		"opacity": true,
		"order": true,
		"orphans": true,
		"widows": true,
		"zIndex": true,
		"zoom": true
	},

	// Add in properties whose names you wish to fix before
	// setting or getting the value
	cssProps: {
		// normalize float css property
		"float": support.cssFloat ? "cssFloat" : "styleFloat"
	},

	// Get and set the style property on a DOM Node
	style: function( elem, name, value, extra ) {
		// Don't set styles on text and comment nodes
		if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
			return;
		}

		// Make sure that we're working with the right name
		var ret, type, hooks,
			origName = jQuery.camelCase( name ),
			style = elem.style;

		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// Check if we're setting a value
		if ( value !== undefined ) {
			type = typeof value;

			// convert relative number strings (+= or -=) to relative numbers. #7345
			if ( type === "string" && (ret = rrelNum.exec( value )) ) {
				value = ( ret[1] + 1 ) * ret[2] + parseFloat( jQuery.css( elem, name ) );
				// Fixes bug #9237
				type = "number";
			}

			// Make sure that null and NaN values aren't set. See: #7116
			if ( value == null || value !== value ) {
				return;
			}

			// If a number was passed in, add 'px' to the (except for certain CSS properties)
			if ( type === "number" && !jQuery.cssNumber[ origName ] ) {
				value += "px";
			}

			// Fixes #8908, it can be done more correctly by specifing setters in cssHooks,
			// but it would mean to define eight (for every problematic property) identical functions
			if ( !support.clearCloneStyle && value === "" && name.indexOf("background") === 0 ) {
				style[ name ] = "inherit";
			}

			// If a hook was provided, use that value, otherwise just set the specified value
			if ( !hooks || !("set" in hooks) || (value = hooks.set( elem, value, extra )) !== undefined ) {

				// Support: IE
				// Swallow errors from 'invalid' CSS values (#5509)
				try {
					// Support: Chrome, Safari
					// Setting style to blank string required to delete "style: x !important;"
					style[ name ] = "";
					style[ name ] = value;
				} catch(e) {}
			}

		} else {
			// If a hook was provided get the non-computed value from there
			if ( hooks && "get" in hooks && (ret = hooks.get( elem, false, extra )) !== undefined ) {
				return ret;
			}

			// Otherwise just get the value from the style object
			return style[ name ];
		}
	},

	css: function( elem, name, extra, styles ) {
		var num, val, hooks,
			origName = jQuery.camelCase( name );

		// Make sure that we're working with the right name
		name = jQuery.cssProps[ origName ] || ( jQuery.cssProps[ origName ] = vendorPropName( elem.style, origName ) );

		// gets hook for the prefixed version
		// followed by the unprefixed version
		hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

		// If a hook was provided get the computed value from there
		if ( hooks && "get" in hooks ) {
			val = hooks.get( elem, true, extra );
		}

		// Otherwise, if a way to get the computed value exists, use that
		if ( val === undefined ) {
			val = curCSS( elem, name, styles );
		}

		//convert "normal" to computed value
		if ( val === "normal" && name in cssNormalTransform ) {
			val = cssNormalTransform[ name ];
		}

		// Return, converting to number if forced or a qualifier was provided and val looks numeric
		if ( extra === "" || extra ) {
			num = parseFloat( val );
			return extra === true || jQuery.isNumeric( num ) ? num || 0 : val;
		}
		return val;
	}
});

jQuery.each([ "height", "width" ], function( i, name ) {
	jQuery.cssHooks[ name ] = {
		get: function( elem, computed, extra ) {
			if ( computed ) {
				// certain elements can have dimension info if we invisibly show them
				// however, it must have a current display style that would benefit from this
				return elem.offsetWidth === 0 && rdisplayswap.test( jQuery.css( elem, "display" ) ) ?
					jQuery.swap( elem, cssShow, function() {
						return getWidthOrHeight( elem, name, extra );
					}) :
					getWidthOrHeight( elem, name, extra );
			}
		},

		set: function( elem, value, extra ) {
			var styles = extra && getStyles( elem );
			return setPositiveNumber( elem, value, extra ?
				augmentWidthOrHeight(
					elem,
					name,
					extra,
					support.boxSizing() && jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
					styles
				) : 0
			);
		}
	};
});

if ( !support.opacity ) {
	jQuery.cssHooks.opacity = {
		get: function( elem, computed ) {
			// IE uses filters for opacity
			return ropacity.test( (computed && elem.currentStyle ? elem.currentStyle.filter : elem.style.filter) || "" ) ?
				( 0.01 * parseFloat( RegExp.$1 ) ) + "" :
				computed ? "1" : "";
		},

		set: function( elem, value ) {
			var style = elem.style,
				currentStyle = elem.currentStyle,
				opacity = jQuery.isNumeric( value ) ? "alpha(opacity=" + value * 100 + ")" : "",
				filter = currentStyle && currentStyle.filter || style.filter || "";

			// IE has trouble with opacity if it does not have layout
			// Force it by setting the zoom level
			style.zoom = 1;

			// if setting opacity to 1, and no other filters exist - attempt to remove filter attribute #6652
			// if value === "", then remove inline opacity #12685
			if ( ( value >= 1 || value === "" ) &&
					jQuery.trim( filter.replace( ralpha, "" ) ) === "" &&
					style.removeAttribute ) {

				// Setting style.filter to null, "" & " " still leave "filter:" in the cssText
				// if "filter:" is present at all, clearType is disabled, we want to avoid this
				// style.removeAttribute is IE Only, but so apparently is this code path...
				style.removeAttribute( "filter" );

				// if there is no filter style applied in a css rule or unset inline opacity, we are done
				if ( value === "" || currentStyle && !currentStyle.filter ) {
					return;
				}
			}

			// otherwise, set new filter values
			style.filter = ralpha.test( filter ) ?
				filter.replace( ralpha, opacity ) :
				filter + " " + opacity;
		}
	};
}

jQuery.cssHooks.marginRight = addGetHookIf( support.reliableMarginRight,
	function( elem, computed ) {
		if ( computed ) {
			// WebKit Bug 13343 - getComputedStyle returns wrong value for margin-right
			// Work around by temporarily setting element display to inline-block
			return jQuery.swap( elem, { "display": "inline-block" },
				curCSS, [ elem, "marginRight" ] );
		}
	}
);

// These hooks are used by animate to expand properties
jQuery.each({
	margin: "",
	padding: "",
	border: "Width"
}, function( prefix, suffix ) {
	jQuery.cssHooks[ prefix + suffix ] = {
		expand: function( value ) {
			var i = 0,
				expanded = {},

				// assumes a single number if not a string
				parts = typeof value === "string" ? value.split(" ") : [ value ];

			for ( ; i < 4; i++ ) {
				expanded[ prefix + cssExpand[ i ] + suffix ] =
					parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
			}

			return expanded;
		}
	};

	if ( !rmargin.test( prefix ) ) {
		jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
	}
});

jQuery.fn.extend({
	css: function( name, value ) {
		return access( this, function( elem, name, value ) {
			var styles, len,
				map = {},
				i = 0;

			if ( jQuery.isArray( name ) ) {
				styles = getStyles( elem );
				len = name.length;

				for ( ; i < len; i++ ) {
					map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
				}

				return map;
			}

			return value !== undefined ?
				jQuery.style( elem, name, value ) :
				jQuery.css( elem, name );
		}, name, value, arguments.length > 1 );
	},
	show: function() {
		return showHide( this, true );
	},
	hide: function() {
		return showHide( this );
	},
	toggle: function( state ) {
		if ( typeof state === "boolean" ) {
			return state ? this.show() : this.hide();
		}

		return this.each(function() {
			if ( isHidden( this ) ) {
				jQuery( this ).show();
			} else {
				jQuery( this ).hide();
			}
		});
	}
});


function Tween( elem, options, prop, end, easing ) {
	return new Tween.prototype.init( elem, options, prop, end, easing );
}
jQuery.Tween = Tween;

Tween.prototype = {
	constructor: Tween,
	init: function( elem, options, prop, end, easing, unit ) {
		this.elem = elem;
		this.prop = prop;
		this.easing = easing || "swing";
		this.options = options;
		this.start = this.now = this.cur();
		this.end = end;
		this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
	},
	cur: function() {
		var hooks = Tween.propHooks[ this.prop ];

		return hooks && hooks.get ?
			hooks.get( this ) :
			Tween.propHooks._default.get( this );
	},
	run: function( percent ) {
		var eased,
			hooks = Tween.propHooks[ this.prop ];

		if ( this.options.duration ) {
			this.pos = eased = jQuery.easing[ this.easing ](
				percent, this.options.duration * percent, 0, 1, this.options.duration
			);
		} else {
			this.pos = eased = percent;
		}
		this.now = ( this.end - this.start ) * eased + this.start;

		if ( this.options.step ) {
			this.options.step.call( this.elem, this.now, this );
		}

		if ( hooks && hooks.set ) {
			hooks.set( this );
		} else {
			Tween.propHooks._default.set( this );
		}
		return this;
	}
};

Tween.prototype.init.prototype = Tween.prototype;

Tween.propHooks = {
	_default: {
		get: function( tween ) {
			var result;

			if ( tween.elem[ tween.prop ] != null &&
				(!tween.elem.style || tween.elem.style[ tween.prop ] == null) ) {
				return tween.elem[ tween.prop ];
			}

			// passing an empty string as a 3rd parameter to .css will automatically
			// attempt a parseFloat and fallback to a string if the parse fails
			// so, simple values such as "10px" are parsed to Float.
			// complex values such as "rotate(1rad)" are returned as is.
			result = jQuery.css( tween.elem, tween.prop, "" );
			// Empty strings, null, undefined and "auto" are converted to 0.
			return !result || result === "auto" ? 0 : result;
		},
		set: function( tween ) {
			// use step hook for back compat - use cssHook if its there - use .style if its
			// available and use plain properties where available
			if ( jQuery.fx.step[ tween.prop ] ) {
				jQuery.fx.step[ tween.prop ]( tween );
			} else if ( tween.elem.style && ( tween.elem.style[ jQuery.cssProps[ tween.prop ] ] != null || jQuery.cssHooks[ tween.prop ] ) ) {
				jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
			} else {
				tween.elem[ tween.prop ] = tween.now;
			}
		}
	}
};

// Support: IE <=9
// Panic based approach to setting things on disconnected nodes

Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
	set: function( tween ) {
		if ( tween.elem.nodeType && tween.elem.parentNode ) {
			tween.elem[ tween.prop ] = tween.now;
		}
	}
};

jQuery.easing = {
	linear: function( p ) {
		return p;
	},
	swing: function( p ) {
		return 0.5 - Math.cos( p * Math.PI ) / 2;
	}
};

jQuery.fx = Tween.prototype.init;

// Back Compat <1.8 extension point
jQuery.fx.step = {};




var
	fxNow, timerId,
	rfxtypes = /^(?:toggle|show|hide)$/,
	rfxnum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" ),
	rrun = /queueHooks$/,
	animationPrefilters = [ defaultPrefilter ],
	tweeners = {
		"*": [ function( prop, value ) {
			var tween = this.createTween( prop, value ),
				target = tween.cur(),
				parts = rfxnum.exec( value ),
				unit = parts && parts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

				// Starting value computation is required for potential unit mismatches
				start = ( jQuery.cssNumber[ prop ] || unit !== "px" && +target ) &&
					rfxnum.exec( jQuery.css( tween.elem, prop ) ),
				scale = 1,
				maxIterations = 20;

			if ( start && start[ 3 ] !== unit ) {
				// Trust units reported by jQuery.css
				unit = unit || start[ 3 ];

				// Make sure we update the tween properties later on
				parts = parts || [];

				// Iteratively approximate from a nonzero starting point
				start = +target || 1;

				do {
					// If previous iteration zeroed out, double until we get *something*
					// Use a string for doubling factor so we don't accidentally see scale as unchanged below
					scale = scale || ".5";

					// Adjust and apply
					start = start / scale;
					jQuery.style( tween.elem, prop, start + unit );

				// Update scale, tolerating zero or NaN from tween.cur()
				// And breaking the loop if scale is unchanged or perfect, or if we've just had enough
				} while ( scale !== (scale = tween.cur() / target) && scale !== 1 && --maxIterations );
			}

			// Update tween properties
			if ( parts ) {
				start = tween.start = +start || +target || 0;
				tween.unit = unit;
				// If a +=/-= token was provided, we're doing a relative animation
				tween.end = parts[ 1 ] ?
					start + ( parts[ 1 ] + 1 ) * parts[ 2 ] :
					+parts[ 2 ];
			}

			return tween;
		} ]
	};

// Animations created synchronously will run synchronously
function createFxNow() {
	setTimeout(function() {
		fxNow = undefined;
	});
	return ( fxNow = jQuery.now() );
}

// Generate parameters to create a standard animation
function genFx( type, includeWidth ) {
	var which,
		attrs = { height: type },
		i = 0;

	// if we include width, step value is 1 to do all cssExpand values,
	// if we don't include width, step value is 2 to skip over Left and Right
	includeWidth = includeWidth ? 1 : 0;
	for ( ; i < 4 ; i += 2 - includeWidth ) {
		which = cssExpand[ i ];
		attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
	}

	if ( includeWidth ) {
		attrs.opacity = attrs.width = type;
	}

	return attrs;
}

function createTween( value, prop, animation ) {
	var tween,
		collection = ( tweeners[ prop ] || [] ).concat( tweeners[ "*" ] ),
		index = 0,
		length = collection.length;
	for ( ; index < length; index++ ) {
		if ( (tween = collection[ index ].call( animation, prop, value )) ) {

			// we're done with this property
			return tween;
		}
	}
}

function defaultPrefilter( elem, props, opts ) {
	/* jshint validthis: true */
	var prop, value, toggle, tween, hooks, oldfire, display, dDisplay,
		anim = this,
		orig = {},
		style = elem.style,
		hidden = elem.nodeType && isHidden( elem ),
		dataShow = jQuery._data( elem, "fxshow" );

	// handle queue: false promises
	if ( !opts.queue ) {
		hooks = jQuery._queueHooks( elem, "fx" );
		if ( hooks.unqueued == null ) {
			hooks.unqueued = 0;
			oldfire = hooks.empty.fire;
			hooks.empty.fire = function() {
				if ( !hooks.unqueued ) {
					oldfire();
				}
			};
		}
		hooks.unqueued++;

		anim.always(function() {
			// doing this makes sure that the complete handler will be called
			// before this completes
			anim.always(function() {
				hooks.unqueued--;
				if ( !jQuery.queue( elem, "fx" ).length ) {
					hooks.empty.fire();
				}
			});
		});
	}

	// height/width overflow pass
	if ( elem.nodeType === 1 && ( "height" in props || "width" in props ) ) {
		// Make sure that nothing sneaks out
		// Record all 3 overflow attributes because IE does not
		// change the overflow attribute when overflowX and
		// overflowY are set to the same value
		opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

		// Set display property to inline-block for height/width
		// animations on inline elements that are having width/height animated
		display = jQuery.css( elem, "display" );
		dDisplay = defaultDisplay( elem.nodeName );
		if ( display === "none" ) {
			display = dDisplay;
		}
		if ( display === "inline" &&
				jQuery.css( elem, "float" ) === "none" ) {

			// inline-level elements accept inline-block;
			// block-level elements need to be inline with layout
			if ( !support.inlineBlockNeedsLayout || dDisplay === "inline" ) {
				style.display = "inline-block";
			} else {
				style.zoom = 1;
			}
		}
	}

	if ( opts.overflow ) {
		style.overflow = "hidden";
		if ( !support.shrinkWrapBlocks() ) {
			anim.always(function() {
				style.overflow = opts.overflow[ 0 ];
				style.overflowX = opts.overflow[ 1 ];
				style.overflowY = opts.overflow[ 2 ];
			});
		}
	}

	// show/hide pass
	for ( prop in props ) {
		value = props[ prop ];
		if ( rfxtypes.exec( value ) ) {
			delete props[ prop ];
			toggle = toggle || value === "toggle";
			if ( value === ( hidden ? "hide" : "show" ) ) {

				// If there is dataShow left over from a stopped hide or show and we are going to proceed with show, we should pretend to be hidden
				if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
					hidden = true;
				} else {
					continue;
				}
			}
			orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
		}
	}

	if ( !jQuery.isEmptyObject( orig ) ) {
		if ( dataShow ) {
			if ( "hidden" in dataShow ) {
				hidden = dataShow.hidden;
			}
		} else {
			dataShow = jQuery._data( elem, "fxshow", {} );
		}

		// store state if its toggle - enables .stop().toggle() to "reverse"
		if ( toggle ) {
			dataShow.hidden = !hidden;
		}
		if ( hidden ) {
			jQuery( elem ).show();
		} else {
			anim.done(function() {
				jQuery( elem ).hide();
			});
		}
		anim.done(function() {
			var prop;
			jQuery._removeData( elem, "fxshow" );
			for ( prop in orig ) {
				jQuery.style( elem, prop, orig[ prop ] );
			}
		});
		for ( prop in orig ) {
			tween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );

			if ( !( prop in dataShow ) ) {
				dataShow[ prop ] = tween.start;
				if ( hidden ) {
					tween.end = tween.start;
					tween.start = prop === "width" || prop === "height" ? 1 : 0;
				}
			}
		}
	}
}

function propFilter( props, specialEasing ) {
	var index, name, easing, value, hooks;

	// camelCase, specialEasing and expand cssHook pass
	for ( index in props ) {
		name = jQuery.camelCase( index );
		easing = specialEasing[ name ];
		value = props[ index ];
		if ( jQuery.isArray( value ) ) {
			easing = value[ 1 ];
			value = props[ index ] = value[ 0 ];
		}

		if ( index !== name ) {
			props[ name ] = value;
			delete props[ index ];
		}

		hooks = jQuery.cssHooks[ name ];
		if ( hooks && "expand" in hooks ) {
			value = hooks.expand( value );
			delete props[ name ];

			// not quite $.extend, this wont overwrite keys already present.
			// also - reusing 'index' from above because we have the correct "name"
			for ( index in value ) {
				if ( !( index in props ) ) {
					props[ index ] = value[ index ];
					specialEasing[ index ] = easing;
				}
			}
		} else {
			specialEasing[ name ] = easing;
		}
	}
}

function Animation( elem, properties, options ) {
	var result,
		stopped,
		index = 0,
		length = animationPrefilters.length,
		deferred = jQuery.Deferred().always( function() {
			// don't match elem in the :animated selector
			delete tick.elem;
		}),
		tick = function() {
			if ( stopped ) {
				return false;
			}
			var currentTime = fxNow || createFxNow(),
				remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),
				// archaic crash bug won't allow us to use 1 - ( 0.5 || 0 ) (#12497)
				temp = remaining / animation.duration || 0,
				percent = 1 - temp,
				index = 0,
				length = animation.tweens.length;

			for ( ; index < length ; index++ ) {
				animation.tweens[ index ].run( percent );
			}

			deferred.notifyWith( elem, [ animation, percent, remaining ]);

			if ( percent < 1 && length ) {
				return remaining;
			} else {
				deferred.resolveWith( elem, [ animation ] );
				return false;
			}
		},
		animation = deferred.promise({
			elem: elem,
			props: jQuery.extend( {}, properties ),
			opts: jQuery.extend( true, { specialEasing: {} }, options ),
			originalProperties: properties,
			originalOptions: options,
			startTime: fxNow || createFxNow(),
			duration: options.duration,
			tweens: [],
			createTween: function( prop, end ) {
				var tween = jQuery.Tween( elem, animation.opts, prop, end,
						animation.opts.specialEasing[ prop ] || animation.opts.easing );
				animation.tweens.push( tween );
				return tween;
			},
			stop: function( gotoEnd ) {
				var index = 0,
					// if we are going to the end, we want to run all the tweens
					// otherwise we skip this part
					length = gotoEnd ? animation.tweens.length : 0;
				if ( stopped ) {
					return this;
				}
				stopped = true;
				for ( ; index < length ; index++ ) {
					animation.tweens[ index ].run( 1 );
				}

				// resolve when we played the last frame
				// otherwise, reject
				if ( gotoEnd ) {
					deferred.resolveWith( elem, [ animation, gotoEnd ] );
				} else {
					deferred.rejectWith( elem, [ animation, gotoEnd ] );
				}
				return this;
			}
		}),
		props = animation.props;

	propFilter( props, animation.opts.specialEasing );

	for ( ; index < length ; index++ ) {
		result = animationPrefilters[ index ].call( animation, elem, props, animation.opts );
		if ( result ) {
			return result;
		}
	}

	jQuery.map( props, createTween, animation );

	if ( jQuery.isFunction( animation.opts.start ) ) {
		animation.opts.start.call( elem, animation );
	}

	jQuery.fx.timer(
		jQuery.extend( tick, {
			elem: elem,
			anim: animation,
			queue: animation.opts.queue
		})
	);

	// attach callbacks from options
	return animation.progress( animation.opts.progress )
		.done( animation.opts.done, animation.opts.complete )
		.fail( animation.opts.fail )
		.always( animation.opts.always );
}

jQuery.Animation = jQuery.extend( Animation, {
	tweener: function( props, callback ) {
		if ( jQuery.isFunction( props ) ) {
			callback = props;
			props = [ "*" ];
		} else {
			props = props.split(" ");
		}

		var prop,
			index = 0,
			length = props.length;

		for ( ; index < length ; index++ ) {
			prop = props[ index ];
			tweeners[ prop ] = tweeners[ prop ] || [];
			tweeners[ prop ].unshift( callback );
		}
	},

	prefilter: function( callback, prepend ) {
		if ( prepend ) {
			animationPrefilters.unshift( callback );
		} else {
			animationPrefilters.push( callback );
		}
	}
});

jQuery.speed = function( speed, easing, fn ) {
	var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
		complete: fn || !fn && easing ||
			jQuery.isFunction( speed ) && speed,
		duration: speed,
		easing: fn && easing || easing && !jQuery.isFunction( easing ) && easing
	};

	opt.duration = jQuery.fx.off ? 0 : typeof opt.duration === "number" ? opt.duration :
		opt.duration in jQuery.fx.speeds ? jQuery.fx.speeds[ opt.duration ] : jQuery.fx.speeds._default;

	// normalize opt.queue - true/undefined/null -> "fx"
	if ( opt.queue == null || opt.queue === true ) {
		opt.queue = "fx";
	}

	// Queueing
	opt.old = opt.complete;

	opt.complete = function() {
		if ( jQuery.isFunction( opt.old ) ) {
			opt.old.call( this );
		}

		if ( opt.queue ) {
			jQuery.dequeue( this, opt.queue );
		}
	};

	return opt;
};

jQuery.fn.extend({
	fadeTo: function( speed, to, easing, callback ) {

		// show any hidden elements after setting opacity to 0
		return this.filter( isHidden ).css( "opacity", 0 ).show()

			// animate to the value specified
			.end().animate({ opacity: to }, speed, easing, callback );
	},
	animate: function( prop, speed, easing, callback ) {
		var empty = jQuery.isEmptyObject( prop ),
			optall = jQuery.speed( speed, easing, callback ),
			doAnimation = function() {
				// Operate on a copy of prop so per-property easing won't be lost
				var anim = Animation( this, jQuery.extend( {}, prop ), optall );

				// Empty animations, or finishing resolves immediately
				if ( empty || jQuery._data( this, "finish" ) ) {
					anim.stop( true );
				}
			};
			doAnimation.finish = doAnimation;

		return empty || optall.queue === false ?
			this.each( doAnimation ) :
			this.queue( optall.queue, doAnimation );
	},
	stop: function( type, clearQueue, gotoEnd ) {
		var stopQueue = function( hooks ) {
			var stop = hooks.stop;
			delete hooks.stop;
			stop( gotoEnd );
		};

		if ( typeof type !== "string" ) {
			gotoEnd = clearQueue;
			clearQueue = type;
			type = undefined;
		}
		if ( clearQueue && type !== false ) {
			this.queue( type || "fx", [] );
		}

		return this.each(function() {
			var dequeue = true,
				index = type != null && type + "queueHooks",
				timers = jQuery.timers,
				data = jQuery._data( this );

			if ( index ) {
				if ( data[ index ] && data[ index ].stop ) {
					stopQueue( data[ index ] );
				}
			} else {
				for ( index in data ) {
					if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
						stopQueue( data[ index ] );
					}
				}
			}

			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && (type == null || timers[ index ].queue === type) ) {
					timers[ index ].anim.stop( gotoEnd );
					dequeue = false;
					timers.splice( index, 1 );
				}
			}

			// start the next in the queue if the last step wasn't forced
			// timers currently will call their complete callbacks, which will dequeue
			// but only if they were gotoEnd
			if ( dequeue || !gotoEnd ) {
				jQuery.dequeue( this, type );
			}
		});
	},
	finish: function( type ) {
		if ( type !== false ) {
			type = type || "fx";
		}
		return this.each(function() {
			var index,
				data = jQuery._data( this ),
				queue = data[ type + "queue" ],
				hooks = data[ type + "queueHooks" ],
				timers = jQuery.timers,
				length = queue ? queue.length : 0;

			// enable finishing flag on private data
			data.finish = true;

			// empty the queue first
			jQuery.queue( this, type, [] );

			if ( hooks && hooks.stop ) {
				hooks.stop.call( this, true );
			}

			// look for any active animations, and finish them
			for ( index = timers.length; index--; ) {
				if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
					timers[ index ].anim.stop( true );
					timers.splice( index, 1 );
				}
			}

			// look for any animations in the old queue and finish them
			for ( index = 0; index < length; index++ ) {
				if ( queue[ index ] && queue[ index ].finish ) {
					queue[ index ].finish.call( this );
				}
			}

			// turn off finishing flag
			delete data.finish;
		});
	}
});

jQuery.each([ "toggle", "show", "hide" ], function( i, name ) {
	var cssFn = jQuery.fn[ name ];
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return speed == null || typeof speed === "boolean" ?
			cssFn.apply( this, arguments ) :
			this.animate( genFx( name, true ), speed, easing, callback );
	};
});

// Generate shortcuts for custom animations
jQuery.each({
	slideDown: genFx("show"),
	slideUp: genFx("hide"),
	slideToggle: genFx("toggle"),
	fadeIn: { opacity: "show" },
	fadeOut: { opacity: "hide" },
	fadeToggle: { opacity: "toggle" }
}, function( name, props ) {
	jQuery.fn[ name ] = function( speed, easing, callback ) {
		return this.animate( props, speed, easing, callback );
	};
});

jQuery.timers = [];
jQuery.fx.tick = function() {
	var timer,
		timers = jQuery.timers,
		i = 0;

	fxNow = jQuery.now();

	for ( ; i < timers.length; i++ ) {
		timer = timers[ i ];
		// Checks the timer has not already been removed
		if ( !timer() && timers[ i ] === timer ) {
			timers.splice( i--, 1 );
		}
	}

	if ( !timers.length ) {
		jQuery.fx.stop();
	}
	fxNow = undefined;
};

jQuery.fx.timer = function( timer ) {
	jQuery.timers.push( timer );
	if ( timer() ) {
		jQuery.fx.start();
	} else {
		jQuery.timers.pop();
	}
};

jQuery.fx.interval = 13;

jQuery.fx.start = function() {
	if ( !timerId ) {
		timerId = setInterval( jQuery.fx.tick, jQuery.fx.interval );
	}
};

jQuery.fx.stop = function() {
	clearInterval( timerId );
	timerId = null;
};

jQuery.fx.speeds = {
	slow: 600,
	fast: 200,
	// Default speed
	_default: 400
};


// Based off of the plugin by Clint Helfers, with permission.
// http://blindsignals.com/index.php/2009/07/jquery-delay/
jQuery.fn.delay = function( time, type ) {
	time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
	type = type || "fx";

	return this.queue( type, function( next, hooks ) {
		var timeout = setTimeout( next, time );
		hooks.stop = function() {
			clearTimeout( timeout );
		};
	});
};


(function() {
	var a, input, select, opt,
		div = document.createElement("div" );

	// Setup
	div.setAttribute( "className", "t" );
	div.innerHTML = "  <link/><table></table><a href='/a'>a</a><input type='checkbox'/>";
	a = div.getElementsByTagName("a")[ 0 ];

	// First batch of tests.
	select = document.createElement("select");
	opt = select.appendChild( document.createElement("option") );
	input = div.getElementsByTagName("input")[ 0 ];

	a.style.cssText = "top:1px";

	// Test setAttribute on camelCase class. If it works, we need attrFixes when doing get/setAttribute (ie6/7)
	support.getSetAttribute = div.className !== "t";

	// Get the style information from getAttribute
	// (IE uses .cssText instead)
	support.style = /top/.test( a.getAttribute("style") );

	// Make sure that URLs aren't manipulated
	// (IE normalizes it by default)
	support.hrefNormalized = a.getAttribute("href") === "/a";

	// Check the default checkbox/radio value ("" on WebKit; "on" elsewhere)
	support.checkOn = !!input.value;

	// Make sure that a selected-by-default option has a working selected property.
	// (WebKit defaults to false instead of true, IE too, if it's in an optgroup)
	support.optSelected = opt.selected;

	// Tests for enctype support on a form (#6743)
	support.enctype = !!document.createElement("form").enctype;

	// Make sure that the options inside disabled selects aren't marked as disabled
	// (WebKit marks them as disabled)
	select.disabled = true;
	support.optDisabled = !opt.disabled;

	// Support: IE8 only
	// Check if we can trust getAttribute("value")
	input = document.createElement( "input" );
	input.setAttribute( "value", "" );
	support.input = input.getAttribute( "value" ) === "";

	// Check if an input maintains its value after becoming a radio
	input.value = "t";
	input.setAttribute( "type", "radio" );
	support.radioValue = input.value === "t";

	// Null elements to avoid leaks in IE.
	a = input = select = opt = div = null;
})();


var rreturn = /\r/g;

jQuery.fn.extend({
	val: function( value ) {
		var hooks, ret, isFunction,
			elem = this[0];

		if ( !arguments.length ) {
			if ( elem ) {
				hooks = jQuery.valHooks[ elem.type ] || jQuery.valHooks[ elem.nodeName.toLowerCase() ];

				if ( hooks && "get" in hooks && (ret = hooks.get( elem, "value" )) !== undefined ) {
					return ret;
				}

				ret = elem.value;

				return typeof ret === "string" ?
					// handle most common string cases
					ret.replace(rreturn, "") :
					// handle cases where value is null/undef or number
					ret == null ? "" : ret;
			}

			return;
		}

		isFunction = jQuery.isFunction( value );

		return this.each(function( i ) {
			var val;

			if ( this.nodeType !== 1 ) {
				return;
			}

			if ( isFunction ) {
				val = value.call( this, i, jQuery( this ).val() );
			} else {
				val = value;
			}

			// Treat null/undefined as ""; convert numbers to string
			if ( val == null ) {
				val = "";
			} else if ( typeof val === "number" ) {
				val += "";
			} else if ( jQuery.isArray( val ) ) {
				val = jQuery.map( val, function( value ) {
					return value == null ? "" : value + "";
				});
			}

			hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

			// If set returns undefined, fall back to normal setting
			if ( !hooks || !("set" in hooks) || hooks.set( this, val, "value" ) === undefined ) {
				this.value = val;
			}
		});
	}
});

jQuery.extend({
	valHooks: {
		option: {
			get: function( elem ) {
				var val = jQuery.find.attr( elem, "value" );
				return val != null ?
					val :
					jQuery.text( elem );
			}
		},
		select: {
			get: function( elem ) {
				var value, option,
					options = elem.options,
					index = elem.selectedIndex,
					one = elem.type === "select-one" || index < 0,
					values = one ? null : [],
					max = one ? index + 1 : options.length,
					i = index < 0 ?
						max :
						one ? index : 0;

				// Loop through all the selected options
				for ( ; i < max; i++ ) {
					option = options[ i ];

					// oldIE doesn't update selected after form reset (#2551)
					if ( ( option.selected || i === index ) &&
							// Don't return options that are disabled or in a disabled optgroup
							( support.optDisabled ? !option.disabled : option.getAttribute("disabled") === null ) &&
							( !option.parentNode.disabled || !jQuery.nodeName( option.parentNode, "optgroup" ) ) ) {

						// Get the specific value for the option
						value = jQuery( option ).val();

						// We don't need an array for one selects
						if ( one ) {
							return value;
						}

						// Multi-Selects return an array
						values.push( value );
					}
				}

				return values;
			},

			set: function( elem, value ) {
				var optionSet, option,
					options = elem.options,
					values = jQuery.makeArray( value ),
					i = options.length;

				while ( i-- ) {
					option = options[ i ];

					if ( jQuery.inArray( jQuery.valHooks.option.get( option ), values ) >= 0 ) {

						// Support: IE6
						// When new option element is added to select box we need to
						// force reflow of newly added node in order to workaround delay
						// of initialization properties
						try {
							option.selected = optionSet = true;

						} catch ( _ ) {

							// Will be executed only in IE6
							option.scrollHeight;
						}

					} else {
						option.selected = false;
					}
				}

				// Force browsers to behave consistently when non-matching value is set
				if ( !optionSet ) {
					elem.selectedIndex = -1;
				}

				return options;
			}
		}
	}
});

// Radios and checkboxes getter/setter
jQuery.each([ "radio", "checkbox" ], function() {
	jQuery.valHooks[ this ] = {
		set: function( elem, value ) {
			if ( jQuery.isArray( value ) ) {
				return ( elem.checked = jQuery.inArray( jQuery(elem).val(), value ) >= 0 );
			}
		}
	};
	if ( !support.checkOn ) {
		jQuery.valHooks[ this ].get = function( elem ) {
			// Support: Webkit
			// "" is returned instead of "on" if a value isn't specified
			return elem.getAttribute("value") === null ? "on" : elem.value;
		};
	}
});




var nodeHook, boolHook,
	attrHandle = jQuery.expr.attrHandle,
	ruseDefault = /^(?:checked|selected)$/i,
	getSetAttribute = support.getSetAttribute,
	getSetInput = support.input;

jQuery.fn.extend({
	attr: function( name, value ) {
		return access( this, jQuery.attr, name, value, arguments.length > 1 );
	},

	removeAttr: function( name ) {
		return this.each(function() {
			jQuery.removeAttr( this, name );
		});
	}
});

jQuery.extend({
	attr: function( elem, name, value ) {
		var hooks, ret,
			nType = elem.nodeType;

		// don't get/set attributes on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		// Fallback to prop when attributes are not supported
		if ( typeof elem.getAttribute === strundefined ) {
			return jQuery.prop( elem, name, value );
		}

		// All attributes are lowercase
		// Grab necessary hook if one is defined
		if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
			name = name.toLowerCase();
			hooks = jQuery.attrHooks[ name ] ||
				( jQuery.expr.match.bool.test( name ) ? boolHook : nodeHook );
		}

		if ( value !== undefined ) {

			if ( value === null ) {
				jQuery.removeAttr( elem, name );

			} else if ( hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ) {
				return ret;

			} else {
				elem.setAttribute( name, value + "" );
				return value;
			}

		} else if ( hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ) {
			return ret;

		} else {
			ret = jQuery.find.attr( elem, name );

			// Non-existent attributes return null, we normalize to undefined
			return ret == null ?
				undefined :
				ret;
		}
	},

	removeAttr: function( elem, value ) {
		var name, propName,
			i = 0,
			attrNames = value && value.match( rnotwhite );

		if ( attrNames && elem.nodeType === 1 ) {
			while ( (name = attrNames[i++]) ) {
				propName = jQuery.propFix[ name ] || name;

				// Boolean attributes get special treatment (#10870)
				if ( jQuery.expr.match.bool.test( name ) ) {
					// Set corresponding property to false
					if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
						elem[ propName ] = false;
					// Support: IE<9
					// Also clear defaultChecked/defaultSelected (if appropriate)
					} else {
						elem[ jQuery.camelCase( "default-" + name ) ] =
							elem[ propName ] = false;
					}

				// See #9699 for explanation of this approach (setting first, then removal)
				} else {
					jQuery.attr( elem, name, "" );
				}

				elem.removeAttribute( getSetAttribute ? name : propName );
			}
		}
	},

	attrHooks: {
		type: {
			set: function( elem, value ) {
				if ( !support.radioValue && value === "radio" && jQuery.nodeName(elem, "input") ) {
					// Setting the type on a radio button after the value resets the value in IE6-9
					// Reset value to default in case type is set after value during creation
					var val = elem.value;
					elem.setAttribute( "type", value );
					if ( val ) {
						elem.value = val;
					}
					return value;
				}
			}
		}
	}
});

// Hook for boolean attributes
boolHook = {
	set: function( elem, value, name ) {
		if ( value === false ) {
			// Remove boolean attributes when set to false
			jQuery.removeAttr( elem, name );
		} else if ( getSetInput && getSetAttribute || !ruseDefault.test( name ) ) {
			// IE<8 needs the *property* name
			elem.setAttribute( !getSetAttribute && jQuery.propFix[ name ] || name, name );

		// Use defaultChecked and defaultSelected for oldIE
		} else {
			elem[ jQuery.camelCase( "default-" + name ) ] = elem[ name ] = true;
		}

		return name;
	}
};

// Retrieve booleans specially
jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( i, name ) {

	var getter = attrHandle[ name ] || jQuery.find.attr;

	attrHandle[ name ] = getSetInput && getSetAttribute || !ruseDefault.test( name ) ?
		function( elem, name, isXML ) {
			var ret, handle;
			if ( !isXML ) {
				// Avoid an infinite loop by temporarily removing this function from the getter
				handle = attrHandle[ name ];
				attrHandle[ name ] = ret;
				ret = getter( elem, name, isXML ) != null ?
					name.toLowerCase() :
					null;
				attrHandle[ name ] = handle;
			}
			return ret;
		} :
		function( elem, name, isXML ) {
			if ( !isXML ) {
				return elem[ jQuery.camelCase( "default-" + name ) ] ?
					name.toLowerCase() :
					null;
			}
		};
});

// fix oldIE attroperties
if ( !getSetInput || !getSetAttribute ) {
	jQuery.attrHooks.value = {
		set: function( elem, value, name ) {
			if ( jQuery.nodeName( elem, "input" ) ) {
				// Does not return so that setAttribute is also used
				elem.defaultValue = value;
			} else {
				// Use nodeHook if defined (#1954); otherwise setAttribute is fine
				return nodeHook && nodeHook.set( elem, value, name );
			}
		}
	};
}

// IE6/7 do not support getting/setting some attributes with get/setAttribute
if ( !getSetAttribute ) {

	// Use this for any attribute in IE6/7
	// This fixes almost every IE6/7 issue
	nodeHook = {
		set: function( elem, value, name ) {
			// Set the existing or create a new attribute node
			var ret = elem.getAttributeNode( name );
			if ( !ret ) {
				elem.setAttributeNode(
					(ret = elem.ownerDocument.createAttribute( name ))
				);
			}

			ret.value = value += "";

			// Break association with cloned elements by also using setAttribute (#9646)
			if ( name === "value" || value === elem.getAttribute( name ) ) {
				return value;
			}
		}
	};

	// Some attributes are constructed with empty-string values when not defined
	attrHandle.id = attrHandle.name = attrHandle.coords =
		function( elem, name, isXML ) {
			var ret;
			if ( !isXML ) {
				return (ret = elem.getAttributeNode( name )) && ret.value !== "" ?
					ret.value :
					null;
			}
		};

	// Fixing value retrieval on a button requires this module
	jQuery.valHooks.button = {
		get: function( elem, name ) {
			var ret = elem.getAttributeNode( name );
			if ( ret && ret.specified ) {
				return ret.value;
			}
		},
		set: nodeHook.set
	};

	// Set contenteditable to false on removals(#10429)
	// Setting to empty string throws an error as an invalid value
	jQuery.attrHooks.contenteditable = {
		set: function( elem, value, name ) {
			nodeHook.set( elem, value === "" ? false : value, name );
		}
	};

	// Set width and height to auto instead of 0 on empty string( Bug #8150 )
	// This is for removals
	jQuery.each([ "width", "height" ], function( i, name ) {
		jQuery.attrHooks[ name ] = {
			set: function( elem, value ) {
				if ( value === "" ) {
					elem.setAttribute( name, "auto" );
					return value;
				}
			}
		};
	});
}

if ( !support.style ) {
	jQuery.attrHooks.style = {
		get: function( elem ) {
			// Return undefined in the case of empty string
			// Note: IE uppercases css property names, but if we were to .toLowerCase()
			// .cssText, that would destroy case senstitivity in URL's, like in "background"
			return elem.style.cssText || undefined;
		},
		set: function( elem, value ) {
			return ( elem.style.cssText = value + "" );
		}
	};
}




var rfocusable = /^(?:input|select|textarea|button|object)$/i,
	rclickable = /^(?:a|area)$/i;

jQuery.fn.extend({
	prop: function( name, value ) {
		return access( this, jQuery.prop, name, value, arguments.length > 1 );
	},

	removeProp: function( name ) {
		name = jQuery.propFix[ name ] || name;
		return this.each(function() {
			// try/catch handles cases where IE balks (such as removing a property on window)
			try {
				this[ name ] = undefined;
				delete this[ name ];
			} catch( e ) {}
		});
	}
});

jQuery.extend({
	propFix: {
		"for": "htmlFor",
		"class": "className"
	},

	prop: function( elem, name, value ) {
		var ret, hooks, notxml,
			nType = elem.nodeType;

		// don't get/set properties on text, comment and attribute nodes
		if ( !elem || nType === 3 || nType === 8 || nType === 2 ) {
			return;
		}

		notxml = nType !== 1 || !jQuery.isXMLDoc( elem );

		if ( notxml ) {
			// Fix name and attach hooks
			name = jQuery.propFix[ name ] || name;
			hooks = jQuery.propHooks[ name ];
		}

		if ( value !== undefined ) {
			return hooks && "set" in hooks && (ret = hooks.set( elem, value, name )) !== undefined ?
				ret :
				( elem[ name ] = value );

		} else {
			return hooks && "get" in hooks && (ret = hooks.get( elem, name )) !== null ?
				ret :
				elem[ name ];
		}
	},

	propHooks: {
		tabIndex: {
			get: function( elem ) {
				// elem.tabIndex doesn't always return the correct value when it hasn't been explicitly set
				// http://fluidproject.org/blog/2008/01/09/getting-setting-and-removing-tabindex-values-with-javascript/
				// Use proper attribute retrieval(#12072)
				var tabindex = jQuery.find.attr( elem, "tabindex" );

				return tabindex ?
					parseInt( tabindex, 10 ) :
					rfocusable.test( elem.nodeName ) || rclickable.test( elem.nodeName ) && elem.href ?
						0 :
						-1;
			}
		}
	}
});

// Some attributes require a special call on IE
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !support.hrefNormalized ) {
	// href/src property should get the full normalized URL (#10299/#12915)
	jQuery.each([ "href", "src" ], function( i, name ) {
		jQuery.propHooks[ name ] = {
			get: function( elem ) {
				return elem.getAttribute( name, 4 );
			}
		};
	});
}

// Support: Safari, IE9+
// mis-reports the default selected property of an option
// Accessing the parent's selectedIndex property fixes it
if ( !support.optSelected ) {
	jQuery.propHooks.selected = {
		get: function( elem ) {
			var parent = elem.parentNode;

			if ( parent ) {
				parent.selectedIndex;

				// Make sure that it also works with optgroups, see #5701
				if ( parent.parentNode ) {
					parent.parentNode.selectedIndex;
				}
			}
			return null;
		}
	};
}

jQuery.each([
	"tabIndex",
	"readOnly",
	"maxLength",
	"cellSpacing",
	"cellPadding",
	"rowSpan",
	"colSpan",
	"useMap",
	"frameBorder",
	"contentEditable"
], function() {
	jQuery.propFix[ this.toLowerCase() ] = this;
});

// IE6/7 call enctype encoding
if ( !support.enctype ) {
	jQuery.propFix.enctype = "encoding";
}




var rclass = /[\t\r\n\f]/g;

jQuery.fn.extend({
	addClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).addClass( value.call( this, j, this.className ) );
			});
		}

		if ( proceed ) {
			// The disjunction here is for better compressibility (see removeClass)
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					" "
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						if ( cur.indexOf( " " + clazz + " " ) < 0 ) {
							cur += clazz + " ";
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = jQuery.trim( cur );
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	removeClass: function( value ) {
		var classes, elem, cur, clazz, j, finalValue,
			i = 0,
			len = this.length,
			proceed = arguments.length === 0 || typeof value === "string" && value;

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( j ) {
				jQuery( this ).removeClass( value.call( this, j, this.className ) );
			});
		}
		if ( proceed ) {
			classes = ( value || "" ).match( rnotwhite ) || [];

			for ( ; i < len; i++ ) {
				elem = this[ i ];
				// This expression is here for better compressibility (see addClass)
				cur = elem.nodeType === 1 && ( elem.className ?
					( " " + elem.className + " " ).replace( rclass, " " ) :
					""
				);

				if ( cur ) {
					j = 0;
					while ( (clazz = classes[j++]) ) {
						// Remove *all* instances
						while ( cur.indexOf( " " + clazz + " " ) >= 0 ) {
							cur = cur.replace( " " + clazz + " ", " " );
						}
					}

					// only assign if different to avoid unneeded rendering.
					finalValue = value ? jQuery.trim( cur ) : "";
					if ( elem.className !== finalValue ) {
						elem.className = finalValue;
					}
				}
			}
		}

		return this;
	},

	toggleClass: function( value, stateVal ) {
		var type = typeof value;

		if ( typeof stateVal === "boolean" && type === "string" ) {
			return stateVal ? this.addClass( value ) : this.removeClass( value );
		}

		if ( jQuery.isFunction( value ) ) {
			return this.each(function( i ) {
				jQuery( this ).toggleClass( value.call(this, i, this.className, stateVal), stateVal );
			});
		}

		return this.each(function() {
			if ( type === "string" ) {
				// toggle individual class names
				var className,
					i = 0,
					self = jQuery( this ),
					classNames = value.match( rnotwhite ) || [];

				while ( (className = classNames[ i++ ]) ) {
					// check each className given, space separated list
					if ( self.hasClass( className ) ) {
						self.removeClass( className );
					} else {
						self.addClass( className );
					}
				}

			// Toggle whole class name
			} else if ( type === strundefined || type === "boolean" ) {
				if ( this.className ) {
					// store className if set
					jQuery._data( this, "__className__", this.className );
				}

				// If the element has a class name or if we're passed "false",
				// then remove the whole classname (if there was one, the above saved it).
				// Otherwise bring back whatever was previously saved (if anything),
				// falling back to the empty string if nothing was stored.
				this.className = this.className || value === false ? "" : jQuery._data( this, "__className__" ) || "";
			}
		});
	},

	hasClass: function( selector ) {
		var className = " " + selector + " ",
			i = 0,
			l = this.length;
		for ( ; i < l; i++ ) {
			if ( this[i].nodeType === 1 && (" " + this[i].className + " ").replace(rclass, " ").indexOf( className ) >= 0 ) {
				return true;
			}
		}

		return false;
	}
});




// Return jQuery for attributes-only inclusion


jQuery.each( ("blur focus focusin focusout load resize scroll unload click dblclick " +
	"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
	"change select submit keydown keypress keyup error contextmenu").split(" "), function( i, name ) {

	// Handle event binding
	jQuery.fn[ name ] = function( data, fn ) {
		return arguments.length > 0 ?
			this.on( name, null, data, fn ) :
			this.trigger( name );
	};
});

jQuery.fn.extend({
	hover: function( fnOver, fnOut ) {
		return this.mouseenter( fnOver ).mouseleave( fnOut || fnOver );
	},

	bind: function( types, data, fn ) {
		return this.on( types, null, data, fn );
	},
	unbind: function( types, fn ) {
		return this.off( types, null, fn );
	},

	delegate: function( selector, types, data, fn ) {
		return this.on( types, selector, data, fn );
	},
	undelegate: function( selector, types, fn ) {
		// ( namespace ) or ( selector, types [, fn] )
		return arguments.length === 1 ? this.off( selector, "**" ) : this.off( types, selector || "**", fn );
	}
});


var nonce = jQuery.now();

var rquery = (/\?/);



var rvalidtokens = /(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g;

jQuery.parseJSON = function( data ) {
	// Attempt to parse using the native JSON parser first
	if ( window.JSON && window.JSON.parse ) {
		// Support: Android 2.3
		// Workaround failure to string-cast null input
		return window.JSON.parse( data + "" );
	}

	var requireNonComma,
		depth = null,
		str = jQuery.trim( data + "" );

	// Guard against invalid (and possibly dangerous) input by ensuring that nothing remains
	// after removing valid tokens
	return str && !jQuery.trim( str.replace( rvalidtokens, function( token, comma, open, close ) {

		// Force termination if we see a misplaced comma
		if ( requireNonComma && comma ) {
			depth = 0;
		}

		// Perform no more replacements after returning to outermost depth
		if ( depth === 0 ) {
			return token;
		}

		// Commas must not follow "[", "{", or ","
		requireNonComma = open || comma;

		// Determine new depth
		// array/object open ("[" or "{"): depth += true - false (increment)
		// array/object close ("]" or "}"): depth += false - true (decrement)
		// other cases ("," or primitive): depth += true - true (numeric cast)
		depth += !close - !open;

		// Remove this token
		return "";
	}) ) ?
		( Function( "return " + str ) )() :
		jQuery.error( "Invalid JSON: " + data );
};


// Cross-browser xml parsing
jQuery.parseXML = function( data ) {
	var xml, tmp;
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	try {
		if ( window.DOMParser ) { // Standard
			tmp = new DOMParser();
			xml = tmp.parseFromString( data, "text/xml" );
		} else { // IE
			xml = new ActiveXObject( "Microsoft.XMLDOM" );
			xml.async = "false";
			xml.loadXML( data );
		}
	} catch( e ) {
		xml = undefined;
	}
	if ( !xml || !xml.documentElement || xml.getElementsByTagName( "parsererror" ).length ) {
		jQuery.error( "Invalid XML: " + data );
	}
	return xml;
};


var
	// Document location
	ajaxLocParts,
	ajaxLocation,

	rhash = /#.*$/,
	rts = /([?&])_=[^&]*/,
	rheaders = /^(.*?):[ \t]*([^\r\n]*)\r?$/mg, // IE leaves an \r character at EOL
	// #7653, #8125, #8152: local protocol detection
	rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
	rnoContent = /^(?:GET|HEAD)$/,
	rprotocol = /^\/\//,
	rurl = /^([\w.+-]+:)(?:\/\/(?:[^\/?#]*@|)([^\/?#:]*)(?::(\d+)|)|)/,

	/* Prefilters
	 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
	 * 2) These are called:
	 *    - BEFORE asking for a transport
	 *    - AFTER param serialization (s.data is a string if s.processData is true)
	 * 3) key is the dataType
	 * 4) the catchall symbol "*" can be used
	 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
	 */
	prefilters = {},

	/* Transports bindings
	 * 1) key is the dataType
	 * 2) the catchall symbol "*" can be used
	 * 3) selection will start with transport dataType and THEN go to "*" if needed
	 */
	transports = {},

	// Avoid comment-prolog char sequence (#10098); must appease lint and evade compression
	allTypes = "*/".concat("*");

// #8138, IE may throw an exception when accessing
// a field from window.location if document.domain has been set
try {
	ajaxLocation = location.href;
} catch( e ) {
	// Use the href attribute of an A element
	// since IE will modify it given document.location
	ajaxLocation = document.createElement( "a" );
	ajaxLocation.href = "";
	ajaxLocation = ajaxLocation.href;
}

// Segment location into parts
ajaxLocParts = rurl.exec( ajaxLocation.toLowerCase() ) || [];

// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
function addToPrefiltersOrTransports( structure ) {

	// dataTypeExpression is optional and defaults to "*"
	return function( dataTypeExpression, func ) {

		if ( typeof dataTypeExpression !== "string" ) {
			func = dataTypeExpression;
			dataTypeExpression = "*";
		}

		var dataType,
			i = 0,
			dataTypes = dataTypeExpression.toLowerCase().match( rnotwhite ) || [];

		if ( jQuery.isFunction( func ) ) {
			// For each dataType in the dataTypeExpression
			while ( (dataType = dataTypes[i++]) ) {
				// Prepend if requested
				if ( dataType.charAt( 0 ) === "+" ) {
					dataType = dataType.slice( 1 ) || "*";
					(structure[ dataType ] = structure[ dataType ] || []).unshift( func );

				// Otherwise append
				} else {
					(structure[ dataType ] = structure[ dataType ] || []).push( func );
				}
			}
		}
	};
}

// Base inspection function for prefilters and transports
function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

	var inspected = {},
		seekingTransport = ( structure === transports );

	function inspect( dataType ) {
		var selected;
		inspected[ dataType ] = true;
		jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
			var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
			if ( typeof dataTypeOrTransport === "string" && !seekingTransport && !inspected[ dataTypeOrTransport ] ) {
				options.dataTypes.unshift( dataTypeOrTransport );
				inspect( dataTypeOrTransport );
				return false;
			} else if ( seekingTransport ) {
				return !( selected = dataTypeOrTransport );
			}
		});
		return selected;
	}

	return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
}

// A special extend for ajax options
// that takes "flat" options (not to be deep extended)
// Fixes #9887
function ajaxExtend( target, src ) {
	var deep, key,
		flatOptions = jQuery.ajaxSettings.flatOptions || {};

	for ( key in src ) {
		if ( src[ key ] !== undefined ) {
			( flatOptions[ key ] ? target : ( deep || (deep = {}) ) )[ key ] = src[ key ];
		}
	}
	if ( deep ) {
		jQuery.extend( true, target, deep );
	}

	return target;
}

/* Handles responses to an ajax request:
 * - finds the right dataType (mediates between content-type and expected dataType)
 * - returns the corresponding response
 */
function ajaxHandleResponses( s, jqXHR, responses ) {
	var firstDataType, ct, finalDataType, type,
		contents = s.contents,
		dataTypes = s.dataTypes;

	// Remove auto dataType and get content-type in the process
	while ( dataTypes[ 0 ] === "*" ) {
		dataTypes.shift();
		if ( ct === undefined ) {
			ct = s.mimeType || jqXHR.getResponseHeader("Content-Type");
		}
	}

	// Check if we're dealing with a known content-type
	if ( ct ) {
		for ( type in contents ) {
			if ( contents[ type ] && contents[ type ].test( ct ) ) {
				dataTypes.unshift( type );
				break;
			}
		}
	}

	// Check to see if we have a response for the expected dataType
	if ( dataTypes[ 0 ] in responses ) {
		finalDataType = dataTypes[ 0 ];
	} else {
		// Try convertible dataTypes
		for ( type in responses ) {
			if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[0] ] ) {
				finalDataType = type;
				break;
			}
			if ( !firstDataType ) {
				firstDataType = type;
			}
		}
		// Or just use first one
		finalDataType = finalDataType || firstDataType;
	}

	// If we found a dataType
	// We add the dataType to the list if needed
	// and return the corresponding response
	if ( finalDataType ) {
		if ( finalDataType !== dataTypes[ 0 ] ) {
			dataTypes.unshift( finalDataType );
		}
		return responses[ finalDataType ];
	}
}

/* Chain conversions given the request and the original response
 * Also sets the responseXXX fields on the jqXHR instance
 */
function ajaxConvert( s, response, jqXHR, isSuccess ) {
	var conv2, current, conv, tmp, prev,
		converters = {},
		// Work with a copy of dataTypes in case we need to modify it for conversion
		dataTypes = s.dataTypes.slice();

	// Create converters map with lowercased keys
	if ( dataTypes[ 1 ] ) {
		for ( conv in s.converters ) {
			converters[ conv.toLowerCase() ] = s.converters[ conv ];
		}
	}

	current = dataTypes.shift();

	// Convert to each sequential dataType
	while ( current ) {

		if ( s.responseFields[ current ] ) {
			jqXHR[ s.responseFields[ current ] ] = response;
		}

		// Apply the dataFilter if provided
		if ( !prev && isSuccess && s.dataFilter ) {
			response = s.dataFilter( response, s.dataType );
		}

		prev = current;
		current = dataTypes.shift();

		if ( current ) {

			// There's only work to do if current dataType is non-auto
			if ( current === "*" ) {

				current = prev;

			// Convert response if prev dataType is non-auto and differs from current
			} else if ( prev !== "*" && prev !== current ) {

				// Seek a direct converter
				conv = converters[ prev + " " + current ] || converters[ "* " + current ];

				// If none found, seek a pair
				if ( !conv ) {
					for ( conv2 in converters ) {

						// If conv2 outputs current
						tmp = conv2.split( " " );
						if ( tmp[ 1 ] === current ) {

							// If prev can be converted to accepted input
							conv = converters[ prev + " " + tmp[ 0 ] ] ||
								converters[ "* " + tmp[ 0 ] ];
							if ( conv ) {
								// Condense equivalence converters
								if ( conv === true ) {
									conv = converters[ conv2 ];

								// Otherwise, insert the intermediate dataType
								} else if ( converters[ conv2 ] !== true ) {
									current = tmp[ 0 ];
									dataTypes.unshift( tmp[ 1 ] );
								}
								break;
							}
						}
					}
				}

				// Apply converter (if not an equivalence)
				if ( conv !== true ) {

					// Unless errors are allowed to bubble, catch and return them
					if ( conv && s[ "throws" ] ) {
						response = conv( response );
					} else {
						try {
							response = conv( response );
						} catch ( e ) {
							return { state: "parsererror", error: conv ? e : "No conversion from " + prev + " to " + current };
						}
					}
				}
			}
		}
	}

	return { state: "success", data: response };
}

jQuery.extend({

	// Counter for holding the number of active queries
	active: 0,

	// Last-Modified header cache for next request
	lastModified: {},
	etag: {},

	ajaxSettings: {
		url: ajaxLocation,
		type: "GET",
		isLocal: rlocalProtocol.test( ajaxLocParts[ 1 ] ),
		global: true,
		processData: true,
		async: true,
		contentType: "application/x-www-form-urlencoded; charset=UTF-8",
		/*
		timeout: 0,
		data: null,
		dataType: null,
		username: null,
		password: null,
		cache: null,
		throws: false,
		traditional: false,
		headers: {},
		*/

		accepts: {
			"*": allTypes,
			text: "text/plain",
			html: "text/html",
			xml: "application/xml, text/xml",
			json: "application/json, text/javascript"
		},

		contents: {
			xml: /xml/,
			html: /html/,
			json: /json/
		},

		responseFields: {
			xml: "responseXML",
			text: "responseText",
			json: "responseJSON"
		},

		// Data converters
		// Keys separate source (or catchall "*") and destination types with a single space
		converters: {

			// Convert anything to text
			"* text": String,

			// Text to html (true = no transformation)
			"text html": true,

			// Evaluate text as a json expression
			"text json": jQuery.parseJSON,

			// Parse text as xml
			"text xml": jQuery.parseXML
		},

		// For options that shouldn't be deep extended:
		// you can add your own custom options here if
		// and when you create one that shouldn't be
		// deep extended (see ajaxExtend)
		flatOptions: {
			url: true,
			context: true
		}
	},

	// Creates a full fledged settings object into target
	// with both ajaxSettings and settings fields.
	// If target is omitted, writes into ajaxSettings.
	ajaxSetup: function( target, settings ) {
		return settings ?

			// Building a settings object
			ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

			// Extending ajaxSettings
			ajaxExtend( jQuery.ajaxSettings, target );
	},

	ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
	ajaxTransport: addToPrefiltersOrTransports( transports ),

	// Main method
	ajax: function( url, options ) {

		// If url is an object, simulate pre-1.5 signature
		if ( typeof url === "object" ) {
			options = url;
			url = undefined;
		}

		// Force options to be an object
		options = options || {};

		var // Cross-domain detection vars
			parts,
			// Loop variable
			i,
			// URL without anti-cache param
			cacheURL,
			// Response headers as string
			responseHeadersString,
			// timeout handle
			timeoutTimer,

			// To know if global events are to be dispatched
			fireGlobals,

			transport,
			// Response headers
			responseHeaders,
			// Create the final options object
			s = jQuery.ajaxSetup( {}, options ),
			// Callbacks context
			callbackContext = s.context || s,
			// Context for global events is callbackContext if it is a DOM node or jQuery collection
			globalEventContext = s.context && ( callbackContext.nodeType || callbackContext.jquery ) ?
				jQuery( callbackContext ) :
				jQuery.event,
			// Deferreds
			deferred = jQuery.Deferred(),
			completeDeferred = jQuery.Callbacks("once memory"),
			// Status-dependent callbacks
			statusCode = s.statusCode || {},
			// Headers (they are sent all at once)
			requestHeaders = {},
			requestHeadersNames = {},
			// The jqXHR state
			state = 0,
			// Default abort message
			strAbort = "canceled",
			// Fake xhr
			jqXHR = {
				readyState: 0,

				// Builds headers hashtable if needed
				getResponseHeader: function( key ) {
					var match;
					if ( state === 2 ) {
						if ( !responseHeaders ) {
							responseHeaders = {};
							while ( (match = rheaders.exec( responseHeadersString )) ) {
								responseHeaders[ match[1].toLowerCase() ] = match[ 2 ];
							}
						}
						match = responseHeaders[ key.toLowerCase() ];
					}
					return match == null ? null : match;
				},

				// Raw string
				getAllResponseHeaders: function() {
					return state === 2 ? responseHeadersString : null;
				},

				// Caches the header
				setRequestHeader: function( name, value ) {
					var lname = name.toLowerCase();
					if ( !state ) {
						name = requestHeadersNames[ lname ] = requestHeadersNames[ lname ] || name;
						requestHeaders[ name ] = value;
					}
					return this;
				},

				// Overrides response content-type header
				overrideMimeType: function( type ) {
					if ( !state ) {
						s.mimeType = type;
					}
					return this;
				},

				// Status-dependent callbacks
				statusCode: function( map ) {
					var code;
					if ( map ) {
						if ( state < 2 ) {
							for ( code in map ) {
								// Lazy-add the new callback in a way that preserves old ones
								statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
							}
						} else {
							// Execute the appropriate callbacks
							jqXHR.always( map[ jqXHR.status ] );
						}
					}
					return this;
				},

				// Cancel the request
				abort: function( statusText ) {
					var finalText = statusText || strAbort;
					if ( transport ) {
						transport.abort( finalText );
					}
					done( 0, finalText );
					return this;
				}
			};

		// Attach deferreds
		deferred.promise( jqXHR ).complete = completeDeferred.add;
		jqXHR.success = jqXHR.done;
		jqXHR.error = jqXHR.fail;

		// Remove hash character (#7531: and string promotion)
		// Add protocol if not provided (#5866: IE7 issue with protocol-less urls)
		// Handle falsy url in the settings object (#10093: consistency with old signature)
		// We also use the url parameter if available
		s.url = ( ( url || s.url || ajaxLocation ) + "" ).replace( rhash, "" ).replace( rprotocol, ajaxLocParts[ 1 ] + "//" );

		// Alias method option to type as per ticket #12004
		s.type = options.method || options.type || s.method || s.type;

		// Extract dataTypes list
		s.dataTypes = jQuery.trim( s.dataType || "*" ).toLowerCase().match( rnotwhite ) || [ "" ];

		// A cross-domain request is in order when we have a protocol:host:port mismatch
		if ( s.crossDomain == null ) {
			parts = rurl.exec( s.url.toLowerCase() );
			s.crossDomain = !!( parts &&
				( parts[ 1 ] !== ajaxLocParts[ 1 ] || parts[ 2 ] !== ajaxLocParts[ 2 ] ||
					( parts[ 3 ] || ( parts[ 1 ] === "http:" ? "80" : "443" ) ) !==
						( ajaxLocParts[ 3 ] || ( ajaxLocParts[ 1 ] === "http:" ? "80" : "443" ) ) )
			);
		}

		// Convert data if not already a string
		if ( s.data && s.processData && typeof s.data !== "string" ) {
			s.data = jQuery.param( s.data, s.traditional );
		}

		// Apply prefilters
		inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

		// If request was aborted inside a prefilter, stop there
		if ( state === 2 ) {
			return jqXHR;
		}

		// We can fire global events as of now if asked to
		fireGlobals = s.global;

		// Watch for a new set of requests
		if ( fireGlobals && jQuery.active++ === 0 ) {
			jQuery.event.trigger("ajaxStart");
		}

		// Uppercase the type
		s.type = s.type.toUpperCase();

		// Determine if request has content
		s.hasContent = !rnoContent.test( s.type );

		// Save the URL in case we're toying with the If-Modified-Since
		// and/or If-None-Match header later on
		cacheURL = s.url;

		// More options handling for requests with no content
		if ( !s.hasContent ) {

			// If data is available, append data to url
			if ( s.data ) {
				cacheURL = ( s.url += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data );
				// #9682: remove data so that it's not used in an eventual retry
				delete s.data;
			}

			// Add anti-cache in url if needed
			if ( s.cache === false ) {
				s.url = rts.test( cacheURL ) ?

					// If there is already a '_' parameter, set its value
					cacheURL.replace( rts, "$1_=" + nonce++ ) :

					// Otherwise add one to the end
					cacheURL + ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + nonce++;
			}
		}

		// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
		if ( s.ifModified ) {
			if ( jQuery.lastModified[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
			}
			if ( jQuery.etag[ cacheURL ] ) {
				jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
			}
		}

		// Set the correct header, if data is being sent
		if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
			jqXHR.setRequestHeader( "Content-Type", s.contentType );
		}

		// Set the Accepts header for the server, depending on the dataType
		jqXHR.setRequestHeader(
			"Accept",
			s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[0] ] ?
				s.accepts[ s.dataTypes[0] ] + ( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
				s.accepts[ "*" ]
		);

		// Check for headers option
		for ( i in s.headers ) {
			jqXHR.setRequestHeader( i, s.headers[ i ] );
		}

		// Allow custom headers/mimetypes and early abort
		if ( s.beforeSend && ( s.beforeSend.call( callbackContext, jqXHR, s ) === false || state === 2 ) ) {
			// Abort if not done already and return
			return jqXHR.abort();
		}

		// aborting is no longer a cancellation
		strAbort = "abort";

		// Install callbacks on deferreds
		for ( i in { success: 1, error: 1, complete: 1 } ) {
			jqXHR[ i ]( s[ i ] );
		}

		// Get transport
		transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

		// If no transport, we auto-abort
		if ( !transport ) {
			done( -1, "No Transport" );
		} else {
			jqXHR.readyState = 1;

			// Send global event
			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
			}
			// Timeout
			if ( s.async && s.timeout > 0 ) {
				timeoutTimer = setTimeout(function() {
					jqXHR.abort("timeout");
				}, s.timeout );
			}

			try {
				state = 1;
				transport.send( requestHeaders, done );
			} catch ( e ) {
				// Propagate exception as error if not done
				if ( state < 2 ) {
					done( -1, e );
				// Simply rethrow otherwise
				} else {
					throw e;
				}
			}
		}

		// Callback for when everything is done
		function done( status, nativeStatusText, responses, headers ) {
			var isSuccess, success, error, response, modified,
				statusText = nativeStatusText;

			// Called once
			if ( state === 2 ) {
				return;
			}

			// State is "done" now
			state = 2;

			// Clear timeout if it exists
			if ( timeoutTimer ) {
				clearTimeout( timeoutTimer );
			}

			// Dereference transport for early garbage collection
			// (no matter how long the jqXHR object will be used)
			transport = undefined;

			// Cache response headers
			responseHeadersString = headers || "";

			// Set readyState
			jqXHR.readyState = status > 0 ? 4 : 0;

			// Determine if successful
			isSuccess = status >= 200 && status < 300 || status === 304;

			// Get response data
			if ( responses ) {
				response = ajaxHandleResponses( s, jqXHR, responses );
			}

			// Convert no matter what (that way responseXXX fields are always set)
			response = ajaxConvert( s, response, jqXHR, isSuccess );

			// If successful, handle type chaining
			if ( isSuccess ) {

				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
				if ( s.ifModified ) {
					modified = jqXHR.getResponseHeader("Last-Modified");
					if ( modified ) {
						jQuery.lastModified[ cacheURL ] = modified;
					}
					modified = jqXHR.getResponseHeader("etag");
					if ( modified ) {
						jQuery.etag[ cacheURL ] = modified;
					}
				}

				// if no content
				if ( status === 204 || s.type === "HEAD" ) {
					statusText = "nocontent";

				// if not modified
				} else if ( status === 304 ) {
					statusText = "notmodified";

				// If we have data, let's convert it
				} else {
					statusText = response.state;
					success = response.data;
					error = response.error;
					isSuccess = !error;
				}
			} else {
				// We extract error from statusText
				// then normalize statusText and status for non-aborts
				error = statusText;
				if ( status || !statusText ) {
					statusText = "error";
					if ( status < 0 ) {
						status = 0;
					}
				}
			}

			// Set data for the fake xhr object
			jqXHR.status = status;
			jqXHR.statusText = ( nativeStatusText || statusText ) + "";

			// Success/Error
			if ( isSuccess ) {
				deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
			} else {
				deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
			}

			// Status-dependent callbacks
			jqXHR.statusCode( statusCode );
			statusCode = undefined;

			if ( fireGlobals ) {
				globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
					[ jqXHR, s, isSuccess ? success : error ] );
			}

			// Complete
			completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

			if ( fireGlobals ) {
				globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );
				// Handle the global AJAX counter
				if ( !( --jQuery.active ) ) {
					jQuery.event.trigger("ajaxStop");
				}
			}
		}

		return jqXHR;
	},

	getJSON: function( url, data, callback ) {
		return jQuery.get( url, data, callback, "json" );
	},

	getScript: function( url, callback ) {
		return jQuery.get( url, undefined, callback, "script" );
	}
});

jQuery.each( [ "get", "post" ], function( i, method ) {
	jQuery[ method ] = function( url, data, callback, type ) {
		// shift arguments if data argument was omitted
		if ( jQuery.isFunction( data ) ) {
			type = type || callback;
			callback = data;
			data = undefined;
		}

		return jQuery.ajax({
			url: url,
			type: method,
			dataType: type,
			data: data,
			success: callback
		});
	};
});

// Attach a bunch of functions for handling common AJAX events
jQuery.each( [ "ajaxStart", "ajaxStop", "ajaxComplete", "ajaxError", "ajaxSuccess", "ajaxSend" ], function( i, type ) {
	jQuery.fn[ type ] = function( fn ) {
		return this.on( type, fn );
	};
});


jQuery._evalUrl = function( url ) {
	return jQuery.ajax({
		url: url,
		type: "GET",
		dataType: "script",
		async: false,
		global: false,
		"throws": true
	});
};


jQuery.fn.extend({
	wrapAll: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapAll( html.call(this, i) );
			});
		}

		if ( this[0] ) {
			// The elements to wrap the target around
			var wrap = jQuery( html, this[0].ownerDocument ).eq(0).clone(true);

			if ( this[0].parentNode ) {
				wrap.insertBefore( this[0] );
			}

			wrap.map(function() {
				var elem = this;

				while ( elem.firstChild && elem.firstChild.nodeType === 1 ) {
					elem = elem.firstChild;
				}

				return elem;
			}).append( this );
		}

		return this;
	},

	wrapInner: function( html ) {
		if ( jQuery.isFunction( html ) ) {
			return this.each(function(i) {
				jQuery(this).wrapInner( html.call(this, i) );
			});
		}

		return this.each(function() {
			var self = jQuery( this ),
				contents = self.contents();

			if ( contents.length ) {
				contents.wrapAll( html );

			} else {
				self.append( html );
			}
		});
	},

	wrap: function( html ) {
		var isFunction = jQuery.isFunction( html );

		return this.each(function(i) {
			jQuery( this ).wrapAll( isFunction ? html.call(this, i) : html );
		});
	},

	unwrap: function() {
		return this.parent().each(function() {
			if ( !jQuery.nodeName( this, "body" ) ) {
				jQuery( this ).replaceWith( this.childNodes );
			}
		}).end();
	}
});


jQuery.expr.filters.hidden = function( elem ) {
	// Support: Opera <= 12.12
	// Opera reports offsetWidths and offsetHeights less than zero on some elements
	return elem.offsetWidth <= 0 && elem.offsetHeight <= 0 ||
		(!support.reliableHiddenOffsets() &&
			((elem.style && elem.style.display) || jQuery.css( elem, "display" )) === "none");
};

jQuery.expr.filters.visible = function( elem ) {
	return !jQuery.expr.filters.hidden( elem );
};




var r20 = /%20/g,
	rbracket = /\[\]$/,
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen)/i;

function buildParams( prefix, obj, traditional, add ) {
	var name;

	if ( jQuery.isArray( obj ) ) {
		// Serialize array item.
		jQuery.each( obj, function( i, v ) {
			if ( traditional || rbracket.test( prefix ) ) {
				// Treat each array item as a scalar.
				add( prefix, v );

			} else {
				// Item is non-scalar (array or object), encode its numeric index.
				buildParams( prefix + "[" + ( typeof v === "object" ? i : "" ) + "]", v, traditional, add );
			}
		});

	} else if ( !traditional && jQuery.type( obj ) === "object" ) {
		// Serialize object item.
		for ( name in obj ) {
			buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
		}

	} else {
		// Serialize scalar item.
		add( prefix, obj );
	}
}

// Serialize an array of form elements or a set of
// key/values into a query string
jQuery.param = function( a, traditional ) {
	var prefix,
		s = [],
		add = function( key, value ) {
			// If value is a function, invoke it and return its value
			value = jQuery.isFunction( value ) ? value() : ( value == null ? "" : value );
			s[ s.length ] = encodeURIComponent( key ) + "=" + encodeURIComponent( value );
		};

	// Set traditional to true for jQuery <= 1.3.2 behavior.
	if ( traditional === undefined ) {
		traditional = jQuery.ajaxSettings && jQuery.ajaxSettings.traditional;
	}

	// If an array was passed in, assume that it is an array of form elements.
	if ( jQuery.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {
		// Serialize the form elements
		jQuery.each( a, function() {
			add( this.name, this.value );
		});

	} else {
		// If traditional, encode the "old" way (the way 1.3.2 or older
		// did it), otherwise encode params recursively.
		for ( prefix in a ) {
			buildParams( prefix, a[ prefix ], traditional, add );
		}
	}

	// Return the resulting serialization
	return s.join( "&" ).replace( r20, "+" );
};

jQuery.fn.extend({
	serialize: function() {
		return jQuery.param( this.serializeArray() );
	},
	serializeArray: function() {
		return this.map(function() {
			// Can add propHook for "elements" to filter or add form elements
			var elements = jQuery.prop( this, "elements" );
			return elements ? jQuery.makeArray( elements ) : this;
		})
		.filter(function() {
			var type = this.type;
			// Use .is(":disabled") so that fieldset[disabled] works
			return this.name && !jQuery( this ).is( ":disabled" ) &&
				rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
				( this.checked || !rcheckableType.test( type ) );
		})
		.map(function( i, elem ) {
			var val = jQuery( this ).val();

			return val == null ?
				null :
				jQuery.isArray( val ) ?
					jQuery.map( val, function( val ) {
						return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
					}) :
					{ name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
		}).get();
	}
});


// Create the request object
// (This is still attached to ajaxSettings for backward compatibility)
jQuery.ajaxSettings.xhr = window.ActiveXObject !== undefined ?
	// Support: IE6+
	function() {

		// XHR cannot access local files, always use ActiveX for that case
		return !this.isLocal &&

			// Support: IE7-8
			// oldIE XHR does not support non-RFC2616 methods (#13240)
			// See http://msdn.microsoft.com/en-us/library/ie/ms536648(v=vs.85).aspx
			// and http://www.w3.org/Protocols/rfc2616/rfc2616-sec9.html#sec9
			// Although this check for six methods instead of eight
			// since IE also does not support "trace" and "connect"
			/^(get|post|head|put|delete|options)$/i.test( this.type ) &&

			createStandardXHR() || createActiveXHR();
	} :
	// For all other browsers, use the standard XMLHttpRequest object
	createStandardXHR;

var xhrId = 0,
	xhrCallbacks = {},
	xhrSupported = jQuery.ajaxSettings.xhr();

// Support: IE<10
// Open requests must be manually aborted on unload (#5280)
if ( window.ActiveXObject ) {
	jQuery( window ).on( "unload", function() {
		for ( var key in xhrCallbacks ) {
			xhrCallbacks[ key ]( undefined, true );
		}
	});
}

// Determine support properties
support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
xhrSupported = support.ajax = !!xhrSupported;

// Create transport if the browser can provide an xhr
if ( xhrSupported ) {

	jQuery.ajaxTransport(function( options ) {
		// Cross domain only allowed if supported through XMLHttpRequest
		if ( !options.crossDomain || support.cors ) {

			var callback;

			return {
				send: function( headers, complete ) {
					var i,
						xhr = options.xhr(),
						id = ++xhrId;

					// Open the socket
					xhr.open( options.type, options.url, options.async, options.username, options.password );

					// Apply custom fields if provided
					if ( options.xhrFields ) {
						for ( i in options.xhrFields ) {
							xhr[ i ] = options.xhrFields[ i ];
						}
					}

					// Override mime type if needed
					if ( options.mimeType && xhr.overrideMimeType ) {
						xhr.overrideMimeType( options.mimeType );
					}

					// X-Requested-With header
					// For cross-domain requests, seeing as conditions for a preflight are
					// akin to a jigsaw puzzle, we simply never set it to be sure.
					// (it can always be set on a per-request basis or even using ajaxSetup)
					// For same-domain requests, won't change header if already provided.
					if ( !options.crossDomain && !headers["X-Requested-With"] ) {
						headers["X-Requested-With"] = "XMLHttpRequest";
					}

					// Set headers
					for ( i in headers ) {
						// Support: IE<9
						// IE's ActiveXObject throws a 'Type Mismatch' exception when setting
						// request header to a null-value.
						//
						// To keep consistent with other XHR implementations, cast the value
						// to string and ignore `undefined`.
						if ( headers[ i ] !== undefined ) {
							xhr.setRequestHeader( i, headers[ i ] + "" );
						}
					}

					// Do send the request
					// This may raise an exception which is actually
					// handled in jQuery.ajax (so no try/catch here)
					xhr.send( ( options.hasContent && options.data ) || null );

					// Listener
					callback = function( _, isAbort ) {
						var status, statusText, responses;

						// Was never called and is aborted or complete
						if ( callback && ( isAbort || xhr.readyState === 4 ) ) {
							// Clean up
							delete xhrCallbacks[ id ];
							callback = undefined;
							xhr.onreadystatechange = jQuery.noop;

							// Abort manually if needed
							if ( isAbort ) {
								if ( xhr.readyState !== 4 ) {
									xhr.abort();
								}
							} else {
								responses = {};
								status = xhr.status;

								// Support: IE<10
								// Accessing binary-data responseText throws an exception
								// (#11426)
								if ( typeof xhr.responseText === "string" ) {
									responses.text = xhr.responseText;
								}

								// Firefox throws an exception when accessing
								// statusText for faulty cross-domain requests
								try {
									statusText = xhr.statusText;
								} catch( e ) {
									// We normalize with Webkit giving an empty statusText
									statusText = "";
								}

								// Filter status for non standard behaviors

								// If the request is local and we have data: assume a success
								// (success with no data won't get notified, that's the best we
								// can do given current implementations)
								if ( !status && options.isLocal && !options.crossDomain ) {
									status = responses.text ? 200 : 404;
								// IE - #1450: sometimes returns 1223 when it should be 204
								} else if ( status === 1223 ) {
									status = 204;
								}
							}
						}

						// Call complete if needed
						if ( responses ) {
							complete( status, statusText, responses, xhr.getAllResponseHeaders() );
						}
					};

					if ( !options.async ) {
						// if we're in sync mode we fire the callback
						callback();
					} else if ( xhr.readyState === 4 ) {
						// (IE6 & IE7) if it's in cache and has been
						// retrieved directly we need to fire the callback
						setTimeout( callback );
					} else {
						// Add to the list of active xhr callbacks
						xhr.onreadystatechange = xhrCallbacks[ id ] = callback;
					}
				},

				abort: function() {
					if ( callback ) {
						callback( undefined, true );
					}
				}
			};
		}
	});
}

// Functions to create xhrs
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch( e ) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject( "Microsoft.XMLHTTP" );
	} catch( e ) {}
}




// Install script dataType
jQuery.ajaxSetup({
	accepts: {
		script: "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript"
	},
	contents: {
		script: /(?:java|ecma)script/
	},
	converters: {
		"text script": function( text ) {
			jQuery.globalEval( text );
			return text;
		}
	}
});

// Handle cache's special case and global
jQuery.ajaxPrefilter( "script", function( s ) {
	if ( s.cache === undefined ) {
		s.cache = false;
	}
	if ( s.crossDomain ) {
		s.type = "GET";
		s.global = false;
	}
});

// Bind script tag hack transport
jQuery.ajaxTransport( "script", function(s) {

	// This transport only deals with cross domain requests
	if ( s.crossDomain ) {

		var script,
			head = document.head || jQuery("head")[0] || document.documentElement;

		return {

			send: function( _, callback ) {

				script = document.createElement("script");

				script.async = true;

				if ( s.scriptCharset ) {
					script.charset = s.scriptCharset;
				}

				script.src = s.url;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function( _, isAbort ) {

					if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;

						// Remove the script
						if ( script.parentNode ) {
							script.parentNode.removeChild( script );
						}

						// Dereference the script
						script = null;

						// Callback if not abort
						if ( !isAbort ) {
							callback( 200, "success" );
						}
					}
				};

				// Circumvent IE6 bugs with base elements (#2709 and #4378) by prepending
				// Use native DOM manipulation to avoid our domManip AJAX trickery
				head.insertBefore( script, head.firstChild );
			},

			abort: function() {
				if ( script ) {
					script.onload( undefined, true );
				}
			}
		};
	}
});




var oldCallbacks = [],
	rjsonp = /(=)\?(?=&|$)|\?\?/;

// Default jsonp settings
jQuery.ajaxSetup({
	jsonp: "callback",
	jsonpCallback: function() {
		var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce++ ) );
		this[ callback ] = true;
		return callback;
	}
});

// Detect, normalize options and install callbacks for jsonp requests
jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

	var callbackName, overwritten, responseContainer,
		jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
			"url" :
			typeof s.data === "string" && !( s.contentType || "" ).indexOf("application/x-www-form-urlencoded") && rjsonp.test( s.data ) && "data"
		);

	// Handle iff the expected data type is "jsonp" or we have a parameter to set
	if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

		// Get callback name, remembering preexisting value associated with it
		callbackName = s.jsonpCallback = jQuery.isFunction( s.jsonpCallback ) ?
			s.jsonpCallback() :
			s.jsonpCallback;

		// Insert callback into url or form data
		if ( jsonProp ) {
			s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
		} else if ( s.jsonp !== false ) {
			s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
		}

		// Use data converter to retrieve json after script execution
		s.converters["script json"] = function() {
			if ( !responseContainer ) {
				jQuery.error( callbackName + " was not called" );
			}
			return responseContainer[ 0 ];
		};

		// force json dataType
		s.dataTypes[ 0 ] = "json";

		// Install callback
		overwritten = window[ callbackName ];
		window[ callbackName ] = function() {
			responseContainer = arguments;
		};

		// Clean-up function (fires after converters)
		jqXHR.always(function() {
			// Restore preexisting value
			window[ callbackName ] = overwritten;

			// Save back as free
			if ( s[ callbackName ] ) {
				// make sure that re-using the options doesn't screw things around
				s.jsonpCallback = originalSettings.jsonpCallback;

				// save the callback name for future use
				oldCallbacks.push( callbackName );
			}

			// Call if it was a function and we have a response
			if ( responseContainer && jQuery.isFunction( overwritten ) ) {
				overwritten( responseContainer[ 0 ] );
			}

			responseContainer = overwritten = undefined;
		});

		// Delegate to script
		return "script";
	}
});




// data: string of html
// context (optional): If specified, the fragment will be created in this context, defaults to document
// keepScripts (optional): If true, will include scripts passed in the html string
jQuery.parseHTML = function( data, context, keepScripts ) {
	if ( !data || typeof data !== "string" ) {
		return null;
	}
	if ( typeof context === "boolean" ) {
		keepScripts = context;
		context = false;
	}
	context = context || document;

	var parsed = rsingleTag.exec( data ),
		scripts = !keepScripts && [];

	// Single tag
	if ( parsed ) {
		return [ context.createElement( parsed[1] ) ];
	}

	parsed = jQuery.buildFragment( [ data ], context, scripts );

	if ( scripts && scripts.length ) {
		jQuery( scripts ).remove();
	}

	return jQuery.merge( [], parsed.childNodes );
};


// Keep a copy of the old load method
var _load = jQuery.fn.load;

/**
 * Load a url into a page
 */
jQuery.fn.load = function( url, params, callback ) {
	if ( typeof url !== "string" && _load ) {
		return _load.apply( this, arguments );
	}

	var selector, response, type,
		self = this,
		off = url.indexOf(" ");

	if ( off >= 0 ) {
		selector = url.slice( off, url.length );
		url = url.slice( 0, off );
	}

	// If it's a function
	if ( jQuery.isFunction( params ) ) {

		// We assume that it's the callback
		callback = params;
		params = undefined;

	// Otherwise, build a param string
	} else if ( params && typeof params === "object" ) {
		type = "POST";
	}

	// If we have elements to modify, make the request
	if ( self.length > 0 ) {
		jQuery.ajax({
			url: url,

			// if "type" variable is undefined, then "GET" method will be used
			type: type,
			dataType: "html",
			data: params
		}).done(function( responseText ) {

			// Save response for use in complete callback
			response = arguments;

			self.html( selector ?

				// If a selector was specified, locate the right elements in a dummy div
				// Exclude scripts to avoid IE 'Permission Denied' errors
				jQuery("<div>").append( jQuery.parseHTML( responseText ) ).find( selector ) :

				// Otherwise use the full result
				responseText );

		}).complete( callback && function( jqXHR, status ) {
			self.each( callback, response || [ jqXHR.responseText, status, jqXHR ] );
		});
	}

	return this;
};




jQuery.expr.filters.animated = function( elem ) {
	return jQuery.grep(jQuery.timers, function( fn ) {
		return elem === fn.elem;
	}).length;
};





var docElem = window.document.documentElement;

/**
 * Gets a window from an element
 */
function getWindow( elem ) {
	return jQuery.isWindow( elem ) ?
		elem :
		elem.nodeType === 9 ?
			elem.defaultView || elem.parentWindow :
			false;
}

jQuery.offset = {
	setOffset: function( elem, options, i ) {
		var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
			position = jQuery.css( elem, "position" ),
			curElem = jQuery( elem ),
			props = {};

		// set position first, in-case top/left are set even on static elem
		if ( position === "static" ) {
			elem.style.position = "relative";
		}

		curOffset = curElem.offset();
		curCSSTop = jQuery.css( elem, "top" );
		curCSSLeft = jQuery.css( elem, "left" );
		calculatePosition = ( position === "absolute" || position === "fixed" ) &&
			jQuery.inArray("auto", [ curCSSTop, curCSSLeft ] ) > -1;

		// need to be able to calculate position if either top or left is auto and position is either absolute or fixed
		if ( calculatePosition ) {
			curPosition = curElem.position();
			curTop = curPosition.top;
			curLeft = curPosition.left;
		} else {
			curTop = parseFloat( curCSSTop ) || 0;
			curLeft = parseFloat( curCSSLeft ) || 0;
		}

		if ( jQuery.isFunction( options ) ) {
			options = options.call( elem, i, curOffset );
		}

		if ( options.top != null ) {
			props.top = ( options.top - curOffset.top ) + curTop;
		}
		if ( options.left != null ) {
			props.left = ( options.left - curOffset.left ) + curLeft;
		}

		if ( "using" in options ) {
			options.using.call( elem, props );
		} else {
			curElem.css( props );
		}
	}
};

jQuery.fn.extend({
	offset: function( options ) {
		if ( arguments.length ) {
			return options === undefined ?
				this :
				this.each(function( i ) {
					jQuery.offset.setOffset( this, options, i );
				});
		}

		var docElem, win,
			box = { top: 0, left: 0 },
			elem = this[ 0 ],
			doc = elem && elem.ownerDocument;

		if ( !doc ) {
			return;
		}

		docElem = doc.documentElement;

		// Make sure it's not a disconnected DOM node
		if ( !jQuery.contains( docElem, elem ) ) {
			return box;
		}

		// If we don't have gBCR, just use 0,0 rather than error
		// BlackBerry 5, iOS 3 (original iPhone)
		if ( typeof elem.getBoundingClientRect !== strundefined ) {
			box = elem.getBoundingClientRect();
		}
		win = getWindow( doc );
		return {
			top: box.top  + ( win.pageYOffset || docElem.scrollTop )  - ( docElem.clientTop  || 0 ),
			left: box.left + ( win.pageXOffset || docElem.scrollLeft ) - ( docElem.clientLeft || 0 )
		};
	},

	position: function() {
		if ( !this[ 0 ] ) {
			return;
		}

		var offsetParent, offset,
			parentOffset = { top: 0, left: 0 },
			elem = this[ 0 ];

		// fixed elements are offset from window (parentOffset = {top:0, left: 0}, because it is its only offset parent
		if ( jQuery.css( elem, "position" ) === "fixed" ) {
			// we assume that getBoundingClientRect is available when computed position is fixed
			offset = elem.getBoundingClientRect();
		} else {
			// Get *real* offsetParent
			offsetParent = this.offsetParent();

			// Get correct offsets
			offset = this.offset();
			if ( !jQuery.nodeName( offsetParent[ 0 ], "html" ) ) {
				parentOffset = offsetParent.offset();
			}

			// Add offsetParent borders
			parentOffset.top  += jQuery.css( offsetParent[ 0 ], "borderTopWidth", true );
			parentOffset.left += jQuery.css( offsetParent[ 0 ], "borderLeftWidth", true );
		}

		// Subtract parent offsets and element margins
		// note: when an element has margin: auto the offsetLeft and marginLeft
		// are the same in Safari causing offset.left to incorrectly be 0
		return {
			top:  offset.top  - parentOffset.top - jQuery.css( elem, "marginTop", true ),
			left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true)
		};
	},

	offsetParent: function() {
		return this.map(function() {
			var offsetParent = this.offsetParent || docElem;

			while ( offsetParent && ( !jQuery.nodeName( offsetParent, "html" ) && jQuery.css( offsetParent, "position" ) === "static" ) ) {
				offsetParent = offsetParent.offsetParent;
			}
			return offsetParent || docElem;
		});
	}
});

// Create scrollLeft and scrollTop methods
jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
	var top = /Y/.test( prop );

	jQuery.fn[ method ] = function( val ) {
		return access( this, function( elem, method, val ) {
			var win = getWindow( elem );

			if ( val === undefined ) {
				return win ? (prop in win) ? win[ prop ] :
					win.document.documentElement[ method ] :
					elem[ method ];
			}

			if ( win ) {
				win.scrollTo(
					!top ? val : jQuery( win ).scrollLeft(),
					top ? val : jQuery( win ).scrollTop()
				);

			} else {
				elem[ method ] = val;
			}
		}, method, val, arguments.length, null );
	};
});

// Add the top/left cssHooks using jQuery.fn.position
// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
// getComputedStyle returns percent when specified for top/left/bottom/right
// rather than make the css module depend on the offset module, we just check for it here
jQuery.each( [ "top", "left" ], function( i, prop ) {
	jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
		function( elem, computed ) {
			if ( computed ) {
				computed = curCSS( elem, prop );
				// if curCSS returns percentage, fallback to offset
				return rnumnonpx.test( computed ) ?
					jQuery( elem ).position()[ prop ] + "px" :
					computed;
			}
		}
	);
});


// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
	jQuery.each( { padding: "inner" + name, content: type, "": "outer" + name }, function( defaultExtra, funcName ) {
		// margin is only for outerHeight, outerWidth
		jQuery.fn[ funcName ] = function( margin, value ) {
			var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
				extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

			return access( this, function( elem, type, value ) {
				var doc;

				if ( jQuery.isWindow( elem ) ) {
					// As of 5/8/2012 this will yield incorrect results for Mobile Safari, but there
					// isn't a whole lot we can do. See pull request at this URL for discussion:
					// https://github.com/jquery/jquery/pull/764
					return elem.document.documentElement[ "client" + name ];
				}

				// Get document width or height
				if ( elem.nodeType === 9 ) {
					doc = elem.documentElement;

					// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height], whichever is greatest
					// unfortunately, this causes bug #3838 in IE6/8 only, but there is currently no good, small way to fix it.
					return Math.max(
						elem.body[ "scroll" + name ], doc[ "scroll" + name ],
						elem.body[ "offset" + name ], doc[ "offset" + name ],
						doc[ "client" + name ]
					);
				}

				return value === undefined ?
					// Get width or height on the element, requesting but not forcing parseFloat
					jQuery.css( elem, type, extra ) :

					// Set width or height on the element
					jQuery.style( elem, type, value, extra );
			}, type, chainable ? margin : undefined, chainable, null );
		};
	});
});


// The number of elements contained in the matched element set
jQuery.fn.size = function() {
	return this.length;
};

jQuery.fn.andSelf = jQuery.fn.addBack;




// Register as a named AMD module, since jQuery can be concatenated with other
// files that may use define, but not via a proper concatenation script that
// understands anonymous AMD modules. A named AMD is safest and most robust
// way to register. Lowercase jquery is used because AMD module names are
// derived from file names, and jQuery is normally delivered in a lowercase
// file name. Do this after creating the global so that if an AMD module wants
// to call noConflict to hide this version of jQuery, it will work.
if ( typeof define === "function" && define.amd ) {
	define( "jquery", [], function() {
		return jQuery;
	});
}




var
	// Map over jQuery in case of overwrite
	_jQuery = window.jQuery,

	// Map over the $ in case of overwrite
	_$ = window.$;

jQuery.noConflict = function( deep ) {
	if ( window.$ === jQuery ) {
		window.$ = _$;
	}

	if ( deep && window.jQuery === jQuery ) {
		window.jQuery = _jQuery;
	}

	return jQuery;
};

// Expose jQuery and $ identifiers, even in
// AMD (#7102#comment:10, https://github.com/jquery/jquery/pull/557)
// and CommonJS for browser emulators (#13566)
if ( typeof noGlobal === strundefined ) {
	window.jQuery = window.$ = jQuery;
}




return jQuery;

}));

define("jquery", function(){});

define('script/draggable.js',[
	'jquery'
], function (jQuery) {
	// http://www.coderholic.com/jquery-draggable-implementation/
	// Make an element draggable using jQuery
	var makeDraggable = function(element) {
		element = jQuery(element);

		// Move the element by the amount of change in the mouse position
		var move = function(event) {
			if(element.data('mouseMove')) {
				var changeX = event.clientX - element.data('mouseX');
				var changeY = event.clientY - element.data('mouseY');

				var newX = parseInt(element.css('left')) + changeX;
				var newY = parseInt(element.css('top')) + changeY;

				element.css('left', newX);
				element.css('top', newY);

				element.data('mouseX', event.clientX);
				element.data('mouseY', event.clientY);
			}
		}

		element.mousedown(function(event) {
			element.data('mouseMove', true);
			element.data('mouseX', event.clientX);
			element.data('mouseY', event.clientY);
		});

		element.parents(':last').mouseup(function() {
			element.data('mouseMove', false);
		});

		element.mouseout(move);
		element.mousemove(move);
	};
	return makeDraggable;
});

/*global window, document */
/*global define */

define('script/gui',[
	'../bower_components/requirejs-text/text!script/gui-template.html!strip',
	'jquery',
	'script/draggable.js'
], function (html, $, makeDraggable) {
	

	var $content,
		gui,
		controller,
		testNames,
		hide = function () {
			$content.remove();
		},
		callChuckbob = function (methodName) {
			return function (optArg) {
				if (controller && controller[methodName]) {
					controller[methodName](optArg);
				}
			};
		},
		singleTestCallback = callChuckbob('runTestByName'),
		singleTestClick = function () {
			var val = $('.chuckbob__tests-list :selected').text();
			if (val && val !== "") {
				singleTestCallback(val);
			}
		},
		updateLog = function () {
			var textLog = controller.getLogText(),
				$logArea;

			$logArea = $('.chuckbob__test-log', $content);
			$logArea.text(textLog);

			//Scroll down:
			try {
				$logArea.scrollTop(
					$logArea[0].scrollHeight - $logArea.height()
				);
			} catch(e) {} // If not shown yet
		},
		update =  function () {
			var isSingleStepping = controller.getIsSingleStepping();
			$('.chuckbob__single-step').text(isSingleStepping ? 'Off' : 'On');
			$('.chuckbob__step').prop('disabled', !isSingleStepping);
			$('.chuckbob__resume').prop('disabled', !isSingleStepping);
			updateLog();
		},
		singleStep = function () {
			controller.toggleSingleStepping();
		},
		bindEvents = function () {
			$('.chuckbob__run-button').click(callChuckbob('runAllTests'));
			$('.chuckbob__restart-button').click(
				callChuckbob('restartFromOriginalUrl'));
			$('.chuckbob__exit-button').click(
				callChuckbob('restartFromOriginalUrlNoAutostart'));
			$('.chuckbob__abort-button').click(hide);
			$('.chuckbob__run-single-button').click(singleTestClick);

			$('.chuckbob__step').click(callChuckbob('step'));
			$('.chuckbob__resume').click(callChuckbob('resume'));
			$('.chuckbob__single-step').click(singleStep);
		},
		addToggler = function () {
			var $el = $('.chuckbob__toggler', $content);
			$el.click(function(event) {
				event.preventDefault();
				$('.chuckbob__container').toggleClass('chuckbob--hidden');
				$el.html() === 'Hide' ? $el.html('Show') : $el.html('Hide');
			});
		},
		renderTests = function () {
			if ($content && testNames) {
				var $tests = $('.chuckbob__tests-list', $content);
				$tests.empty();
				$.each(testNames, function (idx, testName) {
					$('<option/>').text(testName).appendTo($tests);
				});
			}
		},
		render = function () {
			if (!$content) {
				$content = $(html);
				$content.appendTo('body');
				bindEvents();
				renderTests();
				addToggler();
				makeDraggable($content);
			}
			update();
		},
		showResult = function (options) {
			var opt = options || {},
				ok = opt.ok === true,
				failure = opt.ok === false,
				text = '';

			if (ok) {
				text = 'Success';
			}
			if (failure) {
				text = 'Failed';
			}
			render();
			if (failure) {
				$(".chuckbob__fail-sound").get(0).play();
			}
			if (ok) {
				$(".chuckbob__success-sound").get(0).play();
			}
			$('.chuckbob__result')
				.text(text)
				.toggleClass('chuckbob__result--ok', ok)
				.toggleClass('chuckbob__result--failure', failure);

			updateLog(opt.logLines);
		},
		setTests = function (tests) {
			testNames = tests;
			renderTests();
		},
		nop = function () {};

	gui = {
		setTests: setTests,
		show: showResult,
		showResult: showResult,
		hide: hide,
		update: update,
		registerForCallbacks: function (obj) {
			controller = obj;
		}

	};

	return gui;
});

/*global window, document */
/*global require, define */

define('script/phantom-reporter',[
], function () {
	
	var nop = function () {},
		showResult = function (options) {
			var opt = options || {},
				ok = opt.ok,
				logLines = opt.logLines || ['- no log. -'];
			window.toPhantomFromBob = {
				ok: ok,
				logLines: logLines,
				finished: true
			};
		},
		log = function (string, totalLogLines) {
			window.toPhantomFromBob = {
				logLines: totalLogLines
			};
		},
		api = {
			log: log,
			setTests: nop,
			showResult: showResult
		};
	return api;
});

/*jslint */
/*global window, document, console, localStorage */
/*global define,require*/

define('script/chuckbob',[
	'when',
	'../bower_components/URIjs/src/URI',
	'script/gui',
	'script/phantom-reporter'
], function (
	when,
	URI,
	gui,
	phantomReporter
) {
	

	// Chuck = the ventriloquist of soap.
	// http://www.youtube.com/watch?v=DwDbd4jQpkA
	// Bob = the doll chuck controls, i.e. the api you tell to do stuff

	var api = {},
		reporter = gui,
		integrationApi = {},
		DOING_RELOAD_CONDITION = 'DoingReload',
		$ = null,
		loadTimeIndicator = Date.now().toString().slice(-2),
		$element, // Set by pick etc.
		$currentValueSelector, // Set by count
		currentValue, // Set by count etc.
		leavingPage,
		runningTest, // Two modes: running a test and designing in the console
		state = { // Important state information to be preserved between reloads
			currentTestNr: 0
		},
		serializeToQueryString = 'query string',
		serializeToLocalStorage = 'local storage',
		serializeMethod = serializeToLocalStorage,
		serializeState = function () {
			var stateSerialized = JSON.stringify(state);
			stateSerialized = encodeURIComponent(stateSerialized);
			return stateSerialized;
		},
		deSerializeState = function (queryStringParameter) {
			var jsonString = decodeURIComponent(queryStringParameter);
			state = JSON.parse(jsonString);
			return state;
		},
		conditions = {
			NO_HIT: 'No hit',
			NON_UNIQUE_HIT: 'More than one hit',
			VERIFY_FAILED: 'Verification failed'
		},
		statuses = {
			NOT_STARTED: 'Not started',
			FIRST_PAGE_RENDERED: 'First page rendered'
		},
		map = function (args, fn) {
			return ($ && $.map ? $.map(args, fn) : args.map(fn));
		},
		log = function () {
			var text,
				args = Array.prototype.slice.call(arguments, 0),
				toStr = function (thing) {
					return thing.toString() || '';
				};
			if (args.length && typeof args[0] === 'string') {
				args[0] = loadTimeIndicator + ":" + args[0];
			}

			if (window.console) {
				console.log.apply(console, args);
			}

			text = map(args, toStr).join('  ');

			if (state.finalResult) {
				if (!state.finalResult.logLines) {
					state.finalResult.logLines = [];
				}
				state.finalResult.logLines.push(text);
			}

			if (reporter && reporter.log) {
				reporter.log(text, state.finalResult.logLines);
			}
		},
		getLogText = function () {
			var logLines = state && state.finalResult &&
					state.finalResult.logLines,
				text = logLines ? logLines.join('\n') :  '- no log. -';
			return text;
		},
		skipNextSeparator = false,
		logSeparator = function () {
			if (skipNextSeparator) {
				skipNextSeparator = false;
			} else {
				log('--------------------');
			}
		},
		welcome = function () {
			var nl = '\n',
				s =
				"        _                   _     _             _     " + nl +
				"       | |                 | |   | |           | |    " + nl +
				"   ___ | |__   _   _   ___ | | __| |__    ___  | |__  " + nl +
				"  / __|| '_ \\ | | | | / __|| |/ /| '_ \\  / _ \\ | '_ \\ " + nl +
				" | (__ | | | || |_| || (__ |   < | |_) || (_) || |_) |" + nl +
				"  \\___||_| |_| \\__,_| \\___||_|\\_\\|_.__/  \\___/ |_.__/ " + nl +
				nl +
				"Run me like this:" + nl +
				 nl +
				"chuckbob.startSingleStepping();" + nl +
				"chuckbob.runTestByName('foo');" + nl +
				"chuckbob.step();" + nl
				+ nl +
				"Do interactive experiments like this:" + nl +
				"	bob.pick('div.with-a-class:visible');" + nl +
				"	bob.click()" + nl
				+ nl +
				"Add .breakpoint() statements to testCases to pause execution." + nl +
				nl;
			console.log(s);
		},
		showInfo = function () {
			console.log(">>> Current element (pick):", $element);
			console.log(">>> Current value selector (count etc):", $currentValueSelector);
			console.log(">>> Current value (count etc):", currentValue);
		},
		showGui = function () {
			if (gui) {
				gui.show();
			}
		},
		testsList = [],
		testsByName = {},
		testNames = [],
		addTest = function (name, testCase) {
			testCase.testCaseName = name;
			testsList.push(testCase);
			testNames.push(name);
			testsByName[name] = testCase;
		},
		getTestByName = function (name) {
			return testsByName[name];
		},
		getTestListByNames = function (namesArr) {
			return map(namesArr, getTestByName);
		},
		getTestNames = function () {
			return testNames;
		},
		getTests = function () {
			return testsList;
		},
		configurationApi = {},
		bob = {},
		fail = function (reason, extraInfo) {
			throw new Error(reason + (extraInfo ? '( ' + extraInfo + ')' : ''));
		},
		currentPromiseChain = null,
		initPromiseChain = function () {
			currentPromiseChain = when(true);
		},
		addToPromiseChain = function (nextStepPromise) {
			currentPromiseChain = currentPromiseChain.then(nextStepPromise);
		},
		getPromiseChain = function () {
			return currentPromiseChain;
		},
		currentBreakpointResolve,
		getIsSingleStepping = function () {
			return state.isSingleStepping;
		},
		setSingleStepping = function (value) {
			state.isSingleStepping = !!value;
			if (gui && gui.update) {
				gui.update();
			}
		},
		startSingleStepping = function (value) {
			setSingleStepping(true);
		},
		stopSingleStepping = function () {
			setSingleStepping(false);
		},
		toggleSingleStepping = function () {
			setSingleStepping(! getIsSingleStepping());
		},
		makeBreakpointResolver = function () {
			var resolver = function (resolve, reject, notify) {
				if (state.phantomJs) {
					log('I will ignore single-stepping for phantomjs');
					resolve();
				} else {
					showInfo();
					console.log('>>> Suggested commands for the console:');
					console.log('>>> chuckbob.resume() to continue.');
					console.log('>>> chuckbob.step() to single-step.');
					console.log('>>> other: chuckbob.getElement(), .getState()');
					startSingleStepping();
					showGui();
					if (!currentBreakpointResolve) {
						currentBreakpointResolve = resolve;
					}
				}
			};
			return resolver;
		},
		postStep = function (primaryReturnValue) {
			var resolver = makeBreakpointResolver(),
				retVal = primaryReturnValue;
			if (getIsSingleStepping()) {
				retVal = when.promise(resolver);
			}
			return retVal;
		},
		addTask = function (fn) {
			if (runningTest) {
				if (!getPromiseChain()) {
					initPromiseChain();
				}

				addToPromiseChain(function () {
					if (!leavingPage) {
						return postStep(fn());
					}
				});
			} else { // Interactive mode
				fn();
				showInfo();
			}
		},
		resume = function () {
			if (currentBreakpointResolve) {
				var go = currentBreakpointResolve;
				stopSingleStepping();
				currentBreakpointResolve = null;
				window.setTimeout(go, 10);
				return 'Resuming.';
			}
		},
		step = function () {
			if (currentBreakpointResolve) {
				var go = currentBreakpointResolve;
				startSingleStepping();
				currentBreakpointResolve = null;
				window.setTimeout(go, 10);
				return 'Stepping to next.';
			}
		},
		breakpoint = function () {
			var resolver = makeBreakpointResolver();
			addTask(function () {
				return when.promise(resolver);
			});
			return bob;
		},
		waiting = {},
		resetWaiting = function () {
			waiting = {};
		},
		DEFAULT_WAIT_TIMEOUT_SECONDS = 30,
		WAIT_FOR_PAGE = 'Page load wait',
		stopWaiting = function (waitingForId, failed) {
			var callbackObj, method = failed ? 'reject' : 'resolve';
			log('Stopped waiting (' + method + ').');
			callbackObj = waiting[waitingForId];
			if (callbackObj) {
				if (callbackObj.timeoutHandle) {
					window.clearTimeout(callbackObj.timeoutHandle);
				}
				delete waiting[waitingForId];
				callbackObj[method]();
			}
		},
		addToWaitingList = function (waitingForId, resolve, reject) {
			if (waiting[waitingForId]) {
				throw 'This should not happen, we are waiting more than once';
			}
			waiting[waitingForId] = ({
				resolve: resolve,
				reject: reject,
				timeoutHandle: window.setTimeout(function () {
					log(waitingForId + ":timeout after " +
						DEFAULT_WAIT_TIMEOUT_SECONDS + " seconds.");
					stopWaiting(waitingForId, true);
				}, DEFAULT_WAIT_TIMEOUT_SECONDS * 1000)
			});
		},
		phantomJs,
		maybeSwitchToPhantom = function () {
			if (phantomJs) {
				state.phantomJs = true;
			}
			if (state.phantomJs) {
				reporter = phantomReporter;
			}
		},
		initState = function () {
			var uri = URI(window.location),
				queryString = uri.query(),
				params = URI.parseQuery(queryString),
				ls;
			console.log("Query string: ", queryString);
			console.log("Parameters", params);

			if (serializeMethod === serializeToLocalStorage) {
				ls = localStorage.getItem('bobState');
				localStorage.removeItem('bobState');
				if (ls) {
					deSerializeState(ls);
				}
			} else if (serializeMethod === serializeToQueryString) {
				if (params.bobState) {
					deSerializeState(params.bobState);
				}
			}
			if (state && state.originalUri) {
				console.log(state);
				if ($ && $.extend) {
					console.log("Got state information from "
						+ serializeMethod + ":",
						$.extend(true, {}, state));
				}
			} else {
				state.originalUri = uri.href();
				console.log("No state info. Fresh start.");
			}
		},
		currentStatus = statuses.NOT_STARTED,
		setStatus = function (msg) {
			currentStatus = msg;
		},
		status = function () {
			console.log(currentStatus);
			return currentStatus;
		},
		beginTest = function () {
			state.currentTestNr = state.currentTestNr + 1;
			console.log('This test is:', state.currentTestNr);
		},
		callTest = function (testCase) {
			testCase.call(bob, bob);
		},
		reportTestResult = function (status, answer) {
			runningTest = false;
			if (state.testHasNavigated) {
				delete state.testHasNavigated;
			}

			if (leavingPage) {
				answer = when.resolve();
			} else {
				log("Test result: " + status);
				logSeparator();
				setStatus(status);
			}
			return answer;
		},
		runTest = function (testCase) {
			resetWaiting();

			if (leavingPage) {
				return when.resolve();
			}
			if (testCase.disabled && !state.selectedTestNames) {
				log("Skipping test: " + testCase.testCaseName);
				return when.resolve(true);
			}

			logSeparator();
			log("Running test: " + testCase.testCaseName);
			runningTest = true;
			setStatus('Running');

			addTask(beginTest);

			try {
				callTest(testCase);
			} catch (e) {
				log("Error in testcase definition.");
				return false;
			}
			return getPromiseChain()
				.then(function () {
					return reportTestResult('OK', true);
				}, function () {
					return reportTestResult('Failed',
						when.reject(testCase.testCaseName + ' failed.'));
			});
		},
		pickElement = function (jQuerySelector, optWaitTime) {
			log((optWaitTime ? 'After ' + optWaitTime + 'ms,' : '' ) +
				'Picking  ' + jQuerySelector);
			$element = null;
			var hit = $(jQuerySelector);
			if (hit.length === 0) {
				log('Fail: Expected one element picked.');
				fail(conditions.NO_HIT);
			} else if (hit.length > 1) {
				log('Fail: Expected only one element picked, we got ' +
					hit.length + ' hits.');
				fail(conditions.NON_UNIQUE_HIT);
			} else {
				$element = hit;
				log('and got one element: ', $element.get());
			}
		},
		pollingCheck = function (resolve, reject, poll, check) {
			var polledTimeMs = 0,
				intervalMs = 100,
				pollingTimeLimitMs = 5000,
				pollAndCheck = function () {
					if (poll()) {
						try {
							check(polledTimeMs);
						} catch(e) {
							reject(e);
							return;
						}
						resolve();
					} else {
						polledTimeMs = polledTimeMs + intervalMs;
						if (polledTimeMs < pollingTimeLimitMs) {
							window.setTimeout(pollAndCheck, intervalMs);
						} else {
							log('Timeout after ' + pollingTimeLimitMs + 'ms.');
							reject();
						}
					}
				};
			pollAndCheck();
		},
		pickNow = function (jQuerySelector) {
			// Does not wait for elements to be available
			addTask(function () {
				pickElement(jQuerySelector);
			});
			return bob;
		},
		pick = function (jQuerySelector) {
			// Repeatedly try to pick element within 5 seconds,
			// so we don't fail on every little animation or delay.
			// If you don't like this behaviour, use pickNow.
			var resolver = function (resolve, reject, notify) {
				var poll = function () {
					var $elem = $(jQuerySelector);
					return $elem.length > 0;
				},
				check = function (polledTimeMs) {
					pickElement(jQuerySelector, polledTimeMs);
				};
				pollingCheck(resolve, reject, poll, check);
			};
			addTask(function () {
				return when.promise(resolver);
			});
			return bob;
		},
		write = function (text) {
			addTask(function () {
				if ($element.is('input')) {
					$element.val(text).trigger('input').trigger('change');
					log('Wrote: ' + text);
				} else {
					log('The current element is not an input-tag');
					fail();
				};
			});
			return bob;
		},
		sleep = function (ms) {
			var resolver = function (resolve, reject, notify) {
				log("Waiting (" + ms + "ms)");
				window.setTimeout(function () {
					log("Finished waiting.");
					resolve();
				}, ms);
			};
			addTask(function () {
				return when.promise(resolver);
			});
			return bob;
		},
		wait = function () {
			var resolver = function (resolve, reject, notify) {
				addToWaitingList(WAIT_FOR_PAGE, resolve, reject);
				integrationApi.onBeginWait();
			};
			addTask(function () {
				return when.promise(resolver);
			});

			return bob;
		},
		click = function () {
			var resolver = function (resolve, reject, notify) {
				if ($element) {
					log("Clicking on it.");
					$element.click();
					log("Clicked on it.");
					resolve();
				} else {
					log("Fail: There was nothing to click.");
					reject(fail(conditions.NO_HIT));
				}
			};
			addTask(function () {
				return when.promise(resolver);
			});

			return bob;
		},
		run = function (fn) {
			addTask(function () {
				log("Running some code.");
				fn.call($element, $element);
			});
			return bob;
		},
		check = function (fn) {
			addTask(function () {
				log("Running some code that checks.");
				var ok = fn.call($element, $element);
				if (!ok) {
					log("Fail: Code did not return true.");
					fail(conditions.VERIFY_FAILED);
				} else {
					log("Ok, code returned true.");
				}
			});
			return bob;
		},
		clearLocalStorage = function () {
			addTask(function () {
				if (! state.testHasNavigated) {
					log("Clearing local storage");
					localStorage.clear();
				} else {
					log("Clearing local storage was done before reload.");
				};
			});
			return bob;
		},
		gosub = function (testName) {
			var resolver = function (resolve, reject, notify) {
				var test = getTestByName(testName),
					preserveCurrentChain,
					altChain,
					testCase,
					info = "GOSUB: " + testName;
				if (!test) {
					log("Fail: Could not find " + testName);
					return reject(testName + ' is not foud.');
				}
				if (test) {
					preserveCurrentChain = currentPromiseChain;
					currentPromiseChain = null;
					testCase = getTestByName(testName);
					callTest(testCase);
					altChain = currentPromiseChain;
					currentPromiseChain = preserveCurrentChain;
				}

				log(info);
				log("Adding steps from " + testName);
				when(altChain).then(function () {
					log("Return from " + info);
					resolve();
				}, function () {
					if (leavingPage) {
						resolve();
					} else {
						log("Failure " + info);
						reject();
					}
				});
			};
			addTask(function () {
				return when.promise(resolver);
			});

			return bob;
		},
		assert = function (condition, message) {
			if (!condition) {
				throw message || "Assertion failed.";
			}
		},
		urlFromDestination = function (destination, optWinLocation) {
			var winLocation = optWinLocation || window.location,
				url,
				params,
				hash,
				buildUri = false,
				hashMatch = destination && destination.match(/^\S*(#(\w|\W)+)/),
				queryParamsMatch = destination && destination.match(/^([?][a-zA-Z0-9_&=%@]+)/);

			//relative hash
			if (hashMatch && hashMatch.length > 1) {
				hash = hashMatch[1];
				buildUri = true;
			}

			 //Add query params
			if (queryParamsMatch && queryParamsMatch.length === 2) {
				params = URI.parseQuery(queryParamsMatch[1]);
				buildUri = true;
			}
			if (buildUri) {
				url = URI(winLocation);
				if (hash) {
					url = url.hash(hash);
				}
				if (params) {
					url.removeSearch(Object.keys(params));
					url.addSearch(params);
				}
				url = url.href();
			} else {
				url = destination || winLocation; //Default
			}
			return url;
		},
		testUrlFromDestination = function () {
			var currentBase = 'http://localhost:9000/src/?customer=ub&offering=ub',
				testGotoPlainUrl = function () {
					var currentHash = '#home',
						currentLoc = currentBase + currentHash,
						wantedUrl = 'http://www.google.com',
						url = urlFromDestination(wantedUrl,  currentLoc);
					assert(url === wantedUrl, "Simple url");
				},
				testGotoHash = function () {
					var currentHash = '#starting-within',
						currentLoc = currentBase + currentHash,
						newHash = '#home',
						url = urlFromDestination(newHash, currentLoc);
					assert(url === currentBase + newHash,
						   "Expected #home to preserve current location");
				},
				testGotoHashWithSlash = function () {
					var currentHash = '#home',
						currentLoc = currentBase + currentHash,
						newHash = '#starting-within/120',
						url = urlFromDestination(newHash, currentLoc);
					assert(url === currentBase + newHash,
						   "Expected /120 to be preserved");
				},
				testGotoAddQueryParameter = function () {
					var currentHash = '#home',
						currentLoc = currentBase + currentHash,
						queryPart = '&foo=1234',
						wantedUrl = "?" + queryPart,
						expectedUrl = currentBase + queryPart + currentHash,
						url = urlFromDestination(wantedUrl,  currentLoc);
					assert(url === expectedUrl,
						'Query param added, hash preserved');
				},
				testGotoChangeQueryParameter = function () {
					// The http protocal supports more than one query parameter
					// with the same name, but it would be confusing in most cases
					// and it is a rare use anyway.
					var currentHash = '#home',
						currentLoc = currentBase + "&foo=abcd" + currentHash,
						queryPart = '&foo=1234',
						wantedUrl = "?" + queryPart,
						expectedUrl = currentBase + queryPart + currentHash,
						url = urlFromDestination(wantedUrl,  currentLoc);
					assert(url === expectedUrl,
						'Query param added, hash preserved, foo changed to 1234');
				},
				testGotoUndefined = function () {
					var currentLoc = window.location,
						url = urlFromDestination(undefined, currentLoc);
					assert(url === currentLoc,
						   "Expected undefined to mean the current location");
				};
			testGotoPlainUrl();
			testGotoHash();
			testGotoHashWithSlash();
			testGotoAddQueryParameter();
			testGotoChangeQueryParameter();
			testGotoUndefined();
		},
		safeURI = function (url) {
			return URI(url)
				.removeSearch('bobState')
				.removeSearch('chuckbob');
		},
		navigate = function (destination) {
			addTask(function () {
				var currentURI = safeURI(window.location),
					base = state.originalUri ?
						safeURI(state.originalUri).href() : currentURI.href(),
					url = urlFromDestination(destination, base),
					toUrl = URI(url),
					rightUrl = currentURI.equals(toUrl),
					forceReload = (destination === undefined),
					newUri,
					stateSerialized;
				log("Current url: " + currentURI.href());
				log("Desired url: " + toUrl.href());

				if ((rightUrl && ! state.testHasNavigated && ! forceReload) ||
					state.testHasNavigated
				   ) {
					   log("We are at the right location:" + currentURI.readable());
					   if (state.testHasNavigated) {
						   delete state.testHasNavigated;
					   }
				} else {
					// We need to reload the client from the new url.
					// Save the current state of unit testing, then continue
					// on the reloaded page
					state.currentTestNr = state.currentTestNr - 1;
					state.testHasNavigated = true;

					stateSerialized = serializeState();
					if (serializeMethod === serializeToQueryString) {
						newUri = toUrl.addSearch('bobState', stateSerialized);
						console.log(newUri.href());
					} else if (serializeMethod === serializeToLocalStorage) {
						localStorage.setItem('bobState', stateSerialized);
						console.log("Leaving with", state);
						// Phantomjs on windows seems to need a fresh url each time
						// adding a semi-random query string param seems to be needed
						newUri = toUrl.removeSearch('chuckbob')
							.addSearch('chuckbob', Date.now());
					}

					log("I am now going to another url. Bye");

					leavingPage = true;
					window.location = newUri.href();
					throw (new Error(DOING_RELOAD_CONDITION));
				}
			});
			return bob;
		},
		comment = function (message) {
			addTask(function () {
				log(message);
			});
			return bob;
		},

		// Verification

		countElements = function (jquerySelector) {
			$currentValueSelector = $(jquerySelector);
			currentValue = $currentValueSelector.size();
			log('Count on ' + jquerySelector + ' yields ' + currentValue);
		},
		countNow = function (jQuerySelector) {
			addTask(function () {
				countElements(jQuerySelector);
			});
			return bob;
		},
		count = function (jQuerySelector) {
			// Repeatedly try to count within 5 seconds,
			// so we don't fail on every little animation or delay.
			// If you don't like this behaviour, use pickNow.
			var resolver = function (resolve, reject, notify) {
				var poll = function () {
					var $elem = $(jQuerySelector);
					return $elem.length > 0;
				},
				check = function (polledTimeMs) {
					countElements(jQuerySelector, polledTimeMs);
				},
				rejected = function () {
					currentValue = 0;
					resolve();
				};
				log('Count: ' + jQuerySelector);

				pollingCheck(resolve, rejected, poll, check);
			};
			addTask(function () {
				return when.promise(resolver);
			});
			return bob;
		},
		verify = function (verificationFunction) {
			var ok = verificationFunction(currentValue);
			if (!ok) {
				fail(conditions.VERIFY_FAILED, ok);
			}
		},
		addVerifyer = function (name, binaryComparision) {
			bob[name] = function (value) {
				addTask(function () {
					var ok = binaryComparision(currentValue, value),
						okOrFail = (ok ? 'OK.' : 'FAILED');
					log('Checking if ' + currentValue + ' ' + name +
						' ' + value + ': ' + okOrFail);
					if (!ok) {
						fail(conditions.VERIFY_FAILED, ok);
					}
				});
				return bob;
			};
		},

		// startup and control

		resetRunningState = function () {
			currentPromiseChain = null;
			delete state.currentTestNr;
			delete state.selectedTestNames;
		},
		reportSuccess = function () {
			if (leavingPage) {
				return;
			}
			log('All tests OK. Stopping now, celebrate.');
			logSeparator();
			state.finalResult.ok = true;
			resetRunningState();
			reporter.showResult(state.finalResult);
		},
		reportFailure = function () {
			log('Tests finished with failures');
			state.finalResult.ok = false;
			resetRunningState();
			reporter.showResult(state.finalResult);
		},
		runTestList = function (tests) {
			var runNext = function () {
				var test = tests.shift();
				if (test) {
					return runTest(test).then(runNext, reportFailure);
				}
				return reportSuccess();
			};

			return runNext();
		},
		runTests = function () {
			var testIndex = state.currentTestNr,
				selectedTestNames = state.selectedTestNames,
				tests,
				remaining,
				skipIndex = 0;
			state.finalResult = state.finalResult || {};

			if (selectedTestNames) {
				tests = getTestListByNames(selectedTestNames);
			} else {
				tests = getTests();
			}
			if (!tests.length) {
				console.trace();
				log('No tests.');
				return;
			}
			if (!testIndex) {
				log('There are ' + tests.length + ' tests.');
				state.currentTestNr = 0;
				logSeparator();
				testIndex = 0;
			} else {
				log('Continuing testing after reload, at ' +
					testIndex + ' of ' + tests.length + ' tests.');
				skipNextSeparator = true;
			}
			remaining = tests.slice(testIndex);
			runTestList(remaining);
		},
		shouldAutoStart = function () {
			var uri = URI(window.location),
				hasLocalStorageState = localStorage.getItem('bobState') && true,
				hasPhantomjsQueryStringParam = uri.hasQuery('phantomjs');

			console.log('chuckbob.js:Line 619', hasLocalStorageState);

			phantomJs = hasPhantomjsQueryStringParam;

			return uri.hasQuery('autostart') ||
				uri.hasQuery('bobState') ||
				phantomJs ||
				hasLocalStorageState;
		},
		clearResult = function () {
			state.finalResult = {};
		},
		restart = function () {
			initState();
			maybeSwitchToPhantom();
			runTests();
		},
		runAllTests = function () {
			clearResult();
			resetRunningState();
			restart();
		},
		initialize = function () {
			reporter.setTests(getTestNames());
			if (shouldAutoStart()) {
				restart();
			} else {
				console.log("There will be no autostart of tests.");
				welcome();
				showGui();
			}
		},
		goBackToStart = function (optRestart) {
			if (state.originalUri) {
				var uri = URI(state.originalUri);
				uri.removeSearch('autostart');
				if (optRestart) {
					uri.addSearch('autostart');
				}
				window.location = uri.href();
			} else {
				gui.hide();
			}
		},
		restartFromOriginalUrl = function () {
			goBackToStart(true);
		},
		restartFromOriginalUrlNoAutostart = function () {
			goBackToStart(false);
		},

		runTestByName = function (name) {
			var testCase = getTestByName(name);
			if (testCase) {
				clearResult();
				state.selectedTestNames = [name];
				runTests();
			} else {
				console.log("Could not find test:" + name);
			}
		},
		endWaiting = function () {
			if (waiting) {
				stopWaiting(WAIT_FOR_PAGE);
			}
		},
		setReporter = function (reporterObject) {
			reporter = reporterObject;
		},
		setJQuery = function (jQuery) {
			$ = jQuery;
			api.$ = $;
			bob.$ = $;
		},
		selfTest = function () {
			testUrlFromDestination();
		},
		noop = function () {};

	bob.click = click;
	bob.comment = comment;

	bob.verify = verify;

	addVerifyer('isGreaterThan', function (current, value) {
		return current > value;
	});
	addVerifyer('isLessThan', function (current, value) {
		return current < value;
	});
	addVerifyer('equals', function (current, value) {
		return String(current) === String(value);
	});

	api.conditions = conditions;

	bob.clearLocalStorage = clearLocalStorage;
	bob.navigate = navigate;
	bob.gosub = gosub;


	integrationApi.onBeginWait = noop;
	integrationApi.endWaiting = endWaiting;
	integrationApi.setJQuery = setJQuery;

	api.integrationApi = integrationApi;

	api.conditions = conditions;

	bob.run = run;
	bob.check = check;

	bob.wait = wait;
	bob.pick = pick;
	bob.count = count;
	bob.pickNow = pickNow;
	bob.countNow = countNow;
	bob.write = write;

	bob.sleep = sleep;

	bob.breakpoint = breakpoint;

	api.bob = bob;

	api.resume = resume;
	api.startSingleStepping = startSingleStepping;
	api.stopSingleStepping = stopSingleStepping;
	api.toggleSingleStepping = toggleSingleStepping;

	api.getIsSingleStepping = getIsSingleStepping;
	api.step = step;
	api.getLogText = getLogText;

	api.status = status;
	api.stopWaiting = stopWaiting;
	api.runAllTests = runAllTests;

	api.addTest = addTest;
	api.xaddTest = function (name, testCase) {
		addTest(name, testCase);
		testCase.disabled = true;
	};
	api.XaddTest = api.xaddTest;

	api.show = showGui;
	api.gui = gui;

	api.log = log;

	api.getTestNames = getTestNames;
	api.runTestByName = runTestByName;

	api.restartFromOriginalUrl = restartFromOriginalUrl;
	api.restartFromOriginalUrlNoAutostart = restartFromOriginalUrlNoAutostart;
	api.goBackToStart = goBackToStart;


	api.getState = function () { return state; };
	api.getElement = function () { return $element; };
	api.getCurrentValueSelector = function () { return $currentValueSelector; };


	api.initialize = initialize;

	window.chuckbob = api;
	window.bob = bob;

	window.URI = URI; // Temp

	gui.registerForCallbacks(api);

	selfTest();


	return api;

});

/*global window, document */
/*global require */

require([
	'script/chuckbob',
	'jquery'
], function (chuckbob, $) {
	
	$.noConflict();
	chuckbob.integrationApi.setJQuery($);


	if (window.afterChuckbob) {
		window.afterChuckbob(chuckbob);
	};
});

define("main", function(){});

}());