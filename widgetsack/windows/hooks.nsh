; NSIS installer hooks (wired via tauri.conf.json bundle.windows.nsis.installerHooks).
; Tauri's template insert points: PREINSTALL runs inside `Section Install` BEFORE its
; CheckIfAppIsRunning macro — which is what lets the close-app hook below pre-empt the
; "app is running, OK to kill?" modal entirely.

; Close a running widgetsack quietly: polite close first (taskkill without /F sends WM_CLOSE,
; which Tauri windows honour — the overlay exits cleanly), then a forced kill for anything
; wedged, then a short settle so the exe is unlocked before files are copied. taskkill exits
; non-zero when no process matched; that's the common fresh-install case, so errors are ignored.
!macro _WS_CLOSE_RUNNING_APP
  DetailPrint "Closing running widgetsack…"
  nsExec::ExecToStack 'taskkill /IM "widgetsack.exe"'
  Pop $0
  Pop $1
  Sleep 800
  nsExec::ExecToStack 'taskkill /F /IM "widgetsack.exe"'
  Pop $0
  Pop $1
  Sleep 300
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro _WS_CLOSE_RUNNING_APP
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Pre-0.0.28 installers nested the shortcut inside a "widgetsack" Start Menu FOLDER, which
  ; Windows 11's All-apps list and search index handle poorly (the report was "the app doesn't
  ; show up after install"). The shortcut now lands at the Programs root (no startMenuFolder),
  ; so clear the leftover folder an upgrade would otherwise orphan. Runs AFTER the new
  ; shortcuts are created — the root-level widgetsack.lnk is untouched.
  RMDir /r "$SMPROGRAMS\widgetsack"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Same quiet close on uninstall/upgrade-replace, pre-empting the uninstaller's own
  ; running-app modal.
  !insertmacro _WS_CLOSE_RUNNING_APP
!macroend
