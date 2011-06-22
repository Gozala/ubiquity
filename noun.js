/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Ubiquity.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *   Aza Raskin <aza@mozilla.com>
 *   Jono DiCarlo <jdicarlo@mozilla.com>
 *   Maria Emerson <memerson@mozilla.com>
 *   Blair McBride <unfocused@gmail.com>
 *   Abimanyu Raja <abimanyuraja@gmail.com>
 *   Michael Yoshitaka Erlewine <mitcho@mitcho.com>
 *   Satoshi Murakami <murky.satyr@gmail.com>
 *   Irakli Gozalishvili <rfobic@gmail.com> (http://jeditoolkit.com)
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true devel: true
         forin: true latedef: false supernew: true newcap: false */
/*global define: true */

(typeof define === "undefined" ? function($) { $(require, exports, module); } : define)(function(require, exports, module) {

"use strict";

/**
 * A library of noun related utilities.
 */
var streamer = require('https!raw.github.com/Gozala/streamer/v0.0.3/streamer')
var utils = require('./grep')

function keyValues(object) {
  return Object.keys(object).map(function(key) {
    return { key: key, value: object[key] }
  })
}
function get(key, object) { return object[key] }
var getKey = get.bind(null, 'key')

/**
 * Constructor of a noun that accepts a set of inputs types (array, object,
 * regexp, string, function) and depending on type delegates to one of it's own
 * functions (Noun.Array, Noun.Object, Noun.RegExp, Noun.String, Noun.Function).
 * For details see `Noun` methods.
 *
 * Noun also may be called with more than one argument in which case noun will
 * be created for each of them and composite none of all those nouns is
 * returned. See `Noun.append` for details of composite nouns.
 *
 * With in this implementation `noun` is a function. It takes one `input`
 * argument and returns [stream] of matching elements paired with a score of
 * the match. Default value of the `noun` is just an element with a `0` score.
 * [stream]:http://jeditoolkit.com/streamer/docs/readme.html "stream pattern"
 */
function Noun(descriptor, rest) {
  return !rest ? Noun[descriptor.constructor.name](descriptor) :
         Noun.append.apply(Noun, Array.prototype.map.call(arguments, Noun))
}
exports.Noun = Noun
/**
 * Creates a `noun` from the given `stream` of elements. Optionally `serialize`
 * function may be passed in order to preform match on the serialized elements.
 * If `serialize` is not passed than match will be performed on `.toString()`
 * serialized elements.
 * @param {Function} stream
 *    Stream of values to create a noun from.
 * @param {Function} [serialize]
 *    Optional, serialize function, if passed this `serialize` function is used
 *    for serializing input elements before preforming match.
 * @returns {Function}
 */
Noun.Stream = function Stream(stream, serialize) {
  // Composing a `noun` function by binding given `stream` and `serialize`
  // arguments to `grep` function. This way `noun` function will return stream
  // of [element, score] pairs, where `score` is a match score of associated
  // `element` from the given `stream`. Also, elements that don't satisfy match
  // will not be included.
  var noun = utils.grep.bind(null, stream, serialize || String)
  noun.id = noun.displayName = stream.id || stream.displayName || stream.name
  return noun
}
/**
 * Creates a `noun` out of the given `array` of elements. By default
 * match is performed on the raw elements, but optionally, `serialize` function
 * may be passed to preform matches on the serialized elements instead.
 * @param {Array} array
 *    Array of elements to create a noun from.
 * @param {Function} [serialize]
 *    Optional, serialize function, if passed this `serialize` function is used
 *    for serializing input elements before preforming match.
 * @returns {Function}
 */
Noun.Array = function Array(array, serialize) {
  // Creating a stream of elements for the given `array`.
  var stream = streamer.list.apply(null, array)
  serialize = serialize || String
  // Generating an `id` for the given noun.
  stream.id = array.slice(0, 2).map(serialize) + (array.length > 2 ? ',..' : '')
  // Creating a noun form the given stream.
  return Noun.Stream(stream, serialize)
}
/**
 * Creates a `noun` from the given `key:value` pairs. By default `key` is used
 * as match target, but optionally `serialize` function may be passed, in order
 * to perform match on serialized `key:value` instead.
 * @param {Object} object
 *    Hash of `key:values` (Only own properties are used).
 * @param {Function} [serialize]
 *    Optional, serialize function, if passed this `serialize` function is used
 *    for serializing `{ key: key, value: object[key] }` elements before
 *    preforming a match.
 * @returns {Function}
 */
Noun.Object = function Object(object, serialize) {
  // Map object's own properties to a key:value pairs and create noun out of it
  // using `Noun.Array`. If custom `serialize`-r is not passed it defaults to
  // a function that serializes to property names. This basically means that
  // filtering on the returned `noun` will happen over the object keys.
  return Noun.Array(keyValues(object), serialize || getKey)
}
/**
 * Creates a noun from the given `regexp` regular expression and returns it.
 * Optionally `serialize` argument may be passed, in order to perform match on
 * the serialize elements. This `noun` will always contain at max one match
 * since `regexp` either matches input or not.
 * @param {RegExp} regexp
 *    Regular expression used to perform match.
 * @param {Function} [serialize]
 *    Optional, serialize function, if passed this `serialize` function is used
 *    for serializing input elements before preforming match.
 * @returns {Function}
 */
Noun.RegExp = function RegExp(regexp, serialize) {
  serialize = serialize || String
  function noun(input) {
    return function stream(next, stop) {
      var score = utils.score(regexp, input)
      if (score) next([ input, score ])
      if (stop) stop()
    }
  }
  noun.id = noun.displayName = String(regexp)
  return noun
}
/**
 * Creates a noun from the given `pattern` string and returns it.
 * Optionally `serialize` argument may be passed, in order to perform match on
 * the serialize elements. This `noun` will contain at max one match since
 * pattern either matches input or not.
 * @param {String} pattern
 *    Regular expression used to perform match.
 * @param {Function} [serialize]
 *    Optional, serialize function, if passed this `serialize` function is used
 *    for serializing input elements before preforming match.
 * @returns {Function}
 */
Noun.String = function String(pattern, serialize) {
  return Noun.RegExp(utils.Pattern(pattern, 'i'), serialize)
}
/**
 * This does not really does anything other than setting `displayName` and `id`
 * properties on the given `noun`. Given `noun` is returned back. This is useful
 * for normalization custom function based `noun`-s.
 * @param {Function} noun
 * @returns {Function}
 */
Noun.Function = function Function(noun) {
  noun.id = noun.displayName = noun.id || noun.displayName || noun.name
  return noun
}
/**
 * Combines multiple nouns into one and returns it. Given `noun` will match
 * elements from all the nouns that were combined here.
 * @params {Function} noun
 * @returns {Function}
 */
Noun.append = function append() {
  var nouns = Array.prototype.slice(arguments, 0)
  function noun(input) {
    return streamer.append.apply(null, nouns.map(function(noun) {
      return noun(input)
    }))
  }
  noun.id = nouns.map(function(noun) { return noun.id }).join(' | ')
  return noun
}

});
