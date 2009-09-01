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
 *   Jono DiCarlo <jdicarlo@mozilla.com>
 *   Blair McBride <unfocused@gmail.com>
 *   Atul Varma <atul@mozilla.com>
 *   Brandon Pung <brandonpung@gmail.com>
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

var EXPORTED_SYMBOLS = ["NLParser1"];

var NLParser1 = ([f for each (f in this) if (typeof f === "function")]
                 .reduce(function addMethod(o, f) (o[f.name] = f, o), {}));

const Cu = Components.utils;

Cu.import("resource://ubiquity/modules/utils.js");
Cu.import("resource://ubiquity/modules/nounutils.js");
Cu.import("resource://ubiquity/modules/suggestion_memory.js");

const FLAG_DEFAULT = 1;

var {push} = Array.prototype;
var plugins = {};

function makeParserForLanguage(languageCode, verbList,
                               ContextUtils, suggestionMemory) {
  return new Parser(verbList, getPluginForLanguage(languageCode),
                    ContextUtils, suggestionMemory);
}

function registerPluginForLanguage(code, plugin) {
  var {Parser} = Cu.import("resource://ubiquity/modules/parser/new/parser.js",
                           null);
  var langFile = "resource://ubiquity/modules/parser/new/" + code + ".js";
  eval(Utils.getLocalUrl(langFile, "utf-8"));
  var parser = makeParser();
  var roleMap = plugin.roleMap = {};
  for each (let {role, delimiter} in parser.roles)
    if (!(role in roleMap)) roleMap[role] = delimiter;
  plugin.PRONOUNS = parser.anaphora;
  plugin.pronouns = [
    RegExp(a.replace(/\W/g, "\\$&").replace(/^\b|\b$/g, "\\b"), "i")
    for each (a in parser.anaphora)];
  plugins[code] = plugin;
}

function getPluginForLanguage(languageCode) plugins[languageCode];

/* ParserQuery: An object that wraps a request to the parser for suggestions
 * based on a given query string.  Multiple ParserQueries may be in action at
 * a single time; each is independent.  A ParserQuery can execute
 * asynchronously, producing a suggestion list that changes over time as the
 * results of network calls come in.
 */
function ParserQuery(parser, queryString, context, maxSuggestions) {
  this._init.apply(this, arguments);
}
ParserQuery.prototype = {
  _init: function PQ__init(parser, queryString, context, maxSuggestions) {
    this._parser = parser;
    this._suggestionList = [];
    this._queryString = queryString;
    this._context = context;
    this._parsingsList = [];

    this.maxSuggestions = maxSuggestions;
    this.nounCache = {"": {text: "", html: "", data: null, summary: ""}};
    this.requests = [];
    this.onResults = Boolean;
  },

  // Client code should set onResults to a function!!

  cancel: function PQ_cancel() {
    for each (let req in this.requests)
      if (req && typeof req.abort === "function")
        req.abort();
    this.onResults = Boolean;
    this._parsingsList = null;
  },

  // Read-only properties:
  get finished() {
    for each (let req in this.requests)
      if ((req.readyState || 4) !== 4) return false;
    return true;
  },
  get hasResults() !!this._suggestionList.length,
  get suggestionList() this._suggestionList,

  // The handler that makes this a listener for partiallyParsedSentences.
  onNewParseGenerated: function PQ_onNewParseGenerated() {
    this._refreshSuggestionList();
    this.onResults();
  },

  run: function PQ_run() {
    this.onNewParseGenerated();
    return this;
  },

  addPartiallyParsedSentences:
  function PQ_addPartiallyParsedSentences(ppss) {
    push.apply(this._parsingsList, ppss);
  },

  _refreshSuggestionList: function PQ__refreshSuggestionList() {
    // get completions from parsings -- the completions may have changed
    // since the parsing list was first generated.
    var suggs = this._suggestionList = [];
    for each (let parsing in this._parsingsList) {
      let newSuggs = parsing.getParsedSentences();
      push.apply(suggs, newSuggs);
    }
    // Sort and take the top maxSuggestions number of suggestions
    this._sortSuggestionList();
    suggs.splice(this.maxSuggestions);
  },

  _sortSuggestionList: function PQ__sortSuggestionList() {
    // Each suggestion in the suggestion list should already have a matchScore
    // assigned by Verb.match().
    // Give them also a frequencyScore based on the suggestionMemory:
    let {_parser} = this, {pow} = Math;
    for each (let sugg in this._suggestionList) {
      let freq = _parser.getSuggestionMemoryScore(
        sugg.fromNounFirstSuggestion ? "" : sugg._verb.input,
        sugg._verb.cmd.id);
      sugg.frequencyMatchScore = pow(.1, 1 / (freq + 1));
    }
    Utils.sortBy(this._suggestionList,
                 function scoreNegated(sugg) -sugg.score);
  },
};

