/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true devel: true
         forin: true latedef: false supernew: true */
/*global define: true */

(typeof define === "undefined" ? function ($) { $(require, exports, module); } : define)(function (require, exports, module, undefined) {

"use strict";

const { Cc, Ci } = require('chrome')
const awesomebar = require('https!raw.github.com/autonome/Jetpack-Modules/master/awesomebar')
const { tagURI, untagURI } = Cc['@mozilla.org/browser/tagging-service;1'].
             getService(Ci.nsITaggingService)
const tabs = require('tabs');

awesomebar.register(function tag(query) {
  let tags = query.split(/[,|\s]+/)
  return function stream(next, stop) {
    if (!tags.length) return stop()
    stop(next({
      icon: 'chrome://browser/skin/places/star-icons.png',
      title: 'Tags: ' + tags.join(', '),
      url: ''
    }))
    console.log('<<<<<')
  }
})
awesomebar.register(function untag() {
  return function stream(next, stop) {
    next({
      icon: 'chrome://browser/skin/places/star-icons.png',
      title: 'Untag this page',
      url: ''
    })
    stop()
  }
})

})
