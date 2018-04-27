function editorAppInit(window) {
  "use strict";
  
  // globals used 
  var document = window.document, 
      console = window.console,
      chrome = window.chrome,
      CodeMirror = window.CodeMirror,
      DnDFileController = window.DnDFileController;
  
  // globals defined in other cmacs top-level script
  var createIOCtrl = window.createIOCtrl, 
      createEditorUICtrl = window.createEditorUICtrl, 
      initHelpUI = window.initHelpUI,
      editorAppExtension = window.editorAppExtension || {};
  
  var editor; // abstraction over entire editor
  
  // abstraction over (non-CodeMirror aka ediotr) UI  constructs and methods;
  var _uiCtrl; 
  var _ioCtrl;

  var _curFilePath; // used by handleDocumentChange()
  /**
   * Invoked after new file has been loaded to the editor,
   * to update UI, and possibly editor setup accordingly.
   */
  function handleDocumentChange(filePath) {
    function findModeByFileContent(cm) {
      // implemented by inspecting shebang line, if it exists

      // in shebang line, the last word is usually
      // name of the programming language, its alias or extension
      var extOrName = (function() {
        var line1 = cm.getLine(0);
        var matches = line1.match(/^#!.+?([^ /\\]+)\s*$/);
        if (matches) {
          return matches[1];
        } else {
          return "";
        }
      })(); // extOrName = (function())

      var info = CodeMirror.findModeByExtension(extOrName) ||
          CodeMirror.findModeByName(extOrName);
      
      return info;
    } // function findModeByFileContent(..)
    
    var info = null;
    var fileName;
    if (filePath) {
      fileName = filePath.match(/[^\/\\]+$/)[0];
      _uiCtrl.title.set(fileName, filePath);
      info = CodeMirror.findModeByFileName(fileName);
      if (!info) {
        // usually some scripts with no extension
        info = findModeByFileContent(editor);
      }
    } else {
      _uiCtrl.title.set("[no document loaded]");
    }
    
    if (info && editor.getOption('mode') !== info.mime && _curFilePath !== filePath) {
      _uiCtrl.setMode(info.name);
      editor.setOption("mode", info.mime);
      CodeMirror.autoLoadMode(editor, info.mode);
      CodeMirror.builder.initMode(editor, info.mode, _uiCtrl);
    } // else mode not changed. no-op
    
    // manually fire the change event as document just loaded
    updateUIOnChange(editor);  
    
    // needed in case the editor is loaded via keyboard shortcut, e.g., open recent file.
    editor.focus();

    _curFilePath = filePath;
    
    // site-specific workflow
    if (editorAppExtension.onHandleDocumentChange) {
      editorAppExtension.onHandleDocumentChange(editor, _uiCtrl, filePath, fileName);
    }
    
  }
  
  
  
  /**
 * Reset any lingering states / processes before reading a new file to the editor.
 */
  function resetEditorStates(cm) {
    if (CodeMirror.commands.clearSearch) {
      CodeMirror.commands.clearSearch(cm);
    }
    
    if (CodeMirror.commands.disableJsHint) {
      CodeMirror.commands.disableJsHint(cm);
    }
  } // function resetEditorStates(..)
  
  // BEGIN IO callbacks
  function readSuccessCallback(fileFullPath, fileContent) {
    // clean-up old states before reading in new file
    resetEditorStates(editor);
    
    editor.setValue(fileContent); // actual file content
    editor.markClean(); // starting point of edit and history
    editor.clearHistory();
    
    // new content ready, update UI accordingly
    handleDocumentChange(fileFullPath);
    
  } // function readSuccessCallback(..)
  
  function saveSuccessCallback(fileFullPath) {
    editor.markClean();
    handleDocumentChange(fileFullPath); // in case of save as a file with different name
  } // function saveSuccessCallback()
  
  
  function newSuccessCallback() {
    editor.setValue("");
    editor.markClean();
    handleDocumentChange(null);
    
  } // function newSuccessCallback()
  
  // END IO callbacks
  
  // BEGIN UI event hooks to connect to IO logic
  function handleNewButton() {
    if (false) {
      _ioCtrl.newFile();    
    } else {
      chrome.app.window.create('main.html', {
        frame: 'none', width: window.outerWidth, height: window.outerHeight,
        top: window.screenTop + Math.ceil(window.screen.availHeight * 0.05),
        left: window.screenLeft + Math.ceil(window.screen.availWidth * 0.05)
      });
    }
  }
  
  function handleOpenButton() {
    proceedIfFileIsCleanOrOkToDropChanges(editor, function() {
      _ioCtrl.chooseAndOpen();      
    });    
  }
  
  function handleSaveButton() {
    _ioCtrl.save(editor.getValue());
  }
  
  function handleSaveAsButton() {
    _ioCtrl.chooseAndSave(editor.getValue());
  }
  
  function handleOpenRecentButton(ev) {
    _ioCtrl.getRecentList(function(recentList) {
      // call uiCtrl to populate recent button with the list
      _uiCtrl.io.createRecentListDropDownUI(recentList,
                                            function(fileId, destroyUICallback) {
                                              proceedIfFileIsCleanOrOkToDropChanges(editor, function() {
                                                _ioCtrl.openRecentById(fileId);      
                                              }, destroyUICallback);          
                                            }, 
                                            _ioCtrl.pinUnpinRecentListEntry, 
                                            _ioCtrl.removeFromRecentList
                                           );
    });  
  } // function handleOpenRecentButton()
  
  // END UI event hooks to connect to IO logic
  
  var updateUIOnChange = function(cm) { 
    var isDirty = !cm.isClean();
    _uiCtrl.setDirty(isDirty);  
  };
  
  
  // @param cleanUpCallback if specified, it will be invoked irrespective of proceed or not
  //   the effect is equivalent to finally {} block of normal sychrnous flow
  function proceedIfFileIsCleanOrOkToDropChanges(cm, proceedCallback, cleanUpCallback) {
    
    function proceedAndCleanUp(cm) {
      try { 
        proceedCallback(cm);
      } finally {
        if (cleanUpCallback) {
          cleanUpCallback(cm);
        }
      }
    } // function proceedAndCleanUp(..)
    
    function proceedIfOkToDropChanges(cm, okCallback, cancelCallback) {
      cancelCallback = cancelCallback || (function noop() {});
      
      cm.openConfirm('Are you sure to discard the changes? ' + 
                     '<button>Cancel</button> <button>Ok</button>', 
                     [ cancelCallback, okCallback]);
    } 
    
    
    if (cm.isClean()) {
      proceedAndCleanUp(cm);
    } else {
      proceedIfOkToDropChanges(cm, proceedAndCleanUp, cleanUpCallback);
    } 
  } // function proceedIfFileIsCleanOrOkToDropChanges(..)
  
    
  window.onload = function() {
    /// initContextMenu(); disable snippets for now
    
    _uiCtrl = createEditorUICtrl(window, document);
    
    var errorCallback = _uiCtrl.error.showMsg;
    _ioCtrl = createIOCtrl(window, 
                           readSuccessCallback, 
                           saveSuccessCallback, 
                           newSuccessCallback, 
                           errorCallback);
    
    _uiCtrl.io.registerListeners(handleNewButton,                            
                                 handleOpenButton, 
                                 handleOpenRecentButton, 
                                 handleSaveButton, 
                                 handleSaveAsButton);
    
    editor = CodeMirror.builder.create(document.getElementById("editor"), _uiCtrl);
    CodeMirror.modeURL = "node_modules/codemirror/mode/%N/%N.js";  // one-time init for autoload mode feature
    CodeMirror.initEvalSandboxWithPath("codemirror-plus/addon/eval"); // one-time init for eval addon
    window.editor = editor; // the top level export, entry point to the created editor
    
    _uiCtrl.setEditorFocusFunction(editor.focus.bind(editor));
    
    var safeToExitCallback = proceedIfFileIsCleanOrOkToDropChanges.bind(undefined, editor);
    _uiCtrl.registerOnExitListener(safeToExitCallback);
    
    // finally exwant to bind Ctrl-W, but Ctrl-W is also used in emacs for 
    // very different reasons. So aovid it to reduce chances of accidental exit
    editor.options.extraKeys["Alt-F4"] =
      editor.options.extraKeys["Ctrl-F4"] =
      _uiCtrl.safeExitWindow;
    
    // Prevent OS exit window key (Alt-F4, etc.) from propagating to the OS,
    // so that they can be handled by the editor binding above
    function preventOSExitWindow(evt) { 
      /// console.debug(evt);

      var keyName = CodeMirror.keyName(evt);
      if ( ["Ctrl-W", "Ctrl-F4", "Alt-F4"].indexOf(keyName) >= 0 ) {
        evt.preventDefault(); 
      }
    }  
    window.addEventListener('keydown', preventOSExitWindow);
    
    // chrome app-specific features binding
    var extraKeys = editor.getOption('extraKeys') || {};
    var extraKeysForApp = {  
      "Cmd-N": function(cm) { handleNewButton(); },
      "Ctrl-N": function(cm) { handleNewButton(); },
      "Cmd-O": function(cm) { handleOpenButton(); },
      "Ctrl-O": function(cm) { handleOpenButton(); },
      "Cmd-S": function(cm) { handleSaveButton(); },
      "Ctrl-S": function(cm) { handleSaveButton(); },
      "Shift-Ctrl-S" : function(cm) { handleSaveAsButton(); },
      "Shift-Cmd-S" : function(cm) { handleSaveAsButton(); } 
    };
    var k;
    for (k in extraKeysForApp) {
      extraKeys[k] = extraKeysForApp[k];
    }
    editor.setOption('extraKeys', extraKeys);
    
    editor.on('change',  updateUIOnChange);
    
    _ioCtrl.newFile();    
    
    window.onresize();
    
    // this should be moved to uiCtrl 
    // but since it relies on global editor instance 
    // to dynamically generate doc, it is left 
    // alone for now. it has no bearing on other features anyway
    
    window.initHelpUI(document, editor);
    
    // drag-n-drop support over the window itself
    patchDnDOverOnWinIfNeeded(editor); 
    
    // upon minimize, maximize, etc., we will adjust by calling correspond resize
    chrome.app.window.current().onBoundsChanged.addListener(window.onresize);

    // default to a dark theme
    editor.setOption('theme', 'blackboard');
    if (editorAppExtension.onEditorInit) {
      editorAppExtension.onEditorInit(editor, _uiCtrl, _ioCtrl);
    }

  }; // window.onload = function(..)
  
  // codemirror specific changes upon window resize
  // it does not need to be part of uiCtrl
  window.onresize = function() {
    var container = document.getElementById('editor');
    var containerWidth = container.offsetWidth;
    var containerHeight = container.offsetHeight;
    
    var scrollerElement = editor.getScrollerElement();
    scrollerElement.style.width = containerWidth + 'px';
    scrollerElement.style.height = containerHeight + 'px';
    
    // the outermost window edge
    var win = document.getElementById('win');
    win.style.width = (window.innerWidth - 10) + 'px';
    win.style.height = (window.innerHeight - 10) + 'px';
    
    editor.refresh();
    editor.focus();
  };
  
  // drag-n-drop support over the window itself
  function patchDnDOverOnWinIfNeeded(editor) {
    
    var dragDrop = editor.getOption('dragDrop');
    if (!dragDrop) {
      return; // dnd not enabled anyway, so irrelevant
    }
    //
    // case dnd enabled. do the patch
    //
    // disable built-in dnd because it does not work
    //  (it keeps getting error during replacing contents)
    // Uncaught TypeError: Cannot call method 'chunkSize' of undefined codemirror.js:4522
    editor.setOption('dragDrop', false); 
    
    // use this alternative
    var dnd = new DnDFileController('body', function(data) {
      var item = data.items[0];
      // might consider restrict  filetype by checking
      // mimetype on item.type . however, some files
      // such as .md, .json , may not have type registered
      
      // the standard item.getFile() does not provide ways to save the file back
      // We are using Chrome's FileEntry construct anyway
      var chosenFileEntry = item.webkitGetAsEntry();
      
      proceedIfFileIsCleanOrOkToDropChanges(editor, function() {
        _ioCtrl.openFileEntry(chosenFileEntry);
      });
      
    });
    
  } // function patchDnDOverOnWinIfNeeded(..)
    
  editorAppInit._inspect = function(expr) { // for debug purposes
    var res = eval(expr);  // jshint ignore:line
    return res;
  }; // editorAppInit._inspect = function(..)
  
} // function editorAppInit(..)
editorAppInit(window);