function Parser(verbList, languagePlugin, ContextUtils, suggestionMemory) {
  this._languagePlugin = languagePlugin;
  this._ContextUtils = ContextUtils ||
    (Cu.import("resource://ubiquity/modules/contextutils.js", null)
     .ContextUtils);
  this._suggestionMemory = suggestionMemory ||
    new (Cu.import("resource://ubiquity/modules/suggestion_memory.js", null)
         .SuggestionMemory)("main_parser");
  this.setCommandList(verbList);
}
Parser.prototype = {
  _nounFirstSuggestions:
  function P__nounFirstSuggestions(selObj, maxSuggestions, query) {
    let topGenerics =
      this._rankedVerbsThatUseGenericNouns.slice(0, maxSuggestions);
    let verbsToTry = this._verbsThatUseSpecificNouns.concat(topGenerics);
    return [new PartiallyParsedSentence(verb, {}, selObj, 0, query)
            for each (verb in verbsToTry) if (!verb.disabled)];
  },

  strengthenMemory: function P_strengthenMemory(chosenSuggestion) {
    var verb = chosenSuggestion._verb, {id} = verb.cmd;
    if (chosenSuggestion.hasFilledArgs()) {
      this._suggestionMemory.remember("", id);
      this._sortGenericVerbCache();
    }
    if (!chosenSuggestion.fromNounFirstSuggestion) {
      this._suggestionMemory.remember(verb.input, id);
    }
  },

  getSuggestionMemoryScore:
  function P_getSuggestionMemoryScore(inputVerb, suggestedVerb) {
    return this._suggestionMemory.getScore(inputVerb, suggestedVerb);
  },

  // TODO reset is gone

  newQuery: function P_newQuery(input, context, maxSuggestions, lazy) {
    var query = new ParserQuery(this, input, context, maxSuggestions);
    var ppss = [];
    var selObj = this._ContextUtils.getSelectionObject(context);
    var selected = !!(selObj.text || selObj.html);
    var plugin = this._languagePlugin;
    if (selected) {
      query.PRONOUNS = plugin.PRONOUNS;
      query.pronouns = plugin.pronouns;
    }
    if (!input && selected)
      // selection, no input, noun-first suggestion on selection
      push.apply(ppss, this._nounFirstSuggestions(selObj,
                                                  maxSuggestions,
                                                  query));
    else {
      // Language-specific full-sentence suggestions:
      ppss = plugin.parseSentence(
        input,
        this._verbList,
        selObj,
        function makePPS(verb, argStrings, selObj, matchScore) {
          for (var key in argStrings)
            argStrings[key] = argStrings[key].join(" ");
          return new PartiallyParsedSentence(
            verb, argStrings, selObj, matchScore, query);
        });
      // noun-first matches on input
      if (ppss.length === 0) {
        let selObj = {
          text: input,
          html: Utils.escapeHtml(input),
          fake: true,
        };
        selected = !!input;
        push.apply(ppss, this._nounFirstSuggestions(selObj,
                                                    maxSuggestions,
                                                    query));
      }
    }

    // partials is now a list of PartiallyParsedSentences; if there's a
    // selection, try using it for any missing arguments...
    if (selected)
      for each (let pps in ppss)
        query.addPartiallyParsedSentences(
          pps.getAlternateSelectionInterpolations());
    else
      query.addPartiallyParsedSentences(ppss);

    lazy || Utils.setTimeout(function P_nQ_delayedRun() { query.run() });
    return query;
  },

  setCommandList: function P_setCommandList(commandList) {
    var verbs = this._verbList = [];
    var specifics = this._verbsThatUseSpecificNouns = [];
    var generics  = this._rankedVerbsThatUseGenericNouns = [];
    var {roleMap} = this._languagePlugin;
    for each (let cmd in commandList) {
      let verb = new Verb(cmd, roleMap);
      verbs.push(verb);
      (verb.usesAnySpecificNounType() ? specifics : generics).push(verb);
    }
    this._sortGenericVerbCache();
  },

  _sortGenericVerbCache: function P__sortGenericVerbCache() {
    var suggMemory = this._suggestionMemory;
    if (!suggMemory) return;
    Utils.sortBy(
      this._rankedVerbsThatUseGenericNouns,
      function minusSMScore(v) -suggMemory.getScore("", v._name));
  },
};

