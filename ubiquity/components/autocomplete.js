const Ci = Components.interfaces;
const Cc = Components.classes;

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// nsIAutoCompleteSearch implementation
//
// Any XUL textbox element that wants to use this search should set
// its 'type' attribute to 'autocomplete' and its 'autocompletesearch'
// attribute to 'commands'. For more information, see:
//
// http://developer.mozilla.org/en/docs/XUL:textbox_(Firefox_autocomplete)

var gSingleton = null;
var CommandsAutoCompleterFactory = {
  createInstance : function(aOuter, aIID) {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    if (gSingleton == null)
      gSingleton = new CommandsAutoCompleter();

    return gSingleton.QueryInterface(aIID);
  }
};

function CommandsAutoCompleter() {
  Components.utils.import("resource://ubiquity-modules/cmdregistry.js");
  this._cmdRegistry = CommandRegistry;
}

CommandsAutoCompleter.prototype = {
  classDescription : "CommandsAutoCompleter",
  classID : Components.ID("de8db85f-c1de-4d87-94ba-7844890f91fe"),
  contractID : "@mozilla.org/autocomplete/search;1?name=commands",
  _xpcom_factory : CommandsAutoCompleterFactory,
  QueryInterface : XPCOMUtils.generateQI([Ci.nsIAutoCompleteSearch]),

  startSearch : function(searchString, searchParam, previousResult,
                         listener) {
    var result = new CommandsAutoCompleteResult(this._cmdRegistry,
                                                searchString);
    listener.onSearchResult(this, result);
  },

  stopSearch : function() {
  }
};

// nsIAutoCompleteResult implementation

function CommandsAutoCompleteResult(cmdRegistry, searchString) {
  this._cmdRegistry = cmdRegistry;
  this._searchString = searchString;
  this._results = [];

  for (var i = 0; i < this._cmdRegistry.commands.length; i++) {
    var command = this._cmdRegistry.commands[i];
    if (command.name.indexOf(this._searchString) != -1)
      this._results.push(command);
  }

  var sortByEarliestOccurrence = function(a, b) {
    var aIndex = a.name.indexOf(searchString);
    var bIndex = b.name.indexOf(searchString);
    if (aIndex < bIndex)
      return -1;
    if (bIndex < aIndex)
      return 1;
    if (a.name.length < b.name.length)
      return -1;
    if (b.name.length < a.name.length)
      return 1;
    return 0;
  };

  this._results.sort(sortByEarliestOccurrence);
}

CommandsAutoCompleteResult.prototype = {
  RESULT_IGNORED : 1,
  RESULT_FAILURE : 2,
  RESULT_NOMATCH : 3,
  RESULT_SUCCESS : 4,
  RESULT_NOMATCH_ONGOING : 5,
  RESULT_SUCCESS_ONGOING : 6,

  get searchString() {
    return this._searchString;
  },

  get defaultIndex() {
    return 0;
  },

  get errorDescription() {
    return null;
  },

  get matchCount() {
    return this._results.length;
  },

  get searchResult() {
    if (this._results.length == 0) {
      return this.RESULT_NOMATCH;
    } else {
      return this.RESULT_SUCCESS;
    }
  },

  getCommentAt : function(index) {
    return "";
  },

  getImageAt : function(index) {
    return this._results[index].icon;
  },

  getStyleAt : function(index) {
    return "";
  },

  getValueAt : function(index) {
    return this._results[index].name;
  },

  removeValueAt : function(rowIndex, removeFromDb) {
    // TODO: Actually implement this? When does it get called?
    dump("removeValueAt " + rowIndex + "\n");
  },

  QueryInterface : XPCOMUtils.generateQI([Ci.nsIAutoCompleteResult])
};

function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule([CommandsAutoCompleter]);
}