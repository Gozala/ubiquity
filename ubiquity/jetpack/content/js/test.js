var Tests = {
  _runTest: function _runTest(test, onFinished) {
    function reportSuccess() { onFinished("success"); }
    function reportFailure() { onFinished("failure"); }

    var finishedId = null;
    var timeoutId = null;
    var runner = {
      assert: function assert(predicate, message) {
        if (!predicate)
          throw new Error("Assertion failed: " + message);
      },
      allowForMemoryError: function allowForMemoryError(margin) {
        test.memoryErrorMargin = margin;
      },
      setTimeout: function setTimeout(ms, message) {
        timeoutId = window.setTimeout(
          function() {
            console.error(test.name, "timed out at", ms, "ms");
            finishedId = window.setTimeout(reportFailure, 0);
          },
          ms
        );
      },
      success: function success() {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.info(test.name, "succeeded");
        finishedId = window.setTimeout(reportSuccess, 0);
      }
    };
    try {
      test.func(runner);
      if (timeoutId === null && finishedId === null) {
        console.info(test.name, "succeeded");
        finishedId = window.setTimeout(reportSuccess, 0);
      }
    } catch (e) {
      console.error(test.name, "threw error ", e);
      if (timeoutId === null && finishedId === null)
        finishedId = window.setTimeout(reportFailure, 0);
    }
  },

  run: function run() {
    var self = this;
    var testSuites = {};

    console.log("Now running tests.");

    // Find any objects whose name ends in "Tests".
    for (name in window) {
      if (name != "Tests" &&
          name.lastIndexOf("Tests") != -1 &&
          name.lastIndexOf("Tests") == (name.length - "Tests".length))
        testSuites[name] = window[name];
    }

    var tests = [];

    for (name in testSuites) {
      var suite = testSuites[name];
      for (testName in suite)
        tests.push({func: suite[testName],
                    suite: suite,
                    name: name + "." + testName,
                    memoryErrorMargin: 0});
    }

    var succeeded = 0;
    var failed = 0;

    function recomputeCount() {
      Components.utils.forceGC();
      MemoryTracking.compact();
      return MemoryTracking.getLiveObjects().length;
    }

    var lastCount = recomputeCount();
    var currentTest = null;

    function runNextTest(lastResult) {
      var currentCount = recomputeCount();
      if (lastResult == "success") {
        succeeded += 1;
        var memoryDiff = Math.abs(currentCount - lastCount);
        if (memoryDiff > currentTest.memoryErrorMargin)
          console.warn("Object count was", lastCount, "but is now",
                       currentCount, ". You may want to check for " +
                       "memory leaks, though this could be a false " +
                       "alarm.");
      } else if (lastResult == "failure") {
        failed += 1;
      }

      lastCount = currentCount;
      currentTest = tests.pop();

      if (currentTest)
        self._runTest(currentTest, runNextTest);
      else
        console.log(succeeded, "out of", succeeded + failed,
                    "tests successful (", failed, "failed ).",
                    "Please reload this page before running them again.");
    }

    runNextTest();
  }
};