function ParsedSentence(verb, args, verbMatchScore, selObj, query) {
  this._verb = verb;
  this._argSuggs = args;
  this._argFlags = {};
  this._selObj = selObj;
  this._query = query;
  this.verbMatchScore = verbMatchScore;
  this.duplicateDefaultMatchScore = 1;
  // assigned later
  // this.frequencyMatchScore = 0;
  // this.argMatchScore = 0;
}
ParsedSentence.prototype = {
  get completionText PS_getCompletionText() {
    // Returns plain text that we should set the input box to if user hits
    // the key to autocomplete to this sentence.
    var sentence = this._verb.matchedName;
    var args = this._verb._arguments;
    for (let x in args) {
      let argText = (this._argSuggs[x] || 0).text;
      if (!argText || this._argFlags[x] & FLAG_DEFAULT) continue;
      let preposition = " ";
      if (x === "direct_object") {
        // Check for a valid text selection. We'll replace
        // the text with a pronoun for readability
        if (this._selObj.text === argText)
          argText = this._query.PRONOUNS[0];
      }
      else preposition += args[x].flag + " ";
      sentence += preposition + argText;
    }
    return sentence + " ";
  },

  // text formatted sentence for display in popup menu
  get displayText PS_displayText() {
    var {matchedName: sentence, _arguments: args} = this._verb;
    for (let x in args) {
      let obj = x === "direct_object";
      let {text} = this._argSuggs[x] || 0;
      if (text) sentence += (" " +
                             (obj ? "" : args[x].flag + " ") +
                             (obj ? "[ " + text + " ]" : text));
    }
    return sentence;
  },
  // html formatted sentence for display in suggestion list
  get displayHtml PS_displayHtml() {
    var {escapeHtml} = Utils;
    var sentence = ('<span class="verb">' +
                    escapeHtml(this._verb.matchedName) +
                    '</span>');
    var args = this._verb._arguments;
    for (let x in args) {
      let obj = x === "direct_object";
      let {summary} = this._argSuggs[x] || 0;
      if (summary) {
        let label = obj ? "" : escapeHtml(args[x].flag) + " ";
        sentence += (
          " " + (obj ? "" : '<span class="delimiter">' + label + '</span>') +
          '<span class="' + (obj ? "object" : "argument") + '">' +
          summary + "</span>");
      }
      else {
        let label = (obj ? "" : args[x].flag + " ") + args[x].label;
        sentence += ' <span class="needarg">' + escapeHtml(label) + "</span>";
      }
    }
    return sentence;
  },

  get icon() this._verb.cmd.icon,
  get previewUrl() this._verb.cmd.previewUrl,
  get previewDelay() this._verb.cmd.previewDelay,

  execute: function PS_execute(context) {
    return this._verb.execute(context, this._argSuggs);
  },

  preview: function PS_preview(context, previewBlock) {
    this._verb.preview(context, previewBlock, this._argSuggs);
  },

  copy: function PS_copy() {
    var newPS = {__proto__: this};
    for each (let key in ["_argSuggs", "_argFlags"]) {
      let dest = newPS[key] = {};
      let from = this[key];
      for (let x in from) dest[x] = from[x];
    }
    return newPS;
  },

  setArgumentSuggestion:
  function PS_setArgumentSuggestion(arg, sugg, isDefault) {
    this._argSuggs[arg] = sugg;
    this._argFlags[arg] |= isDefault ? FLAG_DEFAULT : 0;
  },

  getArgText: function PS_getArgText(arg) {
    return this._argSuggs[arg].text;
  },

  argumentIsFilled: function PS_argumentIsFilled(arg) {
    return arg in this._argSuggs;
  },

  hasFilledArgs: function PS_hasFilledArgs() {
    /* True if suggestion has at least one filled argument.
     False if verb has no arguments to fill, or if it has arguments but
     none of them are filled. */
    for (var x in this._argSuggs) return true;
    return false;
  },

  equals: function PS_equals(other) {
    if (this._verb.cmd !== other._verb.cmd)
      return false;
    let argSuggs = this._argSuggs;
    for (let x in argSuggs)
      if (argSuggs[x].summary !== other._argSuggs[x].summary)
        return false;
    return true;
  },

  fillMissingArgsWithDefaults: function PS_fillMissingArgsWithDefaults() {
    let newSentences = [this.copy()];
    let gotArrayOfDefaults = false;
    let defaultsSoFar = {};
    let args = this._verb._arguments;
    for (let argName in args) {
      if (argName in this._argSuggs) continue;
      let missingArg = args[argName];
      let defaultValue =
        missingArg.default && NounUtils.makeSugg(missingArg.default);
      if (!defaultValue) {
        let noun = missingArg.type;
        let {nounCache} = this._query;
        defaultValue = nounCache[noun.id] || (nounCache[noun.id] = (
          (typeof noun.default === "function"
           ? noun.default()
           : noun.default) ||
          nounCache[""]));
      }

      let numDefaults = defaultValue.length;
      if (numDefaults === 1 || numDefaults > 1 && gotArrayOfDefaults) {
        // either this is a single-item array, or
        // we've already used an array of values for a previous modifier,
        // so just use first default for this modifier
        defaultValue = defaultValue[0];
        numDefaults = 0;
      }
      if (numDefaults) {
        let defaults = defaultValue;
        // first time we've seen multiple defaults,
        // so create an array of sentences
        gotArrayOfDefaults = true;
        for (let i = 0; i < numDefaults; i++) {
          if (i) {
            let newSen = this.copy();
            for (let arg in defaultsSoFar)
              newSen.setArgumentSuggestion(arg, defaultsSoFar[arg], true);
            // reduce the match score so that multiple entries with the
            // same verb are only shown if there are no other verbs
            newSen.duplicateDefaultMatchScore =
              this.duplicateDefaultMatchScore / (i + 1);
            newSentences[i] = newSen;
          }
          newSentences[i].setArgumentSuggestion(argName, defaults[i], true);
        }
      }
      else {
        for each (let sen in newSentences)
          sen.setArgumentSuggestion(argName, defaultValue, true);
        defaultsSoFar[argName] = defaultValue;
      }
    }
    return newSentences;
  },

  get score PS_getScore() {
    if (!("argMatchScore" in this)) {
      // argument match score starts at 0 and increased for each
      // argument where a specific nountype (i.e. non-arbitrary-text)
      // matches user input.
      let ams = 0, args = this._verb._arguments, suggs = this._argSuggs;
      for (let name in suggs) if (suggs[name].summary)
        ams += ((name === "direct_object" ? .9 : 1) *
                (args[name].type.rankLast ? .1 : 1));
      this.argMatchScore = ams;
    }
    return (this.fromNounFirstSuggestion
            ? this.argMatchScore / 10 + this.frequencyMatchScore / 100
            : (this.duplicateDefaultMatchScore +
               this.frequencyMatchScore / 10 +
               this.verbMatchScore / 100 +
               this.argMatchScore / 1000));
  }
};

