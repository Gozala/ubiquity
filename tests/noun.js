/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true newcap: false undef: true es5: true node: true devel: true
         forin: true */
/*global define: true */

(typeof define === "undefined" ? function ($) { $(require, exports, module) } : define)(function (require, exports, module, undefined) {

"use strict";

var Noun = require('ubiquity/noun').Noun

function values(stream) {
  return function(next, stop) {
    stream(function(element) { next(element[0]) }, stop)
  }
}
function toArray(stream, callback) {
  var buffer = [], value, error
  stream(function onElement(value) {
    buffer.push(value)
  }, function onStop(e) {
    error = e
    value = buffer
    if (error) value = error
    if (callback) callback(error, value)
  })
  return error || value
}

exports['test noun from array'] = function(assert) {
  var dogs = Noun(['poodle', 'golden retreiver', 'beagle', 'bulldog', 'husky'])
  assert.equal(dogs.id, 'poodle,golden retreiver,..', 'noun id was set')
  assert.deepEqual(toArray(dogs()), [
    [ 'poodle', 0.75 ],
    [ 'golden retreiver', 0.75 ],
    [ 'beagle', 0.75 ],
    [ 'bulldog', 0.75 ],
    [ 'husky', 0.75 ]
  ], 'all elements get ".75" score if no input provided');

  assert.deepEqual(toArray(dogs('')), [
    [ 'poodle', 0.75 ],
    [ 'golden retreiver', 0.75 ],
    [ 'beagle', 0.75 ],
    [ 'bulldog', 0.75 ],
    [ 'husky', 0.75 ]
  ], 'all elements get ".75" score if input is "" provided');

  assert.deepEqual(toArray(values(dogs(' '))), [ 'golden retreiver' ],
                   'white space is significant');

  assert.deepEqual(toArray(values(dogs('p'))), [ 'poodle' ], 'found 1 result')
  assert.deepEqual(toArray(values(dogs('b'))), [ 'beagle', 'bulldog' ],
                   'found 2 results')
  assert.deepEqual(toArray(values(dogs('^\\S{0,6}$'))), [
    'poodle',
    'beagle',
    'husky',
  ], 'escaped regexp patterns work')
}

exports['test noun from array with serializer'] = function(assert) {
  var dogs = Noun.Array([
    { name: 'poodle' },
    { name: 'golden retreiver' },
    { name: 'beagle' },
    { name: 'bulldog' },
    { name: 'husky' }
  ], function(element) { return element.name })

  assert.equal(dogs.id, 'poodle,golden retreiver,..', 'noun id was set')

  assert.deepEqual(toArray(dogs()), [
    [ { name: 'poodle' }, 0.75 ],
    [ { name: 'golden retreiver' }, 0.75 ],
    [ { name: 'beagle' }, 0.75 ],
    [ { name: 'bulldog' }, 0.75 ],
    [ { name: 'husky' }, 0.75 ]
  ], 'all elements get ".75" score if no input provided')

  assert.deepEqual(toArray(dogs('')), [
    [ { name: 'poodle' }, 0.75 ],
    [ { name: 'golden retreiver' }, 0.75 ],
    [ { name: 'beagle' }, 0.75 ],
    [ { name: 'bulldog' }, 0.75 ],
    [ { name: 'husky' }, 0.75 ]
  ], 'all elements get ".75" score if input is "" provided');

  assert.deepEqual(toArray(values(dogs('p'))), [ { name: 'poodle' } ],
                   'found 1 result')
  assert.deepEqual(toArray(values(dogs('b'))),
                   [{ name: 'beagle' }, { name: 'bulldog' }], 'found 2 results')
  assert.deepEqual(toArray(values(dogs(' '))), [ { name: 'golden retreiver' } ],
                   'white space is significant');
}

});
