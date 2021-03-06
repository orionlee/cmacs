chrome.app.runtime.onLaunched.addListener(function(launchData) {
  // make size and position proportional to the screen
  chrome.app.window.create('main.html', {
    frame: 'none', width: Math.floor(screen.availWidth * 0.5), height: Math.floor(screen.availHeight * 0.75),
    top: Math.floor(screen.availHeight * 0.05),
    left: Math.floor(screen.availWidth * 0.05)
  },
  function(win) {
    win.contentWindow.launchData = launchData;
    win.contentWindow._dbgW = win;
  });
});