function PartiallyParsedSentence(
  verb, argStrings, selObj, matchScore, query, copying) {
  // This is a partially parsed sentence.
  // What that means is that we've decided what the verb is,
  // and we've assigned all the words of the input to one of the arguments.
  // What we haven't nailed down yet is the exact value to use for each
  // argument, because the nountype may produce multiple argument suggestions
  // from a single argument string.  So one of these partially parsed
  // sentences can produce several completely-parsed sentences, in which
  // final values for all arguments are specified.
  this._verb = verb;
  // ArgStrings is a dictionary, where the keys match the argument names in
  // the verb, and the values are each input that have
  // been assigned to that argument
  this._argStrings = argStrings;
  this._selObj = selObj;
  this._matchScore = matchScore;
  this._invalidArgs = {};
  this._validArgs = {};
  this._query = query;

  // Create fully parsed sentence with empty arguments:
  // If this command takes no arguments, this is all we need.
  // If it does take arguments, this initializes the parsedSentence
  // list so that the algorithm in addArgumentSuggestion will work
  // correctly.
  this._parsedSentences =
    [new ParsedSentence(verb, {}, matchScore, selObj, query, this)];
  for (let argName in this._verb._arguments) {
    let text = argStrings[argName];
    if (text) {
      // If argument is present, try the noun suggestions
      // based both on substituting pronoun...
      // (but not for noun-first)
      let gotSuggs = matchScore && this._suggestWithPronounSub(argName, text);
      // and on not substituting pronoun...
      let gotSuggsDirect = this._argSuggest(argName, text,
                                            Utils.escapeHtml(text), null);
      if (!gotSuggs && !gotSuggsDirect) {
        // One of the arguments is supplied by the user, but produces
        // no suggestions, meaning it's an invalid argument for this
        // command -- that makes the whole parsing invalid!!
        this._invalidArgs[argName] = true;
      }
    }
    // Otherwise, this argument will simply be left blank.
    // (or filled in with default value later)
  }
}
PartiallyParsedSentence.prototype = {
  _argSuggest:
  function PPS__argSuggest(argName, text, html, selectionIndices) {
    // For the given argument of the verb, sends (text,html) to the nounType
    // gets back suggestions for the argument, and adds each suggestion.
    // Return true if at least one arg suggestion was added in this way.
    var noun = this._verb._arguments[argName].type;
    var {nounCache} = this._query;
    var key = text + "\n" + noun.id;
    var suggestions = nounCache[key];
    if (suggestions) {
      suggestions.callback.otherSentences.push([this, argName]);
      for (let i = 0, l = suggestions.length; i < l; ++i)
        this.addArgumentSuggestion(argName, suggestions[i]);
    }
    else {
      let self = this;
      // Callback function for asynchronously generated suggestions:
      function callback(suggs) {
        var suggestions = self._handleSuggestions(argName, suggs);
        var {length} = suggestions;
        if (!length) return;
        for each (let [pps, arg] in callback.otherSentences)
          for (let i = 0; i < length; ++i)
            pps.addArgumentSuggestion(arg, suggestions[i]);
        self._query.onNewParseGenerated();
      }
      try {
        // This is where the suggestion is actually built.
        suggestions = noun.suggest(text, html, callback, selectionIndices);
      } catch (e) {
        if (e && e.stack) e += "\n" + /[^\n]+/(e.stack);
        Cu.reportError(
          'Exception occured while getting suggestions for "' +
          this._verb._name + '" with noun "' + (noun.name || noun.id) +
          '"\n' + e);
        return false;
      }
      suggestions = this._handleSuggestions(argName, suggestions);
      callback.otherSentences = [];
      suggestions.callback = callback;
      nounCache[key] = suggestions;
    }
    return suggestions.length > 0;
  },

  _suggestWithPronounSub: function PPS__suggestWithPronounSub(argName, words) {
    var {text, html} = this._selObj
    var gotAnySuggestions = false;
    function quoteDollars(x) x.replace(/\$/g, "$$$$");
    for each (let regexp in this._query.pronouns) {
      let index = words.search(regexp);
      if (index < 0) continue;
      let selectionIndices = [index, index + text.length];
      let textArg = words.replace(regexp, quoteDollars(text));
      let htmlArg = words.replace(regexp, quoteDollars(html));
      if (this._argSuggest(argName, textArg, htmlArg, selectionIndices))
        gotAnySuggestions = true;
    }
    return gotAnySuggestions;
  },

  _handleSuggestions: function PPS__handleSuggestions(argName, suggs) {
    var filtered = [], {requests, maxSuggestions} = this._query;
    if (!Utils.isArray(suggs)) suggs = [suggs];
    for each (let sugg in suggs) if (sugg) {
      if (sugg.summary >= "") filtered.push(sugg);
      else requests.push(sugg);
    }
    if (maxSuggestions) filtered.splice(maxSuggestions);
    for each (let sugg in filtered) this.addArgumentSuggestion(argName, sugg);
    return filtered;
  },

  addArgumentSuggestion: function PPS_addArgumentSuggestion(arg, sugg) {
    // Adds the given sugg as a suggested value for the given arg.
    // Extends the parsedSentences list with every new combination that
    // is made possible by the new suggestion.
    var newSentences = [];
    this._validArgs[arg] = true;
    EACH_PS: for each (let sen in this._parsedSentences) {
      if (sen.argumentIsFilled(arg)) {
        let newSen = sen.copy();
        newSen.setArgumentSuggestion(arg, sugg);
        for each (let alreadyNewSen in newSentences)
          if (alreadyNewSen.equals(newSen)) // duplicate suggestion
            continue EACH_PS;
        newSentences.push(newSen);
      }
      else sen.setArgumentSuggestion(arg, sugg);
    }
    push.apply(this._parsedSentences, newSentences);
  },

  getParsedSentences: function PPS_getParsedSentences() {
    // For any parsed sentence that is missing any arguments, fill in those
    // arguments with the defaults before returning the list of sentences.
    // The reason we don't set the defaults directly on the object is cuz
    // an asynchronous call of addArgumentSuggestion could actually fill in
    // the missing argument after this.
    for (let argName in this._invalidArgs)
      if (!(argName in this._validArgs))
        // Return nothing if this parsing is invalid
        // due to bad user-supplied args
        return [];

    var parsedSentences = [];
    if (this.fromNounFirstSuggestion) {
      for each (let sen in this._parsedSentences) {
        if (sen.hasFilledArgs()) {
          // When doing noun-first suggestion, we only want matches that put
          // the input or selection into an argument of the verb; therefore,
          // explicitly filter out suggestions that fill no arguments.
          for each (let oneSen in sen.fillMissingArgsWithDefaults()) {
            oneSen.fromNounFirstSuggestion = true;
            parsedSentences.push(oneSen);
          }
        }
      }
    }
    else
      for each (let sen in this._parsedSentences)
        push.apply(parsedSentences,
                   sen.fillMissingArgsWithDefaults());

    return parsedSentences;
  },

  copy: function PPS_copy() {
    let newPPS = {__proto__: this};
    newPPS._parsedSentences =
      [ps.copy() for each (ps in this._parsedSentences)];
    for each (let key in ["_invalidArgs", "_validArgs"]) {
      let dest = newPPS[key] = {};
      let from = this[key];
      for (let x in from) dest[x] = from[x];
    }
    return newPPS;
  },

  _getUnfilledArguments: function PPS__getUnfilledArguments() {
    // Returns list of the names of all arguments the verb expects for which
    // no argument was provided in this partially parsed sentence.
    return [argName
            for (argName in this._verb._arguments)
            if (!this._argStrings[argName])];
  },

  getAlternateSelectionInterpolations:
  function PPS_getAlternateSelectionInterpolations() {
    // Returns a list of PartiallyParsedSentences with the selection
    // interpolated into missing arguments -- one for each argument where
    // the selection could go.
    // If the selection can't be used, returns a
    // list containing just this object.
    let unfilledArgs = this._getUnfilledArguments();
    if (unfilledArgs.length === 0) return [this];

    let {text, html, fake} = this._selObj;
    let indices = [0, fake ? 0 : text.length];
    if (unfilledArgs.length === 1) {
      this._argSuggest(unfilledArgs[0], text, html, indices);
      return [this];
    }

    let alternates = [];
    for each (let arg in unfilledArgs) {
      let newParsing = this.copy();
      if (newParsing._argSuggest(arg, text, html, indices))
        alternates.push(newParsing);
    }
    return alternates.length ? alternates : [this];
  },

  get fromNounFirstSuggestion PPS_fromNounFirstSuggestion() !this._matchScore,
};

