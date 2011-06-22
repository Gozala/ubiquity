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
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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
         forin: true latedef: false supernew: false */
/*global define: true */

(typeof define === "undefined" ? function($) { $(require, exports, module); } : define)(function(require, exports, module) {

"use strict";

var streamer = require('https!raw.github.com/Gozala/streamer/v0.0.3/streamer')
var map = streamer.map, filter = streamer.filter, zip = streamer.zip

/**
 * Calculates the score for use in suggestions from
 * a result array `match` of `RegExp#exec`.
 */

var SCORE_BASE = 0.3
var SCORE_LENGTH = 0.25
var SCORE_INDEX = 1 - SCORE_BASE - SCORE_LENGTH

function score(pattern, input) {
  var match, length = input.length, value = null
  if ((match = pattern.exec(input))) {
    value = SCORE_BASE +
            SCORE_LENGTH * Math.sqrt(match[0].length / length) +
            SCORE_INDEX  * (1 - match.index / length)
  }
  return value
}
exports.score = score

function hasScore(element) { return null !== element[1] }

/**
 * Returns the `pattern` with all regexp meta characters in it backslashed.
 * @param {String} pattern
 * @returns {String}
 */
function escapePattern(pattern) {
  return String(pattern).replace(/[.?*+\^$|()\{\[\\]/g, '\\$&')
}

/**
 * Creates a regexp just like `RegExp`, except that it:
 * - falls back to an escaped version of `pattern` if the compile fails
 * - returns the `pattern` as is if it's already a regexp
 * @param {String|RegExp} pattern
 * @param {String} flags
 * @returns {RegExp}
 *
 * @examples
 *  RegExp("[")          // SyntaxError("unterminated character class")
 *  RegExp(/:/, "y")     // TypeError("can't supply flags when ...")
 *  Pattern("[")          // /\[/
 *  Pattern(/:/, "y")     // /:/
 */
function Pattern(pattern, flags) {
  if (!(pattern instanceof RegExp)) {
    try {
      pattern = new RegExp(pattern, flags)
    } catch (exception) {
      if (exception instanceof SyntaxError)
        pattern = new RegExp(escapePattern(pattern), flags)
      else
        throw exception
    }
  }
  return pattern
}
exports.Pattern = Pattern


/**
 * Function for filtering elements from the given `source` stream using a given
 * `pattern`. Returns stream of [element, score] arrays, where `element` is an
 * element from `source` and `score` is matching score.
 *
 * @param {Function} source
 *    Stream of elements to 'grep' form.
 * @param {Function} [serialize=String]
 *    Optional serializer function, that is used to serialize elements from
 *    `source` stream before evaluating a match.
 * @param {String|RegExp} input
 *    Pattern to filter elements with.
 */
exports.grep = function grep(source, serialize, input) {
  var scores, pattern
  if (typeof(serialize) !== 'function') {
    input = serialize
    serialize = String
  }
  // Creating pattern from the given input.
  pattern = Pattern(input || '', 'i')
  // Creating a map of scores by mapping `source` stream via a serializer
  // function and then mapping that via a `pattern` bounded `score` function.
  // Output of function will be stream of scores.
  scores = map(map(source, serialize), score.bind(null, pattern))
  // Return stream that is composed by zipping `scores` stream with a `source`
  // and filtered so that only elements with non `null` scores are present.
  return filter(zip(source, scores), hasScore)
}

});
