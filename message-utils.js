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

// = Message Services =
// {{{MessageService}}} is the name of an interface that provides a
// means for notifying the end-user of important events in a non-intrusive
// manner.
//
// An object that implements the {{{MessageService}}} interface must
// expose the following method:

// === {{{MessageService#displayMessage(msg)}}} ===
// Displays the given message. {{{msg}}} may be a simple string, but it
// can also be a JavaScript object with the following keys, all of them
// optional:
//
// {{{msg.title}}} is the title of the message.
//
// {{{msg.text}}} is the body of the message.
//
// {{{msg.icon}}} is a URL pointing to an icon for the message.
//
// {{{msg.exception}}} is an exception object corresponding to the
// exception that the message represents, if any.
//
// {{{msg.onclick}}} is a function called when the text is clicked.
//
// {{{msg.onfinished}}} is a function called when the alert goes away.

/* vim:set ts=2 sw=2 sts=2 expandtab */
/*jshint asi: true undef: true es5: true node: true devel: true
         forin: true latedef: false supernew: true */
/*global define: true */

define(function (require, exports, module, undefined) {

"use strict";
//const { Cc, Ci, Cu } = require("chrome");

//Cu.import("resource://ubiquity/modules/utils.js");
//Cu.import("resource://ubiquity/modules/localization_utils.js");

const PREF_SHOW_ERROR = "extensions.ubiquity.displayAlertOnError";

//var L = LocalizationUtils.propertySelector(
  //"chrome://ubiquity/locale/coreubiquity.properties");

// == Message Service Implementations ==

/**
 * === {{{AlertMessageService}}} ===
 * This {{{MessageService}}} uses {{{nsIAlertsService}}} to
 * non-modally display the message to the user. On Windows, this shows
 * up as a "toaster" notification at the bottom-right of the
 * screen. On OS X, it's shown using
 * [[http://en.wikipedia.org/wiki/Growl_%28software%29|Growl]].
 */
function AlertMessageService() {}
exports.AlertMessageService = AlertMessageService;
AlertMessageService.prototype = {
  DEFAULT_ICON : "chrome://ubiquity/skin/icons/favicon.ico",
  DEFAULT_TITLE: /*L(*/"ubiquity.msgservice.defaultmsgtitle"/*)*/,
  displayMessage: function AMS_displayMessage(msg) {
    var text  = "";
    var title = this.DEFAULT_TITLE;
    var icon  = this.DEFAULT_ICON;
    var textClickable = false;
    var cookie = "";
    var alertListener = null;
    var name = null;

    if (Utils.classOf(msg) !== "Object")
      text = String(msg);
    else {
      if ("text" in msg) text = String(msg.text);
      if ("exception" in msg) {
        if (!Utils.prefs.getValue(PREF_SHOW_ERROR, false)) return;
        text += " (" + msg.exception + ")";
      }
      if ("title" in msg) title = String(msg.title);
      if ("icon"  in msg) icon  = String(msg.icon);

      let {onclick, onfinished} = msg;
      if (onclick) textClickable = true;
      if (onclick || onfinished)
        alertListener = {
          observe: function AMS_observe(subject, topic, data) {
            if (topic === "alertclickcallback" && onclick)
              onclick();
            else if (topic === "alertfinished" && onfinished)
              onfinished();
          }
        };
    }
    try {
      Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService)
        .showAlertNotification(icon, title, text, textClickable,
                               cookie, alertListener, name);
    } catch (e) {
      Cu.reportError(e);
      Utils.focusUrlInBrowser("chrome://ubiquity/content/bug19warning.xhtml");
    }
  }
};

/**
 * == Exception Utilities ==
 * The `ExceptionUtils` namespace provides some functionality for
 * introspecting JavaScript and XPCOM exceptions.
 */
exports.ExceptionUtils = {
  stackTraceFromFrame: function EU_stackTraceFromFrame(frame, formatter) {
    if (!formatter)
      formatter = function EU_defaultFormatter(frame) { return frame; };

    var output = "";

    while (frame) {
      output += formatter(frame) + "\n";
      frame = frame.caller;
    }

    return output;
  },

  stackTrace: function EU_stackTrace(e, formatter) {
    var output = "";
    if (e.location) {
      // It's a wrapped nsIException.
      output += this.stackTraceFromFrame(e.location, formatter);
    }
    else if (e.stack)
      // It's a standard JS exception.

      // TODO: It would be nice if we could parse this string and
      // create a 'fake' nsIStackFrame-like call stack out of it,
      // so that we can do things w/ this stack trace like we do
      // with nsIException traces.
      output += e.stack;
    else
      // It's some other thrown object, e.g. a bare string.
      ;

    return output;
  }
};

})