function Verb(cmd, roleMap) {
  // Picks up noun's label. "_name" is for backward compatiblity
  function pluckLabel(noun) noun.label || noun._name || "?";
  // Determines if an object has one or more own keys
  function hasKey(obj) {
    for (var key in new Iterator(obj || 0)) return true;
    return false;
  }

  this.cmd = cmd;
  this.matchedName = this._name = cmd.names[0];
  this.input = "";
  this._arguments = {};
  // Use the presence or absence of the "arguments" dictionary
  // to decide whether this is a version 1 or version 2 command.
  if ((this._isNewStyle = hasKey(cmd.arguments))) {
    // New-style API: command defines arguments dictionary
    // if there are arguments, copy them over using
    // a (semi-arbitrary) choice of preposition
    for each (let arg in cmd.arguments) {
      let {role, nountype} = arg;
      let obj = role === "object";
      this._arguments[obj ? "direct_object" : role] = {
        type : nountype,
        label: arg.label || pluckLabel(nountype),
        flag : obj ? null : roleMap[role],
        "default": arg.default,
      };
    }
  }
  else {
    // Old-style API for backwards compatibility:
    //   Command defines DOType/DOLabel and modifiers dictionary.
    // Convert this to argument dictionary.
    // cmd.DOType must be a NounType, if provided.
    if (cmd.DOType) {
      this._arguments.direct_object = {
        type: cmd.DOType,
        label: cmd.DOLabel,
        flag: null,
        "default": cmd.DODefault,
      };
    }
    // cmd.modifiers should be a dictionary
    // keys are prepositions
    // values are NounTypes.
    // example: {"from" : City, "to" : City, "on" : Day}
    if (hasKey(cmd.modifiers)) {
      let {modifiers, modifierDefaults} = cmd;
      for (let x in modifiers) {
        let type = modifiers[x];
        this._arguments[x] = {
          type: type,
          label: pluckLabel(type),
          flag: x,
        };
        if (modifierDefaults)
          this._arguments[x].default = modifierDefaults[x];
      }
    }
  }
}
Verb.prototype = {
  get disabled() this.cmd.disabled,

  execute: function V_execute(context, argumentValues) {
    if (this._isNewStyle) {
      // New-style commands (api 1.5) expect a single dictionary with all
      // arguments in it, and the object named 'object'.
      argumentValues.object = argumentValues.direct_object;
      return this.cmd.execute(context, argumentValues);
    }
    else {
      // Old-style commands (api 1.0) expect the direct object to be passed
      // in separately.
      return this.cmd.execute(context,
                              argumentValues.direct_object,
                              argumentValues);
    }
  },

  preview: function V_preview(context, previewBlock, argumentValues) {
    // Same logic as the execute command -- see comment above.
    if (this._isNewStyle) {
      argumentValues.object = argumentValues.direct_object;
      this.cmd.preview(context, previewBlock, argumentValues);
    }
    else {
      this.cmd.preview(context, previewBlock,
                       argumentValues.direct_object, argumentValues);
    }
  },

  usesAnySpecificNounType: function V_usesAnySpecificNounType() {
    for each (let arg in this._arguments)
      if (!arg.type.rankLast)
        return true;
    return false;
  },

  // Returns a matching score (1 ~ 0) which will be used for sorting.
  // input should be lowercased.
  match: function V_match(input) {
    var {names} = this.cmd;
    for (let i = 0, l = names.length; i < l; ++i) {
      let score = hagureMetal(input, names[i].toLowerCase());
      if (!score) continue;
      this.matchedName = names[i];
      this.input = input;
      // lower the score based on the name position
      return score * (l - i) / l;
    }
    return 0;
  }
};

// Represents how well an abbreviation matches original
// with a float number 1 (perfect) to 0 (invalid).
// Inspired by <http://github.com/rmm5t/liquidmetal/tree/master>.
function hagureMetal(abbr, orig) {
  var len = orig.length;
  if (len < abbr.length) return 0;
  var sum = 0, score = 1, preIndex = -1, {pow} = Math;
  for each (let c in abbr) {
    let index = orig.indexOf(c, preIndex + 1);
    if (index < 0) return 0;
    sum += (
      index === preIndex + 1 || /[\s_-]/.test(orig[index - 1])
      ? score
      : score = pow((len - index) / len, 3));
    preIndex = index;
  }
  return sum / len;
}
